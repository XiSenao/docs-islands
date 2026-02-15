import path from 'node:path';
import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import { glob } from 'tinyglobby';

async function getModuleFiles(): Promise<string[]> {
  const files = await glob(['**/*.ts'], {
    cwd: process.cwd(),
    absolute: false,
    onlyFiles: true,
    ignore: [
      '**/*.d.ts',
      '**/*.config.ts',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/node_modules/**',
    ],
  });

  return files.map((file) => file.replace('.ts', ''));
}

const modules = await getModuleFiles();
const external: RolldownOptions['external'] = [/^[\w@][^:]/];

const moduleConfigs: RolldownOptions = defineConfig({
  input: './index.ts',
  platform: 'node',
  external,
  output: {
    dir: 'dist',
    format: 'esm',
    preserveModules: true,
  },
});

const dtsConfigs: RolldownOptions[] = modules.map((module) =>
  defineConfig({
    input: `./${module}.ts`,
    platform: 'node',
    external,
    output: {
      dir: `dist/${path.dirname(module)}`,
    },
    plugins: [dts({ emitDtsOnly: true })],
  }),
);

const rolldownConfig: RolldownOptions[] = [moduleConfigs, ...dtsConfigs];

export default rolldownConfig;
