import defaultConfig from '@docs-islands/eslint-config/vitepress';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...defaultConfig,
  {
    files: ['.vitepress/dynamicProxyPlugin.ts'],
    rules: {
      'unicorn/no-process-exit': 'off'
    }
  }
]);
