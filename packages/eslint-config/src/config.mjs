import typescriptESlintParser from '@typescript-eslint/parser';
import { defineConfig, globalIgnores } from 'eslint/config';
import { eslintConfigBase } from '../base.mjs';

/**
 * General structure of generic output packages and lint rules:
 * - packages
 *   - packageName (monorepo)
 *     - docs (monorepo)
 *     - e2e (monorepo)
 *     - src
 *       - client
 *       - node
 *       - shared
 *       - types
 *     - utils
 *     - vitest.config.ts
 *     - rolldown.config.ts
 *     - packagePlugin.ts
 */
export default defineConfig([
  ...eslintConfigBase,
  globalIgnores(['docs/**', 'e2e/**']),
  // Core rendering files - complex rendering logic requires flexibility
  {
    files: ['src/client/**/*.ts', 'src/node/**/*.ts'],
    rules: {
      complexity: ['warn', { max: 50 }], // Rendering logic can be very complex
      'max-lines-per-function': ['warn', { max: 800, skipBlankLines: true, skipComments: true }], // Large rendering functions are acceptable for core logic
      'max-lines': ['warn', { max: 1200, skipBlankLines: true, skipComments: true }], // Core files can be large
      'max-depth': ['warn', 10] // Deep nesting needed for complex rendering conditions
    }
  },

  // Shared runtime files - allow complexity for runtime optimizations
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }], // Runtime functions can be long
      complexity: 'off', // Runtime code can be complex for performance
      'max-depth': 'off' // Runtime optimizations may need deep nesting
    }
  },

  // Utils files - allow complexity for utility functions
  {
    files: ['utils/*.ts'],
    rules: {
      complexity: ['warn', { max: 25 }], // Utils can be more complex
      'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }]
    }
  },

  // Tooling config files - disable typed linting
  {
    files: ['vitest.config.ts', 'rolldown.config.ts', 'packagePlugin.ts'],
    languageOptions: {
      // Tooling config files - parse TS, no type info
      parser: typescriptESlintParser,
      parserOptions: {
        projectService: true,
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/prefer-includes': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/prefer-readonly': 'off',
      '@typescript-eslint/prefer-reduce-type-parameter': 'off',
      '@typescript-eslint/prefer-string-starts-ends-with': 'off',
      '@typescript-eslint/promise-function-async': 'off',
      '@typescript-eslint/require-array-sort-compare': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/return-await': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
      '@typescript-eslint/unbound-method': 'off'
    }
  }
]);
