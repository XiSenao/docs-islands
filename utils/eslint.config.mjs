import eslintConfig from '@docs-islands/eslint-config';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...eslintConfig,
  {
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['./bin/*.ts', './bin/*.mjs'],
    rules: {
      'n/hashbang': 'off',
    },
  },
]);
