import eslint from '@eslint/js';
import htmlESlintPlugin from '@html-eslint/eslint-plugin';
import htmlESlintParser from '@html-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginN from 'eslint-plugin-n';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import eslintPluginRegexp from 'eslint-plugin-regexp';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import typescriptESlint from 'typescript-eslint';

type Config = ReturnType<typeof defineConfig>;

export const eslintConfigBase: Config = [
  eslint.configs.recommended,
  ...typescriptESlint.configs.recommended,
  ...typescriptESlint.configs.stylistic,
  eslintPluginRegexp.configs['flat/recommended'],
  eslintPluginUnicorn.configs.recommended,

  globalIgnores([
    '**/node_modules/**',
    '**/cache/**',
    '**/dist/**',
    '**/public/**',
    '**/outputs/**',
    '**/.vite/**',
    '**/coverage/**',
  ]),

  // Global language configuration
  {
    name: 'Global',
    languageOptions: {
      parser: typescriptESlint.parser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
        isolatedDeclarations: true,
        projectService: true,
      },
      globals: {
        ...globals.es2021,
        ...globals.node,
      },
    },
    settings: {
      node: {
        version: '^20.19.0 || >=22.12.0',
      },
    },
    plugins: {
      // Note: unicorn plugin is already registered by eslintPluginUnicorn.configs.recommended
      '@typescript-eslint': typescriptESlint.plugin,
      n: eslintPluginN,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // Core ESLint rules - Balance between code quality and practicality
      'array-callback-return': ['error', { allowImplicit: true }],
      'block-scoped-var': 'error',
      complexity: ['warn', { max: 20 }],
      'consistent-return': 'error',
      curly: ['error', 'multi-line'],
      'default-case-last': 'error',
      'dot-notation': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'guard-for-in': 'error',
      'no-alert': 'error',
      'no-array-constructor': 'error',
      'no-caller': 'error',
      'no-case-declarations': 'error',
      'no-constant-condition': [
        'error',
        {
          checkLoops: false,
        },
      ],
      'no-constructor-return': 'error',
      'no-continue': 'off',
      'no-else-return': ['error', { allowElseIf: false }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-empty-function': 'error',
      'no-eval': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-implicit-coercion': 'error',
      'no-implied-eval': 'error',
      'no-iterator': 'error',
      'no-labels': 'error',
      'no-lone-blocks': 'error',
      'no-lonely-if': 'error',
      'no-loop-func': 'error',
      'no-multi-assign': 'error',
      'no-new': 'error',
      'no-new-func': 'error',
      'no-new-object': 'error',
      'no-new-wrappers': 'error',
      'no-octal-escape': 'error',
      'no-param-reassign': ['error', { props: false }],
      'no-proto': 'error',
      'no-prototype-builtins': 'off',
      'no-return-assign': ['error', 'except-parens'],
      'no-return-await': 'off',
      'no-script-url': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true },
      ],
      'no-useless-call': 'error',
      'no-useless-concat': 'error',
      'no-useless-return': 'error',
      'no-var': 'error',
      'no-void': 'error',
      'object-shorthand': ['error', 'always'],
      'one-var': ['error', 'never'],
      'prefer-arrow-callback': 'error',
      'prefer-const': [
        'error',
        {
          destructuring: 'all',
          ignoreReadBeforeAssign: true,
        },
      ],
      'prefer-exponentiation-operator': 'error',
      'prefer-object-spread': 'error',
      'prefer-promise-reject-errors': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'error',
      radix: 'error',
      'require-await': 'off',
      'sort-imports': [
        'error',
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
        },
      ],
      'spaced-comment': ['error', 'always', { markers: ['/'] }],
      yoda: 'error',

      // Unicorn rules - Override recommended config
      'unicorn/better-regex': 'error', // recommended: off
      'unicorn/consistent-destructuring': 'error', // recommended: off
      'unicorn/filename-case': 'off', // Allow flexible file naming
      'unicorn/no-array-reduce': 'off', // Allow reduce for complex transformations
      'unicorn/no-lonely-if': 'off', // Allow if in else for clarity
      'unicorn/no-null': 'off', // Allow null in this project
      'unicorn/no-unused-properties': 'off', // Too strict for some cases
      'unicorn/prefer-json-parse-buffer': 'off', // Not supported in older Node
      'unicorn/prefer-native-coercion-functions': 'off', // Explicit is better
      'unicorn/prefer-top-level-await': 'off', // Not always appropriate
      'unicorn/prevent-abbreviations': 'off', // Allow common abbreviations
      'unicorn/require-post-message-target-origin': 'off', // Not always needed
      'unicorn/string-content': 'off', // Too project-specific
      'unicorn/template-indent': 'warn', // Warn instead of error

      'n/no-exports-assign': 'error',
      'n/no-unpublished-bin': 'error',
      'n/no-unsupported-features/es-builtins': 'error',
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          // TODO: remove this when we don't support Node 20 anymore
          ignores: ['Response', 'Request', 'fetch'],
        },
      ],
      'n/process-exit-as-throw': 'error',
      'n/hashbang': 'error',
      'n/no-extraneous-import': 'error',
      'n/no-extraneous-require': 'error',
      'regexp/prefer-regexp-exec': 'error',
      'regexp/prefer-regexp-test': 'error',
      // in some cases using explicit letter-casing is more performant than the `i` flag
      'regexp/use-ignore-case': 'off',
    },
  },

  {
    name: 'JavaScript',
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
        projectService: false,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      'unicorn/prefer-module': 'off',
      'no-return-await': 'off',
      'require-await': 'off',
      complexity: 'off',
      'max-lines': [
        'warn',
        { max: 800, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': 'off',
    },
  },

  {
    name: 'HTML',
    files: ['**/*.html'],
    plugins: { html: htmlESlintPlugin },
    languageOptions: {
      parser: htmlESlintParser,
    },
    settings: {
      'html/javascript-mime-types': ['text/javascript', 'text/jsx'],
    },
    rules: {
      'html/indent': ['error', 2],
      'html/quotes': ['error', 'double'],
      'html/no-trailing-spaces': 'error',
      'html/no-multiple-empty-lines': ['error', { max: 1 }],
      'html/require-doctype': 'error',
      'html/require-lang': 'error',
      'html/no-duplicate-attrs': 'error',
      'html/no-obsolete-tags': 'warn',
      'html/require-attrs': 'off',
      'html/require-closing-tags': 'error',
      'html/require-li-container': 'error',
      'html/no-duplicate-id': 'error',
      'html/no-extra-spacing-attrs': 'error',
    },
  },

  {
    name: 'Declaration Files',
    files: ['**/*.d.ts', '**/*.d.mts', '**/*.d.cts'],
    rules: {
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },

  {
    plugins: { prettier: eslintPluginPrettier },
    rules: {
      'prettier/prettier': ['error', {}, { usePrettierrc: true }],
    },
  },
  eslintConfigPrettier,
];
