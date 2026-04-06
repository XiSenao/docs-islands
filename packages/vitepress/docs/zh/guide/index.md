# 介绍

<script lang="react">
  import { Landing } from '../rendering-strategy-comps/react/Landing';
</script>

<Landing client:load spa:sync-render />

`@docs-islands/vitepress` 为 `VitePress` 带来跨框架 Islands 渲染能力，让你可以在 Markdown 中直接接入 `React` 组件，并按组件粒度选择渲染策略，而不必放弃 `VitePress` 原本的静态优先体验。

> 现阶段内置支持 `React`。文档里的“跨框架”指的是能力模型与扩展方向，后续可以继续扩展到其他 UI 框架。

## 它解决什么问题

`VitePress` 原生擅长处理 `Vue` 组件，但很多文档站并不只需要 `Vue` 生态里的交互部件。常见需求包括：

- 在 Markdown 中直接复用现有 `React` 组件。
- 对不同交互块分别决定是纯静态、立即水合、可见时水合，还是纯客户端渲染。
- 在 `SPA` 切页时尽量减少非 `Vue` 组件的闪烁与 CLS 抖动。
- 保持开发态和生产态的渲染策略尽可能一致，同时保留 HMR 体验。

## 架构思路

这个库延续的是 `VitePress + SSG + SPA` 的基本模型，而不是另起一套站点运行时：

- 静态优先：构建阶段优先产出 HTML。
- 选择性 hydration：只有需要交互的组件才交给客户端接管。
- 框架隔离：每个非 `Vue` 组件都挂在自己的容器里，避免全局混杂。
- 渐进增强：默认从静态内容出发，再按组件声明的策略增强为交互。

## 核心心智模型

可以把它理解成三层职责分工：

- `VitePress` 仍然负责页面、路由、主题和 Markdown 渲染。
- `docs-islands` 负责把 Markdown 里的跨框架组件转换成可分析、可预渲染、可接管的容器。
- `React` 只在真正需要它的地方接管这些容器，而不是接管整页。

这也是为什么它更适合“文档站里的局部交互”，而不是“整页都是重交互应用”的场景。

## 你可以获得什么

- 在 Markdown 中直接导入和使用 `React` 组件。
- `ssr:only`、`client:load`、`client:visible`、`client:only` 四种核心渲染模式。
- `spa:sync-render` / `spa:sr` 用于优化切页时的同步渲染体验。
- 一次性 props 透传，让 `Vue` 容器可以把初始化数据传给 `React` 组件。
- 内建 `Site Debug Console`，帮助排查渲染状态、包体积、HMR 时序与运行时注入状态。
- 与 `VitePress` 的 `MPA` 模式兼容。

## 适合哪些场景

- 以文档为主，但需要插入少量 `React` 交互组件的产品站或文档站。
- 已经有一批现成 `React` 组件，希望低成本复用到 `VitePress` 中。
- 对首屏静态输出、SEO 和切页体验都比较敏感的内容型站点。

## 采用前建议

- 先从 `ssr:only` 开始接入，让第一版尽量保持静态输出。
- 只有确认组件真的需要交互时，再升级到 `client:load` 或 `client:visible`。
- 只有当切页闪烁确实会影响核心体验时，再评估 `spa:sr`。
- 如果项目里会长期维护较多交互块，建议尽早挂上 `Site Debug Console`，把运行时状态留在统一视图里。

## 暂时不适合的场景

- 你的页面主体本身就是一个完整的重交互应用，而不是“文档里插入少量岛屿组件”。
- 组件之间依赖复杂的跨框架共享状态，希望 `Vue` 和 `React` 之间天然保持响应式双向通信。
- 你希望它替代现有前端应用框架的页面级路由、数据流和应用壳模型。

## 下一步

- 从 [快速上手](./getting-started.md) 开始接入。
- 在 [工作原理](./how-it-works.md) 里理解各渲染策略与 `spa:sync-render` 的取舍。
- 在 [站点调试](../site-debug-console/) 里查看运行时排障入口。
