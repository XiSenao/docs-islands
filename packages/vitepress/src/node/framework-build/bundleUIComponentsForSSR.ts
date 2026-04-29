import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type { RollupOutput } from '#dep-types/rollup';
import type { ConfigType } from '#dep-types/utils';
import { VITEPRESS_BUILD_LOG_GROUPS } from '#shared/constants/log-groups/build';
import { DIRNAME_VAR_NAME } from '@docs-islands/core/shared/constants/runtime';
import { createElapsedLogOptions } from '@docs-islands/logger/helper';
import { isNodeLikeBuiltin } from '@docs-islands/utils/builtin';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'pathe';
import type { InlineConfig } from 'vite';
import { build } from 'vite';
import {
  createVitePressLoggerFacadePlugin,
  VITEPRESS_LOGGER_MODULE_ID,
} from '../core/vite-plugin-logger-facade';
import { createLoggerTreeShakingPlugin } from '../core/vite-plugin-logger-tree-shaking';
import { getVitePressGroupLogger } from '../logger';
import type { UIFrameworkBuildAdapter } from './adapter';
import { createComponentEntryModules, isOutputChunk } from './shared';

const elapsedSince = (startTimeMs: number) =>
  createElapsedLogOptions(startTimeMs, Date.now());

export async function bundleUIComponentsForSSR(
  config: ConfigType,
  ssrComponents: ComponentBundleInfo[],
  usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  adapter: UIFrameworkBuildAdapter,
  loggerScopeId: string,
): Promise<{
  renderedComponents: Map<string, string>;
}> {
  const bundleStartedAt = Date.now();
  const Logger = getVitePressGroupLogger(
    VITEPRESS_BUILD_LOG_GROUPS.frameworkSsrBundle,
    loggerScopeId,
  );
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
            if (id === VITEPRESS_LOGGER_MODULE_ID) {
              return false;
            }

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
      plugins: [
        createVitePressLoggerFacadePlugin(loggerScopeId),
        createLoggerTreeShakingPlugin(loggerScopeId),
        ...adapter.ssrBundlerPlugins(),
      ],
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
          const importStartedAt = Date.now();

          try {
            const ssrModule = await import(pathToFileURL(bundlePath).href);
            const ssrModuleComponent = ssrModule.default;

            if (!ssrModuleComponent) {
              Logger.warn(
                `Component "${ssrComponent.componentName}" not found in bundle`,
                elapsedSince(importStartedAt),
              );
              continue;
            }

            const pendingRenderIds = ssrComponent.pendingRenderIds;

            for (const [renderId, usedSnippet] of usedSnippetContainer) {
              if (pendingRenderIds.has(renderId)) {
                const renderStartedAt = Date.now();
                try {
                  /**
                   * `renderToString` is intentionally async-friendly so future
                   * framework adapters can perform lazy runtime setup without
                   * forcing another generic SSR code path here.
                   */
                  const frameworkSSRHtml = await adapter.renderToString(
                    ssrModuleComponent,
                    Object.fromEntries(usedSnippet.props),
                  );
                  renderedComponents.set(renderId, frameworkSSRHtml);
                  usedSnippet.ssrHtml = frameworkSSRHtml;
                  Logger.success(
                    `Rendered ${adapter.framework} component ${ssrComponent.componentName} for render ID: ${renderId}`,
                    elapsedSince(renderStartedAt),
                  );
                } catch (error) {
                  Logger.error(
                    `Error rendering component "${ssrComponent.componentName}" for render ID ${renderId}: ${error}`,
                    elapsedSince(renderStartedAt),
                  );
                }
              }
            }
          } catch (error) {
            Logger.error(
              `Failed to import SSR bundle for ${ssrComponent.componentName}: ${error}`,
              elapsedSince(importStartedAt),
            );
          }
        }
      }
    }

    return { renderedComponents };
  } catch (error) {
    Logger.error(
      `Failed to bundle ${adapter.framework} SSR components: ${error}`,
      elapsedSince(bundleStartedAt),
    );
    throw error;
  } finally {
    fs.rmSync(ssrTempDir, { recursive: true, force: true });
    fs.rmSync(preparedEntryModules.tempEntryDir, {
      recursive: true,
      force: true,
    });
  }
}
