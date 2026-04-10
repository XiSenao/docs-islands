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
        text: 'Home',
        link: '/',
      },
      {
        text: 'Guide',
        activeMatch: '/guide/',
        link: '/guide/',
      },
      {
        text: 'Site Debug',
        activeMatch: '/site-debug-console/',
        link: '/site-debug-console/',
      },
      {
        text: pkg.version,
        items: [
          {
            text: 'Changelog',
            link: 'https://github.com/XiSenao/docs-islands/blob/main/packages/vitepress/CHANGELOG.md',
          },
          {
            text: 'Contributing',
            link: 'https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.md',
          },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          base: '/guide/',
          items: [
            {
              text: 'Introduction',
              link: 'index.md',
            },
            {
              text: 'Getting Started',
              link: 'getting-started',
            },
            {
              text: 'How It Works',
              link: 'how-it-works',
            },
            {
              text: 'Best Practices',
              link: 'best-practices',
            },
          ],
        },
      ],
      '/site-debug-console/': [
        {
          text: 'Site Debug',
          base: '/site-debug-console/',
          items: [
            {
              text: 'Introduction',
              link: 'index.md',
            },
            {
              text: 'Getting Started',
              link: 'getting-started',
            },
          ],
        },
        {
          text: 'Options',
          base: '/site-debug-console/options/',
          items: [
            {
              text: 'Analysis',
              link: 'analysis',
            },
            {
              text: 'Models',
              link: 'models',
            },
            {
              text: 'Build Reports',
              link: 'build-reports',
            },
          ],
        },
      ],
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: `Copyright © 2025-present Senao Xi`,
    },
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/XiSenao/docs-islands/tree/main/packages/vitepress',
      },
    ],
  },
};

export default vitepressConfig;
