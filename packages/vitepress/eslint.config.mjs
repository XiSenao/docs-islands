import defaultConfig from '@docs-islands/eslint-config';
import typescriptESlintParser from '@typescript-eslint/parser';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  ...defaultConfig,

  // Ignore intentionally empty .d.ts files for runtime modules
  globalIgnores(['src/shared/client-runtime.d.ts', 'utils/logger.d.ts']),

  {
    rules: {
      // https://typescript-eslint.io/rules/no-inferrable-types/#when-not-to-use-it
      '@typescript-eslint/no-inferrable-types': 'off',
    },
  },
  {
    files: ['scripts/*.ts'],
    languageOptions: {
      parser: typescriptESlintParser,
      parserOptions: {
        projectService: true,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Script files are allowed to use console and process.exit
      'no-console': 'off',
      'unicorn/no-process-exit': 'off',
      // Script files can have higher complexity
      complexity: ['warn', { max: 30 }],
      'max-lines': [
        'warn',
        { max: 800, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': [
        'warn',
        { max: 200, skipBlankLines: true, skipComments: true },
      ],
      // Relaxed TypeScript rules
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'no-return-await': 'off',
      'require-await': 'off',
    },
  },
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      // Test files are allowed to use any type for mocks and test utilities
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // Test files can have higher complexity
      complexity: 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
]);
