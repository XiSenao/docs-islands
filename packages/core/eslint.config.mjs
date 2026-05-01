import { createLoggerPlugin } from '@docs-islands/eslint-config/plugins';
import { core } from '@docs-islands/eslint-config/presets';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...core,

  {
    name: 'Create Logger Boundary',
    files: ['**/*.{js,mjs,cjs,jsx,mjsx,ts,mts,cts,tsx,mtsx}'],
    plugins: {
      '@docs-islands/core': createLoggerPlugin,
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
      '@docs-islands/core/unified-log-entry': 'error',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-inferrable-types': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      complexity: 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
]);
