# `logging`

`logging` 用来控制 `createDocsIslands()` 产生的包内日志。它不会改变渲染逻辑，只决定 `@docs-islands/*` 在 Node 和浏览器里哪些消息可见。

## 什么时候用它

当集成本身正常、但终端或浏览器控制台太吵时，可以用 `logging` 收窄输出范围。接入初期通常只保留 `warn` 和 `error`；排查问题时，可以打开 `debug`，查看是哪几条规则放行了当前日志，以及 logger 已运行的相对耗时。

## 最小示例

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';

const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn', 'error'],
    rules: [
      {
        label: 'runtime-react',
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
      },
    ],
  },
});

islands.apply(vitepressConfig);
```

这个配置只保留 `@docs-islands/vitepress` 中 `group` 匹配 `runtime.react.*` 的 `warn` 和 `error`。一旦配置了 `rules`，其它 group 不会再回退到根 `levels` 输出。

## 判断模型

当没有配置 `logging.rules` 时，logger 使用默认可见级别：

- `debug: false`：输出 `error`、`warn`、`info`、`success`。
- `debug: true`：输出 `error`、`warn`、`info`、`success`、`debug`。

当配置了 `logging.rules` 时，logger 进入规则模式：

1. 先过滤掉 `enabled: false` 的 rule。它们不参与 scope 匹配、不参与 level 放行，也不会出现在 debug label 中。
2. 每一条 active rule 都会按日志的 `main`、`group`、`message` 做匹配。只要 rule 声明了多个字段，这些字段就必须同时命中。
3. 命中的 rule 使用 `rule.levels ?? logging.levels` 作为自己的 effective levels。若两者都没写，则使用默认非 debug 级别集合。
4. 只要有任意一条命中的 active rule 放行当前 level，日志就会输出。
5. 如果处于规则模式但没有 active rule 命中，则不输出；不会 fallback 到根 `levels`。

多条 rule 可以同时放行同一条日志。它们的可见级别按并集生效，debug label 按 `logging.rules` 中的声明顺序展示。

## 根配置项

| 配置项   | 含义                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `debug`  | 启用诊断输出。可见的 `error`、`warn`、`info`、`success` 日志会带上命中的 label，以及 `12.34ms` 这样的相对耗时后缀。            |
| `levels` | 根可见级别集合。在规则模式下，它是没有声明 `rule.levels` 的 rule 的默认 effective levels；它不是用来强制收窄所有 rule 的上限。 |
| `rules`  | 聚焦规则数组。当它存在且规范化后非空时，日志是否输出只由 active 且命中的 rules 决定。                                          |

## Rule 字段

| 字段      | 含义                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `label`   | 必填、稳定的规则标识。开启 `debug` 后，可见日志会以 `[LabelA][LabelB]` 的形式展示真正贡献输出的规则。                        |
| `enabled` | 可选预过滤开关。`false` 表示这条 rule 完全不生效；它不是低优先级 deny rule。                                                 |
| `main`    | 可选包名精确匹配，例如 `@docs-islands/vitepress`。`main` 不使用 glob。                                                       |
| `group`   | 可选 logger group 匹配。普通字符串按精确匹配；包含 glob magic 时使用 `picomatch`，例如 `runtime.react.*` 或 `test.case.?1`。 |
| `message` | 可选消息文本匹配。普通字符串按精确匹配；包含 glob magic 时使用 `picomatch`，例如 `*timeout*`、`request *` 或 `task-[ab]`。   |
| `levels`  | 可选的当前 rule effective levels。它会替代根 `levels`，并和其它命中 rule 的 levels 一起组成并集。                            |

## 匹配示例

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
