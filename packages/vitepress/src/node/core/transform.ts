import type { RenderDirective } from '#dep-types/render';
import {
  ALLOWED_RENDER_DIRECTIVES,
  SPA_RENDER_SYNC_OFF,
  SPA_RENDER_SYNC_ON,
} from '#shared/constants';
import getLoggerInstance from '#shared/logger';
import type { Identifier, Literal } from 'estree';
import { Parser } from 'htmlparser2';
import MagicString, { type SourceMap } from 'magic-string';
import MarkdownIt from 'markdown-it';
import { createHash } from 'node:crypto';
import { parseAst } from 'vite';

/**
 * Shared MarkdownIt instance for identifying html_block tokens.
 * Stateless after construction — safe to reuse across calls.
 */
const componentTagExtractorMd = new MarkdownIt({ html: true });

/** Extracts the PascalCase tag name from a raw start tag string. */
const tagNameRE = /^<\s*([A-Z][\dA-Za-z]*)/;

/** Tests whether a raw start tag is self-closing (`/>` at the end). */
const selfClosingRE = /\/\s*>\s*$/;

/** Escapes text for safe use inside a double-quoted HTML attribute value. */
const escapeHtmlAttribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

export interface ImportNameSpecifier {
  importedName: string;
  localName: string;
}

function getIdentifierNameOrLiteralValue(
  node: Identifier | Literal,
): string | number | boolean | null {
  return node.type === 'Identifier'
    ? node.name
    : (node.value as string | number | boolean | null);
}

export const travelImports = (
  content: string,
): ImportNameSpecifier[] | undefined => {
  const node = parseAst(content).body[0];
  if (
    node.type === 'ImportDeclaration' ||
    node.type === 'ExportNamedDeclaration'
  ) {
    if (node.specifiers.length === 0) return undefined;
    const importNames: ImportNameSpecifier[] = [];
    for (const spec of node.specifiers) {
      switch (spec.type) {
        case 'ImportSpecifier': {
          const importedName = getIdentifierNameOrLiteralValue(
            spec.imported,
          ) as string;
          const localName = spec.local.name;
          importNames.push({ importedName, localName });

          break;
        }
        case 'ImportDefaultSpecifier': {
          importNames.push({
            importedName: 'default',
            localName: spec.local.name,
          });

          break;
        }
        case 'ImportNamespaceSpecifier': {
          importNames.push({ importedName: '*', localName: spec.local.name });

          break;
        }
      }
    }
    return importNames;
  }
  return undefined;
};

const loggerInstance = getLoggerInstance();

export default function coreTransformComponentTags(
  code: string,
  maybeReactComponentNames: string[],
  id: string,
  attrNames: {
    renderId: string;
    renderDirective: string;
    renderComponent: string;
    renderWithSpaSync: string;
  },
): {
  code: string;
  renderIdToRenderDirectiveMap: Map<string, string[]>;
  map: SourceMap | null;
} {
  const Logger = loggerInstance.getLoggerByGroup('coreTransformComponentTags');
  const tokens = componentTagExtractorMd.parse(code, {});

  const s = new MagicString(code);
  const renderIdToRenderDirectiveMap = new Map<string, string[]>();
  const componentNameSet = new Set(maybeReactComponentNames);

  // Precompute line start offsets for mapping token.map lines to character positions.
  // \r\n safety: token.map line numbers correspond 1-to-1 with code.split('\n')
  // indices regardless of line-ending style (line count is unchanged).
  const lines = code.split('\n');
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  let usedReactComponentCount = 0;

  interface PendingReplacement {
    absStart: number;
    absEnd: number;
    replacement: string;
  }

  const analyze = (
    attrs: readonly { name: string; value: string }[],
    compName: string,
  ) => {
    const attributes: { name: string; value: string | null }[] = [];
    let directive = 'ssr:only';
    let useSpaSyncRender = false;
    let forceDisableSpaSyncRender = false;
    for (const { name, value } of attrs) {
      const attrName = name;
      if (ALLOWED_RENDER_DIRECTIVES.includes(attrName as RenderDirective)) {
        directive = attrName;
        continue;
      }
      if (
        SPA_RENDER_SYNC_ON.includes(
          attrName as (typeof SPA_RENDER_SYNC_ON)[number],
        )
      ) {
        useSpaSyncRender = true;
        continue;
      }
      if (
        SPA_RENDER_SYNC_OFF.includes(
          attrName as (typeof SPA_RENDER_SYNC_OFF)[number],
        )
      ) {
        forceDisableSpaSyncRender = true;
        continue;
      }
      attributes.push({ name: attrName, value });
    }
    if (forceDisableSpaSyncRender) {
      useSpaSyncRender = false;
    } else if (directive === 'ssr:only') {
      /**
       * When the 'ssr:only' directive is enabled, if 'spa:sync-render' is not explicitly disabled,
       * then the 'spa:sync-render' mode is enabled by default.
       */
      useSpaSyncRender = true;
    }
    if (directive === 'client:only' && useSpaSyncRender) {
      Logger.warn(
        `'spa:sync-render' is not supported for 'client:only' directive, disabling 'spa:sync-render'`,
      );
      useSpaSyncRender = false;
    }
    return { name: compName, attributes, directive, useSpaSyncRender };
  };

  for (const token of tokens) {
    const hasInlineHtml =
      token.type === 'inline' &&
      Array.isArray(token.children) &&
      token.children.some((child) => child.type === 'html_inline');
    if (
      (token.type !== 'html_block' && !hasInlineHtml) ||
      !token.map ||
      !token.content
    ) {
      continue;
    }

    const startLine = token.map[0];
    if (startLine >= lineOffsets.length) continue;
    const endLine = token.map[1];
    const rawStart = lineOffsets[startLine];
    const rawEnd =
      endLine < lineOffsets.length ? lineOffsets[endLine] : code.length;
    const rawSlice = code.slice(rawStart, rawEnd);

    const found: {
      start: number;
      end: number;
      attrs: { name: string; value: string }[];
      name: string;
    }[] = [];

    const parser = new Parser(
      {
        onopentag(name, attribs) {
          if (componentNameSet.has(name)) {
            found.push({
              start: parser.startIndex,
              end: parser.endIndex + 1,
              attrs: Object.entries(attribs).map(([k, v]) => ({
                name: k,
                value: v,
              })),
              name,
            });
          }
        },
      },
      {
        lowerCaseTags: false,
        lowerCaseAttributeNames: false,
        recognizeSelfClosing: true,
      },
    );

    parser.write(rawSlice);
    parser.end();

    const pending: PendingReplacement[] = [];

    found.sort((a, b) => a.start - b.start);

    for (const item of found) {
      const originalName = item.name;

      // htmlparser2's startIndex/endIndex are authoritative — they correctly
      // handle attributes containing '>' characters and multiline tags.
      const absStart = rawStart + item.start;
      const absEnd = rawStart + item.end;
      const startTagRaw = code.slice(absStart, absEnd);

      // Extract the typed tag name from the raw start tag.
      const tagNameMatch = tagNameRE.exec(startTagRaw);
      const typedTagName = tagNameMatch ? tagNameMatch[1] : '';

      // 1) Enforce naming: component name must be in PascalCase.
      if (!typedTagName) {
        Logger.error(
          `Component name must be in PascalCase. Found "${typedTagName || startTagRaw}" in ${id}, skipping compilation!`,
        );
        continue;
      }

      // 2) Enforce exact local import name match: no aliasing by different casing.
      if (typedTagName !== originalName) {
        Logger.error(
          `React component tag "${typedTagName}" does not match imported local name "${originalName}" in ${id}, skipping compilation!`,
        );
        continue;
      }

      // 3) Enforce self-closing syntax only: <Comp ... />.
      if (!selfClosingRE.test(startTagRaw)) {
        Logger.error(
          `React component tag must be self-closing. Use "<${typedTagName} ... />". Found in ${id}, skipping compilation!`,
        );
        continue;
      }

      const parsed = analyze(item.attrs, originalName);
      const renderId = createHash('sha256')
        .update(`${id}_${usedReactComponentCount++}`)
        .digest('hex')
        .slice(0, 8);
      const renderDirectiveAttributes = [
        `${attrNames.renderId}="${renderId}"`,
        `${attrNames.renderDirective}="${parsed.directive}"`,
        `${attrNames.renderComponent}="${parsed.name}"`,
        `${attrNames.renderWithSpaSync}="${parsed.useSpaSyncRender}"`,
      ];
      const userElementProps: string[] = [];
      for (const attr of parsed.attributes) {
        if (attr.value === null) {
          userElementProps.push(attr.name);
        } else {
          userElementProps.push(
            `${attr.name}="${escapeHtmlAttribute(attr.value)}"`,
          );
        }
      }
      renderIdToRenderDirectiveMap.set(renderId, renderDirectiveAttributes);
      const replacement = `<div\n ${[...renderDirectiveAttributes, ...userElementProps].join('\n  ')}\n></div>`;
      pending.push({ absStart, absEnd, replacement });
    }

    for (const r of pending.toSorted((a, b) => b.absStart - a.absStart)) {
      s.overwrite(r.absStart, r.absEnd, r.replacement);
    }
  }

  return {
    code: s.toString(),
    renderIdToRenderDirectiveMap,
    map: s.generateMap({ source: id, file: id, includeContent: true }),
  };
}
