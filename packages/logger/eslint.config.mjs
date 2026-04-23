import eslintConfig from '@docs-islands/eslint-config';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...eslintConfig,
  {
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts'],
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
