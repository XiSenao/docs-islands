import tsParser from '@typescript-eslint/parser';
import pluginVue from 'eslint-plugin-vue';
import { defineConfig } from 'eslint/config';
import { eslintConfigBase } from '../base.mjs';

export default defineConfig([
  ...eslintConfigBase,
  ...pluginVue.configs['flat/recommended'],

  // Docs examples - relax non-critical rules
  {
    files: ['docs/**/*.ts', 'docs/**/*.tsx'],
    rules: {
      'unicorn/text-encoding-identifier-case': 'off'
    }
  },

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

  // Vue files
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: '@typescript-eslint/parser',
        extraFileExtensions: ['.vue'],
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      // Vue-specific rules
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/component-api-style': ['error', ['script-setup']],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/custom-event-name-casing': ['error', 'camelCase'],
      'vue/define-emits-declaration': ['error', 'type-based'],
      'vue/define-props-declaration': ['error', 'type-based'],
      'vue/html-button-has-type': 'error',
      'vue/html-comment-content-spacing': 'error',
      'vue/no-boolean-default': 'error',
      'vue/no-duplicate-attr-inheritance': 'error',
      'vue/no-empty-component-block': 'error',
      'vue/no-multiple-objects-in-class': 'error',
      'vue/no-potential-component-option-typo': 'error',
      'vue/no-required-prop-with-default': 'error',
      'vue/no-static-inline-styles': 'error',
      'vue/no-template-target-blank': 'error',
      'vue/no-this-in-before-route-enter': 'error',
      'vue/no-undef-components': 'error',
      'vue/no-undef-properties': 'error',
      'vue/no-unused-properties': 'error',
      'vue/no-unused-refs': 'error',
      'vue/no-use-v-else-with-v-for': 'error',
      'vue/no-useless-mustaches': 'error',
      'vue/no-useless-v-bind': 'error',
      'vue/no-v-text-v-html-on-component': 'error',
      'vue/padding-line-between-blocks': 'error',
      'vue/prefer-define-options': 'error',
      'vue/prefer-separate-static-class': 'error',
      'vue/prefer-true-attribute-shorthand': 'error',
      'vue/require-macro-variable-name': 'error',
      'vue/static-class-names-order': 'error',
      'vue/v-for-delimiter-style': ['error', 'in'],
      'vue/valid-define-options': 'error',

      // Relaxed rules for Vue
      'vue/no-v-html': 'off',
      'vue/require-v-for-key': 'off',

      // TypeScript rules adjustments for Vue
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'no-return-await': 'off',
      'require-await': 'off'
    }
  },

  // Tooling config files - disable typed linting
  {
    files: ['vitest.config.ts', 'rolldown.config.ts', 'packagePlugin.ts'],
    languageOptions: {
      // Tooling config files - parse TS, no type info
      parser: tsParser,
      parserOptions: {
        project: false,
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
