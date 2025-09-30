import reactClientIntegration from '@docs-islands/vitepress/react/client';
import '@nolebase/vitepress-plugin-enhanced-mark/client/style.css';
import 'virtual:group-icons.css';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import './styles/index.css';

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null);
  },
  async enhanceApp() {
    await reactClientIntegration();
  }
};

export default theme;
