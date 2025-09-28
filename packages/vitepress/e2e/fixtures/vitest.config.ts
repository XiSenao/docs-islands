import { defineConfig } from 'vitest/config';

const timeout = 50_000;

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    setupFiles: ['vitestSetup.ts'],
    globalSetup: ['vitestGlobalSetup.ts'],
    testTimeout: timeout,
    hookTimeout: timeout,
    teardownTimeout: timeout,
    expect: {
      poll: {
        timeout: 50 * (process.env.CI ? 300 : 200)
      }
    },
    globals: true,
    sequence: {
      concurrent: false
    },
    maxConcurrency: 1,
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 1,
        minForks: 1
      }
    }
  },
  esbuild: {
    target: 'node20'
  }
}) as ReturnType<typeof defineConfig>;
