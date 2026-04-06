# 快速上手

## 先决条件

- Node.js: `^20.19.0` 或 `>=22.12.0`
- VitePress: `^1.6.3`
- React / ReactDOM: `^18.2.0`
- `@vitejs/plugin-react-swc`: `^3.9.0`

## 安装依赖

::: code-group

```bash [pnpm]
pnpm add -D @docs-islands/vitepress @vitejs/plugin-react-swc
pnpm add react react-dom
```

:::

## 配置 VitePress

1. 在 `.vitepress/config.ts` 中接入 `vitepressReactRenderingStrategies()`：

   ::: code-group

   ```ts [react]
   import { defineConfig } from 'vitepress';
   import vitepressReactRenderingStrategies from '@docs-islands/vitepress/react';

   const vitepressConfig = defineConfig({
     // 你的 VitePress 配置
   });

   vitepressReactRenderingStrategies(vitepressConfig);

   export default vitepressConfig;
   ```

   :::

2. 在主题增强中注册客户端运行时：

   ::: code-group

   ```ts [react]
   import DefaultTheme from 'vitepress/theme';
   import reactClientIntegration from '@docs-islands/vitepress/react/client';
   import type { Theme } from 'vitepress';

   const theme: Theme = {
     extends: DefaultTheme,
     async enhanceApp() {
       await reactClientIntegration();
     },
   };

   export default theme;
   ```

   :::

## 在 Markdown 中渲染第一个 React 组件

先准备一个组件：

::: code-group

```tsx [components/Landing.tsx]
export default function Landing() {
  return <div>Hello Docs Islands</div>;
}
```

:::

然后在 Markdown 中导入并使用它：

::: code-group

```md [guide/getting-started.md]
<script lang="react">
  import Landing from '../components/Landing';
</script>

<Landing ssr:only title="Hello" />
```

:::

如果你没有写渲染指令，默认行为等价于 `ssr:only`。不同指令的差异、默认规则和 `spa:sr` 的取舍，请继续看 [工作原理](./how-it-works.md)。

## 推荐的第一条接入路径

如果你是第一次接入，建议按这个顺序推进：

1. 先让组件以 `ssr:only` 跑通，确保 Markdown 导入、构建和静态输出正确。
2. 再判断这个组件是否真的需要交互。
3. 如果需要首屏立即可操作，改为 `client:load`。
4. 如果组件位于首屏之外，优先考虑 `client:visible`。
5. 只有当浏览器宿主依赖很强、无法安全预渲染时，再使用 `client:only`。

这样做的好处是，你能先确认“集成链路是否正确”，再去增加 hydration 和运行时复杂度。

## 首次接入后的验证清单

接入完成后，建议至少检查以下几件事：

- 页面能正常构建，且 Markdown 中的组件标签没有被忽略。
- 组件在无交互时可以先稳定用 `ssr:only` 输出。
- 切换到带交互的策略后，没有立即出现 hydration mismatch。
- 修改 React 组件源码时，开发态 HMR 行为符合预期。
- 如果组件依赖本地文件或 Node API，确认它只在当前页面以纯 `ssr:only` 方式使用。

## 可选：启用 Site Debug Console

如果你希望尽早拥有一个可视化排障入口，可以在主题布局中挂载 `Site Debug Console`：

```vue
<!-- .vitepress/theme/components/EnhanceLayout.vue -->
<script setup lang="ts">
import SiteDebugConsole from '@docs-islands/vitepress/debug-console/client';
import '@docs-islands/vitepress/debug-console/client/style.css';
import DefaultTheme from 'vitepress/theme';
</script>

<template>
  <DefaultTheme.Layout />
  <SiteDebugConsole />
</template>
```

启用后可以通过以下方式打开：

- 使用 `?site-debug=1` 临时强制开启，`?site-debug=0` 临时强制关闭。
- 状态会被持久化，后续访问会沿用最近一次选择。
- 在当前文档站中，还可以连续点击左上角 `logo` 3 次来切换开启状态。

第一轮排查建议按这个顺序进行：

1. 先点出问题组件的浮层徽标。
2. 如果怀疑问题和 `JS`、`CSS` 或静态资源体积有关，打开 `Bundle Composition`。
3. 如果需要抓取页面级快照，就看 `Debug Logs`，或直接调用控制台辅助对象。

浏览器控制台可直接调用：

```js
globalThis.__DOCS_ISLANDS_SITE_DEBUG__.getRenderMetrics();
globalThis.__DOCS_ISLANDS_SITE_DEBUG__.getHmrMetrics();
globalThis.__DOCS_ISLANDS_SITE_DEBUG__.snapshotRuntime();
```

如果你只想尽快上手控制台本身，请继续看 [站点调试快速上手](../site-debug-console/getting-started.md)。如果你还想启用构建期 AI 报告，请继续看 [分析配置](../site-debug-console/options/analysis.md)。

## 接下来建议阅读

- [工作原理](./how-it-works.md)：理解策略矩阵、`spa:sync-render` 与 Markdown 约束。
- [站点调试快速上手](../site-debug-console/getting-started.md)：查看控制台接入、开启方式与排障流程。
- [产物分析](../site-debug-console/options/build-reports.md)：查看 AI 报告的 cache、`resolvePage` 和模型配置。

## 排错 / FAQ

- 标签被忽略：确认标签名以大写字母开头，并且与同一页面 `<script lang="react">` 中的本地导入名完全一致。
- 组件未渲染：组件必须在同一 `.md` 文件里导入，且不能写在围栏代码块中。
- 切页闪烁：优先检查是否应该为关键组件启用 `spa:sr`。
- 水合报错：运行时会回退到客户端渲染；请确认服务端输出与客户端输出一致，并避免通过属性传递函数。
- Node API 使用报错：只有当该组件在当前页面上纯 `ssr:only` 渲染时，才能依赖 `node:fs` 之类的 Node API。
- 不确定该选哪种策略：优先让组件先静态可用，再按“是否首屏交互”“是否依赖浏览器 API”逐步升级。
