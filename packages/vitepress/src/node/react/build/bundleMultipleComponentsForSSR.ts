import { DIRNAME_VAR_NAME } from '@docs-islands/vitepress-shared/constants';
import type {
  ComponentBundleInfo,
  ConfigType,
  RollupOutput,
  UsedSnippetContainerType,
} from '@docs-islands/vitepress-types';
import { isNodeLikeBuiltin } from '@docs-islands/vitepress-utils';
import logger from '@docs-islands/vitepress-utils/logger';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'pathe';
import type { InlineConfig } from 'vite';
import { build } from 'vite';
import type { FrameworkAdapter } from '../../core/framework-adapter';
import { reactAdapter } from '../adapter';
import { isOutputChunk } from './shared';

const Logger = logger.getLoggerByGroup('bundleMultipleComponentsForSSR');

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

  try {
    const entryPoints: Record<string, string> = {};
    for (const ssrComponent of ssrComponents) {
      const entryName = ssrComponent.componentName;
      entryPoints[entryName] = ssrComponent.componentPath;
    }

    const viteConfig: InlineConfig = {
      root: srcDir,
      base,
      build: {
        ssr: true,
        ssrEmitAssets: false,
        rollupOptions: {
          input: entryPoints,
          external: (id) => {
            if (isNodeLikeBuiltin(id)) {
              return true;
            }

            const bareImportRE = /^(?![A-Za-z]:)[\w@](?!.*:\/\/)/;

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
        target: 'es2022',
        minify: false,
        assetsInlineLimit: 4096,
        cssCodeSplit: true,
      },
      plugins: adapter.ssrBundlerPlugins(),
      define: {
        'process.env.NODE_ENV': '"production"',
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
        if (isOutputChunk(chunk) && chunk.isEntry && entryPoints[chunk.name]) {
          const ssrComponent = ssrComponents.find(
            (ssrComponent) => ssrComponent.componentName === chunk.name,
          );

          if (!ssrComponent) {
            continue;
          }
          const bundlePath = resolve(ssrTempDir, chunk.fileName);

          try {
            const ssrModule = await import(pathToFileURL(bundlePath).href);

            let ssrModuleComponent;
            if (ssrComponent.importReference.importedName === 'default') {
              ssrModuleComponent = ssrModule.default;
            } else if (ssrComponent.importReference.importedName === '*') {
              ssrModuleComponent = ssrModule;
            } else {
              ssrModuleComponent =
                ssrModule[ssrComponent.importReference.importedName];
            }

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

    for (const ssrComponent of ssrComponents) {
      const entryName = ssrComponent.componentName;
      const outputFile = output.output.find(
        (chunk) =>
          isOutputChunk(chunk) &&
          chunk.facadeModuleId === ssrComponent.componentPath &&
          chunk.name === entryName,
      );

      if (!outputFile) {
        Logger.warn(
          `No SSR bundle found for component: ${ssrComponent.componentName}`,
        );
        continue;
      }

      const bundlePath = resolve(ssrTempDir, outputFile.fileName);

      try {
        const ssrModule = await import(pathToFileURL(bundlePath).href);

        let ssrModuleComponent;
        if (ssrComponent.importReference.importedName === 'default') {
          ssrModuleComponent = ssrModule.default;
        } else if (ssrComponent.importReference.importedName === '*') {
          ssrModuleComponent = ssrModule;
        } else {
          ssrModuleComponent =
            ssrModule[ssrComponent.importReference.importedName];
        }

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

    fs.rmSync(ssrTempDir, { recursive: true });

    return { renderedComponents };
  } catch (error) {
    Logger.error(`Failed to bundle SSR components: ${error}`);
    throw error;
  }
}
