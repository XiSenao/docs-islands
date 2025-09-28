import { join } from 'pathe';
import { defineConfig } from 'vitepress';
import { groupIconMdPlugin, groupIconVitePlugin } from 'vitepress-plugin-group-icons';
import llmstxt from 'vitepress-plugin-llms';
import enConfig from '../en/config';
import zhConfig from '../zh/config';
import { dynamicProxyPlugin } from './dynamicProxyPlugin';

const release = Boolean(process.env.RELEASE);

const base = '/docs-islands/';

const vitepressConfig = defineConfig({
  base,
  title: 'Docs Islands',

  rewrites: {
    'en/:rest*': ':rest*'
  },
  head: [
    [
      'link',
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: `${base}favicon.svg`
      }
    ],
    [
      'link',
      {
        rel: 'mask-icon',
        href: `${base}safari-pinned-tab.svg`,
        color: '#646CFF'
      }
    ],
    ['meta', { name: 'theme-color', content: '#0f172a' }]
  ],
  lastUpdated: true,
  cleanUrls: true,
  metaChunk: true,
  locales: {
    root: enConfig,
    zh: zhConfig
  },
  markdown: {
    config: md => {
      md.use(groupIconMdPlugin);
    }
  },
  vite: {
    plugins: [
      dynamicProxyPlugin(),
      {
        name: 'vite-plugin-environment-api-dependency-module-hot-update',
        apply: 'serve',
        async handleHotUpdate(ctx) {
          const { file, server, modules } = ctx;

          if (file.includes('local-data.json')) {
            const updateModuleEntryPath = join(file, '../', 'ReactComp2.tsx');
            const updateModuleEntry =
              await server.moduleGraph.getModuleByUrl(updateModuleEntryPath);
            if (updateModuleEntry) {
              server.moduleGraph.invalidateModule(updateModuleEntry, new Set(), Date.now(), true);
              return [updateModuleEntry];
            }
          }

          return modules;
        }
      },
      groupIconVitePlugin(),
      release &&
        llmstxt({
          workDir: 'en',
          ignoreFiles: ['index.md']
        })
    ]
  },
  themeConfig: {
    outline: 'deep',
    logo: { src: '/favicon.svg', width: 24, height: 24 },
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/XiSenao/docs-islands/tree/main/packages/vitepress'
      }
    ]
  }
});

export default vitepressConfig;
