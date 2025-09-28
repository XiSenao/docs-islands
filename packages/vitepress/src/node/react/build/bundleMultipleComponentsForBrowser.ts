import { RENDER_STRATEGY_CONSTANTS } from '@docs-islands/vitepress-shared/constants';
import type {
  ComponentBundleInfo,
  ConfigType,
  UsedSnippetContainerType
} from '@docs-islands/vitepress-types';
import { isNodeLikeBuiltin } from '@docs-islands/vitepress-utils';
import logger, { lightGeneralLogger } from '@docs-islands/vitepress-utils/logger';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { dirname, join } from 'pathe';
import type { InlineConfig } from 'vite';
import { build } from 'vite';
import { GET_CLEAN_PATHNAME_RUNTIME } from '../../../shared/runtime';
import type { FrameworkAdapter } from '../../core/framework-adapter';
import { reactAdapter } from '../adapter';
import { isOutputAsset, isOutputChunk } from './shared';

const Logger = logger.getLoggerByGroup('bundleMultipleComponentsForBrowser');

export async function bundleMultipleComponentsForBrowser(
  config: ConfigType,
  components: ComponentBundleInfo[],
  usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  adapter: FrameworkAdapter = reactAdapter
): Promise<{
  loaderScript: string;
  modulePreloads: string[];
  cssBundlePaths: string[];
  ssrInjectScript: string;
}> {
  const { base, srcDir, assetsDir, outDir, wrapBaseUrl } = config;
  if (components.length === 0) {
    return { loaderScript: '', modulePreloads: [], cssBundlePaths: [], ssrInjectScript: '' };
  }

  const entryPoints: Record<string, string> = {};
  const componentMapping = new Map<string, ComponentBundleInfo>();

  for (const comp of components) {
    const entryKey = comp.componentName;
    entryPoints[entryKey] = comp.componentPath;
    componentMapping.set(comp.componentPath, comp);
  }

  try {
    const viteConfig: InlineConfig = {
      root: srcDir,
      base,
      build: {
        ssr: false,
        rollupOptions: {
          input: entryPoints,
          preserveEntrySignatures: 'allow-extension',
          external: id => {
            /**
             * Components using only the `ssr:only` directive will also go through the client-side build process,
             * so node modules need to be externalized.
             */
            if (isNodeLikeBuiltin(id)) {
              return true;
            }
            return false;
          },
          output: {
            format: 'esm',
            assetFileNames: `${assetsDir}/[name].[hash].[ext]`,
            entryFileNames: `${assetsDir}/[name].[hash].js`,
            chunkFileNames: `${assetsDir}/chunks/[name].[hash].js`
          }
        },
        write: false,
        target: 'es2022',
        minify: true,
        manifest: true,
        assetsInlineLimit: 4096,
        cssCodeSplit: true
      },
      plugins: adapter.browserBundlerPlugins(),
      define: {
        'process.env.NODE_ENV': '"production"'
      },
      logLevel: 'warn'
    };

    const output = await build(viteConfig);
    if (!output || !('output' in output) || !Array.isArray(output.output)) {
      throw new Error('Expected a array output bundle');
    }

    const componentEntries: Array<{
      componentName: string;
      cssBundlePath: string[];
      assetsBundlePath: string[];
      modulePath: string;
      importReference: { importedName: string; identifier: string };
      pendingRenderIds: Set<string>;
    }> = [];
    const modulePreloads: string[] = [];
    const cssBundlePaths: string[] = [];
    const preRenderComponentNameToCssBundlePathsMap = new Map<string, Set<string>>();

    for (const chunk of output.output) {
      if (isOutputChunk(chunk) && chunk.isEntry && chunk.facadeModuleId) {
        const fullEntryPointPath = chunk.facadeModuleId;
        const clientComponentInfo = componentMapping.get(fullEntryPointPath);

        if (!clientComponentInfo) continue;

        const componentModuleRelativePath = join('/', chunk.fileName);

        const importedCss = [...(chunk.viteMetadata?.importedCss ?? [])];
        const publicCssBundlePaths = importedCss.map(css => join('/', css));

        /**
         * If the rendering component in the current page is NOT only rendered with client:only strategy,
         * it means that the rendering component needs server-side pre-rendering or other strategies.
         */
        if (
          !clientComponentInfo.renderDirectives.has('client:only') ||
          clientComponentInfo.renderDirectives.size > 1
        ) {
          preRenderComponentNameToCssBundlePathsMap.set(
            clientComponentInfo.componentName,
            new Set(publicCssBundlePaths)
          );
        }

        /**
         * If the component is ssr:only and the only directive is ssr:only,
         * At this time, we don't need to inject client code.
         */
        if (
          clientComponentInfo.renderDirectives.has('ssr:only') &&
          clientComponentInfo.renderDirectives.size === 1
        ) {
          continue;
        }

        const importedAssets = [...(chunk.viteMetadata?.importedAssets ?? [])];
        const publicAssetsBundlePaths = importedAssets.map(asset => join('/', asset));

        componentEntries.push({
          componentName: clientComponentInfo.componentName,
          cssBundlePath: publicCssBundlePaths,
          assetsBundlePath: publicAssetsBundlePaths,
          modulePath: componentModuleRelativePath,
          importReference: clientComponentInfo.importReference,
          pendingRenderIds: clientComponentInfo.pendingRenderIds
        });
      }

      if (isOutputChunk(chunk)) {
        const fullOutputPath = join(outDir, chunk.fileName);
        const code = chunk.code;
        if (!fs.existsSync(dirname(fullOutputPath))) {
          fs.mkdirSync(dirname(fullOutputPath), { recursive: true });
        }
        fs.writeFileSync(fullOutputPath, code);
        const relativeOutputPath = join('/', chunk.fileName);
        modulePreloads.push(relativeOutputPath);
      }

      if (isOutputAsset(chunk)) {
        const fullOutputPath = join(outDir, chunk.fileName);
        const code = chunk.source;
        if (!fs.existsSync(dirname(fullOutputPath))) {
          fs.mkdirSync(dirname(fullOutputPath), { recursive: true });
        }
        fs.writeFileSync(fullOutputPath, code);
        if (chunk.fileName.endsWith('.css')) {
          cssBundlePaths.push(join('/', chunk.fileName));
        }
      }
    }

    const getExportExpression = (importInfo: { importedName: string; identifier: string }) => {
      if (importInfo.importedName === 'default') {
        return 'module.default';
      }
      if (importInfo.importedName === '*') {
        return 'module';
      }
      return `module['${importInfo.importedName}']`;
    };

    const ssrInjectCodeSnippet: string[] = [];
    for (const [renderId, usedSnippet] of usedSnippetContainer.entries()) {
      if (usedSnippet.ssrHtml && !usedSnippet.useSpaSyncRender) {
        if (ssrInjectCodeSnippet.length === 0) {
          ssrInjectCodeSnippet.push('export const __SSR_INJECT_CODE__ = () => {');
        }
        ssrInjectCodeSnippet.push(`
          const __SSR_DOM_${usedSnippet.renderId}__ = document.querySelector('[${RENDER_STRATEGY_CONSTANTS.renderId}="${renderId}"]');
          if (__SSR_DOM_${usedSnippet.renderId}__) {
            __SSR_DOM_${usedSnippet.renderId}__.innerHTML = \`${usedSnippet.ssrHtml}\`;
          }
          `);
      } else if (usedSnippet.useSpaSyncRender) {
        /**
         * When rendering using the spa:sync-render instruction,
         * if not rendered with the client:only strategy,
         * the page rendering in route switching scenarios needs to wait
         * until the corresponding rendering component's styles are loaded before rendering.
         */
        if (preRenderComponentNameToCssBundlePathsMap.has(usedSnippet.renderComponent)) {
          usedSnippet.ssrCssBundlePaths = preRenderComponentNameToCssBundlePathsMap.get(
            usedSnippet.renderComponent
          );
        }
      }
    }

    if (ssrInjectCodeSnippet.length > 0) {
      ssrInjectCodeSnippet.push('};');
    }

    // Inject helper body once and call via toString()
    const getCleanPathnameRuntime = GET_CLEAN_PATHNAME_RUNTIME.toString();
    const unifiedLoaderCode = `
(async function() {
  const pageId = (
    ${getCleanPathnameRuntime}
  )();

  if (!window["${RENDER_STRATEGY_CONSTANTS.injectComponent}"][pageId]) { 
    window["${RENDER_STRATEGY_CONSTANTS.injectComponent}"][pageId] = {}; 
  }

  /**
   * Before dynamically importing React components, 
   * you must inject the React runtime globally, otherwise component parsing will fail.
   */
  if (window["${RENDER_STRATEGY_CONSTANTS.componentManager}"]) {
    await window["${RENDER_STRATEGY_CONSTANTS.componentManager}"].loadReact();
  } else {
    throw new Error('ReactComponentManager is not initialized');
  }
  
  const componentLoaders = [
    ${componentEntries
      .map(
        entry => `
    {
      name: '${entry.componentName}',
      loader: async () => {
        try {
          const module = await import('${wrapBaseUrl(entry.modulePath)}');
          return ${getExportExpression(entry.importReference)};
        } catch (error) {
          ${lightGeneralLogger('error', `Failed to load component ${entry.componentName}: error.message`, 'react-client-render', { immediate: false })}
          return null;
        }
      }
    }`
      )
      .join(',')}
  ];
  
  const loadResults = await Promise.allSettled(
    componentLoaders.map(async ({ name, loader }) => {
      const Component = await loader();
      if (Component) {
        if (!window["${RENDER_STRATEGY_CONSTANTS.injectComponent}"][pageId][name]) {
          window["${RENDER_STRATEGY_CONSTANTS.injectComponent}"][pageId][name] = {};
        }
        /**
         * In production environment, unlike development, 
         * we don't need to inject path and importedName fields for HMR.
         */
        window["${RENDER_STRATEGY_CONSTANTS.injectComponent}"][pageId][name].component = Component;
        window["${RENDER_STRATEGY_CONSTANTS.componentManager}"].notifyComponentLoaded(pageId, name);
        return { name, success: true };
      }
      return { name, success: false };
    })
  );
  
  const successCount = loadResults.filter(result => 
    result.status === 'fulfilled' && result.value.success
  ).length;
  
      ${lightGeneralLogger('success', `Loaded \${successCount} / \${componentLoaders.length} React components for page: \${pageId}`, 'react-client-render', { immediate: false })}
})();
    `.trim();

    const hash = createHash('sha256').update(unifiedLoaderCode).digest('hex').slice(0, 8);
    const loaderFileName = `unified-loader.${hash}.js`;
    const loaderFullPath = join(outDir, assetsDir, loaderFileName);
    fs.writeFileSync(loaderFullPath, unifiedLoaderCode);
    const loaderScriptRelativePath = join('/', assetsDir, loaderFileName);

    let ssrInjectScriptRelativePath = '';
    if (ssrInjectCodeSnippet.length > 0) {
      const ssrInjectCodeHash = createHash('sha256')
        .update(ssrInjectCodeSnippet.join('\n'))
        .digest('hex')
        .slice(0, 8);
      const ssrInjectFileName = `ssr-inject-code.${ssrInjectCodeHash}.js`;
      const ssrInjectFullPath = join(outDir, assetsDir, ssrInjectFileName);
      fs.writeFileSync(ssrInjectFullPath, ssrInjectCodeSnippet.join('\n'));
      ssrInjectScriptRelativePath = join('/', assetsDir, ssrInjectFileName);
    }

    Logger.success(`Bundle multiple components for browser completed`);

    return {
      loaderScript: loaderScriptRelativePath,
      modulePreloads,
      cssBundlePaths,
      ssrInjectScript: ssrInjectScriptRelativePath
    };
  } catch (error) {
    Logger.error(`Failed to bundle multiple components: ${error}`);
    throw error;
  }
}
