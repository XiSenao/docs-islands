# 快速上手

以下步骤用于将 `Site Debug Console` 接入项目，并建立首轮排障流程。如果还需要启用构建期 AI 报告，也可以在同一次接入中完成 `siteDebug` 配置。

## 1. 在主题里挂载控制台

推荐把控制台组件挂在主题布局里，并在 `.vitepress/theme/index.ts` 里显式引入样式：

```ts
// .vitepress/theme/index.ts
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import SiteDebugLayout from './components/SiteDebugLayout.vue';
import '@docs-islands/vitepress/debug-console/client/style.css';
// 可选：仅在安装了 vue-json-pretty 时引入。
import 'vue-json-pretty/lib/styles.css';

export default {
  extends: DefaultTheme,
  Layout: SiteDebugLayout,
} satisfies Theme;
```

```vue
<!-- .vitepress/theme/components/SiteDebugLayout.vue -->
<script setup lang="ts">
import SiteDebugConsole from '@docs-islands/vitepress/debug-console/client';
import DefaultTheme from 'vitepress/theme';
</script>

<template>
  <DefaultTheme.Layout />
  <SiteDebugConsole />
</template>
```

`vue-json-pretty/lib/styles.css` 只需要在你安装了可选增强依赖 `vue-json-pretty` 时再引入。`Site Debug Console` 不再自动注入这份样式，因此把它放在主题入口里手动声明会更直观，也更符合宿主项目对样式依赖的管理方式。

接入后，运行时就具备了页面浮层与 `Debug Logs` 面板能力。即使你还没有配置 AI 分析，这部分运行时调试也已经可用。

## 2. 开启调试模式

你可以通过三种方式开启：

- 使用 `?site-debug=1` 强制开启，`?site-debug=0` 强制关闭。
- 开启状态会被持久化，后续访问默认沿用最近一次选择。
- 当前文档站支持连续点击左上角 `logo` 3 次切换开启状态。

## 3. 用第一轮排障流程建立感觉

建议第一次就按固定顺序使用：

1. 先点页面上可疑组件的浮层徽标。
2. 如果你怀疑问题与 `JS`、`CSS`、静态资源或 chunk 组成有关，继续看 `Bundle Composition`。
3. 如果问题已经影响整页，或者你需要留痕，切到 `Debug Logs`。
4. 需要给其他人共享时，复制 `snapshotRuntime()` 返回值或调试日志条目。

这样你能先从“组件症状”进入，再逐步走到“页面级证据”。

## 4. 浏览器控制台辅助对象

浏览器控制台里可以直接访问：

```js
globalThis.__DOCS_ISLANDS_SITE_DEBUG__.getRenderMetrics();
globalThis.__DOCS_ISLANDS_SITE_DEBUG__.getHmrMetrics();
globalThis.__DOCS_ISLANDS_SITE_DEBUG__.snapshotRuntime();
```

如果你只是想快速确认当前页面到底记录了什么，这是最直接的入口。

## 5. `siteDebug` 配置入口

`siteDebug` 是 `vitepressReactRenderingStrategies()` 的文档化入口配置。它本身不负责渲染组件，而是为 `Site Debug Console` 及其构建期 AI 报告能力提供配置挂载点。

你可以把它写在第二个参数里：

```ts
import { defineConfig } from 'vitepress';
import vitepressReactRenderingStrategies from '@docs-islands/vitepress/react';

const vitepressConfig = defineConfig({});

vitepressReactRenderingStrategies(vitepressConfig, {
  siteDebug: {
    analysis: {
      // ...
    },
  },
});
```

也可以先在 `vitepressConfig.siteDebug` 上声明，再让插件读取：

```ts
const vitepressConfig = defineConfig({
  siteDebug: {
    analysis: {
      // ...
    },
  },
});

vitepressReactRenderingStrategies(vitepressConfig);
```

## 6. 与 `vitepressConfig.siteDebug` 的关系

插件会先读取 `vitepressConfig.siteDebug`，再把第二个参数里的 `siteDebug` 合并进去。因此：

- 你可以把默认配置放在 `vitepressConfig.siteDebug`。
- 也可以在 `vitepressReactRenderingStrategies()` 的第二个参数里做覆盖或补充。
- `analysis` 分支会按对象层级继续合并。
- 当你显式提供 `providers.doubao` 或 `buildReports` 时，该分支会以你提供的新值为准。

## 7. 什么时候需要进一步配置它

- 只想挂运行时控制台：不一定需要写 `siteDebug`，把客户端控制台组件挂到主题里即可。
- 想在控制台里消费构建期 AI 报告：需要配置 `siteDebug.analysis`。
- 想控制 provider、模型、缓存、页面范围：继续配置 `analysis.providers` 和 `analysis.buildReports`。

## 8. 推荐的渐进接入方式

- 第一步：先只挂运行时控制台，确认页面浮层与 `Debug Logs` 可以正常工作。
- 第二步：只给一个 provider 和一个 model 跑通 `analysis`。
- 第三步：通过 `buildReports.resolvePage` 把范围收窄到少数关键页面。
- 第四步：确认报告质量稳定后，再逐步扩大页面范围或打开更细的 `includeChunks` / `includeModules`。

这样做可以避免一开始就把模型调用、缓存和页面范围同时拉满。

## 延伸阅读

- [介绍](./index.md)：理解控制台整体价值与证据链。
- [分析](./options/analysis.md)：查看 `siteDebug.analysis` 的职责边界。
- [模型接入](./options/models.md)：配置 provider instance 与 model 选择。
- [产物分析](./options/build-reports.md)：查看 cache、`resolvePage` 与页面范围控制。
