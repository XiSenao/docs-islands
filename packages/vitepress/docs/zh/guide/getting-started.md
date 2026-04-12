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

## 在 Markdown 中渲染第一个孤岛组件

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

如果你没有写渲染指令，默认行为等价于 `ssr:only`。

## 首次接入后的验证清单

接入完成后，建议至少检查以下几件事：

- 页面能正常构建，且 Markdown 中的组件标签没有被忽略。
- 组件在无交互时可以先稳定用 `ssr:only` 输出。
- 切换到带交互的策略后，没有立即出现 hydration mismatch。
- 修改孤岛组件源码时，开发态 HMR 行为符合预期。
- 如果组件存在特殊运行时约束，请在扩展使用范围前先看一遍 [最佳实践](./best-practices.md)。

## 延伸阅读

- [工作原理](./how-it-works.md)：理解注入链路、运行阶段、策略行为和 `spa:sync-render`。
- [最佳实践](./best-practices.md)：查看 Markdown 写法规则、策略选择建议、注意事项和快速排错。
- [站点调试快速上手](../site-debug-console/getting-started.md)：查看控制台接入与首轮排障流程。
