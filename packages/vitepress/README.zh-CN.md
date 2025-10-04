# @docs-islands/vitepress

<p align="center">
  <a href="https://docs.senao.me/docs-islands/vitepress/zh/core-concepts" target="_blank" rel="noopener noreferrer">  
    <img width="180" src="https://docs.senao.me/docs-islands/vitepress/islands-vitepress.svg" alt="logo">
  </a>
</p>
<br/>
<p align="center">
  <a href="https://npmjs.com/package/@docs-islands/vitepress"><img src="https://img.shields.io/npm/v/@docs-islands/vitepress.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/@docs-islands/vitepress.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://pr.new/XiSenao/docs-islands"><img src="https://developer.stackblitz.com/img/start_pr_dark_small.svg" alt="Start new PR in StackBlitz Codeflow"></a>
</p>
<br/>

[English](./README.md) | 简体中文

> **⚡ 项目状态**: 积极开发中 - VitePress 项目生产可用。

为 VitePress 引入跨框架组件渲染能力（当前内置 React），在不改变 VitePress 的 SSG 架构前提下提供更细粒度的渲染与 Hydration 策略，灵感参考自 [Astro](https://docs.astro.build/) 的 [Islands Architecture](https://docs.astro.build/en/concepts/islands)。

- **跨框架渲染**: 生产就绪的 React 集成，采用统一的 Islands Architecture，未来也计划支持社区中更多的 UI 框架，共享渲染原语。
- **四种客户端指令**: client:only、client:load、client:visible、ssr:only（默认）。
- **SPA 同步渲染优化**: spa:sync-render/spa:sr，在路由切换时同步注入关键组件的预渲染输出，消除导致视觉不稳定的异步加载间隙。
- **HMR 支持**: 跨框架边界的完整热模块替换，保持状态，维护开发速度。
- **MPA 模式兼容**: 兼容 VitePress MPA 模式。

> 更完整的策略设计、动机与示例，见文档 [VitePress Cross-Framework Rendering Strategy](https://docs.senao.me/docs-islands/vitepress/zh/core-concepts)。

## 快速上手

阅读 [快速上手](https://docs.senao.me/docs-islands/vitepress/zh/quick-start) 来了解更多信息。

## 贡献

欢迎社区贡献！请查看 [贡献指南](https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.zh-CN.md) 了解详情。

## 许可证

MIT © [XiSenao](https://github.com/XiSenao)
