import licensePlugin from '@docs-islands/plugin-license';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, resolve } from 'node:url';
import type { PreRenderedChunk } from 'rolldown';
import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import pkg from './package.json' with { type: 'json' };
import generatePackageJson from './packagePlugin';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const getExternalDeps = () => {
  return [
    'react-dom/client',
    'vitepress/client',
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
    // @ts-expect-error No type checking is needed here.
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ];
};

const external = getExternalDeps();

const getSharedOptions = (platform: 'node' | 'browser') => {
  const baseDir = platform === 'node' ? 'node' : 'client';
  const chunkFileExt = platform === 'node' ? 'js' : 'mjs';
  return defineConfig({
    platform,
    external,
    plugins: [
      licensePlugin(
        path.resolve(__dirname, 'LICENSE.md'),
        '@docs-islands/vitepress license',
        '@docs-islands/vitepress',
      ),
      dts(),
      generatePackageJson(),
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
              source: await readFile(
                resolve(__dirname, 'README.zh-CN.md'),
                'utf8',
              ),
              fileName: 'README.zh-CN.md',
            });
            this.emitFile({
              type: 'asset',
              source: await readFile(resolve(__dirname, 'LICENSE.md'), 'utf8'),
              fileName: 'LICENSE.md',
            });
          },
        },
      },
    ],
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
        if (chunkInfo.name === 'logger') {
          return 'utils/[name].js';
        }
        if (chunkInfo.name === 'client-runtime') {
          return 'shared/[name].js';
        }
        return `${baseDir}/[name].${chunkFileExt}`;
      },
      chunkFileNames: `${baseDir}/chunks/dep-[hash].${chunkFileExt}`,
      exports: 'named',
      format: 'esm',
      externalLiveBindings: false,
      sourcemap: false,
    },
  });
};

const sharedNodeOptions = getSharedOptions('node');
const sharedBrowserOptions = getSharedOptions('browser');

const nodeConfig = defineConfig({
  ...sharedNodeOptions,
  input: {
    index: resolve(__dirname, 'src/node/index.ts'),
    react: resolve(__dirname, 'src/node/react/index.ts'),
  },
  output: {
    ...sharedNodeOptions.output,
    minify: {
      compress: true,
      mangle: false,
      removeWhitespace: false,
    },
  },
});

const clientConfig = defineConfig({
  ...sharedBrowserOptions,
  input: {
    logger: resolve(__dirname, 'utils/logger.ts'),
    index: resolve(__dirname, 'src/client/index.ts'),
    react: resolve(__dirname, 'src/client/react/index.ts'),
  },
  plugins: [dts()],
  transform: {
    target: 'es2022',
  },
});

const enableClientRuntimeSourcemap = Boolean(
  process.env.enableClientRuntimeSourcemap,
);

const clientRuntimeConfig = defineConfig({
  ...sharedBrowserOptions,
  input: {
    'client-runtime': resolve(__dirname, 'src/shared/client-runtime.ts'),
  },
  plugins: [dts()],
  transform: {
    target: 'es2022',
  },
  output: {
    ...sharedBrowserOptions.output,
    /**
     * The runtime module is an optimization module that exposes features to the user side,
     * which directly copies the output products to the output directory on the user side,
     * therefore it does not include chunks dependencies temporarily.
     */
    manualChunks: undefined,
    sourcemap: enableClientRuntimeSourcemap ? 'inline' : false,
  },
});

const configs: RolldownOptions[] = [
  nodeConfig,
  clientConfig,
  clientRuntimeConfig,
];

export default configs;
