# 快速开始

## 先决条件

- Node.js: ^20.19.0 或 >=22.12.0
- VitePress: ^1.6.3
- React/ReactDOM（可选）: ^18.2.0
- @vitejs/plugin-react-swc（可选）: ^3.9.0

## 安装依赖

::: code-group

```bash [react]
pnpm add -D @docs-islands/vitepress @vitejs/plugin-react-swc
pnpm add react react-dom
```

:::

## 配置 VitePress

1. 在 `VitePress` 配置中集成 `UI` 框架编译支持：

   ::: code-group

   ```ts [react]
   // .vitepress/config.ts
   import { defineConfig } from 'vitepress';
   import vitepressReactRenderingStrategies from '@docs-islands/vitepress/react';

   const vitePressConfig = defineConfig({
     // 你的 VitePress 配置...
   });

   // 向 Vite 配置注入 React 渲染支持与构建期优化
   vitepressReactRenderingStrategies(vitePressConfig);

   export default vitePressConfig;
   ```

   :::

2. 在主题增强中注册框架对应的客户端运行时：

   ::: code-group

   ```ts [react]
   // .vitepress/theme/index.ts
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

## 在 Markdown 中使用 UI 组件

1. 编写 `UI` 组件：

   ::: code-group

   ```tsx [react]
   // components/Landing.tsx
   import { useState } from 'react';

   export default function Landing() {
     return <div>Hello World</div>;
   }
   ```

   :::

2. 在 `Markdown` 中导入 `UI` 组件并使用渲染指令：

   ::: code-group

   ```md [react]
   <script lang="react">
     import Landing from '../components/Landing';
   </script>

   <Landing ssr:only spa:sr title="Hello" />
   ```

   :::

## 渲染指令与行为

### 指令一览

- `ssr:only`（默认）

  - 构建期完成预渲染，仅输出静态 `HTML`，不执行客户端 `Hydration`。
  - 适合静态内容、`SEO` 关键内容，最利于 `FCP`/`LCP`/`SEO`，并避免增加客户端 `JS` 体积。

- `client:load`

  - 先预渲染 `HTML`，随后在客户端立即 `Hydration` 接管交互。
  - 适合首屏关键且需要交互的组件，在弱网环境和低性能设备上以及渲染大型组件时对 TTI 可能存在一定压力。

- `client:visible`

  - 预渲染 `HTML`，组件进入用户可见视口后再完成 `Hydration` 工作。
  - 适合非首屏交互组件（评论区、图表等），脚本默认预加载，非纯惰性。

- `client:only`

  - 仅客户端渲染，无服务器端预渲染。
  - 适合强宿主依赖或非关键、轻量组件。

### 指令速查表

| 指令             | 是否预渲染 HTML | 客户端 Hydration | 触发时机                 | 典型场景                   | `spa:sr` 默认 |
| ---------------- | --------------- | ---------------- | ------------------------ | -------------------------- | ------------- |
| `ssr:only`       | 是              | 否               | N/A                      | 静态/SEO 关键内容          | 开启          |
| `client:load`    | 是              | 立即             | 预加载模块，加载后即水合 | 首屏关键交互组件           | 关闭          |
| `client:visible` | 是              | 可见时           | 预加载；进入视口后水合   | 非首屏交互（评论、图表等） | 关闭          |
| `client:only`    | 否              | 否               | 仅客户端                 | 强宿主依赖或轻量小部件     | 禁用          |

### SPA 同步渲染（`spa:sync-render` / `spa:sr`）

`VitePress` 在 `SPA` 路由切换时，`Vue` 内容同步更新；非 `Vue` 组件（如 `React`）的预渲染 `HTML` 与客户端脚本加载是异步的，在弱网环境和低性能设备上容易造成 **闪烁** 现象。`spa:sr` 通过将目标页面中使用该指令的组件的预渲染输出合并到 `Vue` 的客户端脚本，高优阻塞下载和解析所有使用 `spa:sr` 指令的组件的 `CSS` 模块，同步渲染来消除闪烁现象。

默认规则：

- `client:only` 组件不支持 `spa:sr`。
- 使用 `client:*` 指令的组件默认不开启 `spa:sr`，除非显式(`spa:sr`/`spa:sync-render`)标注。
- 使用 `ssr:only` 的组件（以及无指令组件）默认开启 `spa:sr`，除非显式(`spa:sr:disable`/`spa:sync-render:disable`)标注。

权衡：`spa:sr` 改善切页体验，但会增大切页加载的客户端脚本体积，建议对 **关键渲染组件** 启用。

示例：

```md
<Landing client:load spa:sr title="Home" />
<Hero ssr:only />
<Chart client:visible />
<Widget client:only />
```

包体积提示：体积增加仅发生在 SPA 切页时加载的页面客户端脚本；不影响首屏使用的 `.lean.js`（VitePress 首次渲染用以水合的精简脚本）。

## 约定事项

1. **组件标签命名**

   - 必须以大写字母开头（`PascalCase` 风格），例如 `MyComp`。
   - 标签名必须与同一 `.md` 文件内 `<script lang="react">` 块中的本地导入名完全一致。如果使用了别名导入（如 `import { Landing as HomeLanding } from '...';`），则标签必须写为 `<HomeLanding ... />`。
   - 任何不匹配情况都会在编译时跳过，并输出一条告警。

2. **仅支持自闭合标签**

   - `Markdown` 中的 `React` 组件必须写成自闭合形式：`<Comp ... />`。
   - 非自闭合形式（如 `<Comp>...</Comp>`）会被跳过并输出一条告警。

3. **位置与导入**

   - 组件必须在同一 `Markdown` 页面内的 `<script lang="react">` 块中完成导入，未导入的组件会被忽略。
   - 组件可以在 `Vue` 的插槽/模板中使用（例如在 `<template #default>...</template>` 内部），也会被正确发现并转换。

4. **Props 传递（初始化）**

   - 标签上的所有非策略属性会作为字符串 `props` 传递给 `React` 组件。`Vue` 绑定（如 `:page-title="page.title"`）会先由 `Vue` 求值为 `DOM` 属性，再在 `React` 渲染/水合时转发为 `props`。这是一次性数据传递，非响应式。
   - 不要通过属性传递函数或事件处理（如 `onClick`）；当前不支持跨框架桥接可调用的 `props`/事件。

5. **支持的指令**

   - `client:only`、`client:load`、`client:visible`、`ssr:only`（默认）。
   - `spa:sync-render`（即 `spa:sr`）对 `client:*`(`client:only` 不支持) 默认关闭，对 `ssr:only` 默认开启（除非显式 `spa:sync-render:disable`/`spa:sr:disable`）。

6. **`ssr:only` 使用 Node API 的约束**

   - 仅当组件在单个页面上“仅以 `ssr:only` 形式”渲染时，才能依赖 Node API（例如 `node:fs`）。若同一页面上该组件同时以任意 `client:*` 指令使用，则不得依赖 Node API。
   - 使用 `node:fs` 等环境 API 读取本地文件时，请以 `import.meta.dirname` 作为基础路径来解析目标路径。

   ```ts
   import { readFileSync } from 'node:fs';
   import { join } from 'pathe';

   const targetPath = join(import.meta.dirname, 'local-data.json');
   const data = JSON.parse(readFileSync(targetPath, 'utf8')) as {
     data: unknown;
   };
   ```

> **约束：`<script lang="react">` 里仅支持静态 `ESM import`。初始渲染时的 `props` 为一次性快照，非响应式双向绑定（通过父级 `Vue` 传入的数据只用于初始化）。**

## 排错 / FAQ

- 标签被忽略：确保标签以大写字母开头、名称与本地导入名完全一致，且 `React` 标签必须自闭合。
- 组件未渲染：组件必须在同一 `.md` 内的 `<script lang="react">` 完成导入，且不要放在围栏代码块中。
- 切页闪烁：对首屏关键组件启用 `spa:sr`。
- 水合报错：运行时会回退到客户端渲染；请确保服务端标记与客户端输出一致，避免通过属性传递函数。
- Node API 使用报错：仅在该页面 **纯 `ssr:only`** 渲染时使用，并通过 `import.meta.dirname` 解析路径。
