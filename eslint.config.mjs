import defaultConfig from '@docs-islands/eslint-config/monorepo';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...defaultConfig,
  {
    files: ['scripts/**/*.ts'],
    rules: {
      complexity: ['warn', { max: 40 }],
      'max-lines': [
        'warn',
        { max: 1200, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': [
        'warn',
        { max: 240, skipBlankLines: true, skipComments: true },
      ],
      'n/no-unsupported-features/node-builtins': 'off',
      'no-restricted-syntax': 'off',
      'no-void': 'off',
      'prefer-template': 'off',
      'regexp/no-super-linear-backtracking': 'off',
      'regexp/prefer-character-class': 'off',
      'sort-imports': 'off',
      'unicorn/better-regex': 'off',
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-array-sort': 'off',
      'unicorn/no-await-expression-member': 'off',
      'unicorn/prefer-single-call': 'off',
      'unicorn/prefer-ternary': 'off',
      'unicorn/switch-case-braces': 'off',
    },
  },
]);
