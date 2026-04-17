import { reactClient } from '@docs-islands/vitepress/adapters/react/client';
import '@nolebase/vitepress-plugin-enhanced-mark/client/style.css';
import { inject } from '@vercel/analytics';
import 'virtual:group-icons.css';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import 'vue-json-pretty/lib/styles.css';
import EnhanceLayout from './components/EnhanceLayout.vue';
import './styles/index.css';

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () => {
    return h(EnhanceLayout, null);
  },
  async enhanceApp() {
    inject();
    await reactClient();
  },
};

export default theme;
