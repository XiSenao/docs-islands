import {
  ALLOWED_RENDER_DIRECTIVES,
  REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID,
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '@docs-islands/vitepress-shared/constants';
import type {
  ComponentBundleInfo,
  ConfigType,
  PageMetafile,
  RenderDirective,
  SSRUpdateData,
  SSRUpdateRenderData,
  UsedSnippetContainerType,
} from '@docs-islands/vitepress-types';
import { resolveConfig } from '@docs-islands/vitepress-utils';
import logger from '@docs-islands/vitepress-utils/logger';
import reactPlugin from '@vitejs/plugin-react-swc';
import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';
import { type ImportSpecifier, init, parse } from 'es-module-lexer';
import { default as MagicString, type SourceMap } from 'magic-string';
import MarkdownIt from 'markdown-it';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'pathe';
import React, { version as reactPackageVersion } from 'react';
import { version as reactDomPackageVersion } from 'react-dom';
import ReactDOMServer from 'react-dom/server';
import type { ModuleNode, PluginOption, Rollup } from 'vite';
import { normalizePath } from 'vite';
import type { DefaultTheme, UserConfig } from 'vitepress';
import {
  type ExtractedProps,
  transformReactSSRIntegrationCode,
} from '../../client/react/react-ssr-integration-processor';
import { GET_CLEAN_PATHNAME_RUNTIME } from '../../shared/runtime';
import type { CompilationContainerType } from '../core/render-controller';
import type { ImportNameSpecifier } from '../core/transform';
import coreTransformComponentTags, { travelImports } from '../core/transform';
import createVitePressPathResolverPlugin, {
  createPathResolver,
  transformPathForInlinePathResolver,
  type VitePressPathResolver,
} from '../plugins/vite-plugin-vitepress-path-resolver';
import { buildReactIntegrationInMPA } from './build/buildReactIntegrationInMPA';
import { bundleMultipleComponentsForBrowser } from './build/bundleMultipleComponentsForBrowser';
import { bundleMultipleComponentsForSSR } from './build/bundleMultipleComponentsForSSR';
import { ReactRenderController } from './react-render-controller';

interface ClientRuntimeMetafile {
  fileName: string;
  content: string;
}

let clientRuntimeMetafileCache: ClientRuntimeMetafile | null = null;

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

// TODO: Simplify processing; optimize further.
const getClientRuntimeMetafile = async (): Promise<ClientRuntimeMetafile> => {
  if (clientRuntimeMetafileCache) {
    return clientRuntimeMetafileCache;
  }
  const currentFilePath = fileURLToPath(import.meta.url);
  const fileExtension = extname(currentFilePath);
  const __require = createRequire(import.meta.url);
  let clientRuntimePath = __require.resolve(
    '@docs-islands/vitepress/shared/client/runtime',
  );
  if (fileExtension !== '.js') {
    /**
     * A consumer application can pull the @docs-islands/vitepress project
     * and add it as a Git sub-repository dependency within a monorepo.
     * This approach is useful for developing and debugging @docs-islands/vitepress.
     */
    try {
      clientRuntimePath = __require.resolve(
        '@docs-islands/vitepress/shared/client/runtime-dev',
      );
    } catch {
      logger
        .getLoggerByGroup('getClientRuntimeMetafile')
        .error(
          'This is developer mode, you need to build the @docs-islands/vitepress project first (pnpm build) to complete the build.',
        );
      throw new Error(
        'Developer mode detected without built artifacts. Please run "pnpm build" first.',
      );
    }
  }
  const clientRuntimeContent = fs.readFileSync(clientRuntimePath, 'utf8');
  const hash = createHash('sha256')
    .update(clientRuntimeContent)
    .digest('hex')
    .slice(0, 8);
  const clientRuntimeFileName = `client-runtime.${hash}.js`;
  const clientRuntimeMetafile = {
    fileName: clientRuntimeFileName,
    content: clientRuntimeContent,
  };
  return (clientRuntimeMetafileCache = clientRuntimeMetafile);
};

interface TransformContext {
  resolveId: (id: string) => Promise<{ id: string } | null>;
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

function registerBuildHelper(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  config: ConfigType,
  renderController: ReactRenderController,
) {
  const { assetsDir, mpa, wrapBaseUrl } = config;
  let inlinePathResolver: VitePressPathResolver | null = null;

  const preHtmlTransform = vitepressConfig.transformHtml?.bind(vitepressConfig);
  /**
   * Each page proactively preloads React and React DOM to accelerate lazy loading.
   * Injection is deferred to avoid preempting resources when concurrency limits are reached.
   */
  const injectReactModulePreload = async ($: CheerioAPI) => {
    const publicReactPath = join(
      '/',
      assetsDir,
      `chunks/react@${reactPackageVersion}.js`,
    );
    const publicReactClientPath = join(
      '/',
      assetsDir,
      `chunks/client@${reactDomPackageVersion}.js`,
    );
    const { fileName } = await getClientRuntimeMetafile();
    const publicClientRuntimeFilePath = join(
      '/',
      assetsDir,
      `chunks/${fileName}`,
    );
    $('head').append(`
      <link rel="modulepreload" href="${wrapBaseUrl(publicReactPath)}" crossorigin>
      <link rel="modulepreload" href="${wrapBaseUrl(publicReactClientPath)}" crossorigin>
      <link rel="modulepreload" href="${wrapBaseUrl(publicClientRuntimeFilePath)}" crossorigin>
    `);
  };
  vitepressConfig.transformHtml = async (html, id, ctx) => {
    const pageName = ctx.page;
    const pendingResolvedId = join('/', pageName.replace('.md', ''));
    const Logger = logger.getLoggerByGroup('transformHtml');
    const transformedHtml = preHtmlTransform
      ? await Promise.resolve(preHtmlTransform(html, id, ctx))
      : html;
    const $ = load(transformedHtml ? transformedHtml.toString() : '');

    const pendingInlineResolveId =
      transformPathForInlinePathResolver(pendingResolvedId);
    if (!inlinePathResolver) {
      inlinePathResolver = createPathResolver(ctx.siteConfig);
    }
    const resolvedId =
      inlinePathResolver.resolveId(pendingInlineResolveId) || pendingResolvedId;
    if (
      !renderController.hasCompilationContainerByMarkdownModuleId(resolvedId)
    ) {
      await injectReactModulePreload($);
      return $.html();
    }

    const compilationContainer =
      await renderController.getCompilationContainerByMarkdownModuleId(
        resolvedId,
      );
    const importsByLocalName = compilationContainer.importsByLocalName;

    if (importsByLocalName.size === 0) {
      await injectReactModulePreload($);
      return $.html();
    }

    const elementsToRender = $(
      `[${RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase()}]`,
    );

    if (elementsToRender.length === 0) {
      await injectReactModulePreload($);
      return $.html();
    }

    const clientScripts = new Set<string>();
    const clientComponentsToBundle = new Map<string, ComponentBundleInfo>();
    const ssrComponentsToBundle = new Map<string, ComponentBundleInfo>();
    const usedSnippetContainer =
      renderController.getUsedSnippetContainerByMarkdownModuleId(resolvedId) ||
      new Map<string, UsedSnippetContainerType>();

    renderController.setUsedSnippetContainer(resolvedId, usedSnippetContainer);
    for (const el of elementsToRender.toArray()) {
      const $el = $(el);
      const renderId = $el.attr(
        RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
      );
      const componentName = $el.attr(
        RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
      );
      const renderDirective = ($el.attr(
        RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
      ) || 'ssr:only') as RenderDirective;

      if (
        !componentName ||
        !renderId ||
        !ALLOWED_RENDER_DIRECTIVES.includes(renderDirective)
      ) {
        continue;
      }

      const importReference = importsByLocalName.get(componentName);
      if (!importReference) {
        Logger.warn(
          `Component "${componentName}" import not found for page ${id}.`,
        );
        continue;
      }

      if (renderDirective !== 'client:only') {
        if (!ssrComponentsToBundle.has(importReference.identifier)) {
          ssrComponentsToBundle.set(importReference.identifier, {
            componentPath: importReference.identifier,
            componentName,
            importReference,
            pendingRenderIds: new Set(),
            renderDirectives: new Set(),
          });
        }

        const ssrComponentBundle = ssrComponentsToBundle.get(
          importReference.identifier,
        );
        if (ssrComponentBundle) {
          ssrComponentBundle.pendingRenderIds.add(renderId);
          ssrComponentBundle.renderDirectives.add(renderDirective);
        }

        /**
         * Collect the props information of the current element, which is determined during the
         * transform phase.
         */
        const usedSnippet = usedSnippetContainer.get(renderId);
        if (usedSnippet) {
          const elementProps = new Map<string, string>();
          const attrs = $el.attr();
          if (attrs) {
            for (const [key, value] of Object.entries(attrs)) {
              if (!RENDER_STRATEGY_ATTRS.includes(key)) {
                elementProps.set(key, value);
              }
            }
          }
          usedSnippet.props = elementProps;
        }
      }

      /**
       * Although we don't need to care about ssr:only components,
       * we need to generate the static resources required by ssr:only components.
       */
      if (!clientComponentsToBundle.has(importReference.identifier)) {
        clientComponentsToBundle.set(importReference.identifier, {
          componentPath: importReference.identifier,
          componentName,
          importReference,
          pendingRenderIds: new Set(),
          renderDirectives: new Set(),
        });
      }

      const componentBundle = clientComponentsToBundle.get(
        importReference.identifier,
      );
      if (componentBundle) {
        componentBundle.pendingRenderIds.add(renderId);
        componentBundle.renderDirectives.add(renderDirective);
      }
    }

    const pageMetafile: PageMetafile = {
      loaderScript: '',
      modulePreloads: [],
      cssBundlePaths: [],
      ssrInjectScript: '',
    };

    // Complete SSR first to enable `spa:sync-render` optimizations in the client script.
    if (ssrComponentsToBundle.size > 0) {
      try {
        const { renderedComponents } = await bundleMultipleComponentsForSSR(
          config,
          [...ssrComponentsToBundle.values()],
          usedSnippetContainer,
        );

        for (const [renderId, html] of renderedComponents.entries()) {
          const targetElement = $(
            `[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}="${renderId}"]`,
          );
          if (targetElement) {
            targetElement.html(html);
            Logger.success(`Injected SSR HTML for render ID: ${renderId}`);
          }
        }
      } catch (error) {
        Logger.error(
          `Failed to bundle and render SSR components for page ${id}, error: ${error}`,
        );
      }
    }

    if (clientComponentsToBundle.size > 0) {
      try {
        const {
          loaderScript,
          modulePreloads,
          cssBundlePaths,
          ssrInjectScript,
        } = await bundleMultipleComponentsForBrowser(
          config,
          [...clientComponentsToBundle.values()],
          usedSnippetContainer,
        );

        for (const [, usedSnippet] of usedSnippetContainer) {
          if (usedSnippet.ssrCssBundlePaths) {
            const wrapCssBundlePaths = new Set<string>();
            for (const cssBundlePath of usedSnippet.ssrCssBundlePaths) {
              wrapCssBundlePaths.add(wrapBaseUrl(cssBundlePath));
            }
            usedSnippet.ssrCssBundlePaths = wrapCssBundlePaths;
          }
        }

        if (loaderScript) {
          clientScripts.add(loaderScript);

          // Inject page-required preload scripts at build time to accelerate subsequent script loading.
          if (modulePreloads.length > 0) {
            const preloadTags = modulePreloads
              .map((src) => {
                pageMetafile.modulePreloads.push(wrapBaseUrl(src));
                return `<link rel="modulepreload" href="${wrapBaseUrl(src)}">`;
              })
              .join('\n');
            $('head').append(preloadTags);
          }
          if (ssrInjectScript) {
            pageMetafile.ssrInjectScript = wrapBaseUrl(ssrInjectScript);
            $('head').append(`
              <link rel="modulepreload" href="${wrapBaseUrl(ssrInjectScript)}" crossorigin>
            `);
          }
          if (cssBundlePaths.length > 0) {
            const cssBundleTags = cssBundlePaths
              .map((src) => {
                pageMetafile.cssBundlePaths.push(wrapBaseUrl(src));
                return `<link data-vrite-css-bundle="${wrapBaseUrl(src)}" rel="stylesheet"  href="${wrapBaseUrl(src)}" crossorigin>`;
              })
              .join('\n');
            $('head').append(cssBundleTags);
          }
          pageMetafile.loaderScript = wrapBaseUrl(loaderScript);
          $('head').append(`
            <link rel="modulepreload" href="${wrapBaseUrl(loaderScript)}" crossorigin>
          `);
        }
      } catch (error) {
        Logger.error(
          `Failed to bundle components for page ${id}, error: ${error}`,
        );
      }
    }

    if (
      pageMetafile.loaderScript ||
      pageMetafile.modulePreloads.length > 0 ||
      pageMetafile.cssBundlePaths.length > 0 ||
      pageMetafile.ssrInjectScript
    ) {
      renderController.setPageMetafile(ctx.page, pageMetafile);
    }

    if (clientScripts.size > 0) {
      if (mpa) {
        const { entryPoint, modulePreloads } =
          await buildReactIntegrationInMPA(config);
        if (modulePreloads.length > 0) {
          const preloadTags = modulePreloads
            .map(
              (src) => `<link rel="modulepreload" href="${wrapBaseUrl(src)}">`,
            )
            .join('\n');
          $('head').append(preloadTags);
        }
        if (entryPoint) {
          $('head').append(
            `<script type="module" src="${wrapBaseUrl(entryPoint)}"></script>`,
          );
        }
      }

      const scriptTags = [...clientScripts]
        .map(
          (src) => `<script src="${wrapBaseUrl(src)}" type="module"></script>`,
        )
        .join('\n');
      $('head').append(scriptTags);
    }

    if (!mpa) {
      await injectReactModulePreload($);
    }

    return $.html();
  };

  vitepressConfig.buildEnd = async () => {
    const { outDir, assetsDir } = config;
    const matafileDir = join(outDir, assetsDir);
    const Logger = logger.getLoggerByGroup('buildEnd');
    const { fileName, content } = await getClientRuntimeMetafile();
    const clientRuntimeFilePath = join(matafileDir, `chunks/${fileName}`);
    fs.writeFileSync(clientRuntimeFilePath, content);

    const transformedPageMetafileMap =
      renderController.getTransformedPageMetafile();
    if (Object.keys(transformedPageMetafileMap).length > 0) {
      const metafilePath = join(matafileDir, 'vrite-page-metafile.json');
      fs.writeFileSync(
        metafilePath,
        JSON.stringify(transformedPageMetafileMap, null, 2),
      );
      Logger.info(
        `Generated global page metafile with ${Object.keys(transformedPageMetafileMap).length} pages`,
      );
    }

    const markdownModuleIdToSpaSyncRenderMap =
      renderController.getMarkdownModuleIdToSpaSyncRenderMap();
    if (markdownModuleIdToSpaSyncRenderMap.size > 0) {
      for (const [
        markdownModuleId,
        spaSyncRender,
      ] of markdownModuleIdToSpaSyncRenderMap.entries()) {
        const { outputPath, code, renderIdToSpaSyncRenderMap } = spaSyncRender;
        const { code: transformedCode, stats } =
          transformReactSSRIntegrationCode(code, (props: ExtractedProps) => {
            const renderId =
              props[RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()];
            if (
              typeof renderId === 'string' &&
              renderIdToSpaSyncRenderMap.has(renderId)
            ) {
              const { ssrHtml, ssrCssBundlePaths } =
                renderIdToSpaSyncRenderMap.get(renderId)!;
              return {
                ssrHtml,
                ssrCssBundlePaths,
                clientRuntimeFileName: fileName,
              };
            }
            return {
              ssrHtml: '',
              ssrCssBundlePaths: new Set(),
              clientRuntimeFileName: fileName,
            };
          });
        if (stats.totalTransformations > 0) {
          logger.getLoggerByGroup('ReactSSRIntegrationProcessor').success(`
            Complete ${stats.totalTransformations} pre-rendering injections for page ${markdownModuleId}

            ${stats.transformedNodes.map((node) => `- Line ${node.line}, Column ${node.column}`).join('\n')}
          `);
          fs.writeFileSync(join(outDir, outputPath), transformedCode);
        } else {
          logger
            .getLoggerByGroup('ReactSSRIntegrationProcessor')
            .info(
              `No transformations performed, preserve original code for ${markdownModuleId}.`,
            );
        }
      }
    }
  };
}

export default function vitepressReactRenderingStrategies(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
): void {
  let ssr = false;
  const siteConfig: ConfigType = resolveConfig(vitepressConfig);
  const renderController = new ReactRenderController();

  registerBuildHelper(vitepressConfig, siteConfig, renderController);

  async function transform(
    code: string,
    id: string,
    ctx: TransformContext,
  ): Promise<{ code: string; map: SourceMap | null }> {
    // Normalize and clean the id to ensure consistent behavior across platforms (e.g., Windows adds ?v=...)
    const cleanedId = normalizePath(id.split('?')[0].replace(/#.*$/, ''));

    if (!cleanedId.endsWith('.md')) {
      return {
        code,
        map: null,
      };
    }
    const normalizedId = cleanedId;
    await init;

    const s = new MagicString(code);
    // Match only script tags that start at the beginning of a line to avoid inline code like `<script lang="react">` inside Markdown text
    const scriptReactRE =
      /^[\t ]*<script\b[^>]*lang=["']react["'][^>]*>([^]*?)<\/script>/gm;

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

    let scriptMatch;
    const scriptMatches: Array<{
      match: RegExpExecArray;
      content: string;
      startIndex: number;
      endIndex: number;
    }> = [];

    const md = new MarkdownIt({ html: true });
    const tokens = md.parse(code, {});
    const codeBlockRanges: Array<{ start: number; end: number }> = [];
    for (const token of tokens) {
      if (token.map) {
        const [startLine, endLine] = token.map;
        const lines = code.split('\n');
        const tokenStart = lines
          .slice(0, startLine)
          .reduce((acc, line) => acc + line.length + 1, 0);
        const tokenEnd =
          lines
            .slice(0, endLine)
            .reduce((acc, line) => acc + line.length + 1, 0) - 1;
        if (token.type === 'code_block' || token.type === 'fence') {
          codeBlockRanges.push({ start: tokenStart, end: tokenEnd });
        }
      }
    }

    const isInCodeBlock = (position: number): boolean => {
      return codeBlockRanges.some(
        (range) => position >= range.start && position <= range.end,
      );
    };

    // Find all script tags, but filter out those within code blocks
    while ((scriptMatch = scriptReactRE.exec(code)) !== null) {
      const content = scriptMatch[1];
      const startIndex = scriptMatch.index;
      const endIndex = startIndex + scriptMatch[0].length;

      // Skip this match if it's within a code block
      if (isInCodeBlock(startIndex)) {
        continue;
      }

      scriptMatches.push({ match: scriptMatch, content, startIndex, endIndex });
    }

    if (scriptMatches.length > 1) {
      throw new Error(
        'Single file can contain only one <script lang="react"> element.',
      );
    }

    // Process script tags in reverse order to maintain correct indices
    let hasScriptTransformation = false;

    const inlineComponentReferenceMap = new Map<
      string,
      { localName: string; path: string; importedName: string }
    >();
    // The <script lang="react"> element only declares React components, reducing complexity while maintaining consistency with <script setup>.
    if (scriptMatches.length === 1) {
      const { content, startIndex, endIndex } = scriptMatches[0];
      hasScriptTransformation = true;

      const lowerCaseComponentNamesToOriginalNames = new Map<string, string>();
      const maybeComponentReferenceMap = new Map<
        string,
        { identifier: string; importedName: string }
      >();
      let imports: ReadonlyArray<ImportSpecifier>;
      try {
        [imports] = parse(content);
      } catch (parseError) {
        // Log a warning instead of throwing an error for parse failures.
        // This allows the build to continue with other valid components.
        logger
          .getLoggerByGroup('ReactPlugin')
          .warn(
            `Failed to parse JavaScript in ${id}: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          );

        // Remove the problematic script tag entirely to prevent further processing errors.
        const { startIndex, endIndex } = scriptMatches[0];
        const replacement = '\n'.repeat(
          code.slice(startIndex, endIndex).split('\n').length - 1,
        );
        s.overwrite(startIndex, endIndex, replacement);

        // Ensure we exit script processing and return clean Markdown.
        return {
          code: s.toString(),
          map: s.generateMap({ source: id, file: id, includeContent: true }),
        };
      }

      for (const _importSpecifier of imports) {
        const importSpecifier = _importSpecifier || {};
        let { ss: expStart, se: expEnd, n: identifier = '' } = importSpecifier;
        const resolved = await ctx.resolveId(identifier);
        if (resolved) {
          identifier = resolved.id;
        } else {
          // Log an error instead of throwing during failed import resolution.
          // This allows the build to continue and lets the bundler handle the error.
          logger
            .getLoggerByGroup('ReactPlugin')
            .error(
              `Failed to resolve import ${identifier} in ${id}, skipping component registration`,
            );
          continue;
        }

        const exp = content.slice(expStart, expEnd);
        let importSets: ImportNameSpecifier[];
        try {
          importSets = travelImports(exp) || [];
        } catch (importParseError) {
          // Log a warning and skip this import if parsing fails.
          logger
            .getLoggerByGroup('ReactPlugin')
            .warn(
              `Failed to parse import statement in ${id}: ${importParseError instanceof Error ? importParseError.message : String(importParseError)}`,
            );
          continue;
        }

        for (const importSet of importSets) {
          const { importedName, localName } = importSet;
          if (/^[A-Z][\dA-Za-z]*$/.test(localName)) {
            /**
             * The HTML module is case-insensitive and standardizes to lowercase.
             * An error will be thrown in the following scenarios:
             *
             * import HelloWorld from './HelloWorld';
             * import Helloworld from './HelloWorld'; // X
             *
             * <HelloWorld />
             * <Helloworld />
             */
            const lowerCaseLocalName = localName.toLowerCase();
            if (
              lowerCaseComponentNamesToOriginalNames.has(lowerCaseLocalName)
            ) {
              throw new Error(
                `[@docs-islands/vitepress] Duplicate component name ${localName} in ${id}, please use the same case as the import statement.`,
              );
            }
            lowerCaseComponentNamesToOriginalNames.set(
              lowerCaseLocalName,
              localName,
            );

            maybeComponentReferenceMap.set(localName, {
              identifier,
              importedName,
            });
            inlineComponentReferenceMap.set(localName, {
              localName,
              path: join('/', identifier.replace(siteConfig.srcDir, '')),
              importedName,
            });
          }
        }
      }

      // Replace the entire script tag with empty lines to preserve line numbers.
      const replacement = '\n'.repeat(
        code.slice(startIndex, endIndex).split('\n').length - 1,
      );
      s.overwrite(startIndex, endIndex, replacement);

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

        // Combine source maps if we have both script and component transformations.
        if (hasScriptTransformation && componentMap) {
          // For now, we'll use the component map as the final map since it's the last transformation.
          // In a more sophisticated implementation, we could chain the source maps.
          finalMap = componentMap;
        } else if (componentMap) {
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
            _,
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

          if (renderDirective !== 'ssr:only') {
            nonSSROnlyComponentNames.add(renderComponent);
          } else {
            ssrOnlyComponentNames.add(renderComponent);
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
          const __PAGE_ID__ = (${GET_CLEAN_PATHNAME_RUNTIME.toString()})();
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
                  ${RENDER_STRATEGY_CONSTANTS.reactInlineComponentReference}['${inlineComponentReference.localName}'] = {
                    component: null,
                    path: '${inlineComponentReference.path}',
                    importedName: '${inlineComponentReference.importedName}'
                  }
                `;
              }
              return `
                ${RENDER_STRATEGY_CONSTANTS.reactInlineComponentReference}['${inlineComponentReference.localName}'] = {
                  component: ${inlineComponentReference.localName},
                  path: '${inlineComponentReference.path}',
                  importedName: '${inlineComponentReference.importedName}'
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
            id,
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
          id,
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

        config.define.__BASE__ = JSON.stringify(siteConfig.base);

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
            resolveId: async (pendingResolveId: string) => {
              const resolvedId = await this.resolve(pendingResolveId, id);
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
        const collectCssModulesInSSR = (
          module: ModuleNode,
          hasVisited: Set<string>,
        ): string[] | null => {
          if (!module?.id || hasVisited.has(module.id)) {
            return null;
          }
          hasVisited.add(module.id);
          const { importedModules, id } = module;
          if (!id || id.includes('node_modules')) {
            return null;
          }
          if (id.endsWith('.css')) {
            return [id.replace(siteConfig.srcDir, '')];
          }
          const collectCssModules = new Set<string>();
          if (importedModules.size > 0) {
            for (const module of importedModules) {
              const collected = collectCssModulesInSSR(module, hasVisited);
              if (collected) {
                for (const id of collected) {
                  collectCssModules.add(id);
                }
              }
            }
          }
          return [...collectCssModules];
        };
        server.ws.on(
          'vrite-ssr-update',
          async ({ pathname, data, updateType }: SSRUpdateData, client) => {
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
              const importedNameList: Array<string | null> = [];
              const ssrComponentsPromise: Array<
                | Promise<Record<string, string>>
                | Promise<ModuleNode | undefined>
                | undefined
              > = [];
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
          const Logger = logger.getLoggerByGroup('handleHotUpdate');

          // Markdown level hot update
          if (file.endsWith('.md')) {
            const normalizedId = normalizePath(file);

            const originalContent = await read();
            // Match only script tags that start at the beginning of a line to avoid inline code matches inside prose
            const scriptReactRE =
              /^[\t ]*<script\b[^>]*lang=["']react["'][^>]*>([^]*?)<\/script>/gm;

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
                  resolveId: async (pendingResolveId: string) => {
                    const resolvedId = await server.pluginContainer.resolveId(
                      pendingResolveId,
                      file,
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
                { path: string; importedName: string }
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
                  };
                }
              }

              const missingImports = new Set<string>();
              for (const [
                componentName,
                _,
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
          if (normalized === '@docs-islands/vitepress/utils/client/logger') {
            const __require = createRequire(import.meta.url);
            return __require.resolve(
              '@docs-islands/vitepress/utils/client/logger',
            );
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
          const pageIdToUpdateComponentNamesMap = new Map<
            string,
            Set<string>
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
                const updateComponentNames =
                  pageIdToUpdateComponentNamesMap.get(pageId) ||
                  new Set<string>();
                updateComponentNames.add(importedName);
                pageIdToUpdateComponentNamesMap.set(
                  pageId,
                  updateComponentNames,
                );
              }
            }
            if (
              nonSSROnlyComponentFullPathToPageIdAndImportedNameMap.has(
                module.id,
              )
            ) {
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

          if (pageIdToUpdateComponentNamesMap.size > 0) {
            const updates: Record<string, string[]> = {};
            for (const [
              pageId,
              updateComponentNames,
            ] of pageIdToUpdateComponentNamesMap) {
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
                updates[cleanPathname] = [...updateComponentNames];
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

  if (!vitepressConfig.vite.plugins) {
    vitepressConfig.vite.plugins = [];
  }
  vitepressConfig.vite.plugins.push(
    createVitePressPathResolverPlugin(),
    ...reactRenderPlugins,
  );
}
