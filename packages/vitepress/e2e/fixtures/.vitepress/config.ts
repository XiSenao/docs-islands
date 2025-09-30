import vitepressReactRenderingStrategies from '@docs-islands/vitepress/react';
import { type DefaultTheme, defineConfig, type UserConfig } from 'vitepress';

const config: UserConfig<DefaultTheme.Config> = defineConfig({
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
