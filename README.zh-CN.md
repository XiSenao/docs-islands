# docs-islands

<p align="center">
  <a href="https://docs.senao.me/docs-islands" target="_blank" rel="noopener noreferrer">
    <img width="180" src="https://docs.senao.me/docs-islands/favicon.svg" alt="docs-islands logo">
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

**面向文档站点的跨框架 Islands 架构**

docs-islands 将 Islands Architecture 带到文档站点，在保持静态优先的前提下提供选择性与懒加载注水（Hydration），并以 UI 框架无关与构建工具可插拔为核心目标。目前已提供对 VitePress 的零侵入接入（`@docs-islands/vitepress`），同一模式可扩展到其他文档框架与工具链（例如未来的 `@docs-islands/docusaurus`、`@docs-islands/nextra`、`@docs-islands/rspress`）。

## 核心特性

- **跨框架渲染**: 生产就绪的 React 集成，采用统一的 Islands Architecture，未来也计划支持社区中更多的 UI 框架，共享渲染原语。
- **四种客户端指令**: client:only、client:load、client:visible、ssr:only（默认）。
- **SPA 同步渲染优化**: spa:sync-render/spa:sr，在路由切换时同步注入关键组件的预渲染输出，消除导致视觉不稳定的异步加载间隙。
- **HMR 支持**: 跨框架边界的完整热模块替换，保持状态，维护开发速度。
- **MPA 模式兼容**: 兼容 VitePress MPA 模式。
- **UI 框架无关**: 架构支持扩展到 Solid / Svelte / Preact / Angular 等。
- **插件化接入**: 受 unplugin 启发，一套核心，多种适配。

## 贡献

欢迎社区贡献！请查看 [贡献指南](https://github.com/XiSenaodocs-islands/blob/main/.github/CONTRIBUTING.zh-CN.md) 了解详情。

## 许可协议

MIT © [XiSenao](https://github.com/XiSenao)
