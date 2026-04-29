# @docs-islands/logger

<p align="center">
  <a href="https://npmjs.com/package/@docs-islands/logger"><img src="https://img.shields.io/npm/v/@docs-islands/logger.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/@docs-islands/logger.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://github.com/XiSenao/docs-islands/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@docs-islands/logger.svg" alt="license"></a>
</p>

[English](./README.md) | 简体中文

面向 docs-islands 包和用户工具的框架无关 logger：提供统一的 Node.js / 浏览器运行时日志 API、可预测的可见性策略，以及可选的构建期插件，用来从生产产物中移除静态可判定为隐藏的日志调用。

## 特性

- **精简公共 API**：从 `@docs-islands/logger` 导入 `createLogger` 和 `setLoggerConfig` 即可。
- **同时支持 Node.js 与浏览器**：终端环境尽量使用彩色输出，浏览器环境使用 styled console 输出。
- **分组日志流**：用 package `main` 和小写点分命名空间 group 组织日志，例如 `build.pipeline`。
- **可配置可见性**：全局或按规则控制 `error`、`warn`、`info`、`success`。
- **Debug 诊断**：简单配置下可开启 debug 输出；规则模式下会给可见日志附加命中规则 label 与 elapsed timing 信息。
- **生产环境裁剪**：`loggerPlugin` 会移除被配置隐藏、且能静态证明安全的日志调用。
- **基于 unplugin 的构建工具覆盖**：支持 Vite、Rollup、Rolldown、esbuild、webpack、Rspack 与 Farm。
- **TypeScript 优先**：通过 package exports 提供 ESM 与 TypeScript 类型。

## 安装

```sh
pnpm add @docs-islands/logger
```

```sh
npm install @docs-islands/logger
```

```sh
yarn add @docs-islands/logger
```

```sh
bun add @docs-islands/logger
```

环境要求：

- Node.js `^20.19.0 || >=22.12.0`
- 支持 ESM 的运行时或构建工具
- 根据使用的构建插件安装对应的可选 peer dependency，例如 Rollup 需要 `@rollup/plugin-replace`，Rolldown 需要 `rolldown`

## 快速开始

```ts
import { createLogger, setLoggerConfig } from '@docs-islands/logger';

setLoggerConfig({
  debug: true,
  levels: ['info', 'warn', 'error'],
});

const logger = createLogger({
  main: '@acme/docs',
}).getLoggerByGroup('build.pipeline');

logger.info('build started', { elapsedTimeMs: 12.34 });
logger.success('build finished', { elapsedTimeMs: 42.8 });
logger.warn('cache is cold');
logger.error('build failed');
logger.debug('debug details');
```

`createLogger({ main })` 用来标识日志流所属的包或子系统。`getLoggerByGroup(group)` 用来标识更细的功能区域。group 必须使用小写点分命名空间，且不能带 package 标识，例如 `runtime.react` 或 `build.pipeline`。

如果没有使用 `loggerPlugin`，也没有在创建 logger 前调用 `setLoggerConfig(...)`，运行时会回退到默认可见性策略。

## Runtime 配置

默认可见级别是 `error`、`warn`、`info` 和 `success`。`debug` 日志默认隐藏；只有在没有配置规则的简单模式下设置 `debug: true`，`debug` 日志才会显示。

```ts
setLoggerConfig({
  levels: ['warn', 'error'],
});
```

传入 `null` 或 `undefined` 可以清空默认 runtime 配置：

```ts
setLoggerConfig(null);
```

### 规则模式

规则会把日志策略切换成 allowlist。只要存在至少一个 active rule，日志就必须命中某条规则，并且该规则允许当前级别，才会输出。未命中的日志不会回退到 root `levels`。

```ts
setLoggerConfig({
  debug: true,
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'metrics',
      main: '@acme/docs',
      group: 'userland.metrics',
      levels: ['info', 'warn'],
    },
    {
      enabled: false,
      label: 'noisy-devtools',
      group: 'devtools.*',
    },
  ],
});
```

规则字段：

| 字段      | 说明                                                         |
| --------- | ------------------------------------------------------------ |
| `label`   | 必填且必须唯一。debug 模式下，可见的规则日志会显示该 label。 |
| `enabled` | 设置为 `false` 后，规则保留但不参与匹配。                    |
| `main`    | 精确匹配 package 或子系统。                                  |
| `group`   | 默认精确匹配；包含 glob 字符时按 glob pattern 匹配。         |
| `message` | 默认精确匹配；包含 glob 字符时按 glob pattern 匹配。         |
| `levels`  | 当前规则允许的非 debug 级别。                                |

`levels` 只接受 `error`、`warn`、`info` 和 `success`。`debug` 由 `debug: true` 控制，不放进 `levels`。

## 构建插件

当你需要由构建工具注入 runtime config，并在生产构建中做日志裁剪时，使用 `@docs-islands/logger/plugin`。

```ts
import { defineConfig } from 'vite';
import { loggerPlugin } from '@docs-islands/logger/plugin';

export default defineConfig({
  plugins: [
    loggerPlugin.vite({
      config: {
        levels: ['warn', 'error'],
      },
    }),
  ],
});
```

插件提供 unplugin adapter：

```ts
loggerPlugin.vite(options);
loggerPlugin.rollup(options);
loggerPlugin.rolldown(options);
loggerPlugin.esbuild(options);
loggerPlugin.webpack(options);
loggerPlugin.rspack(options);
loggerPlugin.farm(options);
```

插件选项：

| 选项        | 说明                                                                    |
| ----------- | ----------------------------------------------------------------------- |
| `config`    | 注入 bundle 的 runtime `LoggerConfig`。省略时使用默认可见性策略。       |
| `treeshake` | 默认为 `true`。设置为 `false` 后保留所有日志调用，只依赖 runtime 过滤。 |

Rollup 宿主 bundler 在使用 `loggerPlugin.rollup(...)` 前，需要主动安装 `@rollup/plugin-replace`。logger plugin 会把 Rollup 的 replace plugin 插到插件链前面，用它内联 logger 控制常量，包括 `__DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__` 和 `__DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__`，让 Rollup bundle 拿到与其他 bundler 通过 `define` hook 注入时相同的序列化 runtime config。

当 runtime 由 `loggerPlugin` 接管时，应用代码里调用 `setLoggerConfig(...)` 会抛错。请改为更新插件的 `config`，这样构建期裁剪与 runtime 过滤会共享同一套策略。

### Tree-Shaking 范围

Tree-shaking 会保持保守。runtime 策略永远是最终依据；插件只会移除能够证明安全的调用。

支持裁剪的静态写法：

```ts
import { createLogger } from '@docs-islands/logger';

const logger = createLogger({
  main: '@acme/docs',
}).getLoggerByGroup('userland.metrics');

logger.info('static metric ready');
logger.warn('static metric delayed');
logger.error('static metric failed');
logger.success('static metric uploaded');
logger.debug('static metric details');
```

以下写法会保留，并交给 runtime 过滤：

- 动态的 `main`、`group` 或 message
- 给 `createLogger` 起别名的 import
- 被重新赋值的 logger binding
- 解构出的日志方法
- computed method access
- 非独立表达式，例如把日志调用结果赋值给变量

## API

Root 入口：

```ts
import { createLogger, setLoggerConfig } from '@docs-islands/logger';
```

| API               | 说明                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| `createLogger()`  | 创建或复用 main logger。继续调用 `.getLoggerByGroup(group)` 后写日志。 |
| `setLoggerConfig` | 为直接、非插件用法设置或清空默认 runtime config。                      |

插件入口：

```ts
import { loggerPlugin } from '@docs-islands/logger/plugin';
```

高级类型与 helper 入口：

```ts
import type { LoggerConfig } from '@docs-islands/logger/types';
import { createElapsedLogOptions } from '@docs-islands/logger/helper';
import { createLoggerScopeId } from '@docs-islands/logger/core/helper';
```

应用代码优先使用 root 入口。共享的格式化、elapsed-time、error/debug-message 工具从 `@docs-islands/logger/helper` 导入；scoped logger helper 工具从 `@docs-islands/logger/core/helper` 导入。

## 文档

- [Logger 指南](https://docs.senao.me/docs-islands/zh/logger)
- [VitePress logging 集成](https://docs.senao.me/docs-islands/zh/vitepress/options/logging)
- [变更日志](./CHANGELOG.md)

## 贡献

欢迎贡献。从仓库根目录运行：

```sh
pnpm --filter @docs-islands/logger test
pnpm --filter @docs-islands/logger typecheck
pnpm --filter @docs-islands/logger lint:package
```

提交 PR 前，请阅读 [贡献指南](https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.zh-CN.md)。

## 许可证

MIT © [XiSenao](https://github.com/XiSenao)
