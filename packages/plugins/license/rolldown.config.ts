import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';

const config: RolldownOptions = defineConfig({
  input: 'src/index.ts',
  platform: 'node',
  output: {
    dir: 'dist',
    format: 'esm',
    entryFileNames: 'index.mjs'
  }
});

const dtsConfig: RolldownOptions = defineConfig({
  input: 'src/index.ts',
  platform: 'node',
  external: [/^[\w@][^:]/],
  output: {
    dir: 'dist'
  },
  plugins: [
    dts({
      emitDtsOnly: true
    })
  ]
});

const rolldownConfig: RolldownOptions[] = [dtsConfig, config];

export default rolldownConfig;
