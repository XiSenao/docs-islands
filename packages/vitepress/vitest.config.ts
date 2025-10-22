import { fileURLToPath } from 'node:url';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

const config: ViteUserConfig = defineConfig({
  resolve: {
    alias: {
      '#dep-types': fileURLToPath(new URL('src/types', import.meta.url)),
      '#shared': fileURLToPath(new URL('src/shared', import.meta.url)),
      '#utils': fileURLToPath(new URL('utils', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.{test,spec}.{js,ts,tsx}'],
    testTimeout: 50_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportOnFailure: true,
      all: true,
      include: ['src/**/*.{js,ts,tsx}'],
      exclude: ['**/__tests__/**', '**/types/**'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4,
      },
    },
    reporters: ['default', 'json'],
    outputFile: {
      json: './coverage/test-results.json',
    },
    resolveSnapshotPath: (testPath, snapExtension) => {
      return testPath.replace(/\.test\.([jt]sx?)$/, `${snapExtension}.$1`);
    },
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ['./tests/setup.ts'],
    watch: false,
  },
  define: {
    __TEST__: true,
  },
});

export default config;
