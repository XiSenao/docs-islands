import { loadEnv } from '@docs-islands/utils';
import vue from '@vitejs/plugin-vue';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RolldownOptions } from 'rolldown';
import pkg from './package.json' with { type: 'json' };

const { config } = loadEnv();
const { sourcemap, minify } = config;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const entry = path.resolve(__dirname, 'theme/SiteDebugConsole.vue');
const sourcePreviewWorkerEntry = path.resolve(
  __dirname,
  'theme/site-debug-source-preview.worker.ts',
);
const sourceTextWorkerEntry = path.resolve(
  __dirname,
  'theme/site-debug-source-text.worker.ts',
);
const sourceHighlightWorkerEntry = path.resolve(
  __dirname,
  'theme/site-debug-source-highlight.worker.ts',
);
const themeDistDir = path.resolve(__dirname, 'dist/theme');

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

let hasCleanedThemeDist = false;

const createThemeDistCleanPlugin = () => ({
  name: 'rolldown-plugin-clean-theme-dist',
  async buildStart() {
    if (hasCleanedThemeDist) {
      return;
    }

    hasCleanedThemeDist = true;
    await rm(themeDistDir, {
      force: true,
      recursive: true,
    });
  },
});

const createSiteDebugWorkerUrlRewritePlugin = () => ({
  name: 'rolldown-plugin-rewrite-site-debug-worker-urls',
  renderChunk(code: string, chunk: { fileName: string }) {
    const chunkDirectory = path.posix.dirname(chunk.fileName);
    const previewWorkerPath = path.posix.relative(
      chunkDirectory,
      'site-debug-source-preview.worker.mjs',
    );
    const textWorkerPath = path.posix.relative(
      chunkDirectory,
      'site-debug-source-text.worker.mjs',
    );
    const highlightWorkerPath = path.posix.relative(
      chunkDirectory,
      'site-debug-source-highlight.worker.mjs',
    );
    const nextCode = code
      .replaceAll('site-debug-source-preview.worker.ts', previewWorkerPath)
      .replaceAll('site-debug-source-text.worker.ts', textWorkerPath)
      .replaceAll('site-debug-source-highlight.worker.ts', highlightWorkerPath);

    if (nextCode === code) {
      return null;
    }

    return {
      code: nextCode,
      map: null,
    };
  },
});

const createThemeOutput = (
  overrides: Partial<NonNullable<RolldownOptions['output']>> = {},
): NonNullable<RolldownOptions['output']> => ({
  dir: themeDistDir,
  format: 'es',
  entryFileNames: '[name].mjs',
  sourcemap,
  minify,
  ...overrides,
});

const debugConsoleConfig: RolldownOptions = {
  input: {
    'debug-console': entry,
  },
  external: shouldExternalizeThemeRuntimeDependency,
  plugins: [
    createThemeDistCleanPlugin(),
    vue(),
    createSiteDebugWorkerUrlRewritePlugin(),
  ],
  transform: {
    target: 'es2020',
  },
  output: createThemeOutput({
    exports: 'named',
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
  }),
};

const previewWorkerConfig: RolldownOptions = {
  input: {
    'site-debug-source-preview.worker': sourcePreviewWorkerEntry,
  },
  external: shouldExternalizeThemeRuntimeDependency,
  plugins: [
    createThemeDistCleanPlugin(),
    createSiteDebugWorkerUrlRewritePlugin(),
  ],
  transform: {
    target: 'es2020',
  },
  output: createThemeOutput({
    codeSplitting: false,
  }),
};

const textWorkerConfig: RolldownOptions = {
  input: {
    'site-debug-source-text.worker': sourceTextWorkerEntry,
  },
  external: shouldExternalizeThemeRuntimeDependency,
  plugins: [
    createThemeDistCleanPlugin(),
    createSiteDebugWorkerUrlRewritePlugin(),
  ],
  transform: {
    target: 'es2020',
  },
  output: createThemeOutput({
    codeSplitting: false,
  }),
};

const highlightWorkerConfig: RolldownOptions = {
  input: {
    'site-debug-source-highlight.worker': sourceHighlightWorkerEntry,
  },
  external: shouldExternalizeThemeRuntimeDependency,
  plugins: [
    createThemeDistCleanPlugin(),
    createSiteDebugWorkerUrlRewritePlugin(),
  ],
  transform: {
    target: 'es2020',
  },
  output: createThemeOutput({
    codeSplitting: false,
  }),
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

const configs: RolldownOptions[] = [
  debugConsoleConfig,
  previewWorkerConfig,
  textWorkerConfig,
  highlightWorkerConfig,
];

export default configs;
