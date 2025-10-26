import path from 'node:path';
import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import { glob } from 'tinyglobby';

async function getModuleFiles(): Promise<string[]> {
  const files = await glob(['**/*.ts'], {
    cwd: process.cwd(),
    absolute: false,
    onlyFiles: true,
    ignore: ['**/*.d.ts', 'rolldown.config.ts', '**/node_modules/**'],
  });

  return files.map((file) => file.replace('.ts', ''));
}

const modules = await getModuleFiles();

const moduleConfigs: RolldownOptions[] = modules.map((module) =>
  defineConfig({
    input: `./${module}.ts`,
    platform: 'node',
    external: [/^[\w@][^:]/],
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: `${module}.js`,
    },
  }),
);

const dtsConfigs: RolldownOptions[] = modules.map((module) =>
  defineConfig({
    input: `./${module}.ts`,
    platform: 'node',
    external: [/^[\w@][^:]/],
    output: {
      dir: `dist/${path.dirname(module)}`,
    },
    plugins: [
      dts({
        emitDtsOnly: true,
      }),
    ],
  }),
);

const rolldownConfig: RolldownOptions[] = [...moduleConfigs, ...dtsConfigs];

export default rolldownConfig;
