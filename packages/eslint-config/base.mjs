import eslint from '@eslint/js';
import htmlESlintRules from '@html-eslint/eslint-plugin';
import htmlESlintParser from '@html-eslint/parser';
import typescriptESlintParser from '@typescript-eslint/parser';
import eslintPluginHtml from 'eslint-plugin-html';
import eslintPluginJsxA11y from 'eslint-plugin-jsx-a11y';
import eslintPluginMarkdown from 'eslint-plugin-markdown';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import eslintPluginVue from 'eslint-plugin-vue';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import typescriptESlint from 'typescript-eslint';

export const eslintConfigBase = defineConfig([
  eslint.configs.recommended,
  ...eslintPluginVue.configs['flat/recommended'],
  globalIgnores([
    '**/node_modules/**',
    '**/cache/**',
    '**/dist/**',
    '**/public/**',
    '**/outputs/**',
    '**/.vite/**',
    '**/coverage/**'
  ]),

  // Global language configuration
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      unicorn: eslintPluginUnicorn,
      '@typescript-eslint': typescriptESlint.plugin,
      react: eslintPluginReact,
      'react-hooks': eslintPluginReactHooks,
      'jsx-a11y': eslintPluginJsxA11y
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
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
      'max-depth': ['warn', 5],
      'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 150, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['warn', 4],
      'max-params': ['warn', 5],
      'no-alert': 'error',
      'no-array-constructor': 'error',
      'no-caller': 'error',
      'no-case-declarations': 'error',
      'no-constant-condition': [
        'error',
        {
          checkLoops: false
        }
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
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
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
          ignoreReadBeforeAssign: true
        }
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
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single']
        }
      ],
      'spaced-comment': ['error', 'always', { markers: ['/'] }],
      yoda: 'error',

      // Unicorn rules
      'unicorn/better-regex': 'error',
      'unicorn/catch-error-name': 'error',
      'unicorn/consistent-destructuring': 'error',
      'unicorn/consistent-function-scoping': 'error',
      'unicorn/custom-error-definition': 'off',
      'unicorn/empty-brace-spaces': 'error',
      'unicorn/error-message': 'error',
      'unicorn/escape-case': 'error',
      'unicorn/expiring-todo-comments': 'error',
      'unicorn/explicit-length-check': 'error',
      'unicorn/filename-case': 'off',
      'unicorn/import-style': 'error',
      'unicorn/new-for-builtins': 'error',
      'unicorn/no-abusive-eslint-disable': 'error',
      'unicorn/no-array-callback-reference': 'error',
      'unicorn/no-array-for-each': 'error',
      'unicorn/no-array-method-this-argument': 'error',
      'unicorn/no-array-push-push': 'error',
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-await-expression-member': 'error',
      'unicorn/no-console-spaces': 'error',
      'unicorn/no-document-cookie': 'error',
      'unicorn/no-empty-file': 'error',
      'unicorn/no-for-loop': 'error',
      'unicorn/no-hex-escape': 'error',
      'unicorn/no-instanceof-array': 'error',
      'unicorn/no-invalid-remove-event-listener': 'error',
      'unicorn/no-keyword-prefix': 'off',
      'unicorn/no-lonely-if': 'off',
      'unicorn/no-nested-ternary': 'error',
      'unicorn/no-new-array': 'error',
      'unicorn/no-new-buffer': 'error',
      'unicorn/no-null': 'off',
      'unicorn/no-object-as-default-parameter': 'error',
      'unicorn/no-process-exit': 'error',
      'unicorn/no-static-only-class': 'error',
      'unicorn/no-thenable': 'error',
      'unicorn/no-this-assignment': 'error',
      'unicorn/no-unnecessary-await': 'error',
      'unicorn/no-unreadable-array-destructuring': 'error',
      'unicorn/no-unreadable-iife': 'error',
      'unicorn/no-unused-properties': 'off',
      'unicorn/no-useless-fallback-in-spread': 'error',
      'unicorn/no-useless-length-check': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/no-useless-spread': 'error',
      'unicorn/no-useless-switch-case': 'error',
      'unicorn/no-zero-fractions': 'error',
      'unicorn/number-literal-case': 'error',
      'unicorn/numeric-separators-style': 'error',
      'unicorn/prefer-add-event-listener': 'error',
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-array-flat': 'error',
      'unicorn/prefer-array-flat-map': 'error',
      'unicorn/prefer-array-index-of': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-at': 'error',
      'unicorn/prefer-code-point': 'error',
      'unicorn/prefer-date-now': 'error',
      'unicorn/prefer-default-parameters': 'error',
      'unicorn/prefer-dom-node-append': 'error',
      'unicorn/prefer-dom-node-dataset': 'error',
      'unicorn/prefer-dom-node-remove': 'error',
      'unicorn/prefer-dom-node-text-content': 'error',
      'unicorn/prefer-export-from': 'error',
      'unicorn/prefer-includes': 'error',
      'unicorn/prefer-json-parse-buffer': 'off',
      'unicorn/prefer-keyboard-event-key': 'error',
      'unicorn/prefer-logical-operator-over-ternary': 'error',
      'unicorn/prefer-math-trunc': 'error',
      'unicorn/prefer-modern-dom-apis': 'error',
      'unicorn/prefer-modern-math-apis': 'error',
      'unicorn/prefer-module': 'error',
      'unicorn/prefer-native-coercion-functions': 'off',
      'unicorn/prefer-negative-index': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-number-properties': 'error',
      'unicorn/prefer-object-from-entries': 'error',
      'unicorn/prefer-optional-catch-binding': 'error',
      'unicorn/prefer-prototype-methods': 'error',
      'unicorn/prefer-query-selector': 'error',
      'unicorn/prefer-reflect-apply': 'error',
      'unicorn/prefer-regexp-test': 'error',
      'unicorn/prefer-set-has': 'error',
      'unicorn/prefer-set-size': 'error',
      'unicorn/prefer-spread': 'error',
      'unicorn/prefer-string-replace-all': 'error',
      'unicorn/prefer-string-slice': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
      'unicorn/prefer-string-trim-start-end': 'error',
      'unicorn/prefer-switch': 'error',
      'unicorn/prefer-ternary': 'error',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/prefer-type-error': 'error',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/relative-url-style': 'error',
      'unicorn/require-array-join-separator': 'error',
      'unicorn/require-number-to-fixed-digits-argument': 'error',
      'unicorn/require-post-message-target-origin': 'off',
      'unicorn/string-content': 'off',
      'unicorn/switch-case-braces': 'error',
      'unicorn/template-indent': 'warn',
      'unicorn/text-encoding-identifier-case': 'error',
      'unicorn/throw-new-error': 'error'
    }
  },

  // TypeScript files - Common configuration
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptESlintParser,
      parserOptions: {
        project: true,
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        JSX: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ]
    }
  },

  // JavaScript files - Common configuration
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {},
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
      'max-lines': ['warn', { max: 800, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': 'off'
    }
  },

  // Markdown files - Common configuration
  {
    files: ['**/*.md'],
    plugins: {
      markdown: eslintPluginMarkdown
    },
    processor: 'markdown/markdown',
    rules: {
      eqeqeq: 'off',
      semi: 'off',
      'no-return-await': 'off',
      'require-await': 'off',
      'no-unused-vars': 'off'
    }
  },

  // Markdown code blocks - Common configuration
  {
    files: ['**/*.md/*.{js,ts,jsx,tsx}'],
    languageOptions: {
      parser: typescriptESlintParser,
      parserOptions: {
        // Markdown code blocks are virtual files, don't require tsconfig.json.
        project: false,
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    rules: {
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/adjacent-overload-signatures': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/member-ordering': 'off',
      '@typescript-eslint/method-signature-style': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-confusing-non-null-assertion': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-extra-non-null-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-for-in-array': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/prefer-for-of': 'off',
      '@typescript-eslint/prefer-includes': 'off',
      '@typescript-eslint/prefer-literal-enum-member': 'off',
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
      '@typescript-eslint/unbound-method': 'off',
      'no-unused-vars': 'off',
      'unicorn/text-encoding-identifier-case': 'off',
      'no-unused-expressions': 'off',
      'dot-notation': 'off',
      'import/no-unresolved': 'off',
      'no-console': 'off',
      'no-constant-binary-expression': 'off',
      'no-constant-condition': 'off',
      'no-empty': 'off',
      'no-func-assign': 'off',
      'no-import-assign': 'off',
      'no-redeclare': 'off',
      'no-undef': 'off',
      'no-unused-private-class-members': 'off',
      'no-var': 'off',
      'prefer-rest-params': 'off',
      'no-return-await': 'off',
      'no-unused-vars': 'off',
      'require-await': 'off'
    }
  },

  // HTML files - Common configuration
  {
    files: ['**/*.html'],
    plugins: { html: eslintPluginHtml, '@html-eslint': htmlESlintRules },
    languageOptions: {
      parser: htmlESlintParser
    },
    settings: {
      'html/javascript-mime-types': ['text/javascript', 'text/jsx']
    },
    rules: {
      '@html-eslint/indent': ['error', 2],
      '@html-eslint/quotes': ['error', 'double'],
      '@html-eslint/no-trailing-spaces': 'error',
      '@html-eslint/no-multiple-empty-lines': ['error', { max: 1 }],
      '@html-eslint/require-doctype': 'error',
      '@html-eslint/require-lang': 'error',
      '@html-eslint/no-duplicate-attrs': 'error',
      '@html-eslint/no-obsolete-tags': 'warn',
      '@html-eslint/require-attrs': 'off',
      '@html-eslint/require-closing-tags': 'error',
      '@html-eslint/require-li-container': 'error',
      '@html-eslint/no-duplicate-id': 'error',
      '@html-eslint/no-extra-spacing-attrs': 'error'
    }
  },

  // Declaration files - Common configuration
  {
    files: ['**/*.d.ts', '**/*.d.mts', '**/*.d.cts'],
    languageOptions: {
      parserOptions: {
        project: false
      }
    },
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-unused-vars': 'off',
      'no-return-await': 'off',
      'require-await': 'off'
    }
  },

  // Test files configuration - Relaxed rules for testing
  {
    files: [
      '**/*.test.{js,ts,jsx,tsx}',
      '**/*.spec.{js,ts,jsx,tsx}',
      '**/tests/**/*',
      '**/__tests__/**/*',
      '**/e2e/**/*.{ts,tsx}'
    ],
    languageOptions: {
      // Tests - Parse TypeScript and provide common globals
      parser: typescriptESlintParser,
      parserOptions: {
        project: true,
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        test: 'readonly',
        expect: 'readonly',
        describe: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        page: 'readonly',
        browser: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      // Tests often use unconventional names and empty placeholders
      '@typescript-eslint/naming-convention': 'off',
      'no-empty-function': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'unicorn/no-await-expression-member': 'off',
      'unicorn/prefer-module': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
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
      '@typescript-eslint/unbound-method': 'off',
      'max-lines-per-function': 'off', // Tests can be very long
      'max-lines': ['warn', { max: 800, skipBlankLines: true, skipComments: true }], // Allow longer test files
      'max-nested-callbacks': 'off',
      complexity: 'off', // Test complexity differs from production code
      'max-depth': 'off', // Test nesting can be deep
      'no-console': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/no-useless-undefined': 'off',
      'no-return-await': 'off',
      'require-await': 'off'
    }
  },

  // Vue-specific configuration
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
      // Vue-specific quality rules (non-formatting)
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

      // Disable formatting rules - let Prettier handle these
      'vue/html-indent': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/html-closing-bracket-spacing': 'off',
      'vue/html-self-closing': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/singleline-html-element-content-newline': 'off',

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

  // React-specific configuration
  {
    files: ['**/*.{jsx,tsx}'],
    settings: {
      react: {
        version: 'detect' // Automatically detect React version
      }
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      // Security rules
      'react/jsx-no-target-blank': 'error', // Prevent tabnabbing attacks
      'react/no-danger': 'warn', // Warn when using dangerouslySetInnerHTML
      'react/no-danger-with-children': 'error', // Disallow using dangerouslySetInnerHTML with children

      'react/jsx-key': ['error', { checkFragmentShorthand: true }], // Require keys in list rendering
      'react/no-array-index-key': 'warn', // Avoid using array index as key
      'react/no-children-prop': 'error', // Disallow passing children via props
      'react/no-deprecated': 'error', // Disallow deprecated APIs
      'react/no-direct-mutation-state': 'error', // Disallow direct state mutation
      'react/no-find-dom-node': 'error', // Disallow findDOMNode
      'react/no-is-mounted': 'error', // Disallow isMounted
      'react/no-render-return-value': 'error', // Disallow using ReactDOM.render return value
      'react/no-string-refs': 'error', // Disallow string refs
      'react/no-unescaped-entities': 'error', // Disallow unescaped HTML entities
      'react/no-unknown-property': 'error', // Disallow unknown DOM properties
      'react/no-unsafe': 'warn', // Warn when using UNSAFE_ lifecycles
      'react/prop-types': 'off', // Disable PropTypes (TypeScript project)
      'react/react-in-jsx-scope': 'off', // React 17+ doesn't require importing React
      'react/require-render-return': 'error', // Require return value in render method
      'react/self-closing-comp': 'error', // Use self-closing tags for components without children
      'react/style-prop-object': 'error', // Require style prop to be an object
      'react/void-dom-elements-no-children': 'error', // Void elements cannot have children
      'react/jsx-no-duplicate-props': 'error', // Disallow duplicate props
      'react/jsx-no-undef': 'error', // Disallow undefined components
      'react/jsx-uses-react': 'off', // Not needed in React 17+
      'react/jsx-uses-vars': 'error', // Prevent components from being marked as unused

      // Hook rules
      'react/hook-use-state': 'error', // useState destructuring naming convention
      'react-hooks/rules-of-hooks': 'error', // Enforce Hook rules
      'react-hooks/exhaustive-deps': 'warn', // Check effect dependencies

      // Accessibility rules
      'jsx-a11y/alt-text': 'error', // Require alt text for img
      'jsx-a11y/anchor-has-content': 'error', // Require anchor content
      'jsx-a11y/anchor-is-valid': 'error', // Require valid anchor
      'jsx-a11y/aria-props': 'error', // Require valid ARIA props
      'jsx-a11y/aria-proptypes': 'error', // Require correct ARIA prop types
      'jsx-a11y/aria-unsupported-elements': 'error', // Disallow ARIA on unsupported elements
      'jsx-a11y/heading-has-content': 'error', // Require heading content
      'jsx-a11y/html-has-lang': 'error', // Require lang attribute on html
      'jsx-a11y/iframe-has-title': 'error', // Require title on iframe
      'jsx-a11y/no-distracting-elements': 'error', // Disallow distracting elements
      'jsx-a11y/role-has-required-aria-props': 'error', // Require required ARIA props for roles
      'jsx-a11y/role-supports-aria-props': 'error', // Require role to support ARIA props
      'jsx-a11y/scope': 'error', // Require scope attribute only on th elements
      'jsx-a11y/click-events-have-key-events': 'warn', // Require keyboard events for click events
      'jsx-a11y/img-redundant-alt': 'warn', // Avoid "image", "picture" in img alt
      'jsx-a11y/no-access-key': 'warn', // Avoid using accessKey
      'jsx-a11y/no-autofocus': 'warn', // Avoid using autoFocus
      'jsx-a11y/no-redundant-roles': 'warn', // Avoid redundant role attributes

      // Disable all formatting rules (Prettier handles these)
      'react/jsx-child-element-spacing': 'off',
      'react/jsx-closing-bracket-location': 'off',
      'react/jsx-closing-tag-location': 'off',
      'react/jsx-curly-brace-presence': 'off',
      'react/jsx-curly-newline': 'off',
      'react/jsx-curly-spacing': 'off',
      'react/jsx-equals-spacing': 'off',
      'react/jsx-first-prop-new-line': 'off',
      'react/jsx-indent': 'off',
      'react/jsx-indent-props': 'off',
      'react/jsx-max-props-per-line': 'off',
      'react/jsx-newline': 'off',
      'react/jsx-one-expression-per-line': 'off',
      'react/jsx-props-no-multi-spaces': 'off',
      'react/jsx-tag-spacing': 'off',
      'react/jsx-wrap-multilines': 'off'
    }
  },

  eslintPluginPrettierRecommended
]);
