import { createRequire } from 'node:module';
import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const __require = createRequire(import.meta.url);
const pkg = __require('@docs-islands/vitepress/package.json');

const vitepressConfig: LocaleSpecificConfig<DefaultTheme.Config> & {
  label: string;
  link?: string;
} = {
  label: 'English',
  lang: 'en',
  description:
    'Cross-framework Islands Architecture for VitePress with multi-UI framework component rendering',

  themeConfig: {
    nav: [
      {
        text: 'Core Concepts',
        link: '/core-concepts'
      },
      {
        text: 'Quick Start',
        link: '/quick-start'
      },
      {
        text: pkg.version,
        items: [
          {
            text: 'Changelog',
            link: 'https://github.com/XiSenao/docs-islands/blob/main/packages/vitepress/CHANGELOG.md'
          },
          {
            text: 'Contributing',
            link: 'https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.md'
          }
        ]
      }
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: `Copyright © 2025-present Senao Xi`
    },
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/XiSenao/docs-islands/tree/main/packages/vitepress'
      }
    ]
  }
};

export default vitepressConfig;
