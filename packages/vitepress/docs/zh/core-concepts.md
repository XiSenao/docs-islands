# VitePress 跨框架渲染策略

## 概述

<Landing client:load spa:sync-render />

[`@docs-islands/vitepress`](https://www.npmjs.com/package/@docs-islands/vitepress) 库为 `vitepress` 静态站点生成器提供跨框架组件渲染能力，突破了 `vitepress` 原生仅支持 `vue` 组件的限制。

> **现阶段仅扩展支持 `react` 组件渲染，未来将支持其他主流 `UI` 框架(例如 `solid`、`svelte`、`preact`、`angular` 等)渲染支持。**

### 技术架构说明

本库受 [`astro`](https://docs.astro.build/) 的 [孤岛架构（Islands Architecture）](https://docs.astro.build/en/concepts/islands/) 设计启发，在 `vitepress` 的 `SSG`（静态站点生成）基础上实现跨框架组件集成。

**架构核心特点：**

- **静态优先**：基于 `vitepress` 的 `SSG` 架构，构建时完成组件预渲染。
- **选择性 `hydration`**：仅对需要交互的组件进行客户端激活。
- **框架隔离**：各框架组件独立运行，每个组件容器独立完成 `hydration`，避免全局状态冲突。
- **渐进增强**：优先考虑静态内容，通过不同渲染策略逐步增强为交互式应用。

### 功能特性

- **跨框架支持**: 目前在 `vitepress` 中原生支持 `react` 组件渲染，未来扩展至其他主流框架。
- **多样化渲染策略**: 参照 `astro` 的 [模板指令](https://docs.astro.build/en/reference/directives-reference/)。客户端指令目前支持了 [`client:only`](https://docs.astro.build/en/reference/directives-reference/#clientonly)、[`client:load`](https://docs.astro.build/en/reference/directives-reference/#clientload)、[`client:visible`](https://docs.astro.build/en/reference/directives-reference/#clientvisible) 三种渲染模式，默认情况下采用 `ssr:only` 渲染模式。
- **SPA 路由优化**: `spa:sync-render`(简写 `spa:sr`) 指令优化 `SPA` 路由切换性能。
- **单向数据传递**: 支持在组件首次渲染时，由 `vue` 向 `react` 容器传递 `props`，用于初始化 `react` 组件。此为一次性传递，非响应式绑定。
- **开发体验**: 完整的 `HMR` 支持，提供流畅的开发体验。
- **环境一致性**: 开发与生产环境保持一致的渲染策略，避免开发与生产环境不一致导致的渲染问题。
- **支持 `MPA` 模式**: 完全兼容 `vitepress` 的 [`MPA`](https://vitepress.dev/guide/mpa-mode#mpa-mode) 模式。即使在 `MPA` 模式下，`react` 组件的渲染和 `hydration` 也能正常工作。

#### spa:sync-render 指令的设计初衷

`vitepress` 是一个 `SSG` 应用，在构建阶段完成页面的预渲染工作，同时客户端路由是受控的。首次页面渲染会完成客户端注水(过滤静态节点)工作，当路由发生变更，`vitepress` 会加载目标路由页面所依赖的客户端脚本，完成局部客户端渲染工作，这是典型的 `SSG` 应用的架构。

默认情况下，[`@docs-islands/vitepress`](https://www.npmjs.com/package/@docs-islands/vitepress) 会将目标页面中所有需预渲染组件(非 `vue` 组件)均集成到单独的脚本中(`ssr-inject-code.[ContentHash].js`)，路由切换时会预加载该脚本，等待 `vue` 渲染完主要内容后再将预渲染产物注入到对应的渲染容器节点下。若组件需要注水，则继续加载客户端脚本并完成客户端注水工作。这样确保了路由切换时组件渲染行为的连贯性，但存在很典型的一个问题，<mark>**切换路由场景下无法发挥预渲染的性能优势和存在组件渲染闪烁问题**</mark>。

**下述演示环境在 `CPU: 20x slowdown`、`0.75` 倍速播放：**

![spa:sync-render:disable](/spa-sync-render-disable-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-disable-video.mp4" type="video/mp4">
</video>

从视频中可以看出，主要区域更新时 `Layout shift score` 值分为两部分：

1. **文本内容偏移产生的 `Layout shift score` 值：`0.1486`。**
2. **资源加载偏移产生的 `Layout shift score` 值：`0.0010`。**

文本内容 `Layout shift score` 已经达到 `Chrome` 约定的 [**需要改善**](https://web.dev/articles/cls?utm_source=devtools&utm_campaign=stable&hl=en) 的阈值(`0.10` ~ `0.25`)，这会导致用户在切换路由时感受到明显的视觉闪烁。

> **`vitepress` 的 `SPA` 路由切换场景下，`vue` 的内容更新是同步的，而加载和渲染非 `vue` 组件（如 `react`）的预渲染 `HTML` 和对应的 `CSS` 均是异步的。这个时间差导致了视觉上的闪烁，并使得预渲染的性能优势在切换时丢失。**

`vitepress` 采用的 `SSG` 架构方案是合理的，我们并不打算对整体架构进行调整。那么目标就是在现有架构的基础上尽可能增强预渲染的性能优势，我们为此提供 `spa:sync-render`(简写 `spa:sr`) 指令，该指令会集成目标页面中所有使用该指令的组件所预渲染的产物到 `vue` 的客户端渲染脚本中，跟随着 `vue` 客户端渲染工作并同步完成预渲染产物的渲染工作，用户就不会看到特殊场景下某一时刻组件的闪烁问题。

![spa:sync-render](/spa-sync-render-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-video.mp4" type="video/mp4">
</video>

视频中是采用了 `spa:sync-render` 指令的场景，相比于上述没有使用 `spa:sync-render` 指令的场景，主要区域更新时，`Layout shift score` 值仅包含 **资源加载偏移产生的 `Layout shift score` 值：`0.0013`**。

`spa:sync-render` 特性一定是有利于 [`CLS` 指标](https://web.dev/articles/cls?utm_source=devtools&utm_campaign=stable&hl=en) 的，但也存在性能损耗，因此需要权衡后使用。

> **文档导向型项目本身并不建议大量集成高负载、强交互的渲染组件，文档导向型项目更关心主体内容交付给用户的时间，我们 **假设** 这类组件是 **非关键渲染组件**。我们并不推荐为这类组件启用 `spa:sync-render` 指令，因为这会增加 `vue` 客户端渲染脚本的体积的同时还需额外加载脚本完成组件的渲染工作，这可能会延迟主体内容的交付。**

::: warning 关键样式阻塞渲染说明

当路由切换到具体页面时，若页面中存在使用 `spa:sync-render` 指令的组件，则需等待所有使用该指令的组件依赖的 `css` 模块加载完成后才会开始渲染主要内容，这可能会导致页面渲染阻塞，影响用户体验。

<video controls>
  <source src="/spa-sync-render-side-effects-video.mp4" type="video/mp4">
</video>

视频中可以看到，渲染主要内容之前需要先完成对于所有使用 `spa:sync-render` 指令的组件的 `css` 模块的加载和解析工作，因此存在一定的渲染阻塞，影响用户体验。

不过这是有意为之的默认行为，使用 `spa:sync-render` 指令的组件默认视为关键渲染组件，对应的样式也会被视为 **关键样式**，需要确保在渲染主要内容前加载和解析完所有关键样式，避免用户看到组件渲染闪烁问题(`FOUC`，Flash of Unstyled Content)。

:::

::: warning 客户端包体积增加说明

`vitepress` 首次页面渲染(非路由切换)时，会通过简化的 `vue` 客户端脚本(`.lean.js`)完成应用的 `hydration` 工作，简化意味着 `vitepress` 在编译阶段会过滤掉所有静态节点来减少首次 `hydration` 的脚本体积。

当路由切换时，`vitepress` 会加载目标路由页面所依赖的客户端脚本，完成局部客户端渲染工作，这是一个完整的客户端渲染，客户端脚本必须包含渲染组件的所有信息。

上述提到的体积增加 **仅针对** 路由切换时加载的客户端脚本，并 **不会影响** 首次页面渲染(非路由切换)时 `vue` 客户端脚本(`.lean.js`)的体积。

那么接下来具体计算额外增加了多少体积(**非压缩状态**)：

1. **`client-runtime.js` 模块脚本，大小约为 `13 KB`。**

   用来管理 `spa:sync-render` 指令的组件的 `css` 模块的加载工作，该模块会在每一个页面初始化时完成预加载工作。

2. **页面客户端模块脚本，大小由组件数量和组件大小决定。**
   - 所有使用 `spa:sync-render` 指令的组件通过服务器预渲染产生的产物。
   - 阻塞渲染的 `css` 模块。

```js [xxx.md.js]
import { __CSS_LOADING_RUNTIME__ } from './chunks/client-runtime.41d9d1b5.js';
await __CSS_LOADING_RUNTIME__(['/assets/styles.css', '/assets/styles2.css', '/assets/styles3.css']);
```

对当前示例页面来说，`Landing`、`ReactComp2`、`ReactComp3` 均使用 `spa:sync-render` 指令：

未使用 `spa:sync-render` 指令的模块脚本大小约为 `207 KB`，使用 `spa:sync-render` 指令的模块脚本大小约为 `212 KB` 且需额外依赖 `client-runtime.js` 模块脚本(约 `13 KB`)，需要额外加载 **`18 KB`** 的客户端脚本。

:::

我们提供此指令是为了满足 **关键渲染组件** 的同步渲染需求，但开发者需要警惕其对客户端包体积的影响。

`ssr:only` 指令意味着组件是纯静态的。我们 **假设** 这类组件是 **关键渲染组件**，因此默认将其渲染优先级与 `vue` 组件对齐，以消除路由切换时的视觉不一致。

> `spa:sr` 的核心是在 **更平滑的路由切换体验** 与 **更小的客户端包体积** 之间做权衡。请仔细评估你的组件是否为必须同步渲染的 **关键组件**。

基于上述考量，我们约定了以下默认规则：

- 使用 `client:only` 指令的组件 **不支持** `spa:sync-render` 指令。
- 使用 `client:*` 指令(非 `client:only` 指令)的组件默认不启用 `spa:sync-render` 指令，除非显式启用 `spa:sync-render`(或 `spa:sr`) 指令。
- 所有使用 `ssr:only` 指令的组件(包括不带任何指令的组件)默认启用 `spa:sync-render`(或 `spa:sr`) 指令，除非显式启用 `spa:sync-render:disable`(或 `spa:sr:disable`) 指令。

::: warning SPA 同步渲染特性在开发阶段不生效

`spa:sync-render`(即 `spa:sr`) 特性并不会在开发阶段生效。这个技术限制的根本原因在于开发阶段 `vitepress` 的架构设计：开发环境下 `vitepress` 均采用 `spa` 模块完成局部关键内容的动态渲染，而这些 `spa` 模块脚本采用动态求值的执行方式，这种执行机制并不利于依赖 `vue` 引擎的渲染容器获取和传递完整的初始 `props`。

1. **生产环境为何不受此限制影响？**

   两个环境下解析 `spa` 模块脚本的时机存在根本性差异。在生产环境中，有意设计为先完成页面 `HTML` 的预渲染工作，然后会再次解析对应的 `spa` 模块脚本。在这个时序安排下，当 `spa` 模块脚本开始执行时，渲染容器的初始 `props` 已经完成求值过程，因此可以安全地预渲染渲染容器对应的渲染组件。

   相比之下，开发环境由于无法获取到完整的渲染完成后的上下文信息，仅凭 `spa` 模块脚本动态求值获取到的 `props` 往往是不完整或不准确的，在这种情况下无法安全地提前渲染渲染容器对应的渲染组件，只能等待页面渲染完成后获取渲染容器对应的 `props` 后才能安全渲染对应的渲染组件。

2. **设计权衡与解决方案**

   这个限制的本质原因来自 `vitepress` 在开发阶段和生产环境下采用不同渲染策略所导致的架构差异。为了在保证开发体验的同时尽可能减少环境差异，当前库在开发阶段通过中间层技术来尽可能模拟生产环境下的渲染行为，力求确保开发阶段的渲染行为与生产环境保持一致，遵循用户指定的渲染策略。这是一种在开发体验与环境一致性之间的技术权衡：优先保证开发阶段的稳定性和流畅体验，同时通过技术手段最大程度地模拟生产环境行为。

:::

## 使用方式

<script setup>
  import VueComp1 from './rendering-strategy-comps/vue/VueComp1.vue';
  const page = {
    title: '渲染策略',
  };
  const vueUniqueId = 'vue-unique-id';
</script>

<script lang="react">
  import ReactComp1 from './rendering-strategy-comps/react/ReactComp1';
  import { ReactComp2 } from './rendering-strategy-comps/react/ReactComp2';
  import ReactComp3 from './rendering-strategy-comps/react/ReactComp3';
  import { ReactComp4 } from './rendering-strategy-comps/react/ReactComp4';
  import { ReactComp5 } from './rendering-strategy-comps/react/ReactComp5';
  import ReactVueSharedComp from './rendering-strategy-comps/react/ReactVueSharedComp';
  import { Landing } from './rendering-strategy-comps/react/Landing';
</script>

::: code-group

```md [playground.md]
<script setup>
  import VueComp1 from './rendering-strategy-comps/vue/VueComp1.vue';
  const page = {
    title: '渲染策略',
  };
  const vueUniqueId = 'vue-unique-id';
</script>

<script lang="react">
  import ReactComp1 from './rendering-strategy-comps/react/ReactComp1';
  import { ReactComp2 } from './rendering-strategy-comps/react/ReactComp2';
  import ReactComp3 from './rendering-strategy-comps/react/ReactComp3';
  import { ReactComp4 } from './rendering-strategy-comps/react/ReactComp4';
  import { ReactComp5 } from './rendering-strategy-comps/react/ReactComp5';
  import ReactVueSharedComp from './rendering-strategy-comps/react/ReactVueSharedComp';
  import { Landing } from './rendering-strategy-comps/react/Landing';
</script>
```

:::

## 策略设计

[`@docs-islands/vitepress`](https://www.npmjs.com/package/@docs-islands/vitepress) 跨框架渲染策略目前为 `react` 组件提供了四种核心渲染模式，每种模式都针对特定的应用场景进行了优化。

### Client:Only

**特征分析**:

1. 适用于强依赖宿主环境的客户端组件，如依赖浏览器宿主环境的 `window`、`document` 对象或宿主环境的 `API` 的组件。

2. 该模式通常用于非关键组件或轻量组件的渲染，利好 `TTFB` 指标（减少服务器负载），但不利好 `FCP`、`LCP` 指标（首屏无内容）、`TTI` 指标（需等待 `JS` 加载）以及 `SEO`（内容不在初始 `HTML` 中）。对 `INP` 指标影响取决于组件复杂度。

3. 该模式对于服务器负载较低(或几乎没有)，整个渲染开销完全由用户宿主环境承担，提供商通常可以将脚本托管到 `CDN` 上或用作服务器高负载时的回退方案。

4. 该模式对于开发者来说心智负担较低，开发环境若无需集成复杂的渲染逻辑以及生产环境中局部更新组件时常见使用到的渲染模式，是现阶段最常见的渲染模式。

::: code-group

```md [playground.md]
<script lang="react">
  import ReactComp1 from './rendering-strategy-comps/react/ReactComp1';
</script>

<ReactComp1 client:only render-strategy="client:only" component-name="ReactComp1" :page-title="page.title" :render-count="1" />
```

```tsx [ReactComp1.tsx]
import { useState } from 'react';
import type { CompProps } from '../type';
import './css/rc1.css';
import { renderSharedLicense } from './shared/renderSharedLicense';

export default function ReactComp1(props: CompProps) {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp1-demo">
      <strong>
        {props['render-count']}: 渲染策略: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>组件名称:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>页面标题:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <strong>协议:</strong> <span>{renderSharedLicense()}</span>
        </li>
        <li>
          <button className="rc1-button" onClick={() => setCount(count + 1)} type="button">
            点击我!
          </button>
          <strong>仅客户端渲染模式, React 实例数量:</strong> <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

```ts [shared/renderSharedLicense.ts]
export const renderSharedLicense = () => {
  return '根据 MIT 许可证发布。[共享模块用于 HMR 测试]';
};
```

```css [rc1.css]
.rc1-button {
  padding: 5px;
  border-radius: 8px;
  font-size: 14px;
  margin-right: 8px;
  background-color: #ff6d0563;
  color: #0f3923;
  border: none;
}
```

:::

容器预处理为：

```html
<div
  __render_id__="7b68f067"
  __render_directive__="client:only"
  __render_component__="ReactComp1"
  __spa_sync_render__="false"
  render-strategy="client:only"
  component-name="ReactComp1"
  page-title="渲染策略"
  render-count="1"
></div>
```

渲染结果如下：

---

<ReactComp1 client:only render-strategy="client:only" component-name="ReactComp1" :page-title="page.title" :render-count="1" />

---

### SSR:Only

**特征分析**：

1. 适用于纯静态内容组件，如数据展示、`SEO` 关键内容等不需要客户端交互的组件。服务器渲染优先策略是文档内容导向(`SSG`)最常用的渲染策略，这是 [`@docs-islands/vitepress`](https://www.npmjs.com/package/@docs-islands/vitepress) 默认的渲染策略。`astro` 也采取该策略作为 [默认渲染策略](https://docs.astro.build/en/concepts/why-astro/#server-first)：

   > **Astro leverages server rendering over client-side rendering in the browser as much as possible.**

2. 该模式与 `SSG` 模式结合，预渲染开销仅在项目构建时产生，构建完成后生成的静态 `HTML` 可托管到 `CDN` 上，不会影响生产服务器的负载。若需满足特定的实时渲染支持，可结合 [`ISR`](https://nextjs.org/docs/app/guides/incremental-static-regeneration) 来实现。该模式也可作为服务器高负载时的回退方案。

3. 该模式除了不利好实时性渲染和交互性需求外，对其他各指标(`FCP`、`LCP`、`SEO` 等)来说是利好的，同时避免了客户端 `javascript` 包体积的增加。

> 这是 [`@docs-islands/vitepress`](https://www.npmjs.com/package/@docs-islands/vitepress) 的默认渲染策略，符合文档导向型项目的核心需求。

::: code-group

```md [playground.md]
<script lang="react">
  import { ReactComp2 } from './rendering-strategy-comps/react/ReactComp2';
</script>

<ReactComp2 ssr:only render-strategy="ssr:only" component-name="ReactComp2" :page-title="page.title" :render-count="2" />
```

```tsx [ReactComp2.tsx]
import { readFileSync } from 'node:fs';
import { join } from 'pathe';
import { useState } from 'react';
import type { CompProps } from '../type';
import './css/rc2.css';
import { renderSharedLicense } from './shared/renderSharedLicense';

interface LocalData {
  data: {
    id: number;
    name: string;
    email: string;
  }[];
}

const targetPath = join(import.meta.dirname, 'local-data.json');

export function ReactComp2(props: CompProps) {
  const [count, setCount] = useState(0);
  const data = JSON.parse(readFileSync(targetPath, 'utf8')) as LocalData;

  const displayLocalData = () => {
    const showLocalList = data.data.map((item) => (
      <li key={item.id}>
        <span>
          <strong>标识位:</strong> {item.id}
        </span>
        <br />
        <span>
          <strong>名称:</strong> {item.name}
        </span>
        <br />
        <span>
          <strong>邮箱:</strong> {item.email}
        </span>
      </li>
    ));
    return <ul>{showLocalList}</ul>;
  };
  return (
    <div className="react-comp2-demo">
      <strong>
        {props['render-count']}: 渲染策略: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>组件名称:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>页面标题:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <button className="rc2-button" onClick={() => setCount(count + 1)} type="button">
            点击我!
          </button>
          <strong>仅预渲染模式, React 实例数量:</strong> <span>{count}</span>
        </li>
      </ol>
      <div>{displayLocalData()}</div>
      <div>
        <span>
          <strong>协议:</strong> {renderSharedLicense()}
        </span>
      </div>
    </div>
  );
}
```

```ts [shared/renderSharedLicense.ts]
export const renderSharedLicense = () => {
  return '根据 MIT 许可证发布。[共享模块用于 HMR 测试]';
};
```

```json [local-data.json]
{
  "data": [
    {
      "id": 1,
      "name": "Senao Xi",
      "email": "senaoxi@gmail.com"
    },
    {
      "id": 2,
      "name": "Doe",
      "email": "doe@gmail.com"
    },
    {
      "id": 3,
      "name": "Jane Doe",
      "email": "jane.doe@gmail.com"
    }
  ]
}
```

```css [rc2.css]
.rc2-button {
  padding: 5px;
  border-radius: 8px;
  font-size: 14px;
  margin-right: 8px;
  background-color: #9ceaca63;
  color: #1dd270;
  border: none;
}
```

:::

容器预处理为：

```html
<div
  __render_id__="381f7181"
  __render_directive__="ssr:only"
  __render_component__="ReactComp2"
  __spa_sync_render__="true"
  render-strategy="ssr:only"
  component-name="ReactComp2"
  page-title="渲染策略"
  render-count="2"
></div>
```

渲染结果如下：

---

<ReactComp2 ssr:only render-strategy="ssr:only" component-name="ReactComp2" :page-title="page.title" :render-count="2" />

---

### Client:Load

**特征分析**：

1. 这是典型的同构应用组件，需要服务端渲染以提升首屏性能，同时需要客户端交互功能，适用于关键组件的渲染。
2. 采用类似传统 `SSR` 的架构模式，在构建时预渲染组件生成初始 `HTML`，客户端脚本加载完成后立即执行 `hydration` 工作接管组件交互。在传统 `SSR` 应用中可能会遇到性能瓶颈问题，包括高并发时服务器渲染性能问题和客户端 `FID`、`INP` 指标问题，给用户感觉是虚假站点而弱交互性体验。**孤岛架构** 简化了传统 `SSR` 架构的复杂度，各组件容器可独立完成渲染和 `hydration` 流程，无需等待所有组件渲染完成后进行根容器的一次性 `hydration`。
3. 需要注意的是，这与传统的 `SSR` 架构不同，这是在 `SSG` 架构基础上完成 `hydration` 工作。预渲染在构建时完成，生成静态 `HTML`，而非传统 `SSR` 的运行时渲染，构建完成后可托管到 `CDN` 上，不会影响生产服务器的负载。因此使用该模式相对于 `ssr:only` 模式，增加的是客户端 `hydration` 流程，这部分开销由 `CDN` 和用户宿主环境承担。
4. 该模式通常情况下利好 `FCP`、`LCP` 指标（快速显示内容），但不利好 `TTI` 指标（需要 `hydration` 时间）。对 `FID`、`INP` 指标的影响取决于 `hydration` 期间的主线程阻塞程度和组件复杂度。

::: code-group

```md [playground.md]
<script lang="react">
  import ReactComp3 from './rendering-strategy-comps/react/ReactComp3';
</script>

<ReactComp3 client:load spa:sync-render render-strategy="client:load" component-name="ReactComp3" :page-title="page.title" :render-count="3" />
```

```tsx [ReactComp3.tsx]
import { useState } from 'react';
import type { CompProps } from '../type';
import './css/rc3.css';

export default function ReactComp3(props: CompProps) {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp3-demo">
      <strong>
        {props['render-count']}: 渲染策略: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>组件名称:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>页面标题:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <button className="rc3-button" onClick={() => setCount(count + 1)} type="button">
            点击我!
          </button>
          <strong>预渲染客户端 hydration 模式, React 实例数量:</strong> <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

```css [rc3.css]
.rc3-button {
  padding: 5px;
  border-radius: 8px;
  font-size: 14px;
  margin-right: 8px;
  background-color: #56a8ab;
  color: #9ee2d3;
  border: none;
}
```

:::

容器预处理为：

```md
<div
  __render_id__="57eb78e7"
  __render_directive__="client:load"
  __render_component__="ReactComp3"
  __spa_sync_render__="true"
  render-strategy="client:load"
  component-name="ReactComp3"
  page-title="渲染策略"
  render-count="3"
></div>
```

渲染结果如下：

---

<ReactComp3 client:load spa:sync-render render-strategy="client:load" component-name="ReactComp3" :page-title="page.title" :render-count="3" />

---

### Client:Visible

<!-- TODO: 支持自定义可见性阈值和根边距配置。 -->

**特征分析**：

<!-- markdownlint-disable MD051 -->

1. 适用于非首屏关键内容的交互式组件，如页面底部的评论系统、图表组件等。但需要注意的是，组件脚本默认会采取预加载策略，并非存粹的懒加载。
2. 特征可参考 [`client:load`](#client-load)。

::: code-group

```md [playground.md]
<script lang="react">
  import { ReactComp4 } from './rendering-strategy-comps/react/ReactComp4';
</script>

<ReactComp4 client:visible render-strategy="client:visible" component-name="ReactComp4" :page-title="page.title" :render-count="4" />
```

```tsx [ReactComp4.tsx]
import { useState } from 'react';
import type { CompProps } from '../type';

export function ReactComp4(props: CompProps) {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp4-demo">
      <strong>
        {props['render-count']}: 渲染策略: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>组件名称:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>页面标题:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <button
            style={{
              padding: '5px',
              borderRadius: '8px',
              fontSize: '14px',
              marginRight: '8px',
              backgroundColor: '#56a8ab',
              color: '#9ee2d3',
              border: 'none',
            }}
            onClick={() => setCount(count + 1)}
            type="button"
          >
            点击我!
          </button>
          <strong>预渲染客户端可见 hydration 模式, React 实例数量:</strong> <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

:::

容器预处理为：

```md
<div
  __render_id__="3948d788"
  __render_directive__="client:visible"
  __render_component__="ReactComp4"
  __spa_sync_render__="false"
  render-strategy="client:visible"
  component-name="ReactComp4"
  page-title="渲染策略"
  render-count="4"
></div>
```

渲染结果如下：

---

<ReactComp4 client:visible render-strategy="client:visible" component-name="ReactComp4" :page-title="page.title" :render-count="4" />

---

### 默认策略

默认渲染策略等价于 `ssr:only` 模式，详情可见 [`ssr:only`](#ssr-only)。

::: code-group

```md [playground.md]
<script lang="react">
  import { ReactComp5 } from './rendering-strategy-comps/react/ReactComp5';
</script>

<ReactComp5 render-strategy="default" component-name="ReactComp5" :page-title="page.title" :render-count="5" />
```

```tsx [ReactComp5.tsx]
import { useState } from 'react';
import type { CompProps } from '../type';

export function ReactComp5(props: CompProps) {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp5-demo">
      <strong>
        {props['render-count']}: 渲染策略: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>组件名称:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>页面标题:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <button
            style={{
              padding: '5px',
              borderRadius: '8px',
              fontSize: '14px',
              marginRight: '8px',
              backgroundColor: '#56a8ab',
              color: '#9ee2d3',
              border: 'none',
            }}
            onClick={() => setCount(count + 1)}
            type="button"
          >
            点击我!
          </button>
          <strong>默认渲染模式(仅预渲染模式), React 实例数量:</strong> <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

:::

容器预处理为：

```md
<div
  __render_id__="a0449579"
  __render_directive__="ssr:only"
  __render_component__="ReactComp5"
  __spa_sync_render__="true"
  render-strategy="default"
  component-name="ReactComp5"
  page-title="渲染策略"
  render-count="5"
></div>
```

渲染结果如下：

---

<ReactComp5 render-strategy="default" component-name="ReactComp5" :page-title="page.title" :render-count="5" />

---

### 渲染策略组合

本库支持 `vue` 组件与 `react` 组件的嵌套使用。在组件 **首次渲染** 时，`vue` 父组件可以通过 `slot` 将数据作为 `props` **一次性** 传递给 `react` 子组件，用于初始化 `react` 组件的状态。

> **渲染根容器首次快照会先经 `vue` 渲染引擎处理，再完成对应 `UI` 框架的渲染工作，因此渲染组件的 `props` 可访问到根容器快照的属性。**

```md [playground.md]
<script setup>
import VueComp1 from './rendering-strategy-comps/vue/VueComp1.vue';
const page = {
  title: '渲染策略'
};
const vueUniqueId = 'vue-unique-id';
</script>

<script lang="react">
import ReactVueSharedComp from './rendering-strategy-comps/react/ReactVueSharedComp';
</script>

<VueComp1 :unique-id="vueUniqueId" render-strategy="client:only" component-name="VueComp1" :page-title="page.title" :render-count="6"

> <template #default="{ vueInfo }">

    <ReactVueSharedComp client:only render-strategy="client:only" component-name="ReactVueSharedComp" :page-title="page.title" render-count="3-7" :vue-info="vueInfo" />

  </template>
</VueComp1>
```

::: code-group

```tsx [ReactVueSharedComp.tsx]
import { useState } from 'react';
import type { CompProps } from '../type';

interface ReactVueSharedCompProps extends CompProps {
  'vue-info': string;
}

export default function ReactVueSharedComp(props: ReactVueSharedCompProps) {
  const [count, setCount] = useState(0);
  return (
    <div className="react-vue-shared-comp">
      <strong>
        {props['render-count']}: 渲染策略: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>组件名称:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>页面标题:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <strong>Vue 组件信息:</strong> <span>{props['vue-info']}</span>
        </li>
        <li>
          <button
            style={{
              padding: '5px',
              borderRadius: '8px',
              fontSize: '14px',
              marginRight: '8px',
              backgroundColor: '#56a8ab',
              color: '#9ee2d3',
              border: 'none',
            }}
            onClick={() => setCount(count + 1)}
            type="button"
          >
            点击我!
          </button>
          <strong>仅客户端渲染模式, React 实例数量:</strong> <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

```vue [VueComp1.vue]
<script setup lang="ts">
export interface CompProps {
  componentName: string;
  renderStrategy: string;
  pageTitle: string;
  renderCount: number;
}

const props = defineProps<CompProps>();
const vueInfo = 'VueComp1';
</script>

<template>
  <div class="vue-comp1-demo">
    <strong> {{ props.renderCount }}: 渲染策略: {{ props.renderStrategy }} </strong>
    <ol>
      <li>
        <strong>组件名称:</strong> <span>{{ props.componentName }}</span>
      </li>
      <li>
        <strong>页面标题:</strong> <span>{{ props.pageTitle }}</span>
      </li>
      <li>
        <strong>子组件渲染:</strong>
        <slot :vue-info="vueInfo" />
      </li>
    </ol>
  </div>
</template>
```

:::

容器预处理为：

```md
<div
  __render_id__="4b8c8047"
  __render_directive__="client:only"
  __render_component__="ReactVueSharedComp"
  __spa_sync_render__="false"
  render-strategy="client:only"
  component-name="ReactVueSharedComp"
  page-title="渲染策略"
  render-count="3-7"
  vue-info="VueComp1"
></div>
```

渲染结果如下：

---

<VueComp1 :unique-id="vueUniqueId" render-strategy="client:only" component-name="VueComp1" :page-title="page.title" :render-count="6">
  <template #default="{ vueInfo }">
    <ReactVueSharedComp client:only render-strategy="client:only" component-name="ReactVueSharedComp" :page-title="page.title" render-count="3-7" :vue-info="vueInfo" />
  </template>
</VueComp1>

---

## 集成方式

要在 `vitepress` 项目中启用跨框架渲染策略，需要在构建配置中引入相应的插件：

::: code-group

```ts [.vitepress/config.ts]
import { defineConfig } from 'vitepress';
import vitepressReactRenderingStrategies from '@docs-islands/vitepress/react';

const vitePressConfig = defineConfig({
  // ...
});

vitepressReactRenderingStrategies(vitePressConfig);

export default vitePressConfig;
```

```ts [.vitepress/theme/index.ts]
import DefaultTheme from 'vitepress/theme';
import reactClientIntegration from '@docs-islands/vitepress/react/client';
import type { Theme } from 'vitepress';

const theme: Theme = {
  extends: DefaultTheme,
  async enhanceApp(context) {
    await reactClientIntegration();
  },
};

export default theme;
```

:::

::: warning 约定事项

1. **组件命名规范**

   - 必须以大写字母开头（`PascalCase` 风格）：例如 `MyComp`。
   - 标签名必须与同一 `.md` 文件中 `<script lang="react">` 块内本地导入的名称 **完全匹配**。如果你导入了 `import { Landing as HomeLanding } from '...';`，那么标签必须是 `<HomeLanding ... />`。
   - 任何不匹配的情况都将跳过编译。

2. **仅支持自闭合标签**

   - 在 `Markdown` 中使用的组件必须写成自闭合形式：`<Comp ... />`。
   - 非自闭合形式，如 `<Comp>...</Comp>`，将跳过编译并显示警告。

3. **位置与导入**

   - 组件必须在 **同一** `Markdown` 页面内的 `<script lang="react">` 块中导入，未导入的组件将被忽略，跳过编译。
   - 组件可以在 `Vue` 的插槽/模板中使用（例如，在 `<template #default>...</template>` 内部），它们仍然会被正确发现和转换。

4. **`Props` 传递（初始化）**

   - 标签上的所有非策略性属性都会作为 `props`（字符串）传递给 `react` 容器。像 `:page-title="page.title"` 这样的 `vue` 绑定会首先由 `vue` 进行求值并写入 `DOM` 属性，然后在 `react` 渲染/水合（`hydration`）期间作为 `props` 转发。这可以视为用作 **初始化** 组件渲染的数据传递，并非响应式的。
   - 不要通过属性传递函数或事件处理程序（例如 `onClick`），不支持跨框架桥接可调用的 `props`/事件。

5. **仅 `ssr:only` 指令的组件**

   - 一个组件在单一页面中可以采用多种渲染策略，例如组件即可以通过 `ssr:only` 指令的容器完成渲染工作，也可以通过 `client:only` 指令的容器完成渲染工作。需要注意的是，当组件在单一页面中采用非 `ssr:only` 的渲染策略时(例如同时使用 `client:only` 和 `ssr:only` 渲染指令)，组件是不能依赖 `node` 环境 `api` 的，而若组件在单一页面中仅通过 `ssr:only` 指令的容器完成渲染工作时，该组件是具备依赖 `node` 环境 `api` 的能力，换句话说，此时组件可以使用 `node` 环境中 `node:fs` 等核心模块。
   - `vite` 通常情况下并不会将环境 `api` 依赖的模块作为依赖图的一部分。因此当组件在仅 `ssr:only` 模式下使用环境 `api` 时，需要 **注意** 如下两点：

     1. **依赖模块的路径 **必须** 通过 `import.meta.dirname` 变量来求值。**

        ```ts
        import { readFileSync } from 'node:fs';
        const targetPath = join(import.meta.dirname, 'local-data.json'); // [!code focus]
        try {
          const data = JSON.parse(readFileSync(targetPath, 'utf8'));
        } catch (error) {
          console.error(error);
        }
        ```

     2. **通过环境 `api` 依赖的模块并不支持 `HMR`**

        > **换句话说，用户需要自行通过 `vite` 的 `handleHotUpdate` 机制实现上述例子中对于 `local-data.json` 模块变更时的 `HMR` 支持，否则需自行重新刷新页面方可生效。**

        ```ts [.vitepress/config.ts]
        import { defineConfig } from 'vitepress';
        const vitepressConfig = defineConfig({
          vite: {
            plugins: [
              {
                name: 'vite-plugin-environment-api-dependency-modules-hot-update',
                apply: 'serve',
                async handleHotUpdate(ctx) {
                  const { file, server, modules } = ctx;

                  if (file.includes('local-data.json')) {
                    const updateModuleEntryPath = join(file, '../', 'ReactComp2.tsx');
                    const updateModuleEntry =
                      await server.moduleGraph.getModuleByUrl(updateModuleEntryPath);
                    if (updateModuleEntry) {
                      server.moduleGraph.invalidateModule(
                        updateModuleEntry,
                        new Set(),
                        Date.now(),
                        true,
                      );
                      return [updateModuleEntry];
                    }
                  }

                  return modules;
                },
              },
            ],
          },
        });

        export default vitepressConfig;
        ```

        此时 `HMR` 特性就可以正常工作了。

:::
