import typescriptESlintParser from '@typescript-eslint/parser';
import eslintPluginPnpm from 'eslint-plugin-pnpm';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import { eslintConfigBase } from './base';

type Config = ReturnType<typeof defineConfig>;

/**
 * Root Directory ESLint Configuration
 *
 * IMPORTANT: CommonJS Module Policy
 * ==================================
 * This project does NOT promote the use of CommonJS modules.
 * CommonJS configuration is restricted to the monorepo root directory only.
 *
 * Rationale:
 * - The project follows modern ESM (ES Modules) standards throughout
 * - CommonJS is only retained for legacy tooling compatibility at the root level
 * - Root-level build scripts and configuration files may still require CommonJS
 * - All workspace packages and application code should use ESM exclusively
 *
 * If you need to write new configuration or scripts, prefer ESM (.mjs) over CommonJS (.cjs).
 */
const config: Config = [
  ...eslintConfigBase,

  globalIgnores(['packages/**', 'docs', 'utils']),

  // Root directory TypeScript script files
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

  // CommonJS files configuration (Root directory only)
  {
    files: ['*.cjs'],
    languageOptions: {
      // CommonJS uses default Espree parser (not TypeScript parser)
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'commonjs',
        projectService: false,
      },
      globals: {
        ...globals.node,
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        global: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      // CommonJS-appropriate styles
      'no-console': 'off', // CommonJS files typically used for build scripts/config
      'unicorn/prefer-module': 'off', // .cjs files using CommonJS is expected

      // Code quality rules
      'consistent-return': 'error', // Ensure consistent return values
      'no-param-reassign': ['error', { props: false }], // Allow modifying parameter properties
      'no-prototype-builtins': 'error', // Avoid direct use of Object.prototype methods
      'prefer-object-spread': 'error', // Use object spread
      'object-shorthand': 'error', // Use object shorthand

      // Security rules
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // Complexity controls (moderately relaxed)
      complexity: ['warn', { max: 20 }],
      'max-lines-per-function': [
        'warn',
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      'max-lines': [
        'warn',
        { max: 800, skipBlankLines: true, skipComments: true },
      ],
      'max-depth': ['warn', 5],

      // Naming conventions
      camelcase: [
        'warn',
        {
          properties: 'never',
          ignoreDestructuring: true,
          allow: ['^npm_', '^PNPM_', '^NODE_'],
        },
      ],

      // Comment conventions
      'spaced-comment': ['error', 'always', { markers: ['/'] }],

      // Relaxed TypeScript rules
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },

  // .pnpmfile.cjs specific rules (Supplement general .cjs rules)
  {
    files: ['.pnpmfile.cjs'],
    rules: {
      // pnpm hooks specific: Allow modifying pkg parameter properties
      'no-param-reassign': [
        'error',
        {
          props: true,
          ignorePropertyModificationsFor: ['pkg'], // Required for pnpm readPackage hook
        },
      ],
    },
  },

  // pnpm-workspace.yaml specific rules
  {
    name: 'Pnpm Workspace',
    files: ['pnpm-workspace.yaml'],
    languageOptions: { parser: await import('yaml-eslint-parser') },
    plugins: { pnpm: eslintPluginPnpm },
    rules: {
      'pnpm/yaml-no-duplicate-catalog-item': 'error',
      'pnpm/yaml-no-unused-catalog-item': 'error',
    },
  },
];

export default config;
