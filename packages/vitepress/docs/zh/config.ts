import { createRequire } from 'node:module';
import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const __require = createRequire(import.meta.url);
const pkg = __require('@docs-islands/vitepress/package.json');

const vitepressConfig: LocaleSpecificConfig<DefaultTheme.Config> & {
  label: string;
  link?: string;
} = {
  label: '简体中文',
  lang: 'zh',
  description: '赋予 vitepress 多 UI 框架支持',

  themeConfig: {
    nav: [
      {
        text: '核心概念',
        link: '/zh/core-concepts'
      },
      {
        text: '快速开始',
        link: '/zh/quick-start'
      },
      {
        text: pkg.version,
        items: [
          {
            text: '更新日志',
            link: 'https://github.com/XiSenao/docs-islands/blob/main/packages/vitepress/CHANGELOG.md'
          },
          {
            text: '参与贡献',
            link: 'https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.zh-CN.md'
          }
        ]
      }
    ],
    footer: {
      message: '根据 MIT 许可证发布。',
      copyright: `版权所有 © 2025-present Senao Xi`
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },

    outline: {
      label: '页面导航',
      level: 'deep'
    },

    lastUpdated: {
      text: '最后更新于'
    },

    notFound: {
      title: '页面未找到',
      quote: '但如果你不改变方向，并且继续寻找，你可能最终会到达你所前往的地方。',
      linkLabel: '前往首页',
      linkText: '带我回首页'
    },

    langMenuLabel: '多语言',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    skipToContentLabel: '跳转到内容'
  }
};

export default vitepressConfig;
