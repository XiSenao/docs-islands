import { loadEnv } from '@docs-islands/utils';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RolldownOptions } from 'rolldown';
import pkg from './package.json' with { type: 'json' };

const { config } = loadEnv();
const { sourcemap, minify } = config;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const entry = path.resolve(__dirname, 'theme/SiteDebugConsole.vue');

const runtimeDependencyNames = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
  // @ts-expect-error No type checking is needed here.
  ...Object.keys(pkg.optionalDependencies ?? {}),
];

const shouldExternalizeThemeRuntimeDependency = (source: string) => {
  if (/\.css(?:$|\?)/.test(source)) {
    return false;
  }

  if (source === pkg.name || source.startsWith(`${pkg.name}/`)) {
    return true;
  }

  return runtimeDependencyNames.some(
    (packageName) =>
      source === packageName || source.startsWith(`${packageName}/`),
  );
};

const vueClientConfig: RolldownOptions = {
  input: {
    'debug-console': entry,
  },
  external: shouldExternalizeThemeRuntimeDependency,
  plugins: [vue()],
  transform: {
    target: 'es2020',
  },
  output: {
    dir: path.resolve(__dirname, 'dist/theme'),
    format: 'es',
    exports: 'named',
    entryFileNames: '[name].mjs',
    chunkFileNames: 'assets/[name]-[hash].mjs',
    assetFileNames: (asset) => {
      const isCss =
        asset.names?.some((n) => n.endsWith('.css')) ||
        asset.originalFileNames?.some((f) => f.endsWith('.css'));

      if (isCss) {
        return '[name][extname]';
      }

      return 'assets/[name]-[hash][extname]';
    },
    sourcemap,
    minify,
  },
};

// const vueClientDtsConfig: RolldownOptions = {
//   input: {
//     'debug-console': entry,
//   },
//   plugins: [
//     dts({
//       tsconfig: './tsconfig.theme.json',
//       emitDtsOnly: true,
//       sourcemap,
//       vue: true,
//     }),
//   ],
//   external: shouldExternalizeThemeRuntimeDependency,
//   output: {
//     cleanDir: false,
//     dir: path.resolve(__dirname, 'dist/theme'),
//     format: 'es',
//     entryFileNames: '[name].d.ts',
//   },
// };

const configs: RolldownOptions[] = [vueClientConfig];

export default configs;
