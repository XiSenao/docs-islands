import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type {
  BundleAssetMetric,
  PageBuildMetrics,
  PageMetafile,
  RuntimeBundleMetric,
  SpaSyncComponentSideEffectMetric,
} from '#dep-types/page';
import type { RenderDirective } from '#dep-types/render';
import type { ConfigType } from '#dep-types/utils';
import {
  ALLOWED_RENDER_DIRECTIVES,
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '#shared/constants';
import getLoggerInstance from '#shared/logger';
import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'pathe';
import { version as reactPackageVersion } from 'react';
import { version as reactDomPackageVersion } from 'react-dom';
import type { DefaultTheme, UserConfig } from 'vitepress';
import {
  type ExtractedProps,
  transformReactSSRIntegrationCode,
} from '../../client/react/react-ssr-integration-processor';
import {
  createPathResolver,
  transformPathForInlinePathResolver,
  type VitePressPathResolver,
} from '../plugins/vite-plugin-vitepress-path-resolver';
import { buildReactIntegrationInMPA } from './build/buildReactIntegrationInMPA';
import { bundleMultipleComponentsForBrowser } from './build/bundleMultipleComponentsForBrowser';
import { bundleMultipleComponentsForSSR } from './build/bundleMultipleComponentsForSSR';
import type { ReactRenderController } from './react-render-controller';

const loggerInstance = getLoggerInstance();

interface ClientRuntimeMetafile {
  fileName: string;
  content: string;
}

let clientRuntimeMetafileCache: ClientRuntimeMetafile | null = null;
// TODO: Simplify processing; optimize further.

const getClientRuntimeMetafile = async (): Promise<ClientRuntimeMetafile> => {
  if (clientRuntimeMetafileCache) {
    return clientRuntimeMetafileCache;
  }
  const currentFilePath = fileURLToPath(import.meta.url);
  const fileExtension = extname(currentFilePath);
  const __require = createRequire(import.meta.url);
  let clientRuntimePath = __require.resolve(
    '@docs-islands/vitepress/internal/runtime',
  );
  if (fileExtension !== '.js') {
    /**
     * The user's site project may import this dependency via a git sub-repo or other development-mode setup.
     * In that case, the built artifacts are not automatically generated, so we proactively fall back to
     * the helper runtime and surface a clearer error if it is still unavailable.
     */
    try {
      clientRuntimePath = __require.resolve(
        '@docs-islands/vitepress/internal-helper/runtime',
      );
    } catch {
      loggerInstance
        .getLoggerByGroup('client-runtime-metafile')
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

const wrapBundleAssetMetrics = (
  metrics: BundleAssetMetric[],
  wrapBaseUrl: (value: string) => string,
): BundleAssetMetric[] =>
  metrics.map((metric) => ({
    ...metric,
    file: wrapBaseUrl(metric.file),
  }));

const wrapRuntimeBundleMetric = (
  metric: RuntimeBundleMetric | null,
  wrapBaseUrl: (value: string) => string,
): RuntimeBundleMetric | null => {
  if (!metric) {
    return null;
  }

  return {
    ...metric,
    entryFile: wrapBaseUrl(metric.entryFile),
    files: wrapBundleAssetMetrics(metric.files, wrapBaseUrl),
  };
};

const wrapPageBuildMetrics = (
  metrics: PageBuildMetrics,
  wrapBaseUrl: (value: string) => string,
): PageBuildMetrics => ({
  ...metrics,
  components: metrics.components.map((componentMetric) => ({
    ...componentMetric,
    entryFile: wrapBaseUrl(componentMetric.entryFile),
    files: wrapBundleAssetMetrics(componentMetric.files, wrapBaseUrl),
    modules: componentMetric.modules.map((moduleMetric) => ({
      ...moduleMetric,
      file: wrapBaseUrl(moduleMetric.file),
      sourceAssetFile: moduleMetric.sourceAssetFile
        ? wrapBaseUrl(moduleMetric.sourceAssetFile)
        : undefined,
    })),
  })),
  loader: wrapRuntimeBundleMetric(metrics.loader, wrapBaseUrl),
  spaSyncEffects: metrics.spaSyncEffects
    ? {
        ...metrics.spaSyncEffects,
        components: metrics.spaSyncEffects.components.map(
          (component): SpaSyncComponentSideEffectMetric => ({
            ...component,
            blockingCssFiles: wrapBundleAssetMetrics(
              component.blockingCssFiles,
              wrapBaseUrl,
            ),
          }),
        ),
      }
    : null,
  ssrInject: wrapRuntimeBundleMetric(metrics.ssrInject, wrapBaseUrl),
});

export function registerBuildHelper(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  config: ConfigType,
  renderController: ReactRenderController,
): void {
  const { assetsDir, mpa, wrapBaseUrl } = config;
  let inlinePathResolver: VitePressPathResolver | null = null;

  const preHtmlTransform = vitepressConfig.transformHtml?.bind(vitepressConfig);
  /**
   * Proactively preload React, ReactDOM, and the client runtime so the page can begin
   * resolving shared dependencies before the actual integration loader executes.
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
    // Keep the fast path cheap: even pages without React islands still receive shared preloads.
    const pageName = ctx.page;
    const pendingResolvedId = join('/', pageName.replace('.md', ''));
    const Logger = loggerInstance.getLoggerByGroup('transform-html');
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

    // Multiple islands on the same page can share one loader entry, so dedupe at the page boundary.
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
         * Collect the current element's props during the transform phase so SSR output
         * and later client-side reconciliation share the same attribute snapshot.
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
       * Even for `ssr:only` components, we still generate static resources so SSR output,
       * page metadata, and downstream preload/caching behavior remain consistent.
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
          buildMetrics,
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

        pageMetafile.buildMetrics = wrapPageBuildMetrics(
          buildMetrics,
          wrapBaseUrl,
        );

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
    const { outDir, assetsDir, cleanUrls } = config;
    const matafileDir = join(outDir, assetsDir);
    const Logger = loggerInstance.getLoggerByGroup('build-end');
    const { fileName, content } = await getClientRuntimeMetafile();
    const clientRuntimeFilePath = join(matafileDir, `chunks/${fileName}`);
    fs.writeFileSync(clientRuntimeFilePath, content);

    const transformedPageMetafileMap =
      renderController.getTransformedPageMetafile(cleanUrls);
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
          loggerInstance.getLoggerByGroup('react-ssr-integration-processor')
            .success(`
            Complete ${stats.totalTransformations} pre-rendering injections for page ${markdownModuleId}

            ${stats.transformedNodes.map((node) => `- Line ${node.line}, Column ${node.column}`).join('\n')}
          `);
          fs.writeFileSync(join(outDir, outputPath), transformedCode);
        } else {
          loggerInstance
            .getLoggerByGroup('react-ssr-integration-processor')
            .info(
              `No transformations performed, preserve original code for ${markdownModuleId}.`,
            );
        }
      }
    }
  };
}
