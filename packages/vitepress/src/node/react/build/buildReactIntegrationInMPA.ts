import type { OutputChunk, RollupOutput } from '#dep-types/rollup';
import type { ConfigType } from '#dep-types/utils';
import getLoggerInstance from '#shared/logger';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'pathe';
import type { InlineConfig, Plugin } from 'vite';
import { build as viteBuild } from 'vite';
import type { FrameworkAdapter } from '../../core/framework-adapter';
import { reactAdapter } from '../adapter';
import { isOutputChunk, resolveSafeOutputPath } from './shared';

const loggerInstance = getLoggerInstance();
const Logger = loggerInstance.getLoggerByGroup(
  'build-react-integration-in-mpa',
);

let buildPromise: Promise<{
  entryPoint: string;
  modulePreloads: string[];
}> | null = null;

export const buildReactIntegrationInMPA = async (
  config: ConfigType,
  adapter: FrameworkAdapter = reactAdapter,
): Promise<{ entryPoint: string; modulePreloads: string[] }> => {
  const { base, cacheDir, assetsDir, srcDir, outDir } = config;
  if (buildPromise) {
    return buildPromise;
  }

  buildPromise = (async () => {
    const tempEntryPath = resolve(cacheDir, 'react-integration.js');

    try {
      /**
       * In MPA mode, it is not necessary to use TLA for the entry module for the following reasons:
       *
       * 1. In MPA mode, the contentUpdated hook does not produce side effects; it only needs to be triggered in loading order.
       * 2. TLA itself has side effects, and build tools are not adept at handling them. The current build result exhibits a deadlock issue.
       *
       * - The `entry` module statically imports the `entry-chunk` module.
       * - The `entry-chunk` module dynamically imports the `client-chunk` and `index-chunk` modules via TLA.
       * - The `client-chunk` module statically imports the `index-chunk` module.
       * - The `index-chunk` module statically imports the `entry-chunk` module.
       */
      const tempEntryContent = `
import clientIntegration from '${adapter.clientEntryModule()}';

clientIntegration();
`;

      fs.writeFileSync(tempEntryPath, tempEntryContent, 'utf8');

      Logger.info('Starting ReactIntegration build with Vite...');

      const vitepressTreeShakingPlugin: Plugin = {
        name: 'vite-plugin-vitepress-tree-shaking',
        enforce: 'pre',
        resolveId(id) {
          if (id === 'vitepress/client') {
            return { id: 'vitepress-stub', external: false };
          }
          return null;
        },
        load(id) {
          if (id === 'vitepress-stub') {
            return `
export const onContentUpdated = (_) => {};
export const inBrowser = true;
`;
          }
          return null;
        },
      };

      const viteConfig: InlineConfig = {
        root: srcDir,
        base,
        build: {
          lib: {
            entry: {
              'react-integration': tempEntryPath,
            },
            formats: ['es'],
            fileName: '[name].[hash].js',
          },
          rollupOptions: {
            output: {
              format: 'esm',
              assetFileNames: `${assetsDir}/[name].[hash].[ext]`,
              entryFileNames: `${assetsDir}/[name].[hash].js`,
              chunkFileNames: `${assetsDir}/chunks/[name].[hash].js`,
            },
          },
          emptyOutDir: false,
          write: false,
          target: 'es2022',
          minify: true,
          assetsInlineLimit: 4096,
        },
        plugins: [vitepressTreeShakingPlugin],
        define: {
          'import.meta.env.DEV': 'false',
          'import.meta.hot': 'false',
          'import.meta.env.MPA': 'true',
          'import.meta.env.PROD': 'true',
          'process.env.NODE_ENV': '"production"',
          __BASE__: JSON.stringify(base),
        },
        resolve: {
          extensions: ['.ts', '.tsx', '.js', '.jsx'],
          alias: {
            '#types': resolve(
              dirname(fileURLToPath(import.meta.url)),
              '../../../../types',
            ),
            '#dep-types': resolve(
              dirname(fileURLToPath(import.meta.url)),
              '../../../types',
            ),
            '#shared': resolve(
              dirname(fileURLToPath(import.meta.url)),
              '../../../shared',
            ),
          },
        },
        esbuild: {
          target: 'es2022',
          supported: {
            'top-level-await': true,
          },
        },
        logLevel: 'warn',
      };

      const modulePreloads: string[] = [];
      const outputs = (await viteBuild(viteConfig)) as RollupOutput[];
      if (outputs[0] && outputs[0].output && Array.isArray(outputs[0].output)) {
        let entryPointChunk = null;
        for (const chunk of outputs[0].output as OutputChunk[]) {
          if (
            isOutputChunk(chunk) &&
            chunk.isEntry &&
            chunk.facadeModuleId === tempEntryPath
          ) {
            entryPointChunk = chunk;
          } else if (isOutputChunk(chunk)) {
            modulePreloads.push(join('/', chunk.fileName));
          }

          if (isOutputChunk(chunk)) {
            const fullOutputPath = resolveSafeOutputPath(
              outDir,
              chunk.fileName,
            );
            const code = chunk.code;
            if (!fs.existsSync(dirname(fullOutputPath))) {
              fs.mkdirSync(dirname(fullOutputPath), { recursive: true });
            }
            fs.writeFileSync(fullOutputPath, code);
          }
        }

        Logger.success(
          `ReactIntegration build completed, entryPoint: ${entryPointChunk ? join('/', entryPointChunk.fileName) : ''}`,
        );

        return {
          entryPoint: entryPointChunk
            ? join('/', entryPointChunk.fileName)
            : '',
          modulePreloads,
        };
      }
      throw new Error('vite did not generate output file');
    } catch (error) {
      Logger.error(`ReactIntegration build failed: ${error}`);
      throw error;
    } finally {
      try {
        if (fs.existsSync(tempEntryPath)) {
          fs.unlinkSync(tempEntryPath);
          Logger.info('Temporary files cleaned up');
        }
      } catch (cleanupError) {
        Logger.warn(`Failed to clean up temporary files: ${cleanupError}`);
      }
      buildPromise = null;
    }
  })();

  return buildPromise;
};
