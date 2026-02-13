import inspector from 'node:inspector';
import path from 'node:path';
import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import { glob } from 'tinyglobby';

async function getModuleFiles(): Promise<string[]> {
  const files = await glob(['*.ts'], {
    cwd: process.cwd(),
    absolute: false,
    onlyFiles: true,
    ignore: ['rolldown.config.ts'],
  });

  return files.map((file) => file.replace('.ts', ''));
}

const modules = await getModuleFiles();

const moduleConfigs: RolldownOptions[] = modules.map((module) =>
  defineConfig({
    input: `./${module}.ts`,
    platform: 'neutral',
    external: [/^[\w@][^:]/],
    transform: {
      define: {
        __PROD__: String(process.env.NODE_ENV === 'production'),
        __DEBUG__: String(inspector.url() !== undefined),
      },
    },
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
    platform: 'neutral',
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
