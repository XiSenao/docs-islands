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
  - title: 极致性能体验
    details: 静态内容即时呈现，交互组件按需加载。让文档站点兼具静态网站的速度与现代应用的交互体验，为用户提供流畅的阅读体验。
    icon: '🏝️'

  - title: 灵活的渲染策略
    details: 灵活控制每个组件的渲染与注水时机，支持服务端渲染、立即加载、可见时加载、纯客户端等多种策略。避免不必要的 JavaScript 执行，让交互在最合适的时候发生。
    icon: '🎯'

  - title: 架构可扩展
    details: 设计理念支持扩展到其他主流文档框架。当前为 VitePress 提供生产级集成，随着社区发展逐步覆盖更多平台，保持技术栈选择的灵活性。
    icon: '🧩'

  - title: 跨框架支持
    details: 在文档中自由使用 React、Vue、Solid、Svelte 等任何喜欢的 UI 框架。团队无需学习新技术栈，直接复用现有组件库和开发经验。
    icon: '⚛️'

  - title: 快速集成
    details: 最小化配置即可在现有文档项目中启用 Islands 能力。无需重构代码，不影响现有功能，渐进式增强文档交互性。
    icon: '🔌'

  - title: 完善开发体验
    details: 开发环境热更新即时反馈，开发与生产环境行为一致。提供完整的类型支持和性能优化选项，确保从开发到部署的流畅体验。
    icon: '📦'
---

<script setup>
import CommunitySection from '../.vitepress/theme/components/landing/community-section/CommunitySection.vue'
</script>

<CommunitySection />
