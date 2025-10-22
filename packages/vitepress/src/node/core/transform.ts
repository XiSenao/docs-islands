import type { RenderDirective } from '#dep-types/render';
import {
  ALLOWED_RENDER_DIRECTIVES,
  SPA_RENDER_SYNC_OFF,
  SPA_RENDER_SYNC_ON,
} from '#shared/constants';
import logger from '#utils/logger';
import type { Identifier, Literal } from 'estree';
import MagicString, { type SourceMap } from 'magic-string';
import MarkdownIt from 'markdown-it';
import { createHash } from 'node:crypto';
import { type DefaultTreeAdapterMap, parseFragment } from 'parse5';
import { parseAst } from 'vite';

export interface ImportNameSpecifier {
  importedName: string;
  localName: string;
}

interface StartTagOffsets {
  startOffset: number;
  endOffset: number;
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
  const Logger = logger.getLoggerByGroup('coreTransformComponentTags');
  const md = new MarkdownIt({ html: true });
  const tokens = md.parse(code, {});

  const s = new MagicString(code);
  const renderIdToRenderDirectiveMap = new Map<string, string[]>();
  const maybeReactComponentNameSets = new Set(
    maybeReactComponentNames.map((n) => n.toLowerCase()),
  );

  // Handle different line ending types properly
  const lines = code.split('\n');
  const lineOffsets: number[] = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    // For each line (except the last), add line content length + 1 (for \n separator)
    // The \r (if present) is already included in the line content after split('\n')
    lineOffsets.push(lineOffsets[i] + lines[i].length + 1);
  }

  const findOffset = (line: number, col: number) =>
    line >= lineOffsets.length ? -1 : lineOffsets[line] + col;
  let usedReactComponentCount = 0;

  for (const token of tokens) {
    if (
      (token.type === 'html_block' || token.type === 'html_inline') &&
      token.map &&
      token.content
    ) {
      const tokenContent = token.content;
      const startLine = token.map[0];
      const startOffset = findOffset(startLine, token.meta?.col || 0);
      if (startOffset === -1) continue;

      const fragment = parseFragment(tokenContent, {
        sourceCodeLocationInfo: true,
      });
      const stack: DefaultTreeAdapterMap['node'][] = [...fragment.childNodes];
      interface PendingReplacement {
        absStart: number;
        absEnd: number;
        replacement: string;
      }
      const pending: PendingReplacement[] = [];

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

      const found: {
        start: number;
        end: number;
        attrs: { name: string; value: string }[];
        nameLower: string;
      }[] = [];

      const isElementNode = (
        node: DefaultTreeAdapterMap['node'],
      ): node is DefaultTreeAdapterMap['element'] => 'tagName' in node;

      const isStartTagOffsets = (
        x: { startOffset?: number; endOffset?: number } | null | undefined,
      ): x is StartTagOffsets =>
        typeof x === 'object' &&
        x !== null &&
        typeof x.startOffset === 'number' &&
        typeof x.endOffset === 'number';

      const getStartTagOffsets = (
        loc:
          | DefaultTreeAdapterMap['element']['sourceCodeLocation']
          | null
          | undefined,
      ): StartTagOffsets | null => {
        if (!loc || typeof loc !== 'object') return null;
        const startTag = (
          loc as {
            startTag?:
              | { startOffset?: number; endOffset?: number }
              | null
              | undefined;
          }
        ).startTag;
        return isStartTagOffsets(startTag) ? startTag : null;
      };

      const hasChildNodes = (
        node: DefaultTreeAdapterMap['node'],
      ): node is
        | DefaultTreeAdapterMap['element']
        | DefaultTreeAdapterMap['document']
        | DefaultTreeAdapterMap['documentFragment'] =>
        'childNodes' in (node as DefaultTreeAdapterMap['element']) &&
        Array.isArray(
          (node as DefaultTreeAdapterMap['element']).childNodes as unknown[],
        );

      const isTemplateNode = (
        node: DefaultTreeAdapterMap['node'],
      ): node is DefaultTreeAdapterMap['template'] =>
        node?.nodeName === 'template' && 'content' in node;
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (node?.nodeName) {
          const nameLower = node.nodeName;
          if (
            maybeReactComponentNameSets.has(nameLower) &&
            isElementNode(node)
          ) {
            const loc = node.sourceCodeLocation;
            const st = getStartTagOffsets(loc);
            if (st) {
              found.push({
                start: st.startOffset,
                end: st.endOffset,
                attrs: node.attrs.map((attribute) => ({
                  name: attribute.name,
                  value: attribute.value,
                })),
                nameLower,
              });
            }
          }
        }
        // Traverse normal child nodes.
        if (hasChildNodes(node)) {
          stack.push(
            ...((node as DefaultTreeAdapterMap['element'])
              .childNodes as DefaultTreeAdapterMap['node'][]),
          );
        }
        // Ensure we also traverse into <template> content to discover nodes inside slots.
        if (isTemplateNode(node)) {
          stack.push(...node.content.childNodes);
        }
      }

      found.sort((a, b) => a.start - b.start);

      for (const item of found) {
        const originalName =
          maybeReactComponentNames.find(
            (n) => n.toLowerCase() === item.nameLower,
          ) || item.nameLower;

        // Compute absolute positions of the start tag for validation.
        let absStart = startOffset + item.start;
        const absStartTagEnd = startOffset + item.end;
        let startTagRaw = code.slice(absStart, absStartTagEnd);

        // Handle case where parse5 includes leading whitespace/newlines in the position
        const leadingWhitespaceRegex = /^(\s*)</;
        const leadingWhitespaceMatch = leadingWhitespaceRegex.exec(startTagRaw);
        if (leadingWhitespaceMatch) {
          const leadingWhitespace = leadingWhitespaceMatch[1];
          if (leadingWhitespace.length > 0) {
            // Adjust positions to exclude leading whitespace
            absStart = absStart + leadingWhitespace.length;
            startTagRaw = code.slice(absStart, absStartTagEnd);
          }
        }

        // Find the actual end of the self-closing tag
        // First, let's search for the complete self-closing tag from the current position
        const remainingCode = code.slice(absStart);
        const selfClosingTagRegex = /^<[^>]*\/>/;
        const selfClosingTagMatch = selfClosingTagRegex.exec(remainingCode);
        let actualAbsEnd = absStartTagEnd;

        if (selfClosingTagMatch) {
          actualAbsEnd = absStart + selfClosingTagMatch[0].length;
        } else {
          // If no self-closing tag found, try to find any closing >
          const tagEndRegex = /^<[^>]*>/;
          const tagEndMatch = tagEndRegex.exec(remainingCode);
          if (tagEndMatch) {
            actualAbsEnd = absStart + tagEndMatch[0].length;
          }
        }

        startTagRaw = code.slice(absStart, actualAbsEnd);

        // Extract the typed tag name from the raw start tag.
        const tagNameMatch = /^<\s*([A-Z][^\s/>]*)/.exec(startTagRaw);
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
        const isSelfClosing = /\/\s*>\s*$/.test(startTagRaw);
        if (!isSelfClosing) {
          Logger.error(
            `React component tag must be self-closing. Use "<${typedTagName} ... />". Found in ${id}, skipping compilation!`,
          );
          continue;
        }
        const absEnd = actualAbsEnd;

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
              `${attr.name}="${String(attr.value).replaceAll('"', '&quot;')}"`,
            );
          }
        }
        renderIdToRenderDirectiveMap.set(renderId, renderDirectiveAttributes);
        const replacement = `<div\n ${[...renderDirectiveAttributes, ...userElementProps].join('\n  ')}\n></div>`;
        pending.push({ absStart, absEnd, replacement });
      }

      for (const r of pending.sort((a, b) => b.absStart - a.absStart)) {
        s.overwrite(r.absStart, r.absEnd, r.replacement);
      }
    }
  }

  return {
    code: s.toString(),
    renderIdToRenderDirectiveMap,
    map: s.generateMap({ source: id, file: id, includeContent: true }),
  };
}
