# Docs Islands

<p align="center">
  <a href="https://docs.senao.me/docs-islands" target="_blank" rel="noopener noreferrer">
    <img width="180" src="https://docs.senao.me/docs-islands/favicon.svg" alt="Docs Islands logo">
  </a>
</p>
<br/>
<p align="center">
  <a href="https://npmjs.com/package/@docs-islands/vitepress"><img src="https://img.shields.io/npm/v/@docs-islands/vitepress.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/@docs-islands/vitepress.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://pr.new/XiSenao/docs-islands/tree/stackblitz?file=docs/zh/index.md"><img src="https://developer.stackblitz.com/img/start_pr_dark_small.svg" alt="Start new PR in StackBlitz Codeflow"></a>
</p>
<br/>

[English](./README.md) | 简体中文

> **⚡ 项目状态**: 积极开发中 - VitePress 项目生产可用。

为文档框架引入跨框架 Islands 架构，在保持静态优先的前提下提供选择性与懒加载注水（Hydration）。基于适配器模型设计，架构可扩展到多种文档框架和构建工具链，无锁定。目前为 VitePress 提供生产可用的零摩擦集成。

## 核心特性

- **🏝️ Islands 架构** - 静态优先，选择性与懒加载注水。按组件隔离，避免全局状态冲突，渐进式增强交互能力。
- **🎯 灵活的渲染策略** - 目前支持四种渲染模式（ssr:only、client:load、client:visible、client:only），可扩展更多策略。
- **🧩 框架无关设计** - 基于适配器模型，可扩展到其他文档框架（如 Docusaurus、Nextra、Rspress 等）和构建工具链，无锁定。
- **⚛️ 跨框架 UI 支持** - 生产就绪的 React 集成，可扩展到 Solid、Svelte、Preact、Angular 等主流 UI 框架。
- **🔌 零摩擦集成** - 最小化配置，开箱即用。通过适配器无缝接入现有文档项目，不破坏原有工作流。
- **📦 完整的开发体验** - 开发环境 HMR、开发/生产一致性、MPA 兼容。针对特定场景提供性能优化选项。

> 更多详细信息和使用指南，请访问 [文档站点](https://docs.senao.me/docs-islands/zh/)。

## 贡献

欢迎社区贡献！请查看 [贡献指南](https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.zh-CN.md) 了解详情。

## 许可证

MIT © [XiSenao](https://github.com/XiSenao)
