---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'Docs Islands'
  tagline: 面向文档站点的跨框架 Islands 架构
  image:
    src: /favicon.svg
    alt: Docs Islands
  actions:
    - theme: alt
      text: 在 GitHub 上查看
      link: https://github.com/XiSenao/docs-islands

features:
  - title: 群岛架构
    details: 受 Astro 群岛架构启发。每个组件容器独立完成水合工作，实现框架隔离，避免全局状态冲突。
    icon: '🏝️'
  - title: 灵活的渲染策略
    details: 四种渲染模式 - ssr:only (默认)、client:only、client:load 和 client:visible。根据组件重要性优化性能和用户体验。
    icon: '🎯'
  - title: SPA 导航优化
    details: spa:sync-render 指令通过与 Vue 渲染周期同步预渲染 HTML 注入，消除路由切换时的组件闪烁。
    icon: '⚡'
  - title: 静态优先，渐进增强
    details: SSG 优先架构，构建时预渲染。组件在构建时预渲染，仅在需要交互的地方进行选择性客户端水合。
    icon: '🚀'
  - title: 开发体验卓越
    details: 完整的 HMR 支持、开发生产环境行为一致、TypeScript 集成。环境一致性避免生产环境意外。
    icon: '🛠️'
  - title: 生产就绪
    details: 完整的 MPA 模式兼容性，通过渲染容器实现 Vue 到 React 的 props 初始化。与 VitePress 生产构建无缝集成。
    icon: '📦'
---

<script setup>
import CommunitySection from '../.vitepress/theme/components/landing/community-section/CommunitySection.vue'
</script>

<CommunitySection />
