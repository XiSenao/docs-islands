import markdown from '@eslint/markdown';
import tsParser from '@typescript-eslint/parser';
import eslintPluginJsxA11y from 'eslint-plugin-jsx-a11y';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintPluginVue from 'eslint-plugin-vue';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import vueParser from 'vue-eslint-parser';
import { eslintConfigBase } from '../../base.mjs';

export default defineConfig([
  ...eslintConfigBase,

  // Vue recommended config (includes plugin registration)
  ...eslintPluginVue.configs['flat/recommended'],

  {
    rules: {
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          // ideally we would like to allow all experimental features
          // https://github.com/eslint-community/eslint-plugin-n/issues/199
          ignores: ['fetch', 'import.meta.dirname'],
        },
      ],
    },
  },

  // Vue configuration overrides
  {
    name: 'Vue',
    files: ['**/*.vue'],
    settings: {
      vue: {
        version: 'detect',
      },
    },
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
        ecmaVersion: 2022,
      },
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
      'require-await': 'off',
    },
  },

  // React Hooks and JSX A11y plugins (not included in React recommended)
  {
    name: 'React Hooks & A11y Plugins',
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'jsx-a11y': eslintPluginJsxA11y,
    },
  },

  // React configuration with recommended rules
  {
    name: 'React',
    files: ['**/*.{jsx,mjsx,tsx,mtsx}'],
    ...eslintPluginReact.configs.flat.recommended,
    ...eslintPluginReact.configs.flat['jsx-runtime'],
    settings: {
      react: {
        version: 'detect',
      },
    },
    languageOptions: {
      ...eslintPluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
    rules: {
      // TypeScript provides type checking
      'react/prop-types': 'off',
      // Not needed in React 17+
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // Warn about dangerouslySetInnerHTML
      'react/no-danger': 'warn',
      // Prevent javascript: URLs
      'react/jsx-no-script-url': 'error',
      // Enhanced target="_blank" security
      'react/jsx-no-target-blank': [
        'error',
        {
          allowReferrer: false,
          enforceDynamicLinks: 'always',
        },
      ],
      'react/jsx-key': [
        'error',
        {
          checkFragmentShorthand: true,
          checkKeyMustBeforeSpread: true,
          warnOnDuplicates: true,
        },
      ],
      // Avoid array index as key
      'react/no-array-index-key': 'warn',
      // Enforce self-closing tags
      'react/self-closing-comp': 'error',
      // Style must be object
      'react/style-prop-object': 'error',
      // Void elements can't have children
      'react/void-dom-elements-no-children': 'error',
      // Omit true value for boolean props
      'react/jsx-boolean-value': ['error', 'never'],
      // Use <> instead of <Fragment>
      'react/jsx-fragments': ['error', 'syntax'],
      // Avoid unnecessary fragments
      'react/jsx-no-useless-fragment': [
        'error',
        {
          allowExpressions: true,
        },
      ],
      'react/jsx-pascal-case': [
        'error',
        {
          allowAllCaps: true,
          allowNamespace: true,
        },
      ],
      'react/no-unstable-nested-components': [
        'error',
        {
          allowAsProps: true,
        },
      ],
      // Consistent function component style
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'function-declaration',
          unnamedComponents: 'arrow-function',
        },
      ],

      // useState naming convention [value, setValue]
      'react/hook-use-state': 'error',
      // Enforce Hooks rules
      'react-hooks/rules-of-hooks': 'error', // Enforce Hooks rules
      // Verify effect dependencies
      'react-hooks/exhaustive-deps': 'warn', // Verify effect dependencies

      // Accessibility (a11y) - Essential for inclusive web
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'warn',
      'jsx-a11y/no-access-key': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/no-distracting-elements': 'error',
      'jsx-a11y/no-redundant-roles': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/scope': 'error',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/mouse-events-have-key-events': 'warn',
      // Avoid recreating context values
      'react/jsx-no-constructed-context-values': 'warn',
      // Detect unused state
      'react/no-unused-state': 'warn',
      'react/jsx-no-leaked-render': [
        'warn',
        {
          validStrategies: ['ternary', 'coerce'],
        },
      ],
      // iframe should have sandbox
      'react/iframe-missing-sandbox': 'warn',
      'react/jsx-child-element-spacing': 'off',
      'react/jsx-closing-bracket-location': 'off',
      'react/jsx-closing-tag-location': 'off',
      // Let Prettier handle this
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
      'react/jsx-wrap-multilines': 'off',
    },
  },

  // Markdown
  {
    files: ['**/*.md'],
    plugins: {
      markdown,
    },
    extends: ['markdown/processor'],
  },

  {
    name: 'Markdown Code Blocks - TypeScript/JavaScript',
    files: ['**/*.md/*.{js,ts,jsx,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // Markdown code blocks are virtual files, don't require tsconfig.json.
        projectService: false,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
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
      'require-await': 'off',
    },
  },

  {
    name: 'Markdown Code Blocks - Vue',
    files: ['**/*.md/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        projectService: false,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },
]);
