import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type { RollupOutput } from '#dep-types/rollup';
import type { ConfigType } from '#dep-types/utils';
import { RENDER_STRATEGY_CONSTANTS } from '#shared/constants';
import getLoggerInstance, { LightGeneralLogger } from '#shared/logger';
import { isNodeLikeBuiltin } from '@docs-islands/utils/builtin';
import fs from 'node:fs';
import { dirname, join } from 'pathe';
import type { InlineConfig } from 'vite';
import { build } from 'vite';
import { GET_CLEAN_PATHNAME_RUNTIME } from '../../../shared/runtime';
import type { FrameworkAdapter } from '../../core/framework-adapter';
import { reactAdapter } from '../adapter';
import { isOutputAsset, isOutputChunk, resolveSafeOutputPath } from './shared';

const loggerInstance = getLoggerInstance();
const Logger = loggerInstance.getLoggerByGroup(
  'bundle-multiple-components-for-browser',
);

function createUnifiedLoaderEntryCode(
  base: string,
  cleanUrls: boolean,
  componentEntries: {
    componentName: string;
    modulePath: string;
    importReference: { importedName: string; identifier: string };
  }[],
): string {
  const getCleanPathnameRuntime = GET_CLEAN_PATHNAME_RUNTIME.toString();
  const loaderEntries = componentEntries.map((entry) => ({
    componentName: entry.componentName,
    modulePath: entry.modulePath,
    importedName: entry.importReference.importedName,
  }));

  return `
const getPageId = ${getCleanPathnameRuntime};

const componentEntries = ${JSON.stringify(loaderEntries, null, 2)};

const resolveComponentExport = (module, importedName) => {
  if (importedName === 'default') {
    return module.default;
  }
  if (importedName === '*') {
    return module;
  }
  return module[importedName];
};

(async function() {
  const pageId = getPageId(${JSON.stringify(base)}, ${JSON.stringify(cleanUrls)});

  const componentManager = window["${RENDER_STRATEGY_CONSTANTS.componentManager}"];
  if (!componentManager) {
    throw new Error('ReactComponentManager is not initialized');
  }

  await componentManager.subscribeRuntimeReady();
  const injectComponent = window["${RENDER_STRATEGY_CONSTANTS.injectComponent}"];
  if (!injectComponent) {
    throw new Error('ReactComponentRegistry is not initialized');
  }

  if (!injectComponent[pageId]) {
    injectComponent[pageId] = {};
  }

  /**
   * Before dynamically importing React components,
   * you must inject the React runtime globally, otherwise component parsing will fail.
   */
  await componentManager.loadReact();

  const loadResults = await Promise.allSettled(
    componentEntries.map(async ({ componentName: name, modulePath, importedName }) => {
      try {
        const module = await import(/* @vite-ignore */ modulePath);
        const Component = resolveComponentExport(module, importedName);
        if (!Component) {
          return { name, success: false };
        }

        if (!injectComponent[pageId][name]) {
          injectComponent[pageId][name] = {};
        }

        /**
         * In production environment, unlike development,
         * we don't need to inject path and importedName fields for HMR.
         */
        injectComponent[pageId][name].component = Component;
        componentManager.notifyComponentLoaded(pageId, name);
        return { name, success: true };
      } catch (error) {
        ${
          LightGeneralLogger(
            'error',
            `'Failed to load component ' + name + ': ' + (error instanceof Error ? error.message : String(error))`,
            'react-client-render',
          ).formatText
        }
        return { name, success: false };
      }
    })
  );

  const successCount = loadResults.filter(result =>
    result.status === 'fulfilled' && result.value.success
  ).length;

  ${
    LightGeneralLogger(
      'success',
      `Loaded \${successCount} / \${componentEntries.length} React components for page: \${pageId}`,
      'react-client-render',
    ).formatText
  }
})();
  `.trim();
}

async function bundleRuntimeModuleWithVite(
  config: Pick<
    ConfigType,
    'root' | 'outDir' | 'assetsDir' | 'cacheDir' | 'base'
  >,
  runtimeModule: {
    entryFileBaseName: string;
    source: string;
  },
): Promise<string> {
  const tempEntryDir = join(
    config.cacheDir,
    `${runtimeModule.entryFileBaseName}-entry-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
  );
  const tempEntryPath = join(
    tempEntryDir,
    `${runtimeModule.entryFileBaseName}-entry.mjs`,
  );

  fs.mkdirSync(tempEntryDir, { recursive: true });
  fs.writeFileSync(tempEntryPath, runtimeModule.source);

  try {
    const result = (await build({
      root: config.root,
      base: config.base,
      cacheDir: join(config.cacheDir, 'vite-runtime-modules'),
      configFile: false,
      publicDir: false,
      logLevel: 'warn',
      build: {
        outDir: config.outDir,
        emptyOutDir: false,
        write: false,
        target: 'es2020',
        minify: true,
        rollupOptions: {
          input: tempEntryPath,
          preserveEntrySignatures: 'allow-extension',
          output: {
            format: 'esm',
            assetFileNames: `${config.assetsDir}/${runtimeModule.entryFileBaseName}.[hash].[ext]`,
            entryFileNames: `${config.assetsDir}/${runtimeModule.entryFileBaseName}.[hash].js`,
            chunkFileNames: `${config.assetsDir}/chunks/${runtimeModule.entryFileBaseName}.[hash].js`,
          },
        },
      },
    })) as RollupOutput | RollupOutput[];

    const output = Array.isArray(result) ? result[0] : result;
    if (!output?.output || output.output.length === 0) {
      throw new Error(
        `Expected ${runtimeModule.entryFileBaseName} bundle output`,
      );
    }

    let runtimeScriptRelativePath = '';

    for (const chunk of output.output) {
      const fullOutputPath = resolveSafeOutputPath(
        config.outDir,
        chunk.fileName,
      );
      if (!fs.existsSync(dirname(fullOutputPath))) {
        fs.mkdirSync(dirname(fullOutputPath), { recursive: true });
      }

      if (isOutputChunk(chunk)) {
        fs.writeFileSync(fullOutputPath, chunk.code);
        if (chunk.isEntry) {
          runtimeScriptRelativePath = join('/', chunk.fileName);
        }
      } else if (isOutputAsset(chunk)) {
        fs.writeFileSync(fullOutputPath, chunk.source);
      }
    }

    if (!runtimeScriptRelativePath) {
      throw new Error(
        `Failed to locate ${runtimeModule.entryFileBaseName} entry output`,
      );
    }

    return runtimeScriptRelativePath;
  } finally {
    fs.rmSync(tempEntryDir, { recursive: true, force: true });
  }
}

export async function bundleMultipleComponentsForBrowser(
  config: ConfigType,
  components: ComponentBundleInfo[],
  usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  adapter: FrameworkAdapter = reactAdapter,
): Promise<{
  loaderScript: string;
  modulePreloads: string[];
  cssBundlePaths: string[];
  ssrInjectScript: string;
}> {
  const { base, srcDir, assetsDir, outDir, wrapBaseUrl, cleanUrls } = config;
  if (components.length === 0) {
    return {
      loaderScript: '',
      modulePreloads: [],
      cssBundlePaths: [],
      ssrInjectScript: '',
    };
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
          external: (id) => {
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
            chunkFileNames: `${assetsDir}/chunks/[name].[hash].js`,
          },
        },
        write: false,
        target: 'es2020',
        minify: true,
        manifest: true,
        assetsInlineLimit: 4096,
        cssCodeSplit: true,
      },
      plugins: adapter.browserBundlerPlugins(),
      logLevel: 'warn',
    };

    const output = await build(viteConfig);
    if (!output || !('output' in output) || !Array.isArray(output.output)) {
      throw new Error('Expected a array output bundle');
    }

    const componentEntries: {
      componentName: string;
      cssBundlePath: string[];
      assetsBundlePath: string[];
      modulePath: string;
      importReference: { importedName: string; identifier: string };
      pendingRenderIds: Set<string>;
    }[] = [];
    const modulePreloads: string[] = [];
    const cssBundlePaths: string[] = [];
    const preRenderComponentNameToCssBundlePathsMap = new Map<
      string,
      Set<string>
    >();

    for (const chunk of output.output) {
      if (isOutputChunk(chunk) && chunk.isEntry && chunk.facadeModuleId) {
        const fullEntryPointPath = chunk.facadeModuleId;
        const clientComponentInfo = componentMapping.get(fullEntryPointPath);

        if (!clientComponentInfo) continue;

        const componentModuleRelativePath = join('/', chunk.fileName);

        const importedCss = [...(chunk.viteMetadata?.importedCss ?? [])];
        const publicCssBundlePaths = importedCss.map((css) => join('/', css));

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
            new Set(publicCssBundlePaths),
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
        const publicAssetsBundlePaths = importedAssets.map((asset) =>
          join('/', asset),
        );

        componentEntries.push({
          componentName: clientComponentInfo.componentName,
          cssBundlePath: publicCssBundlePaths,
          assetsBundlePath: publicAssetsBundlePaths,
          modulePath: componentModuleRelativePath,
          importReference: clientComponentInfo.importReference,
          pendingRenderIds: clientComponentInfo.pendingRenderIds,
        });
      }

      if (isOutputChunk(chunk)) {
        const fullOutputPath = resolveSafeOutputPath(outDir, chunk.fileName);
        const code = chunk.code;
        if (!fs.existsSync(dirname(fullOutputPath))) {
          fs.mkdirSync(dirname(fullOutputPath), { recursive: true });
        }
        fs.writeFileSync(fullOutputPath, code);
        const relativeOutputPath = join('/', chunk.fileName);
        modulePreloads.push(relativeOutputPath);
      }

      if (isOutputAsset(chunk)) {
        const fullOutputPath = resolveSafeOutputPath(outDir, chunk.fileName);
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

    const ssrInjectCodeSnippet: string[] = [];
    for (const [renderId, usedSnippet] of usedSnippetContainer.entries()) {
      if (usedSnippet.ssrHtml && !usedSnippet.useSpaSyncRender) {
        if (ssrInjectCodeSnippet.length === 0) {
          ssrInjectCodeSnippet.push(
            'export const __SSR_INJECT_CODE__ = () => {',
          );
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
        if (
          preRenderComponentNameToCssBundlePathsMap.has(
            usedSnippet.renderComponent,
          )
        ) {
          usedSnippet.ssrCssBundlePaths =
            preRenderComponentNameToCssBundlePathsMap.get(
              usedSnippet.renderComponent,
            );
        }
      }
    }

    if (ssrInjectCodeSnippet.length > 0) {
      ssrInjectCodeSnippet.push('};');
    }

    const unifiedLoaderCode = createUnifiedLoaderEntryCode(
      base,
      cleanUrls,
      componentEntries.map((entry) => ({
        ...entry,
        modulePath: wrapBaseUrl(entry.modulePath),
      })),
    );
    const loaderScriptRelativePath = await bundleRuntimeModuleWithVite(config, {
      entryFileBaseName: 'unified-loader',
      source: unifiedLoaderCode,
    });

    let ssrInjectScriptRelativePath = '';
    if (ssrInjectCodeSnippet.length > 0) {
      ssrInjectScriptRelativePath = await bundleRuntimeModuleWithVite(config, {
        entryFileBaseName: 'ssr-inject-code',
        source: ssrInjectCodeSnippet.join('\n'),
      });
    }

    Logger.success(`Bundle multiple components for browser completed`);

    return {
      loaderScript: loaderScriptRelativePath,
      modulePreloads,
      cssBundlePaths,
      ssrInjectScript: ssrInjectScriptRelativePath,
    };
  } catch (error) {
    Logger.error(`Failed to bundle multiple components: ${error}`);
    throw error;
  }
}
