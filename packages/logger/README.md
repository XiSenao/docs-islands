# @docs-islands/logger

<p align="center">
  <a href="https://npmjs.com/package/@docs-islands/logger"><img src="https://img.shields.io/npm/v/@docs-islands/logger.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/@docs-islands/logger.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://github.com/XiSenao/docs-islands/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@docs-islands/logger.svg" alt="license"></a>
</p>

English | [简体中文](./README.zh-CN.md)

Framework-agnostic runtime logging and build-time pruning for docs-islands packages and userland tooling. It gives Node.js and browser code one small logging API, a predictable runtime visibility policy, and an optional bundler plugin that removes statically suppressed log calls from production output.

## Features

- **Tiny public runtime API**: import `createLogger` and `setLoggerConfig` from `@docs-islands/logger`.
- **Node.js and browser output**: uses colored terminal output when available and styled browser console output in web runtimes.
- **Scoped log groups**: organize messages by package `main` and lowercase dot-namespace groups such as `build.pipeline`.
- **Configurable visibility**: allow `error`, `warn`, `info`, and `success` globally or by focused rules.
- **Debug diagnostics**: enable debug output for simple configs, and add rule labels plus elapsed timing metadata to visible rule-based logs.
- **Production pruning**: `loggerPlugin` removes supported static log calls that the resolved config suppresses.
- **Bundler coverage through unplugin**: supports Vite, Rollup, Rolldown, esbuild, webpack, Rspack, and Farm.
- **TypeScript first**: ships ESM and TypeScript declarations through package exports.

## Installation

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

Requirements:

- Node.js `^20.19.0 || >=22.12.0`
- ESM-compatible runtime or bundler
- Optional peer packages for the bundler plugin you use, for example `@rollup/plugin-replace` with Rollup and `rolldown` with Rolldown

## Quick Start

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

`createLogger({ main })` identifies the package or subsystem that owns the log stream. `getLoggerByGroup(group)` identifies a narrower area inside that stream. Group names must use lowercase dot namespaces without package identifiers, for example `runtime.react` or `build.pipeline`.

If you use the runtime without `loggerPlugin` or an explicit `setLoggerConfig(...)` call, the package prints a one-time warning and falls back to its default visibility.

## Runtime Configuration

The default visibility set is `error`, `warn`, `info`, and `success`. `debug` logs are hidden unless `debug: true` is enabled in a simple, non-rule config.

```ts
setLoggerConfig({
  levels: ['warn', 'error'],
});
```

Pass `null` or `undefined` to clear the default runtime config:

```ts
setLoggerConfig(null);
```

### Rule Mode

Rules make logging an allowlist. When at least one active rule exists, a log is visible only when a matching rule allows its level. There is no fallback to root `levels` for unmatched logs.

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

Rule fields:

| Field     | Description                                                                 |
| --------- | --------------------------------------------------------------------------- |
| `label`   | Required unique label. In debug mode, visible rule-based logs include it.   |
| `enabled` | Set to `false` to keep a rule declared but inactive.                        |
| `main`    | Exact package or subsystem match.                                           |
| `group`   | Exact match by default, or a glob pattern when glob characters are present. |
| `message` | Exact match by default, or a glob pattern when glob characters are present. |
| `levels`  | Allowed non-debug levels for this rule.                                     |

`levels` accepts `error`, `warn`, `info`, and `success`. `debug` is controlled by `debug: true`, not by `levels`.

## Bundler Plugin

Use `@docs-islands/logger/plugin` when you want bundler-injected runtime config and production tree-shaking.

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

The plugin exposes unplugin adapters:

```ts
loggerPlugin.vite(options);
loggerPlugin.rollup(options);
loggerPlugin.rolldown(options);
loggerPlugin.esbuild(options);
loggerPlugin.webpack(options);
loggerPlugin.rspack(options);
loggerPlugin.farm(options);
```

Plugin options:

| Option      | Description                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `config`    | Runtime `LoggerConfig` injected into the bundle. Omit it to use the default visibility policy. |
| `treeshake` | Defaults to `true`. Set `false` to keep all logger calls and rely only on runtime filtering.   |

Rollup hosts must install `@rollup/plugin-replace` before using `loggerPlugin.rollup(...)`. The logger plugin prepends Rollup's replace plugin to inline the logger control constants, including `__DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__` and `__DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__`, so the bundle receives the same serialized runtime config that other bundlers inject through their `define` hooks.

When `loggerPlugin` controls a runtime, calling `setLoggerConfig(...)` from application code throws. Update the plugin `config` instead so build-time pruning and runtime filtering share the same policy.

### Tree-Shaking Coverage

Tree-shaking is deliberately conservative. The runtime policy is always canonical; the plugin only removes calls it can prove safe.

Supported static shape:

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

Kept for runtime filtering:

- dynamic `main`, `group`, or message values
- aliased `createLogger` imports
- reassigned logger bindings
- destructured methods
- computed method access
- non-standalone expressions such as assigning the result of a log call

## API

Root entry:

```ts
import { createLogger, setLoggerConfig } from '@docs-islands/logger';
```

| API               | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `createLogger()`  | Creates or reuses a main logger. Call `.getLoggerByGroup(group)` to log. |
| `setLoggerConfig` | Sets or clears the default runtime config for direct non-plugin usage.   |

Plugin entry:

```ts
import { loggerPlugin } from '@docs-islands/logger/plugin';
```

Advanced runtime entry:

```ts
import type { LoggerConfig } from '@docs-islands/logger/runtime';
import { createElapsedLogOptions } from '@docs-islands/logger/runtime';
```

Prefer the root entry for application code. Use `@docs-islands/logger/runtime` only when you need explicit scope helpers, normalization utilities, or exported runtime types.

## Documentation

- [Logger guide](https://docs.senao.me/docs-islands/logger)
- [VitePress logging integration](https://docs.senao.me/docs-islands/vitepress/options/logging)
- [Changelog](./CHANGELOG.md)

## Contributing

Contributions are welcome. From the repository root:

```sh
pnpm --filter @docs-islands/logger test
pnpm --filter @docs-islands/logger typecheck
pnpm --filter @docs-islands/logger lint:package
```

Please read the [Contributing Guide](https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.md) before opening a pull request.

## License

MIT © [XiSenao](https://github.com/XiSenao)
