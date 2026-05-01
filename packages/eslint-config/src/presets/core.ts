import typescriptESlintParser from '@typescript-eslint/parser';
import type { defineConfig } from 'eslint/config';
import { globalIgnores } from 'eslint/config';
import { untypedTypeScriptRules } from '../config';
import { supportedEcmaVersion } from '../config/constants';
import eslintGeneralConfig from '../general';

type Config = ReturnType<typeof defineConfig>;

/**
 * Core structure of generic output packages and lint rules:
 * - packages
 *   - packageName (monorepo)
 *     - docs (monorepo)
 *     - playground (monorepo)
 *     - src
 *       - client
 *       - node
 *       - shared
 *       - types
 *     - utils
 *     - types
 *     - vitest.config.ts
 *     - rolldown.config.ts
 *     - packagePlugin.ts
 */
const config: Config = [
  ...eslintGeneralConfig,

  globalIgnores(['docs/**', 'playground/**']),
  // Core rendering files - complex rendering logic requires flexibility
  {
    files: ['src/client/**/*.ts', 'src/node/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'require', '__dirname', '__filename'],
      complexity: ['warn', { max: 50 }], // Rendering logic can be very complex
      'max-lines-per-function': [
        'warn',
        { max: 1000, skipBlankLines: true, skipComments: true },
      ], // Large rendering functions are acceptable for core logic
      'max-lines': [
        'warn',
        { max: 1500, skipBlankLines: true, skipComments: true },
      ], // Core files can be large
      'max-depth': ['warn', 10], // Deep nesting needed for complex rendering conditions
    },
  },

  // Shared runtime files - allow complexity for runtime optimizations
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'max-lines-per-function': [
        'warn',
        { max: 200, skipBlankLines: true, skipComments: true },
      ], // Runtime functions can be long
      complexity: 'off', // Runtime code can be complex for performance
      'max-depth': 'off', // Runtime optimizations may need deep nesting
    },
  },

  // Utils files - allow complexity for utility functions
  {
    files: ['utils/*.ts'],
    rules: {
      complexity: ['warn', { max: 25 }], // Utils can be more complex
      'max-lines-per-function': [
        'warn',
        { max: 200, skipBlankLines: true, skipComments: true },
      ],
    },
  },

  // Tooling config files - disable typed linting
  {
    files: ['vitest.config.ts', 'rolldown.*config.ts', 'packagePlugin.ts'],
    languageOptions: {
      // Tooling config files - parse TS syntax without TS project services.
      parser: typescriptESlintParser,
      parserOptions: {
        projectService: false,
        ecmaVersion: supportedEcmaVersion,
        sourceType: 'module',
      },
    },
    rules: {
      ...untypedTypeScriptRules,
    },
  },
];
export default config;
