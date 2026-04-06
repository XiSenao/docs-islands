---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'Docs Islands for VitePress'
  tagline: 为 VitePress 提供跨框架群岛架构
  image:
    src: /favicon.svg
    alt: Docs Islands for VitePress
  actions:
    - theme: brand
      text: 指南
      link: /zh/guide/
    - theme: alt
      text: GitHub 仓库
      link: https://github.com/XiSenao/docs-islands/tree/main/packages/vitepress

features:
  - title: 在 Markdown 中使用 React
    details: 直接在 VitePress Markdown 文件中导入和使用 React 组件，无需额外配置。支持 JSX/TSX，完整的 TypeScript 类型支持。
    icon: '⚛️'

  - title: 灵活的渲染策略
    details: 目前支持 ssr:only（默认，纯静态）、client:load（立即水合）、client:visible（可见时水合）、client:only（纯客户端），可扩展更多策略。
    icon: '🎯'

  - title: SPA 导航优化
    details: spa:sync-render 指令专为 VitePress SPA 模式设计，与 Vue 渲染周期同步预渲染模板，消除路由切换时的组件闪烁，优化 CLS 指标。
    icon: '⚡'

  - title: 静态优先，渐进增强
    details: 基于 VitePress SSG 架构，构建时预渲染组件模板。仅在需要交互的地方进行选择性客户端水合，优化首屏性能。
    icon: '🚀'

  - title: 开发体验优先
    details: 完整的 HMR 支持，React 组件和 Markdown 文件修改即时热更新，组件内部状态保持不丢失。开发/生产环境渲染行为一致，避免生产环境意外。
    icon: '🛠️'

  - title: 内建站点调试控制台
    details: 提供可视化调试面板与 AI 报告，帮助分析渲染行为、HMR、包组成与 spa:sync-render 副作用，更快发现性能与构建问题。
    icon: '🔎'
---
