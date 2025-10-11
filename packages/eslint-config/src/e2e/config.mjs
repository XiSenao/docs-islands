import { defineConfig } from 'eslint/config';
import { eslintConfigBase } from '../../base.mjs';

export default defineConfig([
  ...eslintConfigBase,
  // E2E test files - allow test-specific patterns
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      // Console statements are essential for debugging test failures
      'no-console': 'off',

      // Tests can have long setup/teardown sequences and multiple test cases in describe blocks
      'max-lines-per-function': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines': ['warn', { max: 800, skipBlankLines: true, skipComments: true }],

      // Test scenarios can be complex with many conditional branches
      complexity: ['warn', { max: 30 }],
      'max-depth': ['warn', 8],

      // Allow nested describes and hooks
      'max-nested-callbacks': ['warn', 8],

      // Tests often use magic numbers for timeouts and retries
      'no-magic-numbers': 'off',

      // Allow empty catch blocks in tests for expected failures
      'no-empty': ['error', { allowEmptyCatch: true }],

      // TypeScript rules - relax for test code
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',

      // Allow non-null assertions in tests (we know test data structure)
      '@typescript-eslint/no-non-null-assertion': 'off',

      // Allow any type in tests for mocking and flexible test data
      '@typescript-eslint/no-explicit-any': 'warn',

      // Allow unused vars with underscore prefix (common in test fixtures)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ]
    }
  }
]);
