import { defineConfig, type ViteUserConfig } from 'vitest/config';

const config: ViteUserConfig = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/**/__tests__/**/*.{test,spec}.{js,ts,tsx}',
      'src/**/*.{test,spec}.{js,ts,tsx}',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '**/*.d.ts',
      'e2e/**/node_modules/**',
      'e2e/fixtures/**',
    ],
    testTimeout: 50_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportOnFailure: true,
      all: true,
      include: ['src/**/*.{js,ts,tsx}'],
      exclude: [
        'e2e/**',
        '**/__tests__/**',
        '**/*.test.{js,ts,tsx}',
        '**/*.spec.{js,ts,tsx}',
        '**/types/**',
        '**/*.d.ts',
        'scripts/**',
        'dist/**',
        'coverage/**',
      ],
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
