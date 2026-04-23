# `logging`

<script lang="react">
  import LoggingPresetCatalog from '../../components/react/LoggingPresetCatalog';
  import LoggerScopePlayground from '../../components/react/LoggerScopePlayground';
</script>

`logging` 用来控制 `createDocsIslands()` 产生的包内日志，以及这个包公开暴露的 logger helper。它不会改变渲染逻辑，只决定 `@docs-islands/*` 在 Node 和浏览器里哪些消息可见。

每个 `createDocsIslands()` 实例都会持有隔离的 logger scope。VitePress 会把这个 scope 注入到构建图中，通用的 `@docs-islands/logger` runtime 会在没有显式 scope 时读取它，所以并行的多个 VitePress 实例或测试不会互相覆盖 logging 配置。框架无关的直接 logger 用法请使用 `@docs-islands/logger`。

## 什么时候用它

当集成本身正常、但终端或浏览器控制台太吵时，可以用 `logging` 收窄输出范围，尤其适合按 docs-islands 内部子系统聚焦日志。接入初期通常只保留 `warn` 和 `error`；排查问题时，可以打开 `debug`，查看是哪几条规则放行了当前日志，以及 logger 已运行的相对耗时。

## 最小示例

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { hmr } from '@docs-islands/vitepress/logger/presets';

const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn', 'error'],
    plugins: { hmr },
    rules: {
      'hmr/markdownUpdate': 'off',
      'hmr/viteAfterUpdate': {},
    },
  },
});

islands.apply(vitepressConfig);
```

这个配置只保留选中的 docs-islands HMR 日志的 `warn` 和 `error`。`hmr/viteAfterUpdate` 使用预设默认匹配器，`hmr/markdownUpdate` 则被显式关闭。`'off'` 是 `{ enabled: false }` 的简写。

## 判断模型

当没有配置 `logging.rules` 时，logger 使用默认可见级别：

- `debug: false`：输出 `error`、`warn`、`info`、`success`。
- `debug: true`：输出 `error`、`warn`、`info`、`success`、`debug`。

当配置了 `logging.rules` 时，logger 会先展开 plugin 规则，再进入规则模式：

1. 先过滤掉 `enabled: false` 的 rule。它们不参与 scope 匹配、不参与 level 放行，也不会出现在 debug label 中。
2. 每一条 active rule 都会按日志的 `main`、`group`、`message` 做匹配。只要 rule 声明了多个字段，这些字段就必须同时命中。
3. 命中的 rule 使用 `rule.levels ?? logging.levels` 作为自己的 effective levels。若两者都没写，则使用默认非 debug 级别集合。
4. 只要有任意一条命中的 active rule 放行当前 level，日志就会输出。
5. 如果处于规则模式但没有 active rule 命中，则不输出；不会 fallback 到根 `levels`。

多条 rule 可以同时放行同一条日志。它们的可见级别按并集生效，debug label 按 `logging.rules` 中的声明顺序展示。

## 根配置项

| 配置项    | 含义                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `debug`   | 启用诊断输出。可见的 `error`、`warn`、`info`、`success` 日志会带上命中的 label，以及 `12.34ms` 这样的相对耗时后缀。            |
| `levels`  | 根可见级别集合。在规则模式下，它是没有声明 `rule.levels` 的 rule 的默认 effective levels；它不是用来强制收窄所有 rule 的上限。 |
| `plugins` | 可选的预设 plugin 注册表。对象 key 会成为 `logging.rules["<plugin>/<rule>"]` 里的命名空间。                                    |
| `rules`   | 既支持原始规则数组，也支持 plugin 规则对象。它存在且规范化后非空时，日志是否输出只由 active 且命中的 rules 决定。              |

## Plugin 规则

如果你只是想过滤 docs-islands 内部日志，推荐优先使用 `logging.plugins`。

```ts
import { hmr, runtime } from '@docs-islands/vitepress/logger/presets';

const logging = {
  debug: true,
  levels: ['warn'],
  plugins: { hmr, runtime },
  rules: {
    'hmr/viteAfterUpdate': {},
    'runtime/reactDevRender': {
      levels: ['warn', 'error'],
    },
    'runtime/renderValidation': 'off',
  },
};
```

- `plugins` 用来注册 logging 预设 plugin，例如 `hmr`。
- `rules["<plugin>/<rule>"] = {}` 表示启用该预设规则并使用默认匹配器。
- `rules["<plugin>/<rule>"] = 'off'` 表示关闭该预设规则，等价于 `{ enabled: false }`。
- override 对象只允许覆盖 `enabled`、`message`、`levels`；`group` 和 `main` 始终继承 preset matcher。

### 内建日志预设与覆盖范围

`@docs-islands/vitepress/logger/presets` 导出的 preset，本质上是一组内建日志的默认 `main/group` 匹配器。下面这张目录会列出所有 preset、所有 rule，以及它们默认约束到的范围。

<LoggingPresetCatalog
  client:load
  spa:sync-render
  locale="zh"
/>

## 公开 Logger 用法

`@docs-islands/vitepress/logger` 是 VitePress logger facade。它只暴露 `createLogger` 与 `formatDebugMessage`；通用的直接 runtime 配置能力位于 `@docs-islands/logger`。

`logging` 定义的是 logger 的运行时可见性策略。它决定日志在运行时是否输出；在 `debug` 模式下，也会决定可见日志附带哪些规则标签和相对耗时信息。

在 VitePress 构建链里，通过 `createLogger(...)` 创建 logger 且没有显式传入 scope 时，会从注入的 runtime define 解析当前 docs-islands logger scope，所以用户侧日志依然受该 VitePress 实例最终解析出的 `logging` 规则控制。

### Runtime Policy 与 Build-Time Optimization

logger tree-shaking plugin 是一个编译期优化层。它会在构建阶段复用已经解析好的 `logging` 规则，对静态可判定的 logger 调用做裁剪。

这两层相关，但不是同一个概念：

- `logging` 始终定义运行时行为。
- tree-shaking plugin 只处理它能安全静态证明的子集。
- 无法静态分析的日志会继续保留在产物中，并交给 runtime logger 决定是否输出。

所以，“运行时会被 suppress” 不等于 “一定会被编译期删除”。

| 维度                            | `logging`      | logger tree-shaking plugin |
| ------------------------------- | -------------- | -------------------------- |
| 生效阶段                        | 运行时         | 编译期                     |
| 是否决定最终控制台输出          | 是             | 否，runtime 语义仍然是基准 |
| 是否移除 bundle 中的静态文案    | 否             | 是，但仅限受支持的静态子集 |
| 是否复用已解析的 `logging` 规则 | 是             | 是                         |
| 覆盖范围                        | 完整运行时模型 | 静态可判定子集             |
| 无法分析时的退化行为            | 正常运行时匹配 | 保留调用并交给 runtime     |

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.metrics');
const hiddenLogger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.hidden');

const islands = createDocsIslands({
  logging: {
    debug: true,
    rules: [
      {
        label: 'userland-metrics',
        main: '@acme/custom-docs',
        group: 'userland.metrics',
        levels: ['info'],
      },
    ],
  },
});

islands.apply(vitepressConfig);

logger.info('visible userland info');
hiddenLogger.info('suppressed userland info');
```

在这个配置下，`userland.metrics` 会保留输出，而 `userland.hidden` 会被抑制。

### Logger Tree-Shaking Plugin

在 `createDocsIslands()` 管理的构建链里，docs-islands 已经会自动安装 logger tree-shaking transform。

如果你只是想在 VitePress 站点里使用公开 logger，同时又希望拿到生产环境裁剪能力，可以显式安装公开 plugin：

```ts [.vitepress/config.ts]
import { defineConfig } from 'vitepress';
import { loggerTreeShaking } from '@docs-islands/logger/plugin';

export default defineConfig({
  vite: {
    plugins: [
      loggerTreeShaking.vite({
        logging: {
          levels: ['warn', 'error'],
        },
      }),
    ],
  },
});
```

如果省略 `logging`，plugin 会回退到默认 logger 可见性策略，这仍然会裁剪静态可判定的 `debug` 日志。如果你还希望 `createDocsIslands()` 模块图之外的动态日志也遵循同一套策略，则需要额外配置 runtime logger。

### 生产环境 Tree-Shaking

当 tree-shaking transform 生效时，只要某条用户静态日志能够被证明会被已解析的 `logging` 规则抑制，这条日志语句就会从生成的 JavaScript 中移除，因此它的静态 message 文案也不会进入最终 bundle。

如果你希望获得 pruning coverage，推荐使用下面这种直接写法：

```ts
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.metrics');

logger.info('static metric ready');
logger.success('static metric uploaded');
logger.warn('static metric delayed');
logger.error('static metric failed');
logger.debug('static metric details');
```

优化器只分析这个受约束的静态形态：

- `createLogger` 必须是从 `@docs-islands/vitepress/logger` 命名导入的函数。
- `main`、`getLoggerByGroup(...)` 和日志 message 都必须是字符串字面量。
- 日志调用必须是独立语句，例如 `logger.info('message')`。

| 形态                                                               | 是否参与 pruning |
| ------------------------------------------------------------------ | ---------------- |
| `const logger = createLogger({ main: 'x' }).getLoggerByGroup('y')` | 是               |
| `logger.info('msg')` / `warn` / `error` / `success` / `debug`      | 是               |
| 模板字符串、字符串拼接、变量 message、动态 `main`、动态 `group`    | 否               |
| alias、destructuring、reassignment、动态 method 访问               | 否               |
| `const result = logger.info('msg')` 这类非独立表达式               | 否               |

动态日志仍然可用，但会刻意保留给运行时过滤：

```ts
logger.info(`metric ${name}`);
logger.info(`metric ${name}`);
logger.info(message);
createLogger({ main }).getLoggerByGroup(group).info('dynamic binding');
```

这些写法依然兼容可运行，但 docs-islands 不保证它们的 message 文案会从生产产物中消失。pruning coverage 只是 runtime logging coverage 的静态可判定子集，不是它的替代品。

### 通用 Logger 用法

如果需要在 VitePress 管理的构建链之外直接使用 logger，请从框架无关的包导入：

```ts
import { createLogger, setLoggerConfig } from '@docs-islands/logger';

setLoggerConfig({
  levels: ['warn', 'error'],
});

const logger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.metrics');

logger.warn('visible generic warning');
```

不要再把 `@docs-islands/vitepress/logger` 当作通用 logger 入口使用。它只服务于 `createDocsIslands()` 建立的 VitePress 构建模块图。

### 交互式 Scope Probe

下面这个 playground 会直接在当前 docs 站里把两层能力都跑一遍：

- 正常的 `@docs-islands/vitepress/logger` 导入，它会通过 runtime 注入使用当前 `createDocsIslands()` 实例的 logger scope。
- 直接使用 `@docs-islands/logger` 的通用 runtime logger。

<LoggerScopePlayground
  client:load
  spa:sync-render
  locale="zh"
/>

::: warning 复用内建 `main/group` 的影响

如果你的自定义日志故意或无意复用了 docs-islands 内建日志使用的 `main` / `group`，那么它们也可能命中同一批 preset rule 或原始 `logging.rules`：

- 你的用户日志会跟着内建日志一起被放行或一起被抑制。
- `debug` 模式下，它们可能带上和内建日志相同的 rule label，增加排查歧义。
- 后续为了过滤内建日志而调整 preset / rule 时，也可能连带影响用户日志。

除非你就是希望用户日志和内建日志共用同一套过滤空间，否则更推荐使用独立的 `main` 与 `group` 命名，例如 `@acme/custom-docs` + `userland.*`。

:::

## 原始 Rule 字段

当你需要写更底层的 `group` / `message` 匹配，而不是绑定到某个 preset label 时，依然可以继续使用数组形式的 `logging.rules`。

| 字段      | 含义                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `label`   | 必填、稳定的规则标识。开启 `debug` 后，可见日志会以 `[LabelA][LabelB]` 的形式展示真正贡献输出的规则。                        |
| `enabled` | 可选预过滤开关。`false` 表示这条 rule 完全不生效；它不是低优先级 deny rule。                                                 |
| `main`    | 可选包名精确匹配，例如 `@docs-islands/vitepress`。`main` 不使用 glob。                                                       |
| `group`   | 可选 logger group 匹配。普通字符串按精确匹配；包含 glob magic 时使用 `picomatch`，例如 `runtime.react.*` 或 `test.case.?1`。 |
| `message` | 可选消息文本匹配。普通字符串按精确匹配；包含 glob magic 时使用 `picomatch`，例如 `*timeout*`、`request *` 或 `task-[ab]`。   |
| `levels`  | 可选的当前 rule effective levels。它会替代根 `levels`，并和其它命中 rule 的 levels 一起组成并集。                            |

## 匹配示例

原始规则数组仍然适合那种跨 preset 的宽匹配，比如直接按大范围 `group` 前缀或消息文本筛选。

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    debug: true,
    levels: ['warn'],
    rules: [
      {
        label: 'react-runtime-warnings',
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
      },
      {
        label: 'runtime-timeouts',
        group: 'runtime.*',
        message: '*timeout*',
        levels: ['error'],
      },
    ],
  },
});
```

来自 `runtime.react.component-manager` 的 `warn` 会由 `react-runtime-warnings` 放行。包含 `timeout` 的 `error` 会由 `runtime-timeouts` 放行。如果同一条日志同时命中两条 rule，并且当前 level 被它们放行，debug 模式会按声明顺序打印两个 label。

debug 输出示例：

```bash
[react-runtime-warnings][runtime-timeouts] @docs-islands/vitepress[runtime.react.component-manager]: request timeout 12.34ms
```

## 常见模式

### 只保留 React 运行时的告警和错误

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn', 'error'],
    rules: [
      {
        label: 'react-runtime-warn-error',
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
      },
    ],
  },
});
```

### 宽泛规则与具体 message 规则组合

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn'],
    rules: [
      {
        label: 'runtime-warnings',
        group: 'runtime.*',
      },
      {
        label: 'timeout-errors',
        message: '*timeout*',
        levels: ['error'],
      },
    ],
  },
});
```

这会保留 runtime 的 warning，同时额外保留任何包含 `timeout` 的 error。两条 rule 不会互相覆盖，而是一起贡献输出能力。

### 临时关闭一条 rule

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    rules: [
      {
        label: 'runtime-react',
        group: 'runtime.react.*',
        levels: ['warn'],
      },
      {
        label: 'runtime-react-disabled',
        enabled: false,
        group: 'runtime.react.component-manager',
        levels: ['error'],
      },
    ],
  },
});
```

被禁用的 rule 会被完全忽略。它不会静音或覆盖 active 的 `runtime-react` rule，也不会污染 debug label。

### 按消息文本筛选

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    rules: [
      {
        label: 'hydration-timeouts',
        message: '*hydration*timeout*',
        levels: ['warn', 'error'],
      },
    ],
  },
});
```

message 规则适合短时间排查问题，尤其是某个高频 group 里只有少数消息值得关注时。
