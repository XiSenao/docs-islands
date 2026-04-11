# Site Debug Console

<script lang="react">
  import {
    SiteDebugConsoleOverview,
    SiteDebugConsolePanels,
  } from '../../components/react/SiteDebugConsoleDocs';
</script>

`Site Debug Console` 是 `@docs-islands/vitepress` 提供的一套运行时调试能力。它把跨框架渲染过程中分散在页面、构建产物、运行时全局对象和 `HMR` 时序里的信息集中到同一套调试入口里，减少在多个工具之间来回切换的成本。

## 遇到什么问题时会需要它

- 组件切页时闪烁，但你不知道是在等 `HTML`、`CSS` 还是客户端注水。
- 你知道某个容器有问题，但不知道它实际用了什么渲染模式，以及卡在什么阶段。
- 页面体积异常，但你不知道主要成本来自 `JS`、`CSS` 还是静态资源。
- `HMR` 变慢或失败，但你不知道问题发生在触发、`SSR Apply`、客户端应用还是运行时 ready。
- 你想把当前运行时状态交给其他同事或贴到 issue / PR 里，但手里只有零散日志。

## 为什么统一视图很重要

跨框架渲染的问题通常不是单一维度的问题，而是页面状态、构建产物、运行时注入和热更新时序一起造成的。没有统一视图时，开发者只能在 DOM、Network、构建目录和控制台之间来回切换。`Site Debug Console` 的价值，就是把这些信息收拢到一个地方，让“猜问题”变成“看证据”。

## 先看快速开始

接入方式、开启方式和第一轮排查流程，请先看 [快速上手](./getting-started.md)。

## 相关选项

如果你还想给 `Site Debug Console` 挂上构建期 AI 报告，请查看这些选项页：

- [分析](./options/analysis.md)
- [模型接入](./options/models.md)
- [产物分析](./options/build-reports.md)

## UI 增强依赖与回退机制

`Site Debug Console` 内部有几项可选的 UI 增强依赖：

| 依赖包            | 提供的增强能力                                  | 不可用时的回退行为                 |
| ----------------- | ----------------------------------------------- | ---------------------------------- |
| `vue-json-pretty` | `Injected Globals` 和运行时快照的树状 JSON 浏览 | 自动退回为可读的纯文本 JSON 视图。 |
| `prettier`        | 源码预览前的格式化整理                          | 直接显示原始源码文本。             |
| `shiki`           | 富语法高亮与大文件窗口化高亮预览                | 保留纯文本源码预览能力。           |

这些依赖只负责“展示增强”，并不是核心调试流程的必需项。即使宿主项目没有安装它们，调试控制台仍然可以打开，主要面板仍然可以使用，调试数据也仍然可以继续查看。

如果你安装了 `vue-json-pretty`，还需要在 `.vitepress/theme/index.ts` 里手动引入 `vue-json-pretty/lib/styles.css`。控制台会继续把这个依赖保持为可选项，但样式注入职责交给宿主主题更清晰。

<SiteDebugConsoleOverview ssr:only locale="zh" />

## 核心功能介绍

### 页面浮层

页面浮层面向“单个组件”。你看到哪个组件有问题，就直接点哪个组件的浮层徽标。

| 展示项                   | 具体意义                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `Status`                 | 当前渲染状态。它告诉你这个容器是刚被发现、等待可见、正在订阅/加载、正在渲染、已经完成、失败还是被跳过。                          |
| `Total`                  | `totalDurationMs`。整个渲染流程的总耗时，通常从检测到容器开始，到完成、失败或跳过结束。                                          |
| `Subscribe`              | `subscribeDurationMs`。仅生产态运行时显示，表示运行时订阅/接管该容器所花的时间。                                                 |
| `Invoke`                 | `invokeDurationMs`。真正执行组件渲染逻辑所花的时间。                                                                             |
| `Visible Wait`           | `waitForVisibilityMs`。常见于 `client:visible`，表示组件为了等进入视口而额外等待的时间。                                         |
| `Bundle`                 | 当前组件关联构建产物的估算总体积，对应 `estimatedTotalBytes`。                                                                   |
| `Vitals`                 | 当前渲染窗口的性能分数，来自 `performanceScore`，范围是 `0-100`，越高越好。                                                      |
| `renderDirective · mode` | 左边是声明时写下的渲染指令，例如 `ssr:only`、`client:load`；右边是运行时实际解析出的模式，例如 `ssr-only`、`hydrate`、`render`。 |
| `renderId`               | 当前渲染容器的唯一标识，用来把 DOM 容器、构建信息和运行时指标关联起来。                                                          |
| `Latest React HMR`       | 当前组件最近一次热更新的机制、阶段耗时和触发事件。                                                                               |

`Status` 的常见取值：

| 状态值      | 含义                                    |
| ----------- | --------------------------------------- |
| `Detected`  | 已识别到容器，但还没进入后续阶段。      |
| `Waiting`   | 正在等待可见，常见于 `client:visible`。 |
| `Loading`   | 正在订阅或加载运行时资源。              |
| `Rendering` | 已经开始执行渲染。                      |
| `Completed` | 渲染完成。                              |
| `Failed`    | 渲染失败。                              |
| `Skipped`   | 当前流程被跳过。                        |

### Bundle Composition

`Bundle Composition` 面向“当前组件到底消耗了哪些资源”。

| 展示项            | 具体意义                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `Total`           | `estimatedTotalBytes`，组件关联的总估算体积。                                               |
| `JS`              | `estimatedJsBytes`，组件关联的 JavaScript 体积。                                            |
| `CSS`             | `estimatedCssBytes`，组件关联的样式体积。                                                   |
| `Asset`           | `estimatedAssetBytes`，图片、字体等静态资源体积。                                           |
| `Chunk Resources` | 构建后输出的文件列表。每一项会显示文件大小、占总量的比例，以及这个 chunk 里包含多少个模块。 |
| `Module Source`   | 某个 chunk 内的模块列表。可以继续看模块源码、模块大小和原始文件路径。                       |

这块能力最适合回答一个问题：当前组件的成本到底主要来自哪一类资源。

### Global Debug Console

`Debug Logs` 面向“页面级运行时”。当问题不只发生在一个组件上，或者你需要把当前状态留痕时，就应该看这里。

<SiteDebugConsolePanels ssr:only locale="zh" />

`Injected Globals` 里的快捷入口含义如下：

| 对象                | 具体意义                                                       |
| ------------------- | -------------------------------------------------------------- |
| `Component Manager` | 运行时组件管理状态，以及它持有的页面 metafile 状态。           |
| `Page Metafile`     | 当前页面解析出来的构建元数据，包含组件 build metrics。         |
| `Inject Component`  | 页面维度的注入组件注册表。                                     |
| `Render Metrics`    | 页面上收集到的 React 渲染指标集合。                            |
| `HMR Metrics`       | 页面上收集到的 React 热更新指标集合。                          |
| `Site Data`         | VitePress 的运行时站点数据。它会在 `dev` 和 `MPA` 模式下隐藏。 |

## 推荐排查路径

如果你想把它当成“稳定的工作流”而不是“偶尔打开的面板”，可以按这个顺序使用：

1. 先在页面浮层定位具体出问题的组件。
2. 再通过 `Bundle Composition` 判断问题更偏向 `JS`、`CSS`、静态资源还是 chunk 组成。
3. 如果问题已经扩展到整页切换或多组件异常，切到 `Debug Logs` 看页面级状态。
4. 需要共享证据时，使用 `snapshotRuntime()` 或直接复制调试日志。

这条路径的好处是：你总是先定位“是哪一个组件出了什么问题”，再逐步扩大到“整页运行时发生了什么”。

## 控制台辅助对象 API

浏览器控制台里会挂一个辅助对象：

```js
globalThis.__DOCS_ISLANDS_SITE_DEBUG__;
```

它的字段含义如下：

| 字段                  | 具体意义                                                   |
| --------------------- | ---------------------------------------------------------- |
| `getEntries()`        | 返回调试台当前收集到的日志条目。                           |
| `getGlobal(path?)`    | 读取某个运行时全局对象，默认读取 `__COMPONENT_MANAGER__`。 |
| `getRenderMetrics()`  | 返回当前页面已收集到的 `Render Metrics` 数组。             |
| `getHmrMetrics()`     | 返回当前页面已收集到的 `HMR Metrics` 数组。                |
| `logGlobal(path?)`    | 把某个全局对象的快照写入调试日志。                         |
| `logRuntime(reason?)` | 把当前运行时总快照写入调试日志。                           |
| `snapshotRuntime()`   | 直接返回当前运行时总快照对象，适合复制、持久化和分享。     |

## `snapshotRuntime()` 返回字段说明

`snapshotRuntime()` 返回的是一个页面级快照对象，顶层字段含义如下：

| 字段                   | 具体意义                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| `componentManager`     | 当前 `__COMPONENT_MANAGER__` 的可序列化快照。                            |
| `currentInjectedPage`  | 当前命中的注入组件页面 ID。                                              |
| `currentInjectedValue` | `currentInjectedPage` 对应的注入组件数据。                               |
| `currentMetafilePage`  | 当前命中的页面 metafile 页面 ID。                                        |
| `currentMetafileValue` | `currentMetafilePage` 对应的 metafile 数据。                             |
| `href`                 | 当前页面地址。                                                           |
| `hmrMetrics`           | 当前页面的 `HMR Metrics` 快照数组。                                      |
| `injectComponentPages` | 当前注入组件注册表里所有页面 ID。                                        |
| `pageMetafilePages`    | 当前页面 metafile 注册表里所有页面 ID。                                  |
| `react`                | 当前页面 `React` 全局对象的可序列化快照。                                |
| `reactDom`             | 当前页面 `ReactDOM` 全局对象的可序列化快照。                             |
| `renderMetrics`        | 当前页面的 `Render Metrics` 快照数组。                                   |
| `scripts`              | 当前页面已注入脚本与样式资源的快照。                                     |
| `siteData`             | 当前页面的 `__VP_SITE_DATA__` 快照；仅在非 `dev` 且非 `MPA` 模式下提供。 |
| `theme`                | 当前主题外观状态快照。                                                   |

`scripts` 的字段：

| 字段             | 具体意义                                              |
| ---------------- | ----------------------------------------------------- |
| `cssBundles`     | 当前页面上带 `data-vrite-css-bundle` 的样式链接列表。 |
| `modulePreloads` | 当前页面上 `modulepreload` 链接的 `href` 列表。       |
| `moduleScripts`  | 当前页面上 `type="module"` 脚本的 `src` 列表。        |

`theme` 的字段：

| 字段                  | 具体意义                          |
| --------------------- | --------------------------------- |
| `bodyDatasetTheme`    | `body.dataset.theme` 当前值。     |
| `computedColorScheme` | 计算后的 `color-scheme`。         |
| `prefersDark`         | 系统是否偏好深色模式。            |
| `rootClassName`       | 根节点 className。                |
| `rootDatasetTheme`    | `html.dataset.theme` 当前值。     |
| `storedPreference`    | 本地存储里的 VitePress 外观偏好。 |

## `getRenderMetrics()` 返回项字段说明

`getRenderMetrics()` 返回的是 `SiteDebugRenderMetric[]`，每一项表示一个渲染容器的运行时指标。

| 字段                  | 具体意义                                               |
| --------------------- | ------------------------------------------------------ |
| `componentName`       | 组件名。                                               |
| `renderId`            | 渲染容器唯一 ID。                                      |
| `pageId`              | 该指标所属页面 ID。                                    |
| `renderDirective`     | 模板里声明的渲染指令，例如 `ssr:only`、`client:load`。 |
| `renderMode`          | 运行时解析后的模式：`hydrate`、`render`、`ssr-only`。  |
| `renderWithSpaSync`   | 是否启用了 `spa:sync-render`。                         |
| `status`              | 当前渲染状态。                                         |
| `detectedAt`          | 识别到容器的时间戳，基于运行时时钟。                   |
| `visibleAt`           | 容器变为可见时的时间戳。                               |
| `updatedAt`           | 最近一次更新该指标的时间戳。                           |
| `waitForVisibilityMs` | 等待进入视口的耗时。                                   |
| `subscribeDurationMs` | 运行时订阅/接管容器的耗时。                            |
| `invokeDurationMs`    | 执行渲染逻辑的耗时。                                   |
| `totalDurationMs`     | 整体渲染总耗时。                                       |
| `hasSsrContent`       | 该容器开始时是否已经存在 SSR 内容。                    |
| `source`              | 记录这条指标的运行时来源，例如开发态或生产态运行时。   |
| `errorMessage`        | 渲染失败时的错误信息。                                 |

## `getHmrMetrics()` 返回项字段说明

`getHmrMetrics()` 返回的是 `SiteDebugHmrMetric[]`，每一项表示一次 React 热更新过程。

| 字段                     | 具体意义                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `hmrId`                  | 这次热更新的唯一 ID。                                                                |
| `componentName`          | 发生热更新的组件名。                                                                 |
| `pageId`                 | 这次热更新关联的页面 ID。                                                            |
| `renderIds`              | 被这次热更新影响到的渲染容器 ID 列表。                                               |
| `mechanismType`          | 热更新机制，例如 `markdown-react-hmr`、`react-fast-refresh`、`ssr-only-direct-hmr`。 |
| `updateType`             | 更新类型，例如 markdown 更新、`ssr:only` 组件更新或 React refresh 更新。             |
| `triggerEvent`           | 触发更新的事件名。                                                                   |
| `applyEvent`             | 应用更新的事件名。                                                                   |
| `status`                 | 当前热更新状态：`running`、`completed`、`failed`。                                   |
| `startedAt`              | 热更新开始时间戳。                                                                   |
| `updatedAt`              | 热更新最近更新时间戳。                                                               |
| `runtimeReadyDurationMs` | 运行时 ready 阶段耗时。                                                              |
| `ssrApplyDurationMs`     | 服务端 patch / SSR apply 阶段耗时。                                                  |
| `clientApplyDurationMs`  | 客户端应用更新阶段耗时。                                                             |
| `totalDurationMs`        | 整次热更新总耗时。                                                                   |
| `sourcePath`             | 关联源码文件路径。                                                                   |
| `sourceLine`             | 关联源码行号。                                                                       |
| `sourceColumn`           | 关联源码列号。                                                                       |
| `importedName`           | 热更新关联的导出名。                                                                 |
| `source`                 | 记录这条热更新指标的来源。                                                           |
| `errorMessage`           | 热更新失败时的错误信息。                                                             |

## 这个功能的价值

这项能力的核心价值不是“多一个面板”，而是把单个组件的问题、页面级运行时状态、构建体积和热更新时序放进同一套证据链里。这样你在排查问题时，能更快知道问题在哪一层，也更容易把当前状态准确地交给别人。

对于长期维护文档站的人来说，它的另一个价值是建立统一语言：你和团队成员可以直接围绕 `renderId`、`Bundle Composition`、`Page Metafile`、`HMR Metrics` 这些证据对象讨论问题，而不是靠“我感觉这里像是慢了一下”来描述现象。
