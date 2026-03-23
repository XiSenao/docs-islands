import '@nolebase/vitepress-plugin-enhanced-mark/client/style.css';
import { inject } from '@vercel/analytics';
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
  enhanceApp() {
    // Initialize Vercel Analytics
    inject();
  },
};

export default theme;
