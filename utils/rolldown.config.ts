import inspector from 'node:inspector';
import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import { glob } from 'tinyglobby';

async function getModuleFiles(): Promise<string[]> {
  const files = await glob(['*.ts'], {
    cwd: process.cwd(),
    absolute: false,
    onlyFiles: true,
    ignore: ['*.config.ts', '*.test.ts', '*.spec.ts'],
  });

  return files.map((file) => file.replace('.ts', ''));
}

const modules = await getModuleFiles();

const moduleConfigs: RolldownOptions = defineConfig({
  input: './index.ts',
  platform: 'neutral',
  external: [/^[\w@][^:]/],
  transform: {
    define: {
      __SILENCE_LOG__: String(
        !process.env.CI && process.env.NODE_ENV === 'production',
      ),
      __DEBUG__: String(process.env.CI || inspector.url() !== undefined),
    },
  },
  output: {
    dir: 'dist',
    format: 'esm',
    preserveModules: true,
  },
});

const dtsConfig: RolldownOptions = defineConfig({
  input: Object.fromEntries(modules.map((m) => [m, `./${m}.ts`])),
  platform: 'neutral',
  external: [/^[\w@][^:]/],
  output: {
    dir: 'dist',
  },
  plugins: [
    dts({
      emitDtsOnly: true,
    }),
  ],
});

const rolldownConfig: RolldownOptions[] = [moduleConfigs, dtsConfig];

export default rolldownConfig;
