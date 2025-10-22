import reactClientIntegration from '@docs-islands/vitepress/react/client';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null);
  },
  async enhanceApp() {
    await reactClientIntegration();
  },
};

export default theme;
