import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { type DefaultTheme, defineConfig, type UserConfig } from 'vitepress';

const config: UserConfig<DefaultTheme.Config> = defineConfig({
  title: 'E2E Test Site',
  description: 'VitePress Rendering Strategies E2E Test Site',
  cleanUrls: true,

  vite: {
    server: {
      watch: {
        usePolling: true,
        interval: 100,
      },
      hmr: {
        overlay: false,
      },
    },
  },
});

createDocsIslands({
  adapters: [react()],
}).apply(config);

export default config;
