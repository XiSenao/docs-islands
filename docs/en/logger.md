# `@docs-islands/logger`

`@docs-islands/logger` is the framework-agnostic logger package for docs-islands projects. Its root entry is intentionally small:

```ts
import { createLogger, setLoggerConfig } from '@docs-islands/logger';
```

Use it when code is not inside a controlled VitePress `createDocsIslands()` graph, such as standalone scripts, shared packages, examples, or documentation-site utilities.

## Runtime Demo

The demo below imports the real package from this docs site. Pick a runtime config and run the scenario; the component captures the console calls produced by `createLogger()`.

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="en" />

## Runtime API

Create a main logger, then derive a group logger:

```ts
import { createLogger, setLoggerConfig } from '@docs-islands/logger';

setLoggerConfig({
  debug: true,
  levels: ['info', 'warn', 'error'],
});

const logger = createLogger({ main: 'my-package' }).getLoggerByGroup('build');

logger.info('build started', { elapsedTimeMs: 12 });
logger.warn('cache is cold', { elapsedTimeMs: 18 });
logger.debug('debug is visible only when debug is enabled');
```

`setLoggerConfig()` updates the default runtime scope. Pass `null` when a page, test, or script should restore the default behavior.

## Tree-Shaking Plugin

The plugin entry lives under `@docs-islands/logger/plugin`:

```ts
import { loggerTreeShaking } from '@docs-islands/logger/plugin';

export default {
  vite: {
    plugins: [loggerTreeShaking.vite()],
  },
};
```

The docs site uses this plugin during `docs:build`. A small static debug fixture is imported by the demo component, so production builds exercise compile-time pruning without changing the interactive runtime demo.

The plugin only removes statically provable calls. Dynamic messages, variable groups, aliases, destructured methods, and indirect wrappers are kept.

## Boundary With VitePress

Use `@docs-islands/logger` for generic runtime logging. Use `@docs-islands/vitepress/logger` only inside the controlled VitePress integration, where `createDocsIslands({ logging })` owns the logger scope.
