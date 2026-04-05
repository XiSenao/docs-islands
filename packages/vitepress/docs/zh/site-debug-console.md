# Site Debug Console

<script lang="react">
  import {
    SiteDebugConsoleOverview,
    SiteDebugConsolePanels,
  } from '../components/react/SiteDebugConsoleDocs';
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

接入方式、开启方式和第一轮排查流程，请先看 [快速开始](./quick-start.md)。本文聚焦于各个面板能提供什么信息，以及如何解读这些运行时数据。

## 构建期 AI 报告配置

`Site Debug Console` 可以在 page、chunk 和 module 视图上挂载构建期 AI 分析。当前设计会为每个 eligible page 生成一份规范化的 page-level report，然后把这份 page report 复用到相关的 chunk 和 module 条目上。因此，`includeChunks` 和 `includeModules` 的作用是扩展 page prompt 里包含的证据范围，而不是额外触发独立的 chunk-only 或 module-only AI 请求。

### 最小配置示例

```ts
vitepressReactRenderingStrategies(vitepressConfig, {
  siteDebug: {
    analysis: {
      providers: {
        doubao: {
          apiKey: 'your-doubao-api-key',
          baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          model: 'doubao-seed-2-0-pro-260215',
          thinking: true,
          maxTokens: 4096,
          temperature: 0.2,
          timeoutMs: 300_000,
        },
      },
      buildReports: {
        cache: true,
        includeChunks: false,
        includeModules: false,
        models: [
          {
            label: 'Doubao Pro',
            model: 'doubao-seed-2-0-pro-260215',
            provider: 'doubao',
            thinking: true,
          },
        ],
      },
    },
  },
});
```

### `buildReports` 配置项

| 配置项              | 含义                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cache`             | 控制是否启用持久化 AI report cache。`false` 表示每次都重新生成；`true` 表示使用默认缓存配置；对象形式则可以继续配置 `dir` 和 `strategy`。                  |
| `models`            | 显式声明构建期分析模型列表。省略或为空时，会跳过 AI report 生成流程，并输出对应的 skip 日志。                                                              |
| `includeChunks`     | 是否把 page-level 的 chunk resource 明细加入 prompt。默认值是 `false`。                                                                                    |
| `includeModules`    | 是否把 page-level 与 component-level 的 module 明细加入 prompt。默认值是 `false`。                                                                         |
| `resolvePage(page)` | 可选的 page-level 过滤与局部 override 钩子。返回 `false` 表示跳过该页；返回对象表示保留该页，并对该页局部覆盖 `cache`、`includeChunks`、`includeModules`。 |

### `providers.doubao` 配置项

| 配置项        | 含义                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `apiKey`      | Volcengine Ark API key。执行 Doubao 请求时需要它，但它不会进入 cache identity。                              |
| `baseUrl`     | Ark API 的 base URL。修改它会改变有效 provider config snapshot，因此会让 `exact` cache 失效。                |
| `model`       | Doubao provider 请求使用的模型标识。是否执行构建期 AI report 仍然取决于 `buildReports.models` 是否显式提供。 |
| `thinking`    | 是否为 Doubao 请求启用 reasoning mode。                                                                      |
| `maxTokens`   | 单次分析返回内容的最大 token 上限。                                                                          |
| `temperature` | 生成分析文本时的采样温度。                                                                                   |
| `timeoutMs`   | 单次分析请求在本地的超时时间。                                                                               |

### `resolvePage(page)` 的行为

`resolvePage` 是控制分析范围最直接的方式。它只会对 eligible page 触发，而且这些页面本身已经包含 docs-islands 的 page-build analysis signals。没有 docs-islands 渲染/构建数据的页面不会进入这个钩子。

钩子接收的上下文如下：

```ts
interface SiteDebugAnalysisBuildReportsPageContext {
  routePath: string;
  filePath: string;
}
```

返回值同时决定“是否分析”和“是否局部覆盖配置”：

- 返回 `false`：跳过这个 eligible page，不生成 build report。
- 返回 `{}`：保留这个页面，并继承全局 `buildReports` 默认配置。
- 返回 override 对象：保留这个页面，并只对这个页面覆盖 `cache`、`includeChunks`、`includeModules`。

示例：

```ts
const buildReports = {
  cache: false,
  includeChunks: false,
  includeModules: false,
  resolvePage(page) {
    if (page.routePath === '/guide/performance') {
      return {
        cache: {
          dir: '.vitepress/cache/site-debug-reports/perf',
          strategy: 'exact',
        },
        includeChunks: true,
        includeModules: true,
      };
    }

    return false;
  },
};
```

这套配置表达的是：

- 默认跳过所有 eligible page
- 只有 `/guide/performance` 会生成 build report
- 这个页面把缓存单独写进自己的目录
- 这个页面同时把 prompt 细节升级到 chunks + modules

## 缓存设计与推荐策略

### 先区分两类产物

这里有两类相关但不同的产物：

- 持久化 cache 目录保存的是可复用的 AI report JSON，用来避免重复请求模型。默认目录是 `.vitepress/cache/site-debug-reports`。
- 构建输出阶段会把 page report 作为产物写入生成后的 VitePress 站点里，供 debug console 在运行时读取。

它们彼此相关，但不是同一层东西。cache 是执行优化层；构建输出里的 report asset 才是运行时实际消费的产物。

在当前仓库里，`cache.dir` 被有意指向了 `.vitepress/site-debug-reports`，而这个目录会被 git 跟踪。因此这里的持久化 cache 文件本身，也被当作常规 docs build 和部署时的规范化 report 来源。

### 默认缓存行为

当配置里存在 `buildReports`，但没有显式写 `cache` 时，系统会启用默认缓存配置：

- `dir`: `.vitepress/cache/site-debug-reports`
- `strategy`: `exact`

也可以显式写成：

```ts
const buildReports = {
  cache: true,
};
```

### `exact` 的含义

`exact` 只有在 cache identity 仍然匹配时才会复用缓存。当前 cache key 的组成是：

- 完整渲染后的分析 prompt
- 当前 provider
- 一份不包含 secret 的 provider config snapshot

对 Doubao 来说，这份 provider snapshot 会包含：

- `baseUrl`
- `model`
- `thinking`
- `maxTokens`
- `temperature`

它刻意不包含：

- `apiKey` 这类 secret 信息
- `label` 这类只影响展示的元数据
- `timeoutMs` 这类本地执行控制参数

因此：

- 修改 `label` 不会让 `exact` cache 失效
- 轮换 `apiKey` 不会让 `exact` cache 失效
- 修改 prompt 内容，或修改真正影响执行行为的 provider 配置，会让 `exact` cache 失效

当 `exact` cache miss 且本地已经存在旧缓存条目时，构建日志也会说明上一次缓存为什么失效。常见原因包括：

- `analysis prompt changed`
- `provider changed`
- `provider snapshot changed (temperature: 0.2 -> 0.7)`

当你希望构建分析尽量严格跟随“当前 prompt”和“当前执行语义”时，应该优先使用 `exact`。

### `fallback` 的含义

`fallback` 只要发现同一 page target 已经有缓存，就会优先复用，即使当前 cache key 已经不匹配也会继续使用。可以把它理解成“允许 stale reuse”的模式。

适合使用 `fallback` 的场景：

- 你希望即使 AI provider 暂时不可用，构建仍然能稳定产出
- 你希望 CI 避免重复执行昂贵的分析请求
- 你已经知道 prompt 会因为 hash 路径或环境路径变化而频繁抖动，导致 `exact` 太容易 miss

如果你需要分析文本高置信度地反映“最新 prompt”或“最新 provider 设置”，就不应该使用 `fallback`。

如果 `fallback` 在当前 exact cache key 已经不匹配的情况下仍然复用了旧缓存，构建日志也会明确提示是哪一部分发生了变化，以及为什么当前仍然继续使用 stale cache。

### 为什么 prompt 很容易抖动

page-build prompt 会把当前页面快照直接嵌进去，而这份快照里可能带有 emitted asset path、page client chunk path，以及带 hash 的构建文件名。于是，一些看起来很小的构建变化，也可能让 prompt 本身变化，即使页面的高层诊断结论几乎没变。

这会带来两个实际影响：

- `exact` 会更严格，因此在重新构建或 hash 变化后更容易 miss
- `fallback` 对这种变化更宽容，所以更适合 CI，或者更适合那些希望持续复用已提交 report 的场景

### 推荐缓存策略

除非你有更强的约束，否则可以优先参考下面这套默认建议：

- 本地调 prompt 或调分析规则：`exact`
- 只对少量页面做本地排查，配合 `resolvePage`：`exact`
- CI / 文档发布，希望 stale-but-available：`fallback`
- 一次性 correctness check，不想复用旧结果：`cache: false`

### 一个实用的混合配置

```ts
const buildReports = {
  cache: {
    dir: '.vitepress/site-debug-reports',
    strategy: isInCi ? 'fallback' : 'exact',
  },
  includeChunks: true,
  includeModules: true,
  resolvePage(page) {
    if (page.routePath.startsWith('/guide/')) {
      return {};
    }

    return false;
  },
};
```

这套写法比较实用，因为：

- 本地构建仍然保持严格，只要 prompt 或 provider 语义真的变化就会刷新
- CI 可以继续复用已有 report，不会因为严格 cache identity miss 而频繁重跑
- `resolvePage` 能把报告生成范围收敛到真正需要构建诊断的页面

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
