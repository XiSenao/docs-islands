# `@docs-islands/logger`

`@docs-islands/logger` 是 docs-islands 项目的框架无关 logger 包。它的 root 入口刻意保持很小：

```ts
import { createLogger, setLoggerConfig } from '@docs-islands/logger';
```

当代码不处在 VitePress 的 `createDocsIslands()` 受控构建图中时，使用这个入口，例如独立脚本、共享包、示例代码或文档站点工具。

## Runtime 演示

下面的演示会直接从当前 docs 站点导入真实包。选择一个 runtime 配置并运行场景，组件会捕获 `createLogger()` 产生的 console 输出。

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="zh" />

## Runtime API

先创建 main logger，再派生 group logger：

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

`setLoggerConfig()` 会更新默认 runtime scope。页面、测试或脚本需要恢复默认行为时，传入 `null` 即可。

## Tree-Shaking 插件

插件入口位于 `@docs-islands/logger/plugin`：

```ts
import { loggerPlugin } from '@docs-islands/logger/plugin';

export default {
  vite: {
    plugins: [loggerPlugin.vite()],
  },
};
```

当前 docs 站点会在 `docs:build` 阶段使用这个插件。演示组件额外导入了一个静态 debug fixture，因此生产构建会实际经过 compile-time pruning，同时不会影响页面上的 runtime 交互演示。

`loggerPlugin` 默认开启 `treeshake`。在 build 模式下，`treeshake: true` 会让插件删除那些根据已解析 logger 配置可以静态证明为隐藏的 logger 调用。构建产物需要保留所有 logger 调用、只依赖 runtime 过滤时，可以设置 `treeshake: false`：

```ts
import { loggerPlugin } from '@docs-islands/logger/plugin';

export default {
  vite: {
    plugins: [
      loggerPlugin.vite({
        treeshake: false,
      }),
    ],
  },
};
```

插件只删除静态可证明的调用。动态消息、变量 group、alias、解构方法和间接封装都会保留。

## 与 VitePress 入口的边界

通用 runtime logging 使用 `@docs-islands/logger`。只有在 VitePress 受控集成内部，才使用 `@docs-islands/vitepress/logger`，由 `createDocsIslands({ logging })` 管理 logger scope。
