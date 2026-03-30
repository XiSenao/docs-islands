import type { SSRUpdateData, SSRUpdateRenderData } from '#dep-types/ssr';
import type { ConfigType } from '#dep-types/utils';
import { resolveConfig } from '#shared/config';
import {
  REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID,
  RENDER_STRATEGY_CONSTANTS,
} from '#shared/constants';
import getLoggerInstance from '#shared/logger';
import reactPlugin from '@vitejs/plugin-react-swc';
import { type ImportSpecifier, init, parse } from 'es-module-lexer';
import MagicString, { type SourceMap } from 'magic-string';
import MarkdownIt from 'markdown-it';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'pathe';
import React, { version as reactPackageVersion } from 'react';
import { version as reactDomPackageVersion } from 'react-dom';
import ReactDOMServer from 'react-dom/server';
import type { ModuleNode, PluginOption, Rollup } from 'vite';
import { normalizePath } from 'vite';
import type { DefaultTheme, UserConfig } from 'vitepress';
import { GET_CLEAN_PATHNAME_RUNTIME } from '../../shared/runtime';
import type { CompilationContainerType } from '../core/render-controller';
import type { ImportNameSpecifier } from '../core/transform';
import coreTransformComponentTags, { travelImports } from '../core/transform';
import createVitePressPathResolverPlugin, {
  transformPathForInlinePathResolver,
} from '../plugins/vite-plugin-vitepress-path-resolver';
import { createImportReferenceResolver } from './export-resolver';
import { registerBuildHelper } from './react-build-helper';
import { ReactRenderController } from './react-render-controller';

/**
 * Shared MarkdownIt instance for extracting html_block tokens from Markdown.
 *
 * markdown-it classifies block-level HTML (including `<script>`) as `html_block`
 * tokens, while code fences and indented code blocks become `fence` / `code_block`
 * tokens. By only inspecting `html_block` tokens, code-block exclusion is
 * structurally guaranteed — no post-filtering needed.
 *
 * This is the same strategy used by VitePress upstream (@mdit-vue/plugin-sfc).
 */
const scriptTagExtractorMd = new MarkdownIt({ html: true });

/** Matches a `<script ...>...</script>` block, capturing `attrs` and inner `content`. */
const scriptBlockRE =
  /[\t ]*<script\b(?<attrs>[^>]*)>(?<content>.*?)<\/script\s*>/is;

/** Validates that an attribute string contains `lang="react"` (or `lang='react'`) with matched quotes. */
const langReactAttrRE = /\blang=(?<q>["'])react\k<q>/;

const loggerInstance = getLoggerInstance();

// Helper functions for chunk identification
const isPageChunk = (
  chunk: Rollup.OutputAsset | Rollup.OutputChunk,
): chunk is Rollup.OutputChunk & { facadeModuleId: string } =>
  Boolean(
    chunk.type === 'chunk' &&
      chunk.isEntry &&
      chunk.facadeModuleId &&
      chunk.facadeModuleId.endsWith('.md'),
  );

const isReactChunk = (chunkInfo: Rollup.PreRenderedChunk) => {
  if (!chunkInfo.isDynamicEntry || chunkInfo.type !== 'chunk') {
    return false;
  }
  const moduleIds = chunkInfo.moduleIds;
  return moduleIds.some((moduleId) =>
    moduleId.includes('/node_modules/react/index.js'),
  );
};

const isReactClientChunk = (chunkInfo: Rollup.PreRenderedChunk) => {
  if (!chunkInfo.isDynamicEntry || chunkInfo.type !== 'chunk') {
    return false;
  }
  const moduleIds = chunkInfo.moduleIds;
  return moduleIds.some((moduleId) =>
    moduleId.includes('/node_modules/react-dom/client.js'),
  );
};

interface TransformContext {
  resolveId: (id: string, importer?: string) => Promise<{ id: string } | null>;
}

function transformComponentTags(
  code: string,
  maybeReactComponentNames: string[],
  id: string,
): {
  code: string;
  renderIdToRenderDirectiveMap: Map<string, string[]>;
  map: SourceMap | null;
} {
  return coreTransformComponentTags(code, maybeReactComponentNames, id, {
    renderId: RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
    renderDirective: RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
    renderComponent: RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
    renderWithSpaSync:
      RENDER_STRATEGY_CONSTANTS.renderWithSpaSync.toLowerCase(),
  });
}

interface ScriptMatch {
  content: string;
  startIndex: number;
  endIndex: number;
}

// Replace the entire script tag with empty lines to preserve line numbers.
function cleanScriptByMatches(s: MagicString, matches: ScriptMatch[]) {
  const code = s.toString();
  for (const scriptMatch of matches) {
    const { startIndex, endIndex } = scriptMatch;
    const replacement = '\n'.repeat(
      code.slice(startIndex, endIndex).split('\n').length - 1,
    );
    s.overwrite(startIndex, endIndex, replacement);
  }
}

function checkNodeVersion(nodeVersion: string): boolean {
  const currentVersion = nodeVersion.split('.');
  const major = Number.parseInt(currentVersion[0], 10);
  const minor = Number.parseInt(currentVersion[1], 10);
  const isSupported =
    (major === 20 && minor >= 19) ||
    (major === 22 && minor >= 12) ||
    major > 22;
  return isSupported;
}

export default function vitepressReactRenderingStrategies(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
): void {
  if (!checkNodeVersion(process.versions.node)) {
    loggerInstance
      .getLoggerByGroup('@docs-islands/vitepress')
      .warn(
        `You are using Node.js ${process.versions.node}. ` +
          `@docs-islands/vitepress requires Node.js version 20.19+ or 22.12+. ` +
          `Please upgrade your Node.js version.`,
      );
  }
  let ssr = false;
  const siteConfig: ConfigType = resolveConfig(vitepressConfig);
  const renderController = new ReactRenderController();

  registerBuildHelper(vitepressConfig, siteConfig, renderController);

  async function transform(
    code: string,
    id: string,
    ctx: TransformContext,
  ): Promise<{ code: string; map: SourceMap | null }> {
    /**
     * Only normalize path separators (backslash → forward slash) without stripping
     * query strings or hash fragments. This is intentional:
     *
     * VitePress compiles Markdown files into Vue SFCs. When a Markdown file contains
     * `<style>` blocks, `@vitejs/plugin-vue` generates sub-module requests with query
     * suffixes appended to the original `.md` path, e.g.:
     *
     *   /path/to/page.md?vue&type=style&index=0&lang.css
     *
     * By preserving the full module ID, the `.endsWith('.md')` guard below correctly
     * skips these style (and template/script) sub-modules, which carry CSS—not
     * Markdown—content. Stripping the query string would cause them to pass the guard
     * and be incorrectly processed as Markdown.
     *
     * This is consistent with VitePress's own approach (see vitepress/src/node/plugin.ts).
     */
    const normalizedId = normalizePath(id);

    if (!normalizedId.endsWith('.md')) {
      return {
        code,
        map: null,
      };
    }
    await init;
    const importReferenceResolver = createImportReferenceResolver(ctx);

    const s = new MagicString(code);

    const pendingCompilationContainer =
      renderController.getCompilationContainerByMarkdownModuleId(normalizedId);
    const resolvedCompilationContainer =
      renderController.markdownModuleIdToPendingResolvedCompilationContainerMap.get(
        normalizedId,
      )!;

    if (!(pendingCompilationContainer instanceof Promise)) {
      renderController.deleteCompilationContainerByMarkdownModuleId(
        normalizedId,
      );
      renderController.markdownModuleIdToPendingResolvedCompilationContainerMap.delete(
        normalizedId,
      );
    }

    const compilationContainer: CompilationContainerType = {
      code: '',
      helperCode: '',
      importsByLocalName: new Map(),
      ssrOnlyComponentNames: new Set<string>(),
    };

    const tokens = scriptTagExtractorMd.parse(code, {});

    // Precompute line start offsets for mapping token.map lines → character positions.
    // \r\n safety: markdown-it internally normalizes \r\n to \n, but token.map line
    // numbers still correspond 1-to-1 with code.split('\n') indices (line count is
    // unchanged). We always slice from the original `code` below, so character offsets
    // stay in the same coordinate space as MagicString.
    const lines = code.split('\n');
    const lineOffsets: number[] = [];
    let offset = 0;
    for (const line of lines) {
      lineOffsets.push(offset);
      offset += line.length + 1;
    }

    const scriptMatches: ScriptMatch[] = [];

    for (const token of tokens) {
      if (token.type !== 'html_block' || !token.map) continue;

      // Extract the raw source slice from the original code using token.map,
      // rather than relying on token.content which may have leading indentation
      // stripped by markdown-it's getLines() when blkIndent > 0 (e.g. inside
      // blockquotes or lists), breaking offset alignment.
      const [startLine, endLine] = token.map;
      const rawStart = lineOffsets[startLine];
      const rawEnd =
        endLine < lineOffsets.length ? lineOffsets[endLine] : code.length;
      const rawSlice = code.slice(rawStart, rawEnd);

      // A single html_block may contain multiple <script> tags on the same line.
      // Scan all script blocks to enforce the single react-script invariant.
      const scriptBlockMatcher = new RegExp(`${scriptBlockRE.source}`, 'gis');
      for (const blockMatch of rawSlice.matchAll(scriptBlockMatcher)) {
        if (
          !blockMatch.groups ||
          !langReactAttrRE.test(blockMatch.groups.attrs)
        ) {
          continue;
        }

        const startIndex = rawStart + blockMatch.index;
        const endIndex = startIndex + blockMatch[0].length;

        scriptMatches.push({
          content: blockMatch.groups.content,
          startIndex,
          endIndex,
        });
      }
    }

    if (scriptMatches.length > 1) {
      loggerInstance
        .getLoggerByGroup('react-plugin')
        .error(
          'Single file can contain only one <script lang="react"> element.',
        );
      cleanScriptByMatches(s, scriptMatches);
      if (resolvedCompilationContainer) {
        renderController.markdownModuleIdToPendingResolvedCompilationContainerMap.delete(
          normalizedId,
        );
        resolvedCompilationContainer(compilationContainer);
      }
      return {
        code: s.toString(),
        map: s.generateMap({ source: id, file: id, includeContent: true }),
      };
    }

    const inlineComponentReferenceMap = new Map<
      string,
      { localName: string; path: string; importedName: string }
    >();
    // The <script lang="react"> element only declares React components, reducing complexity while maintaining consistency with <script setup>.
    if (scriptMatches.length === 1) {
      const { content } = scriptMatches[0];

      const maybeComponentReferenceMap = new Map<
        string,
        { identifier: string; importedName: string }
      >();
      let imports: readonly ImportSpecifier[];
      try {
        [imports] = parse(content);
      } catch (parseError) {
        // Log a warning instead of throwing an error for parse failures.
        // This allows the build to continue with other valid components.
        loggerInstance
          .getLoggerByGroup('react-plugin')
          .error(
            `Failed to parse JavaScript in ${id}: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          );

        // Remove the problematic script tag entirely to prevent further processing errors.
        cleanScriptByMatches(s, scriptMatches);

        if (resolvedCompilationContainer) {
          renderController.markdownModuleIdToPendingResolvedCompilationContainerMap.delete(
            normalizedId,
          );
          resolvedCompilationContainer(compilationContainer);
        }

        // Ensure we exit script processing and return clean Markdown.
        return {
          code: s.toString(),
          map: s.generateMap({ source: id, file: id, includeContent: true }),
        };
      }

      for (const _importSpecifier of imports) {
        const importSpecifier = _importSpecifier || {};
        const {
          ss: expStart,
          se: expEnd,
          n: rawIdentifier = '',
        } = importSpecifier;

        const exp = content.slice(expStart, expEnd);
        let importSets: ImportNameSpecifier[];
        try {
          importSets = travelImports(exp) || [];
        } catch (importParseError) {
          // Log a warning and skip this import if parsing fails.
          loggerInstance
            .getLoggerByGroup('react-plugin')
            .warn(
              `Failed to parse import statement in ${id}: ${importParseError instanceof Error ? importParseError.message : String(importParseError)}`,
            );
          continue;
        }

        for (const importSet of importSets) {
          const { importedName, localName } = importSet;
          if (/^[A-Z][\dA-Za-z]*$/.test(localName)) {
            // Resolve through re-export chains so injected runtime imports point
            // at the final symbol owner instead of a barrel module. Re-export
            // modules should not be used as side-effect injection points.
            const finalImportReference =
              await importReferenceResolver.resolveImportReference(
                rawIdentifier,
                importedName,
                normalizedId,
              );
            if (!finalImportReference) {
              loggerInstance
                .getLoggerByGroup('react-plugin')
                .error(
                  `Failed to resolve final import reference ${rawIdentifier}#${importedName} in ${id}, skipping component registration`,
                );
              continue;
            }

            for (const warning of finalImportReference.warnings) {
              loggerInstance.getLoggerByGroup('react-plugin').warn(warning);
            }

            maybeComponentReferenceMap.set(localName, {
              identifier: finalImportReference.identifier,
              importedName: finalImportReference.importedName,
            });
            inlineComponentReferenceMap.set(localName, {
              localName,
              path: join(
                '/',
                finalImportReference.identifier.replace(siteConfig.srcDir, ''),
              ),
              importedName: finalImportReference.importedName,
            });
          }
        }
      }

      cleanScriptByMatches(s, scriptMatches);

      let currentCode = s.toString();
      let finalMap = s.generateMap({
        source: id,
        file: id,
        includeContent: true,
      });

      if (maybeComponentReferenceMap.size > 0) {
        const maybeReactComponentNames = [...maybeComponentReferenceMap.keys()];
        const determinedComponentReferenceNameSets = new Set<string>();
        const {
          code: transformedCode,
          renderIdToRenderDirectiveMap,
          map: componentMap,
        } = transformComponentTags(currentCode, maybeReactComponentNames, id);
        currentCode = transformedCode;

        if (componentMap) {
          finalMap = componentMap;
        }

        const transformedRenderIdToRenderDirectiveMap = new Map();
        const nonSSROnlyComponentNames = new Set<string>();
        const ssrOnlyComponentNames = new Set<string>();

        for (const [
          renderId,
          renderDirectiveAttributes,
        ] of renderIdToRenderDirectiveMap.entries()) {
          const [
            ,
            renderDirectiveSnips,
            renderComponentSnips,
            useSpaSyncRenderSnips,
          ] = renderDirectiveAttributes;
          const renderDirective = renderDirectiveSnips
            .split('=')[1]
            .slice(1, -1);
          const renderComponent = renderComponentSnips
            .split('=')[1]
            .slice(1, -1);
          const useSpaSyncRender = useSpaSyncRenderSnips
            .split('=')[1]
            .slice(1, -1);

          if (renderDirective === 'ssr:only') {
            ssrOnlyComponentNames.add(renderComponent);
          } else {
            nonSSROnlyComponentNames.add(renderComponent);
          }

          determinedComponentReferenceNameSets.add(renderComponent);
          transformedRenderIdToRenderDirectiveMap.set(renderId, {
            renderId,
            renderDirective,
            renderComponent,
            useSpaSyncRender: useSpaSyncRender === 'true',
          });
        }

        for (const componentName of ssrOnlyComponentNames) {
          if (nonSSROnlyComponentNames.has(componentName)) {
            ssrOnlyComponentNames.delete(componentName);
          }
        }

        const componentReferenceImportSnippets: string[] = [];
        const determinedComponentReferenceMap = new Map<
          string,
          { identifier: string; importedName: string }
        >();
        for (const [
          componentName,
          importInfo,
        ] of maybeComponentReferenceMap.entries()) {
          const { identifier, importedName } = importInfo;
          /**
           * Default component reference does not contain side effects,
           * so remove irrelevant references.
           */
          if (!determinedComponentReferenceNameSets.has(componentName)) {
            continue;
          }

          determinedComponentReferenceMap.set(componentName, {
            identifier,
            importedName,
          });

          /**
           * If a component is rendered on a single page using only the `ssr:only` directive,
           * it must be restricted from loading on the client-side.
           *
           * If a component is rendered on a single page using multiple
           * rendering strategies (including the `ssr:only` directive),
           * it is allowed to load on the client-side to complete the client-side rendering (hydration)
           * for containers without the `ssr:only` directive.
           */
          if (ssrOnlyComponentNames.has(componentName)) {
            continue;
          }

          switch (importedName) {
            case '*': {
              componentReferenceImportSnippets.push(
                `import * as ${componentName} from '${identifier}';`,
              );
              break;
            }
            case 'default': {
              componentReferenceImportSnippets.push(
                `import ${componentName} from '${identifier}';`,
              );
              break;
            }
            case componentName: {
              // Support reference name aliases.
              componentReferenceImportSnippets.push(
                `import { ${componentName} } from '${identifier}';`,
              );
              break;
            }
            default: {
              componentReferenceImportSnippets.push(
                `import { ${importedName} as ${componentName} } from '${identifier}';`,
              );
              break;
            }
          }
        }

        compilationContainer.code = componentReferenceImportSnippets.join('\n');
        const helperCode = `
          // This snippet is emitted via function.toString(), so pass base/cleanUrls
          // explicitly instead of relying on define replacements inside the string body.
          const __PAGE_ID__ = (${GET_CLEAN_PATHNAME_RUNTIME.toString()})(${JSON.stringify(siteConfig.base)}, ${JSON.stringify(siteConfig.cleanUrls)});
          if (!window['${RENDER_STRATEGY_CONSTANTS.injectComponent}'][__PAGE_ID__]) {
            window['${RENDER_STRATEGY_CONSTANTS.injectComponent}'][__PAGE_ID__] = {};
          }
          const ${RENDER_STRATEGY_CONSTANTS.reactInlineComponentReference} = window['${RENDER_STRATEGY_CONSTANTS.injectComponent}'][__PAGE_ID__];
        `;
        const inlineComponentReferenceCode = [
          ...inlineComponentReferenceMap.values(),
        ]
          .map((inlineComponentReference) => {
            // Inject the client-side components that have been determined to be loaded.
            if (
              determinedComponentReferenceNameSets.has(
                inlineComponentReference.localName,
              )
            ) {
              if (
                ssrOnlyComponentNames.has(inlineComponentReference.localName)
              ) {
                return `
                  ${RENDER_STRATEGY_CONSTANTS.reactInlineComponentReference}[${JSON.stringify(inlineComponentReference.localName)}] = {
                    component: null,
                    path: ${JSON.stringify(inlineComponentReference.path)},
                    importedName: ${JSON.stringify(inlineComponentReference.importedName)}
                  }
                `;
              }
              return `
                ${RENDER_STRATEGY_CONSTANTS.reactInlineComponentReference}[${JSON.stringify(inlineComponentReference.localName)}] = {
                  component: ${inlineComponentReference.localName},
                  path: ${JSON.stringify(inlineComponentReference.path)},
                  importedName: ${JSON.stringify(inlineComponentReference.importedName)}
                }
              `;
            }
            return '';
          })
          .join('\n');

        compilationContainer.helperCode = `
          ${helperCode}

          ${inlineComponentReferenceCode}
        `;
        compilationContainer.importsByLocalName =
          determinedComponentReferenceMap;
        compilationContainer.ssrOnlyComponentNames = ssrOnlyComponentNames;

        renderController.setUsedSnippetContainer(
          normalizedId,
          transformedRenderIdToRenderDirectiveMap,
        );
        renderController.setCompilationContainer(
          normalizedId,
          compilationContainer,
        );

        if (resolvedCompilationContainer) {
          renderController.markdownModuleIdToPendingResolvedCompilationContainerMap.delete(
            normalizedId,
          );
          resolvedCompilationContainer(compilationContainer);
        }

        return {
          code: currentCode,
          map: finalMap,
        };
      }
      renderController.setUsedSnippetContainer(normalizedId, new Map());
      renderController.setCompilationContainer(
        normalizedId,
        compilationContainer,
      );
      if (resolvedCompilationContainer) {
        renderController.markdownModuleIdToPendingResolvedCompilationContainerMap.delete(
          normalizedId,
        );
        resolvedCompilationContainer(compilationContainer);
      }

      return {
        code: s.toString(),
        map: finalMap,
      };
    }

    // Markdown document without React script tags, no need to compile.
    if (resolvedCompilationContainer) {
      renderController.markdownModuleIdToPendingResolvedCompilationContainerMap.delete(
        normalizedId,
      );
      resolvedCompilationContainer(compilationContainer);
    }

    return {
      code,
      map: null,
    };
  }

  const reactRenderPlugins: PluginOption[] = [
    reactPlugin(),
    {
      name: 'vite-plugin-support-react-render-for-vitepress',
      config(config) {
        if (!config.define) config.define = {};
        if (!config.build) config.build = {};
        if (!config.build.rollupOptions) config.build.rollupOptions = {};
        if (!config.build.rollupOptions.output)
          config.build.rollupOptions.output = {};

        const originalChunkFileNames =
          (config.build.rollupOptions.output as Rollup.OutputOptions)
            .chunkFileNames || '[name].[hash].js';

        (
          config.build.rollupOptions.output as Rollup.OutputOptions
        ).chunkFileNames = function (chunkInfo) {
          if (isReactChunk(chunkInfo)) {
            return `${siteConfig.assetsDir}/chunks/react@${reactPackageVersion}.js`;
          }
          if (isReactClientChunk(chunkInfo)) {
            return `${siteConfig.assetsDir}/chunks/client@${reactDomPackageVersion}.js`;
          }
          return typeof originalChunkFileNames === 'function'
            ? originalChunkFileNames(chunkInfo)
            : originalChunkFileNames;
        };

        /**
         * In SSR mode, the @docs-islands/vitepress library must be built for
         * the `__BASE__` defined in `define` to take effect.
         */
        if (config.ssr) {
          if (Array.isArray(config.ssr.noExternal)) {
            config.ssr.noExternal.push('@docs-islands/vitepress');
          } else {
            config.ssr.noExternal = ['@docs-islands/vitepress'];
          }
        }

        return config;
      },
      transform: {
        order: 'pre',
        async handler(code, id) {
          const result = await transform(code, id, {
            resolveId: async (pendingResolveId: string, importer?: string) => {
              const resolvedId = await this.resolve(
                pendingResolveId,
                importer ?? id,
              );
              return resolvedId;
            },
          });
          return {
            code: result.code,
            map: result.map,
          };
        },
      },
    },
    {
      name: 'vite-plugin-support-spa-sync-render-for-vitepress',
      enforce: 'post',
      apply: 'build',
      configResolved(config) {
        ssr = Boolean(config.build.ssr);
      },
      generateBundle(_, bundles) {
        /**
         * The `spa:sync-render` directive is designed to
         * optimize the client-side scripts loaded during route changes.
         */
        if (ssr) {
          return;
        }
        for (const name in bundles) {
          if (!Object.prototype.hasOwnProperty.call(bundles, name)) continue;
          const chunk = bundles[name];
          if (isPageChunk(chunk) && !name.endsWith('-lean')) {
            const facadeModuleId = chunk.facadeModuleId;
            renderController.setClientChunkByFacadeModuleId(facadeModuleId, {
              outputPath: name,
              code: chunk.code,
            });
          }
        }
      },
    },
    {
      name: 'vite-plugin-support-react-render-for-vitepress-in-dev',
      apply: 'serve',
      enforce: 'pre',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url) {
            next();
            return;
          }

          const requestUrl = new URL(req.url, 'http://docs-islands.local');
          const normalizedBase = siteConfig.base.endsWith('/')
            ? siteConfig.base
            : `${siteConfig.base}/`;
          const debugSourcePath = `${normalizedBase}__docs-islands/debug-source`;

          if (requestUrl.pathname !== debugSourcePath) {
            next();
            return;
          }

          const sourcePath = requestUrl.searchParams.get('path');

          if (!sourcePath) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('Missing "path" query parameter.');
            return;
          }

          try {
            if (!fs.existsSync(sourcePath)) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end('Source file not found.');
              return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(fs.readFileSync(sourcePath, 'utf8'));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(error instanceof Error ? error.message : String(error));
          }
        });

        const collectCssModulesInSSR = (
          module: ModuleNode,
          hasVisited: Set<string>,
        ): string[] | null => {
          if (!module?.id || hasVisited.has(module.id)) {
            return null;
          }
          hasVisited.add(module.id);
          const { importedModules, id: moduleId } = module;
          if (!moduleId || moduleId.includes('node_modules')) {
            return null;
          }
          if (moduleId.endsWith('.css')) {
            return [moduleId.replace(siteConfig.srcDir, '')];
          }
          const collectCssModules = new Set<string>();
          if (importedModules.size > 0) {
            for (const importedModule of importedModules) {
              const collected = collectCssModulesInSSR(
                importedModule,
                hasVisited,
              );
              if (collected) {
                for (const cssPath of collected) {
                  collectCssModules.add(cssPath);
                }
              }
            }
          }
          return [...collectCssModules];
        };
        server.ws.on(
          'vrite-ssr-update',
          async (
            { pathname, data, updateType, requestId }: SSRUpdateData,
            client,
          ) => {
            const pendingInlineResolveId =
              transformPathForInlinePathResolver(pathname);
            const resolveId = await server.pluginContainer.resolveId(
              pendingInlineResolveId,
            );
            const markdownModuleId = resolveId ? resolveId.id : pathname;
            const compilationContainer =
              await renderController.getCompilationContainerByMarkdownModuleId(
                markdownModuleId,
              );

            const needCompile =
              compilationContainer.importsByLocalName.size > 0;

            if (needCompile && Array.isArray(data)) {
              const importsByLocalName =
                compilationContainer.importsByLocalName;
              const ssrOnlyComponentNames =
                compilationContainer.ssrOnlyComponentNames;
              const importedNameList: (string | null)[] = [];
              const ssrComponentsPromise: (
                | Promise<Record<string, string>>
                | Promise<ModuleNode | undefined>
                | undefined
              )[] = [];
              for (const preRenderComponent of data) {
                const { componentName } = preRenderComponent;
                const importInfo = importsByLocalName.get(componentName);
                if (importInfo) {
                  const { identifier, importedName } = importInfo;
                  const isSsrOnlyComponent =
                    ssrOnlyComponentNames.has(componentName);
                  importedNameList.push(importedName, null);
                  ssrComponentsPromise.push(
                    server.ssrLoadModule(identifier),
                    isSsrOnlyComponent
                      ? server.moduleGraph.getModuleByUrl(identifier)
                      : undefined,
                  );
                }
                continue;
              }
              const ssrComponents = await Promise.all(ssrComponentsPromise);

              const ssrComponentsRenderData: SSRUpdateRenderData['data'] = [];
              for (let i = 0; i < ssrComponents.length; i += 2) {
                const ssrComponent = ssrComponents[i] as Record<string, string>;
                const ssrOnlyModuleGraph = ssrComponents[i + 1];
                let ssrOnlyCss: string[] = [];

                /**
                 * If the component is only used for ssr:only rendering in the current page,
                 * the css resources need to be collected in order.
                 */
                if (ssrOnlyModuleGraph) {
                  ssrOnlyCss =
                    collectCssModulesInSSR(
                      ssrOnlyModuleGraph as ModuleNode,
                      new Set(),
                    ) || [];
                }

                const importedName = importedNameList[i] as string;
                const renderComponent = (importedName === 'default'
                  ? ssrComponent.default
                  : importedName === '*'
                    ? ssrComponent
                    : ssrComponent[importedName]) as unknown as
                  | React.FunctionComponent
                  | React.ComponentClass;

                const { renderId, props } = data[i / 2];
                const wrapSSROnlyCss = ssrOnlyCss.map((css) =>
                  join(siteConfig.base, css),
                );
                ssrComponentsRenderData.push({
                  renderId,
                  ssrOnlyCss: wrapSSROnlyCss,
                  ssrHtml: ReactDOMServer.renderToString(
                    React.createElement(renderComponent, props),
                  ),
                });
              }

              const ssrUpdateRenderData: SSRUpdateRenderData = {
                pathname,
                requestId,
                data: ssrComponentsRenderData,
              };

              switch (updateType) {
                case 'mounted': {
                  client.send('vrite-ssr-mount-render', ssrUpdateRenderData);
                  break;
                }
                case 'markdown-update': {
                  client.send(
                    'vrite-ssr-markdown-update-render',
                    ssrUpdateRenderData,
                  );
                  break;
                }
                case 'ssr-only-component-update': {
                  client.send(
                    'vrite-ssr-only-component-update-render',
                    ssrUpdateRenderData,
                  );
                  break;
                }
              }
            }
          },
        );
      },
      handleHotUpdate: {
        order: 'pre',
        async handler(ctx) {
          const { file, modules, server, read } = ctx;
          const Logger = loggerInstance.getLoggerByGroup('handle-hot-update');

          // Markdown level hot update
          if (file.endsWith('.md')) {
            const normalizedId = normalizePath(file);

            const originalContent = await read();
            // Match only script tags that start at the beginning of a line to avoid inline code matches inside prose
            const scriptReactRE =
              /^[\t ]*<script\b[^>]+lang=["']react["'][^>]*>.*?<\/script>/ms;

            // react container script tag needs to be parsed and removed before the Vue engine processes it, otherwise an error will occur.
            if (scriptReactRE.test(originalContent)) {
              const relativeId = normalizedId.replace(siteConfig.srcDir, '');
              Logger.success(
                `${relativeId} changed, container script content will be re-parsed...`,
              );
              let oldCompilationContainerImportsByLocalName = new Map<
                string,
                { identifier: string; importedName: string }
              >();

              if (
                renderController.hasCompilationContainerByMarkdownModuleId(
                  normalizedId,
                )
              ) {
                const oldCompilationContainer =
                  await renderController.getCompilationContainerByMarkdownModuleId(
                    normalizedId,
                  );
                oldCompilationContainerImportsByLocalName =
                  oldCompilationContainer.importsByLocalName;
              }

              // The old react script tag parsing result is invalid, so it needs to be recalculated.
              renderController.deleteCompilationContainerByMarkdownModuleId(
                normalizedId,
              );
              renderController.markdownModuleIdToPendingResolvedCompilationContainerMap.delete(
                normalizedId,
              );

              const { code: processedContent } = await transform(
                originalContent,
                normalizedId,
                {
                  resolveId: async (
                    pendingResolveId: string,
                    importer?: string,
                  ) => {
                    const resolvedId = await server.pluginContainer.resolveId(
                      pendingResolveId,
                      importer ?? file,
                    );
                    return resolvedId;
                  },
                },
              );

              const compilationContainer =
                await renderController.getCompilationContainerByMarkdownModuleId(
                  normalizedId,
                );
              const updates: Record<
                string,
                { path: string; importedName: string; sourcePath?: string }
              > = {};
              if (compilationContainer.importsByLocalName.size > 0) {
                for (const [
                  componentName,
                  importInfo,
                ] of compilationContainer.importsByLocalName.entries()) {
                  updates[componentName] = {
                    path: join(
                      '/',
                      importInfo.identifier.replace(siteConfig.srcDir, ''),
                    ),
                    importedName: importInfo.importedName,
                    sourcePath: importInfo.identifier,
                  };
                }
              }

              const missingImports = new Set<string>();
              for (const [
                componentName,
                ,
              ] of oldCompilationContainerImportsByLocalName.entries()) {
                if (
                  !compilationContainer.importsByLocalName.has(componentName)
                ) {
                  missingImports.add(componentName);
                }
              }

              ctx.read = async () => processedContent;

              server.ws.send({
                type: 'custom',
                event: 'vrite-markdown-update-prepare',
                data: {
                  updates,
                  missingImports: [...missingImports],
                },
              });
            }

            return modules;
          }

          return modules;
        },
      },
      resolveId: {
        order: 'pre',
        handler(id: string) {
          const normalized = normalizePath(id);

          if (normalized.includes(REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID)) {
            return normalized;
          }
          if (normalized === '@docs-islands/vitepress/internal/logger') {
            const __require = createRequire(import.meta.url);
            return __require.resolve('@docs-islands/vitepress/internal/logger');
          }
          return null;
        },
      },
      async load(id: string) {
        const normalized = normalizePath(id);

        if (normalized.includes(REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID)) {
          const queryString = normalized.split('?')[1] || '';
          const queryStringIterator = queryString.split('&') || [];
          const queryItemString = queryStringIterator.find((queryItemString) =>
            queryItemString.startsWith(
              RENDER_STRATEGY_CONSTANTS.renderClientInDev,
            ),
          );
          if (queryItemString) {
            const [key, queryPathname] = queryItemString.split('=');
            if (key === RENDER_STRATEGY_CONSTANTS.renderClientInDev) {
              const pendingInlineResolveId =
                transformPathForInlinePathResolver(queryPathname);
              const resolvedPathname = await this.resolve(
                pendingInlineResolveId,
              );
              const markdownModuleId = resolvedPathname
                ? resolvedPathname.id
                : queryPathname;
              return renderController.generateClientRuntimeInDEV(
                markdownModuleId,
              );
            }
          }
          return 'throw new Error("Invalid query string")';
        }

        return null;
      },
    },
    {
      name: 'vite-plugin-support-component-hmr-for-vitepress',
      enforce: 'pre',
      apply: 'serve',
      handleHotUpdate: {
        order: 'pre',
        async handler(ctx) {
          const { file, server, modules } = ctx;

          // Markdown level hot update doesn't need to be handled here, here is hot update support at the component level.
          if (file.endsWith('.md')) {
            return modules;
          }

          const {
            ssrOnlyComponentFullPathToPageIdAndImportedNameMap,
            nonSSROnlyComponentFullPathToPageIdAndImportedNameMap,
          } =
            await renderController.getComponentFullPathToPageIdAndImportedNameMap();
          const pageIdToSsrOnlyUpdateComponentsMap = new Map<
            string,
            Map<string, string>
          >();
          const pageIdToFastRefreshComponentsMap = new Map<
            string,
            Map<string, string>
          >();
          const deferredModules = new Set<ModuleNode>();
          const collectSsrOnlyModuleEntries = (
            module: ModuleNode | undefined,
            hasVisited: Set<string>,
          ) => {
            if (!module?.id || hasVisited.has(module.id)) {
              return;
            }
            hasVisited.add(module.id);
            if (
              ssrOnlyComponentFullPathToPageIdAndImportedNameMap.has(module.id)
            ) {
              const pageIdAndImportedNameSet =
                ssrOnlyComponentFullPathToPageIdAndImportedNameMap.get(
                  module.id,
                ) || [];
              for (const pageIdAndImportedName of pageIdAndImportedNameSet) {
                const [pageId, importedName] = pageIdAndImportedName.split(
                  '__SSR_ONLY_PLACEHOLDER__',
                );
                const updateComponents =
                  pageIdToSsrOnlyUpdateComponentsMap.get(pageId) ||
                  new Map<string, string>();
                updateComponents.set(importedName, module.id);
                pageIdToSsrOnlyUpdateComponentsMap.set(
                  pageId,
                  updateComponents,
                );
              }
            }
            if (
              nonSSROnlyComponentFullPathToPageIdAndImportedNameMap.has(
                module.id,
              )
            ) {
              const pageIdAndImportedNameSet =
                nonSSROnlyComponentFullPathToPageIdAndImportedNameMap.get(
                  module.id,
                ) || [];
              for (const pageIdAndImportedName of pageIdAndImportedNameSet) {
                const [pageId, importedName] = pageIdAndImportedName.split(
                  '__NON_SSR_ONLY_PLACEHOLDER__',
                );
                const updateComponents =
                  pageIdToFastRefreshComponentsMap.get(pageId) ||
                  new Map<string, string>();
                updateComponents.set(importedName, module.id);
                pageIdToFastRefreshComponentsMap.set(pageId, updateComponents);
              }
              deferredModules.add(module);
            }
            const importers = module.importers;
            for (const importer of importers) {
              collectSsrOnlyModuleEntries(importer, hasVisited);
            }
          };

          for (const module of modules) {
            collectSsrOnlyModuleEntries(module, new Set());
          }

          if (pageIdToFastRefreshComponentsMap.size > 0) {
            const updates: Record<
              string,
              {
                componentName: string;
                importedName?: string;
                sourcePath: string;
              }[]
            > = {};
            for (const [
              pageId,
              updateComponents,
            ] of pageIdToFastRefreshComponentsMap) {
              const nextUpdates = [...updateComponents.entries()].map(
                ([componentName, sourcePath]) => ({
                  componentName,
                  importedName: componentName,
                  sourcePath,
                }),
              );
              const resolvedPathname = await server.pluginContainer.resolveId(
                transformPathForInlinePathResolver(pageId),
              );
              if (resolvedPathname) {
                let cleanPathname = resolvedPathname.id;
                if (resolvedPathname.id.startsWith(siteConfig.base)) {
                  cleanPathname = resolvedPathname.id.replace(
                    siteConfig.base,
                    '',
                  );
                }
                if (!cleanPathname.startsWith('/')) {
                  cleanPathname = `/${cleanPathname}`;
                }
                updates[cleanPathname] = nextUpdates;
              }
            }
            server.ws.send({
              type: 'custom',
              event: 'vrite-react-fast-refresh-prepare',
              data: {
                updates,
              },
            });
          }

          if (pageIdToSsrOnlyUpdateComponentsMap.size > 0) {
            const updates: Record<
              string,
              {
                componentName: string;
                importedName?: string;
                sourcePath: string;
              }[]
            > = {};
            for (const [
              pageId,
              updateComponents,
            ] of pageIdToSsrOnlyUpdateComponentsMap) {
              const nextUpdates = [...updateComponents.entries()].map(
                ([componentName, sourcePath]) => ({
                  componentName,
                  importedName: componentName,
                  sourcePath,
                }),
              );
              const resolvedPathname = await server.pluginContainer.resolveId(
                transformPathForInlinePathResolver(pageId),
              );
              if (resolvedPathname) {
                let cleanPathname = resolvedPathname.id;
                if (resolvedPathname.id.startsWith(siteConfig.base)) {
                  cleanPathname = resolvedPathname.id.replace(
                    siteConfig.base,
                    '',
                  );
                }
                if (!cleanPathname.startsWith('/')) {
                  cleanPathname = `/${cleanPathname}`;
                }
                updates[cleanPathname] = nextUpdates;
              }
            }
            server.ws.send({
              type: 'custom',
              event: 'vrite-react-ssr-only-component-update',
              data: {
                updates,
              },
            });
            /**
             * Since module may be depended on by components with only the `ssr:only` directive and components in other scenarios,
             * we need to fully control the hmr update of components with only the `ssr:only` directive,
             * and other components with other directives follow the default HMR logic.
             */
            return [...deferredModules];
          }

          return modules;
        },
      },
    },
  ];

  if (!vitepressConfig.vite) {
    vitepressConfig.vite = {};
  }

  if (!vitepressConfig.vite.define) {
    vitepressConfig.vite.define = {};
  }
  vitepressConfig.vite.define.__BASE__ = JSON.stringify(siteConfig.base);
  vitepressConfig.vite.define.__CLEAN_URLS__ = JSON.stringify(
    siteConfig.cleanUrls,
  );

  if (!vitepressConfig.vite.plugins) {
    vitepressConfig.vite.plugins = [];
  }
  vitepressConfig.vite.plugins.push(
    createVitePressPathResolverPlugin(),
    ...reactRenderPlugins,
  );
}
