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
  - title: Islands 架构
    details: 静态优先，选择性与懒加载注水。按组件隔离，避免全局状态冲突，渐进式增强交互能力。
    icon: '🏝️'

  - title: 灵活的渲染策略
    details: 目前支持四种渲染模式 — ssr:only（默认）、client:load、client:visible、client:only — 可扩展更多策略。
    icon: '🎯'

  - title: 框架无关设计
    details: 基于适配器模型，可扩展到其他文档框架（如 Docusaurus、Nextra、Rspress 等）和构建工具链，无锁定。
    icon: '🧩'

  - title: 跨框架 UI 支持
    details: 生产就绪的 React 集成，可扩展到 Solid、Svelte、Preact、Angular 等主流 UI 框架。
    icon: '⚛️'

  - title: 零摩擦集成
    details: 最小化配置，开箱即用。通过适配器无缝接入现有文档项目，不破坏原有工作流。
    icon: '🔌'

  - title: 完整的开发体验
    details: 开发环境 HMR、开发/生产一致性、MPA 兼容。针对特定场景提供性能优化选项（如 SPA 导航）。
    icon: '📦'
---

<script setup>
import CommunitySection from '../.vitepress/theme/components/landing/community-section/CommunitySection.vue'
</script>

<CommunitySection />
