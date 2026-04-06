# `buildReports`

`buildReports` 控制 `Site Debug Console` 的构建期 AI 报告生成流程。当前设计会为每个 eligible page 生成一份规范化的 page-level report，然后把这份 page report 复用到相关的 chunk 和 module 条目上。

因此，`includeChunks` 和 `includeModules` 的作用，是扩展 page prompt 里包含的证据范围，而不是额外触发独立的 chunk-only 或 module-only AI 请求。

## 什么是 eligible page

并不是所有页面都会进入 `buildReports`。当前只有那些已经包含 docs-islands page-build analysis signals 的页面，才会被视为 eligible page。

换句话说：

- 纯静态 Markdown 页面、没有 docs-islands 组件构建信号的页面，不会进入这条分析链路。
- `resolvePage` 只会对这些 eligible page 生效，而不是对整站所有页面无差别执行。

## 最小配置示例

```ts
vitepressReactRenderingStrategies(vitepressConfig, {
  siteDebug: {
    analysis: {
      providers: {
        doubao: [
          {
            apiKey: 'your-doubao-api-key',
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
            default: true,
            id: 'cn',
            label: 'Doubao CN',
            timeoutMs: 300_000,
          },
        ],
      },
      buildReports: {
        cache: true,
        includeChunks: false,
        includeModules: false,
        models: [
          {
            default: true,
            id: 'doubao-pro',
            label: 'Doubao Pro',
            maxTokens: 4096,
            model: 'doubao-seed-2-0-pro-260215',
            providerRef: {
              provider: 'doubao',
            },
            temperature: 0.2,
            thinking: true,
          },
        ],
      },
    },
  },
});
```

## 配置项

| 配置项                 | 含义                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cache`                | 控制是否启用持久化 AI report cache。`false` 表示每次都重新生成；`true` 表示使用默认缓存配置；对象形式则可以继续配置 `dir` 和 `strategy`。                                                    |
| `models`               | 显式声明构建期分析模型列表，同时也在这里定义真正要执行的请求参数，例如 `id`、`providerRef`、`model`、`thinking`、`maxTokens` 和 `temperature`。                                              |
| `includeChunks`        | 是否把 page-level 的 chunk resource 明细加入 prompt。默认值是 `false`。                                                                                                                      |
| `includeModules`       | 是否把 page-level 与 component-level 的 module 明细加入 prompt。默认值是 `false`。                                                                                                           |
| `resolvePage(context)` | 可选的 page-level 过滤与局部 override 钩子。返回 `undefined`、`null` 或 `false` 表示跳过该页；返回对象表示保留该页，并对该页局部覆盖 `modelId`、`cache`、`includeChunks`、`includeModules`。 |

## `resolvePage(context)` 的行为

`resolvePage` 是控制分析范围最直接的方式。它只会对 eligible page 触发，而且这些页面本身已经包含 docs-islands 的 page-build analysis signals。没有 docs-islands 渲染/构建数据的页面不会进入这个钩子。

钩子接收的上下文如下：

```ts
interface SiteDebugAnalysisBuildReportsResolvePageContext {
  page: {
    routePath: string;
    filePath: string;
  };
  models: SiteDebugAnalysisBuildReportModelConfig[];
}
```

返回值同时决定“是否分析”和“是否局部覆盖配置”：

- 返回 `undefined`、`null` 或 `false`：跳过这个 eligible page，不生成 build report。
- 返回 `{}`：保留这个页面，并继承全局 `buildReports` 默认配置，同时使用 default model。
- 返回 override 对象：保留这个页面，并只对这个页面覆盖 `modelId`、`cache`、`includeChunks`、`includeModules`。如果 `cache` 返回的是对象，未显式提供的字段会继承全局 `buildReports.cache` 对象。

示例：

```ts
const buildReports = {
  models: [
    {
      default: true,
      id: 'default-review',
      model: 'doubao-seed-2-0-pro-260215',
      providerRef: {
        provider: 'doubao',
      },
    },
    {
      id: 'perf-review',
      model: 'doubao-seed-2-0-pro-260215',
      providerRef: {
        id: 'cn',
        provider: 'doubao',
      },
    },
  ],
  includeChunks: false,
  includeModules: false,
  resolvePage(context) {
    if (context.page.routePath === '/guide/performance') {
      return {
        modelId: 'perf-review',
        cache: {
          dir: '.vitepress/cache/site-debug-reports/perf',
          strategy: 'exact',
        },
        includeChunks: true,
        includeModules: true,
      };
    }

    return null;
  },
};
```

这套配置表达的是：

- 默认跳过所有 eligible page
- 只有 `/guide/performance` 会生成 build report
- 该页会显式使用 `perf-review` model
- 这个页面把缓存单独写进自己的目录
- 这个页面同时把 prompt 细节升级到 chunks + modules

## 一次构建里它大致做了什么

可以把 `buildReports` 的工作流理解成下面几步：

1. 找出 eligible page。
2. 为每个页面决定使用哪个 model、是否启用 cache、是否包含 chunk / module 证据。
3. 生成 page-level prompt，并请求 AI provider。
4. 把得到的 page report 作为构建产物写入站点，同时在运行时调试面板里复用到 chunk / module 视图。

这也是为什么它的核心对象始终是“页面”，而不是“单个 chunk”。

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
- 一份不包含 secret 的有效请求快照

对 Doubao 来说，这份快照会包含：

- `providerId`
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

### `fallback` 的含义

`fallback` 只要发现同一 page target 已经有缓存，就会优先复用，即使当前 cache key 已经不匹配也会继续使用。可以把它理解成“允许 stale reuse”的模式。

适合使用 `fallback` 的场景：

- 你希望即使 AI provider 暂时不可用，构建仍然能稳定产出
- 你希望 CI 避免重复执行昂贵的分析请求
- 你已经知道 prompt 会因为 hash 路径或环境路径变化而频繁抖动，导致 `exact` 太容易 miss

如果你需要分析文本高置信度地反映“最新 prompt”或“最新 provider 设置”，就不应该使用 `fallback`。

## 失败与降级行为

在实际项目里，更值得关心的往往不是“成功时怎么样”，而是“失败时会怎么样”：

- 当 provider 不可用时，如果没有可复用 cache，对应页面可能拿不到新的 report。
- 当策略是 `fallback` 且已有旧缓存时，系统会优先复用旧报告，让构建继续稳定产出。
- 当策略是 `exact` 时，只要 prompt 或有效请求快照变化，系统就会明确视为 cache miss，并重新生成或报告无法复用。

### 为什么 prompt 很容易抖动

page-build prompt 会把当前页面快照直接嵌进去，而这份快照里可能带有 emitted asset path、page client chunk path，以及带 hash 的构建文件名。于是，一些看起来很小的构建变化，也可能让 prompt 本身变化，即使页面的高层诊断结论几乎没变。

这会带来两个实际影响：

- `exact` 会更严格，因此在重新构建或 hash 变化后更容易 miss
- `fallback` 对这种变化更宽容，所以更适合 CI，或者更适合那些希望持续复用已提交 report 的场景

### 推荐缓存策略

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
  resolvePage({ page }) {
    if (page.routePath.startsWith('/guide/')) {
      return {};
    }

    return null;
  },
};
```

这套写法比较实用，因为：

- 本地构建仍然保持严格，只要 prompt 或 provider 语义真的变化就会刷新
- CI 可以继续复用已有 report，不会因为严格 cache identity miss 而频繁重跑
- `resolvePage` 能把报告生成范围收敛到真正需要构建诊断的页面

## 推荐的落地方式

- 第一步：先只给一两个关键页面生成报告，验证 prompt 质量。
- 第二步：本地调试阶段用 `exact`，确保你看到的是当前构建语义。
- 第三步：CI 或发布阶段再评估是否切到 `fallback`。
- 第四步：只有在确实需要更强证据链时，再打开 `includeChunks` 或 `includeModules`。
