import eslintConfig from '@docs-islands/eslint-config';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...eslintConfig,
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
