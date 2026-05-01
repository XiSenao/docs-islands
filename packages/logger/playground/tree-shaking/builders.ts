import {
  loggerPlugin,
  type LoggerPluginOptions,
} from '@docs-islands/logger/plugin';
import { build as farmBuild } from '@farmfe/core';
import rspack from '@rspack/core';
import esbuild from 'esbuild';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rollup, type RollupOutput } from 'rollup';
import { build as viteBuild } from 'vite';
import { webpack } from 'webpack';

const LOGGER_MODULE_ID = '@docs-islands/logger';
const TREE_SHAKING_PLAYGROUND_ENTRY = fileURLToPath(
  new URL('src/entry.ts', import.meta.url),
);
const TREE_SHAKING_PLAYGROUND_ROOT = path.dirname(
  TREE_SHAKING_PLAYGROUND_ENTRY,
);

interface BuildStatsLike {
  hasErrors: () => boolean;
  toJson: (options: { all: false; errors: true }) => {
    errors?: unknown[];
  };
}

interface CompilerLike<TStats extends BuildStatsLike> {
  close: (callback: (error?: Error | null) => void) => void;
  run: (callback: (error?: Error | null, stats?: TStats) => void) => void;
}

export interface LoggerTreeShakingPlaygroundBuild {
  build: () => Promise<string>;
  bundler: string;
}

const createLoggerPluginOptions = (): LoggerPluginOptions => ({
  config: {
    levels: ['warn', 'error'],
  },
});

const formatStatsError = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return JSON.stringify(error);
};

const runCompiler = async <TStats extends BuildStatsLike>(
  bundler: string,
  compiler: CompilerLike<TStats>,
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    compiler.run((runError, stats) => {
      compiler.close((closeError) => {
        const error = runError ?? closeError;

        if (error) {
          reject(error);

          return;
        }

        if (stats?.hasErrors()) {
          const info = stats.toJson({
            all: false,
            errors: true,
          });
          const errors = info.errors
            ?.map((error) => formatStatsError(error))
            .join('\n');

          reject(
            new Error(
              `${bundler} playground build failed${errors ? `:\n${errors}` : ''}`,
            ),
          );

          return;
        }

        resolve();
      });
    });
  });
};

const withTemporaryOutputDirectory = async (
  bundler: string,
  build: (outputDirectory: string) => Promise<string>,
): Promise<string> => {
  const outputDirectory = await mkdtemp(
    path.join(tmpdir(), `docs-islands-logger-${bundler}-`),
  );

  try {
    return await build(outputDirectory);
  } finally {
    await rm(outputDirectory, {
      force: true,
      recursive: true,
    });
  }
};

const readJavaScriptOutputFiles = async (
  outputDirectory: string,
): Promise<string> => {
  const entries = await readdir(outputDirectory, {
    withFileTypes: true,
  });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(outputDirectory, entry.name);

      if (entry.isDirectory()) {
        return readJavaScriptOutputFiles(entryPath);
      }

      if (!entry.isFile() || !/\.[cm]?js$/u.test(entry.name)) {
        return '';
      }

      return readFile(entryPath, 'utf8');
    }),
  );

  return contents.filter(Boolean).join('\n');
};

const buildVitePlayground = async (): Promise<string> => {
  const output = (await viteBuild({
    build: {
      lib: {
        entry: TREE_SHAKING_PLAYGROUND_ENTRY,
        fileName: 'entry',
        formats: ['es'],
      },
      minify: false,
      rollupOptions: {
        external: [LOGGER_MODULE_ID],
      },
      write: false,
    },
    configFile: false,
    logLevel: 'silent',
    plugins: [loggerPlugin.vite(createLoggerPluginOptions())],
  })) as RollupOutput[];

  const outputs = Array.isArray(output) ? output : [output];
  return outputs
    .flatMap((item) => item.output)
    .filter((item) => item.type === 'chunk')
    .map((item) => item.code)
    .join('\n');
};

const buildRollupPlayground = async (): Promise<string> => {
  const bundle = await rollup({
    external: [LOGGER_MODULE_ID],
    input: TREE_SHAKING_PLAYGROUND_ENTRY,
    plugins: [loggerPlugin.rollup(createLoggerPluginOptions())],
  });

  try {
    const { output } = await bundle.generate({
      format: 'esm',
    });

    return output
      .filter((item) => item.type === 'chunk')
      .map((item) => item.code)
      .join('\n');
  } finally {
    await bundle.close();
  }
};

const buildRolldownPlayground = async (): Promise<string> => {
  const bundle = await rolldown({
    external: [LOGGER_MODULE_ID],
    input: TREE_SHAKING_PLAYGROUND_ENTRY,
    plugins: [loggerPlugin.rolldown(createLoggerPluginOptions())],
  });

  try {
    const { output } = await bundle.generate({
      format: 'esm',
    });

    return output
      .filter((item) => item.type === 'chunk')
      .map((item) => item.code)
      .join('\n');
  } finally {
    await bundle.close();
  }
};

const buildEsbuildPlayground = async (): Promise<string> => {
  const result = await esbuild.build({
    bundle: true,
    entryPoints: [TREE_SHAKING_PLAYGROUND_ENTRY],
    external: [LOGGER_MODULE_ID],
    format: 'esm',
    plugins: [loggerPlugin.esbuild(createLoggerPluginOptions())],
    write: false,
  });

  return result.outputFiles.map((file) => file.text).join('\n');
};

const buildWebpackPlayground = async (): Promise<string> =>
  withTemporaryOutputDirectory('webpack', async (outputDirectory) => {
    const compiler = webpack({
      entry: TREE_SHAKING_PLAYGROUND_ENTRY,
      externals: {
        [LOGGER_MODULE_ID]: LOGGER_MODULE_ID,
      },
      externalsType: 'commonjs',
      mode: 'production',
      optimization: {
        minimize: false,
      },
      output: {
        filename: 'entry.js',
        path: outputDirectory,
      },
      plugins: [loggerPlugin.webpack(createLoggerPluginOptions())],
      resolve: {
        extensions: ['.ts', '.js'],
      },
      target: 'node',
    });

    await runCompiler('webpack', compiler);

    return readJavaScriptOutputFiles(outputDirectory);
  });

const buildRspackPlayground = async (): Promise<string> =>
  withTemporaryOutputDirectory('rspack', async (outputDirectory) => {
    const compiler = rspack({
      entry: TREE_SHAKING_PLAYGROUND_ENTRY,
      externals: {
        [LOGGER_MODULE_ID]: LOGGER_MODULE_ID,
      },
      externalsType: 'commonjs',
      mode: 'production',
      optimization: {
        minimize: false,
      },
      output: {
        filename: 'entry.js',
        path: outputDirectory,
      },
      plugins: [loggerPlugin.rspack(createLoggerPluginOptions())],
      resolve: {
        extensions: ['.ts', '.js'],
      },
      target: 'node',
    });

    await runCompiler('rspack', compiler);

    return readJavaScriptOutputFiles(outputDirectory);
  });

const buildFarmPlayground = async (): Promise<string> =>
  withTemporaryOutputDirectory('farm', async (outputDirectory) => {
    await farmBuild({
      clearScreen: false,
      configFile: false,
      mode: 'production',
      plugins: [loggerPlugin.farm(createLoggerPluginOptions())],
      root: TREE_SHAKING_PLAYGROUND_ROOT,
      compilation: {
        external: [LOGGER_MODULE_ID],
        input: {
          index: TREE_SHAKING_PLAYGROUND_ENTRY,
        },
        mode: 'production',
        output: {
          clean: true,
          entryFilename: 'entry.js',
          filename: '[resourceName].js',
          format: 'esm',
          path: outputDirectory,
          showFileSize: false,
          targetEnv: 'library',
        },
        persistentCache: false,
      },
    });

    return readJavaScriptOutputFiles(outputDirectory);
  });

export const LOGGER_TREE_SHAKING_PLAYGROUND_BUILDS: LoggerTreeShakingPlaygroundBuild[] =
  [
    {
      build: buildVitePlayground,
      bundler: 'vite',
    },
    {
      build: buildRollupPlayground,
      bundler: 'rollup',
    },
    {
      build: buildRolldownPlayground,
      bundler: 'rolldown',
    },
    {
      build: buildEsbuildPlayground,
      bundler: 'esbuild',
    },
    {
      build: buildWebpackPlayground,
      bundler: 'webpack',
    },
    {
      build: buildRspackPlayground,
      bundler: 'rspack',
    },
    {
      build: buildFarmPlayground,
      bundler: 'farm',
    },
  ];
