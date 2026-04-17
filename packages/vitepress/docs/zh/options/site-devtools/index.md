# Site DevTools 概览

<script lang="react">
  import {
    SiteDevToolsConsoleOverview,
    SiteDevToolsConsolePanels,
  } from '../../../components/react/SiteDevToolsConsoleDocs';
</script>

`Site DevTools` 是 `@docs-islands/vitepress` 的运行时诊断界面。基础接入已经稳定之后，再用它看页面当前的渲染状态、包组成、`HMR` 时序，以及可选的构建报告。

## 什么时候打开它

当组件在切页时闪烁、页面资源突然变重、`HMR` 变慢，或者你需要把当前页的运行时快照发给同事、贴到 issue，或写进 PR 说明里时，就应该打开它。

## 入口与视图

<SiteDevToolsConsoleOverview ssr:only locale="zh" />

先用入口卡片打开调试模式，再按问题类型去选视图。大多数时候，你只是在三件事里做选择：看组件状态、看页面运行时，或者看构建证据。

## 核心能力

<SiteDevToolsConsolePanels ssr:only locale="zh" />

下面这 3 张能力卡，覆盖了 `Site DevTools` 日常最常见的使用路径。重点不是把每个面板重新讲一遍，而是帮你更快判断第一眼该看哪里。

## 浏览器控制台辅助对象

如果你想直接检查或导出运行时状态，浏览器控制台里还会挂一个辅助对象：

```js
globalThis.__DOCS_ISLANDS_SITE_DEVTOOLS__;
```

常用方法如下：

| 方法                  | 用途                                                     |
| --------------------- | -------------------------------------------------------- |
| `getEntries()`        | 读取当前调试日志列表。                                   |
| `getGlobal(path?)`    | 读取某个运行时全局对象，默认是 `__COMPONENT_MANAGER__`。 |
| `getRenderMetrics()`  | 读取当前页面的渲染指标。                                 |
| `getHmrMetrics()`     | 读取当前页面的 `HMR` 指标。                              |
| `logRuntime(reason?)` | 把当前运行时快照写入调试日志。                           |
| `snapshotRuntime()`   | 直接返回当前运行时快照对象，适合复制和分享。             |

## 可选 UI 依赖

下面这些依赖只影响展示效果，核心诊断流程本身不依赖它们。

| 依赖              | 增强能力                                  | 缺失时的回退行为          |
| ----------------- | ----------------------------------------- | ------------------------- |
| `vue-json-pretty` | `Injected Globals` 和快照的树状 JSON 浏览 | 回退为可读的纯文本 JSON。 |
| `prettier`        | 源码预览前的格式整理                      | 直接显示原始源码文本。    |
| `shiki`           | 语法高亮和更好的源码预览                  | 保留纯文本预览。          |
