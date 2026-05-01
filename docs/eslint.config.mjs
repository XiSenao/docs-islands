import { docs } from '@docs-islands/eslint-config/presets';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...docs,

  {
    files: ['.vitepress/dynamicProxyPlugin.ts'],
    rules: {
      'unicorn/no-process-exit': 'off',
    },
  },
]);
