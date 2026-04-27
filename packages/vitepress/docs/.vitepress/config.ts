import { loadEnv } from '@docs-islands/utils/env';
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import loggerPresets from '@docs-islands/vitepress/logger/presets';
import vitepressRenderingStrategiesPackageJson from '@docs-islands/vitepress/package.json' with { type: 'json' };
import isInCi from 'is-in-ci';
import { join } from 'pathe';
import { type DefaultTheme, defineConfig, type UserConfig } from 'vitepress';
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
} from 'vitepress-plugin-group-icons';
import llmstxt from 'vitepress-plugin-llms';
import enConfig from '../en/config';
import zhConfig from '../zh/config';

const { release, siteDevtools } = loadEnv();
const { doubao_api_key } = siteDevtools;

const base = `/${vitepressRenderingStrategiesPackageJson.name.replace('@', '')}/`;
const docsLoggerProbePreset = {
  rules: {
    controlledVisible: {
      group: 'docs.logger.injected.visible',
      main: '@docs-islands/vitepress-docs/logger-scope-playground',
    },
  },
} as const;

const vitepressConfig: UserConfig<DefaultTheme.Config> = defineConfig({
  base,
  title: '@docs-islands/vitepress',

  rewrites: {
    'en/:rest*': ':rest*',
  },
  head: [
    [
      'link',
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: `${base}favicon.svg`,
      },
    ],
    [
      'link',
      {
        rel: 'mask-icon',
        href: `${base}safari-pinned-tab.svg`,
        color: '#646CFF',
      },
    ],
    ['meta', { name: 'theme-color', content: '#0f172a' }],
  ],
  lastUpdated: true,
  cleanUrls: true,
  metaChunk: true,
  locales: {
    root: enConfig,
    zh: zhConfig,
  },
  markdown: {
    config: (md) => {
      md.use(groupIconMdPlugin);
    },
  },
  vite: {
    plugins: [
      {
        name: 'vite-plugin-environment-api-dependency-module-hot-update',
        apply: 'serve',
        async handleHotUpdate(ctx) {
          const { file, server, modules } = ctx;

          if (file.includes('local-data.json')) {
            const updateModuleEntryPath = join(file, '../', 'ReactComp2.tsx');
            const updateModuleEntry = await server.moduleGraph.getModuleByUrl(
              updateModuleEntryPath,
            );
            if (updateModuleEntry) {
              server.moduleGraph.invalidateModule(
                updateModuleEntry,
                new Set(),
                Date.now(),
                true,
              );
              return [updateModuleEntry];
            }
          }

          return modules;
        },
      },
      groupIconVitePlugin(),
      release &&
        llmstxt({
          workDir: 'en',
        }),
    ],
  },
  themeConfig: {
    outline: 'deep',
    logo: { src: '/favicon.svg', width: 24, height: 24 },
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/XiSenao/docs-islands/tree/main/packages/vitepress',
      },
    ],
  },
});

createDocsIslands({
  adapters: [react()],
  logging: {
    debug: true,
    levels: release ? ['warn', 'error'] : ['info', 'success', 'warn', 'error'],
    plugins: {
      ...loggerPresets,
      docsLoggerProbe: docsLoggerProbePreset,
    },
    rules: {
      'docsLoggerProbe/controlledVisible': {
        levels: ['info'],
      },
      'siteDevtools/aiBuildReports': {
        levels: ['info', 'success', 'warn', 'error'],
      },
      'siteDevtools/aiServer': {
        levels: ['info', 'success', 'warn', 'error'],
      },
      'hmr/markdownUpdate': {
        levels: ['info', 'success', 'warn', 'error'],
        message: '*changed, container script content will be re-parsed...*',
      },
      'runtime/coreReactComponentManager': {},
      'runtime/coreReactRenderStrategy': {},
      'runtime/reactClientLoader': {},
      'runtime/reactComponentManager': {},
      'runtime/reactDevContentUpdated': {},
      'runtime/reactDevMountFallback': {},
      'runtime/reactDevMountRender': {},
      'runtime/reactDevRender': {},
      'runtime/reactDevRuntimeLoader': {},
    },
  },
  siteDevtools: {
    analysis: {
      providers: {
        doubao: [
          {
            apiKey: doubao_api_key,
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
            default: true,
            id: 'cn',
            label: 'Doubao CN',
            timeoutMs: 300_000,
          },
        ],
      },
      buildReports: {
        cache: {
          dir: '.vitepress/site-devtools-reports',
          // Environmental factors can cause prompts to be unstable, thereby destroying cacheKey.
          strategy: isInCi ? 'fallback' : 'exact',
        },
        includeChunks: true,
        includeModules: true,
        models: [
          {
            default: true,
            id: 'doubao-pro',
            label: 'Doubao Pro',
            model: 'doubao-seed-2-0-pro-260215',
            providerRef: {
              provider: 'doubao',
            },
            temperature: 0.2,
            thinking: true,
            maxTokens: 4096,
          },
        ],
        resolvePage: ({ page }) => {
          const { routePath } = page;

          if (!routePath) {
            return null;
          }

          const cacheDir = routePath.replaceAll('/', '__');

          return {
            modelId: 'doubao-pro',
            cache: {
              dir: `.vitepress/site-devtools-reports/${cacheDir}`,
              strategy: isInCi ? 'fallback' : 'exact',
            },
          };
        },
      },
    },
  },
}).apply(vitepressConfig);

export default vitepressConfig;
