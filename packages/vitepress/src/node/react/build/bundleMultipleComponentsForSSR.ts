import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type { RollupOutput } from '#dep-types/rollup';
import type { ConfigType } from '#dep-types/utils';
import { DIRNAME_VAR_NAME } from '#shared/constants';
import getLoggerInstance from '#shared/logger';
import { isNodeLikeBuiltin } from '@docs-islands/utils/builtin';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'pathe';
import type { InlineConfig } from 'vite';
import { build } from 'vite';
import type { FrameworkAdapter } from '../../core/framework-adapter';
import { reactAdapter } from '../adapter';
import { createComponentEntryModules, isOutputChunk } from './shared';

const loggerInstance = getLoggerInstance();
const Logger = loggerInstance.getLoggerByGroup(
  'bundle-multiple-components-for-ssr',
);

export async function bundleMultipleComponentsForSSR(
  config: ConfigType,
  ssrComponents: ComponentBundleInfo[],
  usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  adapter: FrameworkAdapter = reactAdapter,
): Promise<{
  renderedComponents: Map<string, string>;
}> {
  const { base, srcDir, assetsDir, cacheDir } = config;
  /**
   * Needs to be built concurrently with MPA mode.
   * Using the same directory will cause the latter to overwrite the former.
   * So we need to use a temporary directory for each build.
   */
  const ssrTempDir = join(cacheDir, `ssr-temp-${Date.now()}`);
  if (ssrComponents.length === 0) {
    return { renderedComponents: new Map() };
  }

  const preparedEntryModules = createComponentEntryModules({
    cacheDir,
    components: ssrComponents,
    namespace: 'ssr',
  });
  const entryNameToComponent = new Map(
    preparedEntryModules.entries.map(({ component, entryName }) => [
      entryName,
      component,
    ]),
  );

  try {
    const viteConfig: InlineConfig = {
      root: srcDir,
      base,
      build: {
        ssr: true,
        ssrEmitAssets: false,
        rollupOptions: {
          input: preparedEntryModules.entryPoints,
          external: (id) => {
            if (isNodeLikeBuiltin(id)) {
              return true;
            }

            const bareImportRE = /^(?![a-z]:)[\w@](?!.*:\/\/)/i;

            if (bareImportRE.test(id)) {
              return true;
            }
            return false;
          },
          output: {
            format: 'esm',
            assetFileNames: `${assetsDir}/[name].[hash].[ext]`,
            entryFileNames: '[name].js',
            chunkFileNames: '[name].[hash].js',
          },
        },
        outDir: ssrTempDir,
        emptyOutDir: true,
        write: true,
        target: 'es2020',
        minify: false,
        assetsInlineLimit: 4096,
        cssCodeSplit: true,
      },
      plugins: adapter.ssrBundlerPlugins(),
      define: {
        'import.meta.dirname': DIRNAME_VAR_NAME,
      },
      logLevel: 'warn',
    };

    const result = (await build(viteConfig)) as RollupOutput | RollupOutput[];
    const output = Array.isArray(result) ? result[0] : result;

    if (!output?.output || output.output.length === 0) {
      throw new Error('No output files generated for SSR bundle');
    }

    const renderedComponents = new Map<string, string>();
    if (output.output) {
      for (const chunk of output.output) {
        if (isOutputChunk(chunk) && chunk.isEntry) {
          const ssrComponent = entryNameToComponent.get(chunk.name);

          if (!ssrComponent) {
            continue;
          }
          const bundlePath = resolve(ssrTempDir, chunk.fileName);

          try {
            const ssrModule = await import(pathToFileURL(bundlePath).href);
            const ssrModuleComponent = ssrModule.default;

            if (!ssrModuleComponent) {
              Logger.warn(
                `Component "${ssrComponent.componentName}" not found in bundle`,
              );
              continue;
            }

            const pendingRenderIds = ssrComponent.pendingRenderIds;

            for (const [renderId, usedSnippet] of usedSnippetContainer) {
              if (pendingRenderIds.has(renderId)) {
                try {
                  const reactSSRHtml = adapter.renderToString(
                    ssrModuleComponent,
                    Object.fromEntries(usedSnippet.props),
                  );
                  renderedComponents.set(renderId, reactSSRHtml);
                  usedSnippet.ssrHtml = reactSSRHtml;
                  Logger.success(
                    `Rendered component ${ssrComponent.componentName} for render ID: ${renderId}`,
                  );
                } catch (error) {
                  Logger.error(
                    `Error rendering component "${ssrComponent.componentName}" for render ID ${renderId}: ${error}`,
                  );
                }
              }
            }
          } catch (error) {
            Logger.error(
              `Failed to import SSR bundle for ${ssrComponent.componentName}: ${error}`,
            );
          }
        }
      }
    }

    return { renderedComponents };
  } catch (error) {
    Logger.error(`Failed to bundle SSR components: ${error}`);
    throw error;
  } finally {
    fs.rmSync(ssrTempDir, { recursive: true, force: true });
    fs.rmSync(preparedEntryModules.tempEntryDir, {
      recursive: true,
      force: true,
    });
  }
}
