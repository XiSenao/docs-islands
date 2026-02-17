import inspector from 'node:inspector';
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
      'bin/**',
    ],
  });

  return files.map((file) => file.replace('.ts', ''));
}

const modules = await getModuleFiles();

const moduleConfig: RolldownOptions = defineConfig({
  input: './index.ts',
  platform: 'neutral',
  preserveEntrySignatures: 'strict',
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
  // All modules must be explicit entries so that Rolldown preserves their
  // full export signatures (e.g. `export { X as default }`).
  // With a single entry + preserveModules, non-entry modules lose `as default`
  // because Rolldown optimises the alias away for internal dependencies.
  //
  // This is a general Rolldown behaviour, not specific to dts:
  // `export { X as default }` (ExportNamedDeclaration) is treated as an
  // optimisable alias, while `export default X` (ExportDefaultDeclaration)
  // is preserved. The dts plugin converts all default exports to the former
  // form during its fake-js transform, so the dts build is always affected.
  // The JS build is only safe when the source uses `export default X` directly.
  input: modules,
  platform: 'neutral',
  preserveEntrySignatures: 'strict',
  external: [/^[\w@][^:]/],
  output: {
    dir: 'dist',
    preserveModules: true,
  },
  plugins: [
    dts({
      emitDtsOnly: true,
    }),
  ],
});

const rolldownConfig: RolldownOptions[] = [moduleConfig, dtsConfig];

export default rolldownConfig;
