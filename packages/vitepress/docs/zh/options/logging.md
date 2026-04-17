# `logging`

`logging` 用来控制 `createDocsIslands()` 产生的包内日志。它不会改变页面渲染逻辑，只决定 `@docs-islands/*` 在 Node 和浏览器里哪些日志可见。

## 什么时候用它

接入初期通常只需要保留 `warn` 和 `error`，把高频日志先压下去。定位问题时，可以临时打开 `debug`，结合规则标签确认是哪一组 logger 命中了当前输出；当某一类 `HMR` 或运行时日志过于频繁时，也可以单独对它做静音。

## 最小示例

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';

const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    debug: true,
    rules: [
      {
        label: 'runtime-react-warn-only',
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
        levels: ['warn', 'error'],
      },
    ],
  },
});

islands.apply(vitepressConfig);
```

这个配置会只保留 `runtime.react.*` 里的 `warn` / `error`。当 `debug` 开启时，日志还会附带命中的规则标签，例如 `[rule:runtime-react-warn-only]`。

## 根配置项

| 配置项   | 含义                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| `debug`  | 控制 `debug` 级别输出。默认关闭。开启后，可见日志会附带命中的规则标签。                                            |
| `levels` | 根级别可见性白名单。省略时默认可见 `error`、`warn`、`info`、`success`。写成 `[]` 表示显式关闭所有非 `debug` 日志。 |
| `rules`  | 有序规则数组，用来局部覆盖根级别策略。                                                                             |

## `rules` 字段

| 字段      | 含义                                                                |
| --------- | ------------------------------------------------------------------- |
| `label`   | 必填、稳定且全局唯一的规则标识。                                    |
| `enabled` | 可选总开关。命中且为 `false` 时，这条规则匹配到的日志会被完全静音。 |
| `main`    | 可选包名精确匹配，例如 `@docs-islands/vitepress`。                  |
| `group`   | 可选 logger group 匹配，支持精确值和 glob，例如 `runtime.react.*`。 |
| `message` | 可选消息文本匹配，使用 glob 语义，例如 `*hydration*`。              |
| `levels`  | 可选级别白名单。它只会在根 `logging.levels` 的基础上继续收窄。      |

## 匹配顺序

::: tip 顺序很重要
`logging.rules` 会按声明顺序检查，最后一个命中的规则生效。更具体的规则应该放在后面。
:::

如果一条规则同时声明了 `main`、`group` 和 `message`，它们必须全部命中。`enabled: false` 会直接静音命中的日志，包括 `debug`；`levels: []` 表示该规则不输出任何非 `debug` 日志，而 `debug` 是否可见始终只由 `logging.debug` 控制。

## 常见模式

### 只保留 React 运行时的告警和错误

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    rules: [
      {
        label: 'react-runtime-warn-error-only',
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
        levels: ['warn', 'error'],
      },
    ],
  },
});
```

### 临时静音一类高频日志

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    rules: [
      {
        label: 'mute-markdown-hmr-noise',
        main: '@docs-islands/vitepress',
        group: 'plugin.hmr.markdown-update',
        enabled: false,
      },
    ],
  },
});
```
