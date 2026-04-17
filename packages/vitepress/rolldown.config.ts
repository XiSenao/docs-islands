import licensePlugin from '@docs-islands/plugin-license';
import { loadEnv, scanFiles } from '@docs-islands/utils';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, resolve } from 'node:url';
import type { PreRenderedChunk } from 'rolldown';
import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import pkg from './package.json' with { type: 'json' };
import generatePackageJson from './packagePlugin';

const { config, env } = loadEnv();
const { sourcemap, minify } = config;

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const getExternalDeps = () => {
  return [
    /^#types\//,
    'react-dom/client',
    'vitepress/client',
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
    // @ts-expect-error No type checking is needed here.
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ];
};

const externalDeps = getExternalDeps();
let hasCleanedDist = false;

const nodePlugins: RolldownOptions['plugins'] = [
  {
    name: 'rolldown-plugin-clean-dist',
    async buildStart() {
      if (hasCleanedDist) {
        return;
      }

      hasCleanedDist = true;
      await rm(resolve(__dirname, 'dist'), {
        force: true,
        recursive: true,
      });
    },
  },
  licensePlugin(
    path.resolve(__dirname, 'LICENSE.md'),
    '@docs-islands/vitepress license',
    '@docs-islands/vitepress',
  ),
  generatePackageJson(),
  {
    name: 'rolldown-plugin-add-devtools-mcp-shebang',
    generateBundle(_options: unknown, bundle: Record<string, unknown>) {
      const output = bundle['node/site-devtools/mcp.js'];

      if (
        output &&
        typeof output === 'object' &&
        'code' in output &&
        typeof output.code === 'string' &&
        !output.code.startsWith('#!/usr/bin/env node\n')
      ) {
        output.code = `#!/usr/bin/env node\n${output.code}`;
      }
    },
  },
  {
    name: 'rolldown-plugin-copy-readme',
    generateBundle: {
      order: 'post',
      async handler() {
        this.emitFile({
          type: 'asset',
          source: await readFile(resolve(__dirname, 'README.md'), 'utf8'),
          fileName: 'README.md',
        });
        this.emitFile({
          type: 'asset',
          source: await readFile(resolve(__dirname, 'README.zh-CN.md'), 'utf8'),
          fileName: 'README.zh-CN.md',
        });
        this.emitFile({
          type: 'asset',
          source: await readFile(resolve(__dirname, 'LICENSE.md'), 'utf8'),
          fileName: 'LICENSE.md',
        });
        for (const copyDir of ['types']) {
          await scanFiles(
            resolve(__dirname, copyDir),
            async (_, absolutePath) => {
              const content = await readFile(absolutePath, 'utf8');
              const relativePath = path.relative(__dirname, absolutePath);
              this.emitFile({
                type: 'asset',
                source: content,
                fileName: relativePath,
              });
            },
          );
        }
      },
    },
  },
];

const createVitepressConfigDtsInjectPlugin = () => ({
  name: 'rolldown-plugin-inject-vitepress-config-dts',
  generateBundle(_options: unknown, bundle: Record<string, unknown>) {
    for (const fileName of ['node/index.d.ts', 'node/adapters/react.d.ts']) {
      const vitepressConfigTypesImport = `import "${path.posix.relative(
        path.posix.dirname(fileName),
        'types/vitepress-config.js',
      )}";\n`;
      const output = bundle[fileName];

      if (!output || typeof output !== 'object') {
        continue;
      }

      if (
        'source' in output &&
        typeof output.source === 'string' &&
        !output.source.startsWith(vitepressConfigTypesImport)
      ) {
        output.source = `${vitepressConfigTypesImport}${output.source}`;
        continue;
      }

      if (
        'code' in output &&
        typeof output.code === 'string' &&
        !output.code.startsWith(vitepressConfigTypesImport)
      ) {
        output.code = `${vitepressConfigTypesImport}${output.code}`;
      }
    }
  },
});

const getSharedOptions = (platform: 'node' | 'browser') => {
  const baseDir = platform === 'node' ? 'node' : 'client';
  const chunkFileExt = platform === 'node' ? 'js' : 'mjs';
  return defineConfig({
    platform,
    external: externalDeps,
    resolve: {
      alias: {
        '#types': fileURLToPath(new URL('types', import.meta.url)),
        '#deps-types': resolve(__dirname, 'src/types'),
        '#shared': resolve(__dirname, 'src/shared'),
      },
    },
    treeshake: {
      moduleSideEffects: [
        {
          external: true,
          sideEffects: false,
        },
      ],
    },
    output: {
      dir: './dist',
      entryFileNames: (chunkInfo: PreRenderedChunk) => {
        /**
         * Internal helper entry modules are consumed through package exports
         * instead of the public client entrypoints, so they must be emitted
         * under dist/shared to match the published export map.
         */
        if (['devtools', 'logger', 'client-runtime'].includes(chunkInfo.name)) {
          return 'shared/[name].js';
        }
        return `${baseDir}/[name].${chunkFileExt}`;
      },
      chunkFileNames: `${baseDir}/chunks/dep-[hash].${chunkFileExt}`,
      exports: 'named',
      format: 'esm',
      externalLiveBindings: false,
      sourcemap,
    },
  });
};

const sharedNodeOptions = getSharedOptions('node');
const sharedBrowserOptions = getSharedOptions('browser');

const nodeConfig = defineConfig({
  ...sharedNodeOptions,
  input: {
    'adapters/react': resolve(__dirname, 'src/node/adapters/react/index.ts'),
    index: resolve(__dirname, 'src/node/index.ts'),
    'site-devtools/mcp': resolve(__dirname, 'src/node/site-devtools/mcp.ts'),
  },
  plugins: nodePlugins,
  output: {
    ...sharedNodeOptions.output,
    ...(minify && {
      minify: {
        compress: true,
        mangle: false,
        // Do not minify whitespace for ES lib output since that would remove
        // pure annotations and break tree-shaking
        codegen: {
          removeWhitespace: false,
        },
      },
    }),
  },
});

const nodeDtsConfig = defineConfig({
  ...sharedNodeOptions,
  input: {
    'adapters/react': resolve(__dirname, 'src/node/adapters/react/index.ts'),
    index: resolve(__dirname, 'src/node/index.ts'),
    'site-devtools/mcp': resolve(__dirname, 'src/node/site-devtools/mcp.ts'),
  },
  plugins: [
    dts({
      tsconfig: 'src/node/tsconfig.json',
      emitDtsOnly: true,
      sourcemap,
    }),
    createVitepressConfigDtsInjectPlugin(),
  ],
});

const clientConfig = defineConfig({
  ...sharedBrowserOptions,
  input: {
    'adapters/react': resolve(__dirname, 'src/client/adapters/react/index.ts'),
    devtools: resolve(__dirname, 'src/shared/devtools.ts'),
    logger: resolve(__dirname, 'src/shared/logger.ts'),
    index: resolve(__dirname, 'src/client/index.ts'),
    react: resolve(__dirname, 'src/client/react/index.ts'),
  },
  transform: {
    target: 'es2020',
  },
});

const clientDtsConfig = defineConfig({
  ...sharedBrowserOptions,
  input: {
    'adapters/react': resolve(__dirname, 'src/client/adapters/react/index.ts'),
    index: resolve(__dirname, 'src/client/index.ts'),
    react: resolve(__dirname, 'src/client/react/index.ts'),
  },
  plugins: [
    dts({
      tsconfig: 'src/client/tsconfig.json',
      emitDtsOnly: true,
      sourcemap,
    }),
  ],
  transform: {
    target: 'es2020',
  },
});

const clientRuntimeConfig = defineConfig({
  ...sharedBrowserOptions,
  input: {
    'client-runtime': resolve(__dirname, 'src/shared/client-runtime.ts'),
  },
  transform: {
    target: 'es2020',
    define: {
      __ENV__: JSON.stringify(env),
    },
  },
  plugins: [
    {
      name: 'rolldown-plugin-copy-runtime-dts',
      generateBundle: {
        order: 'post',
        async handler() {
          const clientRuntimeDtsContent = await readFile(
            resolve(__dirname, 'src/shared/client-runtime.d.ts'),
            'utf8',
          );
          this.emitFile({
            type: 'asset',
            fileName: 'shared/client-runtime.d.ts',
            source: clientRuntimeDtsContent,
          });

          const loggerDtsContent = await readFile(
            resolve(__dirname, 'src/shared/logger.d.ts'),
            'utf8',
          );
          this.emitFile({
            type: 'asset',
            fileName: 'shared/logger.d.ts',
            source: loggerDtsContent,
          });

          const devtoolsDtsContent = await readFile(
            resolve(__dirname, 'src/shared/devtools.d.ts'),
            'utf8',
          );
          this.emitFile({
            type: 'asset',
            fileName: 'shared/devtools.d.ts',
            source: devtoolsDtsContent,
          });
        },
      },
    },
  ],
  output: {
    ...sharedBrowserOptions.output,
    /**
     * The runtime module is an optimization module that exposes features to the user side,
     * which directly copies the output products to the output directory on the user side,
     * therefore it does not include chunks dependencies temporarily.
     */
    manualChunks: undefined,
    sourcemap: sourcemap ? 'inline' : false,
  },
});

const configs: RolldownOptions[] = [
  nodeConfig,
  nodeDtsConfig,
  clientConfig,
  clientDtsConfig,
  clientRuntimeConfig,
];

export default configs;
