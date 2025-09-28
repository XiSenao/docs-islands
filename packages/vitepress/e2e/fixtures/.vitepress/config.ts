import vitepressReactRenderingStrategies from '@docs-islands/vitepress/react';
import { defineConfig } from 'vitepress';

const config = defineConfig({
  title: 'E2E Test Site',
  description: 'VitePress Rendering Strategies E2E Test Site',
  cleanUrls: true,

  vite: {
    server: {
      watch: {
        usePolling: true,
        interval: 100
      },
      hmr: {
        overlay: false
      }
    }
  }
});

vitepressReactRenderingStrategies(config);

export default config;
