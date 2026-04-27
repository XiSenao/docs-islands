import { loadEnv } from '@docs-islands/utils/env';
import vue from '@vitejs/plugin-vue';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, RolldownOptions } from 'rolldown';
import pkg from './package.json' with { type: 'json' };

const { config } = loadEnv();
const { sourcemap, minify } = config;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const entry = path.resolve(__dirname, 'theme/SiteDevToolsConsole.vue');
const sourcePreviewWorkerEntry = path.resolve(
  __dirname,
  'theme/site-devtools-source-preview.worker.ts',
);
const sourceTextWorkerEntry = path.resolve(
  __dirname,
  'theme/site-devtools-source-text.worker.ts',
);
const sourceHighlightWorkerEntry = path.resolve(
  __dirname,
  'theme/site-devtools-source-highlight.worker.ts',
);
const vueJsonPrettyFallbackEntry = path.resolve(
  __dirname,
  'theme/optional-deps/vue-json-pretty.ts',
);
const prettierStandaloneFallbackEntry = path.resolve(
  __dirname,
  'theme/optional-deps/prettier-standalone.ts',
);
const prettierPluginFallbackEntry = path.resolve(
  __dirname,
  'theme/optional-deps/prettier-plugin.ts',
);
const shikiFallbackEntry = path.resolve(
  __dirname,
  'theme/optional-deps/shiki.ts',
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

const createThemeDistCleanPlugin = (): Plugin => ({
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

const createSiteDevToolsWorkerUrlRewritePlugin = (): Plugin => ({
  name: 'rolldown-plugin-rewrite-site-devtools-worker-urls',
  renderChunk(code: string, chunk: { fileName: string }) {
    const chunkDirectory = path.posix.dirname(chunk.fileName);
    const previewWorkerPath = path.posix.relative(
      chunkDirectory,
      'site-devtools-source-preview.worker.mjs',
    );
    const textWorkerPath = path.posix.relative(
      chunkDirectory,
      'site-devtools-source-text.worker.mjs',
    );
    const highlightWorkerPath = path.posix.relative(
      chunkDirectory,
      'site-devtools-source-highlight.worker.mjs',
    );
    const nextCode = code
      .replaceAll('site-devtools-source-preview.worker.ts', previewWorkerPath)
      .replaceAll('site-devtools-source-text.worker.ts', textWorkerPath)
      .replaceAll(
        'site-devtools-source-highlight.worker.ts',
        highlightWorkerPath,
      );

    if (nextCode === code) {
      return null;
    }

    return {
      code: nextCode,
      map: null,
    };
  },
});

const createOptionalDependencyAssetCopyPlugin = (): Plugin => ({
  name: 'rolldown-plugin-copy-theme-optional-dependency-assets',
  async generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'optional-deps/empty.css',
      source: await readFile(
        path.resolve(__dirname, 'theme/optional-deps/empty.css'),
        'utf8',
      ),
    });
  },
});

const createOptionalDependencyFallbackConfig = ({
  entry,
  name,
  plugins = [],
}: {
  entry: string;
  name: string;
  plugins?: RolldownOptions['plugins'];
}): RolldownOptions => {
  const normalizedPlugins = Array.isArray(plugins)
    ? plugins
    : plugins
      ? [plugins]
      : [];

  return {
    input: {
      [`optional-deps/${name}`]: entry,
    },
    external: shouldExternalizeThemeRuntimeDependency,
    plugins: [createThemeDistCleanPlugin(), ...normalizedPlugins],
    transform: {
      target: 'es2020',
    },
    output: createThemeOutput({
      codeSplitting: false,
    }),
  };
};

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

const devtoolsConfig: RolldownOptions = {
  input: {
    devtools: entry,
  },
  external: shouldExternalizeThemeRuntimeDependency,
  plugins: [
    createThemeDistCleanPlugin(),
    vue(),
    createSiteDevToolsWorkerUrlRewritePlugin(),
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
    'site-devtools-source-preview.worker': sourcePreviewWorkerEntry,
  },
  external: shouldExternalizeThemeRuntimeDependency,
  plugins: [
    createThemeDistCleanPlugin(),
    createSiteDevToolsWorkerUrlRewritePlugin(),
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
    'site-devtools-source-text.worker': sourceTextWorkerEntry,
  },
  external: shouldExternalizeThemeRuntimeDependency,
  plugins: [
    createThemeDistCleanPlugin(),
    createSiteDevToolsWorkerUrlRewritePlugin(),
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
    'site-devtools-source-highlight.worker': sourceHighlightWorkerEntry,
  },
  external: shouldExternalizeThemeRuntimeDependency,
  plugins: [
    createThemeDistCleanPlugin(),
    createSiteDevToolsWorkerUrlRewritePlugin(),
  ],
  transform: {
    target: 'es2020',
  },
  output: createThemeOutput({
    codeSplitting: false,
  }),
};

const vueJsonPrettyFallbackConfig = createOptionalDependencyFallbackConfig({
  entry: vueJsonPrettyFallbackEntry,
  name: 'vue-json-pretty',
  plugins: [vue(), createOptionalDependencyAssetCopyPlugin()],
});

const prettierStandaloneFallbackConfig = createOptionalDependencyFallbackConfig(
  {
    entry: prettierStandaloneFallbackEntry,
    name: 'prettier-standalone',
  },
);

const prettierPluginFallbackConfig = createOptionalDependencyFallbackConfig({
  entry: prettierPluginFallbackEntry,
  name: 'prettier-plugin',
});

const shikiFallbackConfig = createOptionalDependencyFallbackConfig({
  entry: shikiFallbackEntry,
  name: 'shiki',
});

// const vueClientDtsConfig: RolldownOptions = {
//   input: {
//     'devtools': entry,
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
  devtoolsConfig,
  previewWorkerConfig,
  textWorkerConfig,
  highlightWorkerConfig,
  vueJsonPrettyFallbackConfig,
  prettierStandaloneFallbackConfig,
  prettierPluginFallbackConfig,
  shikiFallbackConfig,
];

export default configs;
