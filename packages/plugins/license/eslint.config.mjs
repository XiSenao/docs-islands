import eslintGeneralConfig from '@docs-islands/eslint-config';
import { createLoggerPlugin } from '@docs-islands/eslint-config/plugins';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...eslintGeneralConfig,

  {
    name: 'Create Logger Boundary',
    files: ['**/*.{js,mjs,cjs,jsx,mjsx,ts,mts,cts,tsx,mtsx}'],
    plugins: {
      '@docs-islands/plugin-license': createLoggerPlugin,
    },
    ignores: [
      'docs/**',
      'playground/**',
      'smoke/**',
      '**/__tests__/**',
      '**/tests/**',
      '**/fixtures/**',
      '**/*.test.*',
      '**/*.spec.*',
    ],
    rules: {
      '@docs-islands/plugin-license/unified-log-entry': 'error',
    },
  },
  {
    files: ['src/index.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
]);
