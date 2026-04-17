import { reactClient } from '@docs-islands/vitepress/adapters/react/client';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null);
  },
  async enhanceApp() {
    await reactClient();
  },
};

export default theme;
