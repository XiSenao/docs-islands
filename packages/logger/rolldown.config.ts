import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';

const sourcemap = process.env.DOCS_ISLANDS_SOURCEMAP === 'true';
const minify = process.env.DOCS_ISLANDS_MINIFY === 'true';

const sharedOptions = defineConfig({
  input: {
    index: 'src/index.ts',
    internal: 'src/internal.ts',
    'plugin/index': 'src/plugin/index.ts',
  },
  platform: 'neutral',
  preserveEntrySignatures: 'strict',
  external: [/^[\w@][^:]/],
  output: {
    dir: 'dist',
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/dep-[hash].js',
    exports: 'named',
    format: 'esm',
    preserveModules: true,
    sourcemap,
  },
});

const codeConfig: RolldownOptions = defineConfig({
  ...sharedOptions,
  output: {
    ...sharedOptions.output,
    ...(minify && {
      minify: {
        compress: true,
        mangle: false,
        codegen: {
          removeWhitespace: false,
        },
      },
    }),
  },
});

const dtsConfig: RolldownOptions = defineConfig({
  ...sharedOptions,
  plugins: [
    dts({
      emitDtsOnly: true,
      sourcemap,
    }),
  ],
});

const rolldownConfig: RolldownOptions[] = [codeConfig, dtsConfig];

export default rolldownConfig;
