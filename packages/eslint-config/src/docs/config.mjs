import { defineConfig } from 'eslint/config';
import { eslintConfigBase } from '../../base.mjs';

export default defineConfig([
  ...eslintConfigBase,
  // Docs examples - relax non-critical rules
  {
    files: ['docs/**/*.ts', 'docs/**/*.tsx'],
    rules: {
      'unicorn/text-encoding-identifier-case': 'off',
    },
  },
]);
