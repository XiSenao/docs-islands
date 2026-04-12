# 工作原理

<script setup>
  import VueComp1 from '../rendering-strategy-comps/vue/VueComp1.vue';

  const page = {
    title: '渲染策略',
  };
</script>

<script lang="react">
  import ReactComp1 from '../rendering-strategy-comps/react/ReactComp1';
  import { ReactComp2 } from '../rendering-strategy-comps/react/ReactComp2';
  import ReactComp3 from '../rendering-strategy-comps/react/ReactComp3';
  import { ReactComp4 } from '../rendering-strategy-comps/react/ReactComp4';
  import { ReactComp5 } from '../rendering-strategy-comps/react/ReactComp5';
  import ReactVueSharedComp from '../rendering-strategy-comps/react/ReactVueSharedComp';
  import { Landing } from '../rendering-strategy-comps/react/Landing';
</script>

<Landing client:load spa:sync-render />

以下内容聚焦运行原理：Markdown 组件如何变成渲染容器、不同指令会带来哪些变化，以及为什么需要 `spa:sync-render`。

接入步骤见 [快速上手](./getting-started.md)，写法规范、策略建议和注意事项见 [最佳实践](./best-practices.md)。

## 注入模型

当你在 Markdown 中写下：

::: code-group

```md [playground.md]
<script setup>
  const page = { title: 'Home' };
</script>

<script lang="react">
  import { Landing } from '../rendering-strategy-comps/react/Landing';
</script>

<Landing client:load spa:sr :title="page.title" />
```

```tsx [Landing.tsx]
export { default as Landing } from './Landing/src/App';
```

```tsx [Landing/src/App.tsx]
import { type JSX, useState } from 'react';
import vitepressLogo from '../public/vitepress.svg';
import './App.css';
import reactLogo from './assets/react.svg';
import './index.css';

function App(): JSX.Element {
  const [count, setCount] = useState(0);

  return (
    <div className="landing">
      <div className="logo-container">
        <a href="https://vitepress.dev" target="_blank" rel="noreferrer">
          <img src={vitepressLogo} className="logo" alt="VitePress logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noreferrer">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>VitePress + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>点击次数: {count}</button>
      </div>
    </div>
  );
}

export default App;
```

:::

页面并不会变成一个由其他框架完整接管的客户端应用。编译器会先把组件标签转换成带渲染元信息的容器节点：

```html
<div
  __render_id__="1194afdb"
  __render_directive__="client:load"
  __render_component__="Landing"
  __spa_sync_render__="true"
  title="Home"
></div>
```

之后整条链路大致会经历：

1. Markdown 处理阶段识别当前页面 `<script lang="react">` 中的导入。
2. 匹配到的组件标签被改写成渲染容器。
3. 构建阶段决定该组件是否要产出预渲染 HTML、客户端接管代码，或两者都要。
4. 运行时找到容器后，再根据指令决定保持静态、立即 hydration、等待可见后 hydration，或纯客户端渲染。

这就是它的核心设计：页面仍然由 `VitePress` 管理，而孤岛组件运行时只管理真正需要接管的那一小块容器。

## 谁在什么阶段负责什么

| 阶段          | 主要负责方                   | 实际发生什么                         |
| ------------- | ---------------------------- | ------------------------------------ |
| Markdown 转换 | `VitePress` + `docs-islands` | 识别组件导入和标签，并改写成容器     |
| 构建期        | `docs-islands`               | 产出预渲染 HTML 和客户端入口         |
| 首次访问      | 浏览器运行时                 | 找到容器并按照指令接管               |
| SPA 切页      | `VitePress` + 运行时         | 页面内容更新，并重新应用孤岛组件输出 |
| 开发态 HMR    | `vite` + `docs-islands`      | 刷新或复用对应容器                   |

## Vue 到孤岛组件的 Props 快照

`Vue` 可以通过把已求值的结果写入渲染容器快照，来初始化一个孤岛组件。这条链路是单向、一次性的。

把 Markdown 用法、`Vue` 父组件和孤岛组件源码放在一起看，会更容易理解这条注入链路：

::: code-group

```md [playground.md]
<script setup>
  import VueComp1 from '../rendering-strategy-comps/vue/VueComp1.vue';
  const page = { title: '渲染策略' };
</script>

<script lang="react">
  import ReactVueSharedComp from '../rendering-strategy-comps/react/ReactVueSharedComp';
</script>

<!-- prettier-ignore -->
<VueComp1
render-strategy="vue-parent"
component-name="VueComp1"
:page-title="page.title"
:render-count="6">
  <template #default="{ vueInfo }">
    <ReactVueSharedComp
      client:only
      render-strategy="client:only"
      component-name="ReactVueSharedComp"
      :page-title="page.title"
      render-count="3-7"
      :vue-info="vueInfo"
    />
  </template>
</VueComp1>
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
    <strong>{{ props.renderCount }}: 渲染策略: {{ props.renderStrategy }}</strong>
    <ol>
      <li>
        <strong>组件名称:</strong>
        <span>{{ props.componentName }}</span>
      </li>
      <li>
        <strong>页面标题:</strong>
        <span>{{ props.pageTitle }}</span>
      </li>
      <li>
        <strong>子组件渲染:</strong>
        <slot :vue-info="vueInfo" />
      </li>
    </ol>
  </div>
</template>
```

```tsx [ReactVueSharedComp.tsx]
import { type JSX, useState } from 'react';
import type { CompProps } from '../type';

interface ReactVueSharedCompProps extends CompProps {
  'vue-info': string;
}

export default function ReactVueSharedComp(props: ReactVueSharedCompProps): JSX.Element {
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

:::

在孤岛组件接管前，容器快照大致如下：

```html
<div
  __render_id__="354a7a63"
  __render_directive__="client:only"
  __render_component__="ReactVueSharedComp"
  __spa_sync_render__="false"
  vue-info="VueComp1"
></div>
```

渲染效果：

<!-- prettier-ignore -->
<VueComp1
render-strategy="vue-parent"
component-name="VueComp1"
:page-title="page.title"
:render-count="6">
  <template #default="{ vueInfo }">
    <ReactVueSharedComp
      client:only
      render-strategy="client:only"
      component-name="ReactVueSharedComp"
      :page-title="page.title"
      render-count="3-7"
      :vue-info="vueInfo"
    />
  </template>
</VueComp1>

## 渲染策略速查

| 指令             | 是否预渲染 HTML | 客户端行为        | 最终模式           |
| ---------------- | --------------- | ----------------- | ------------------ |
| `ssr:only`       | 是              | 不接管            | static             |
| `client:load`    | 是              | 立即 hydration    | hydrate            |
| `client:visible` | 是              | 可见时 hydration  | hydrate-on-visible |
| `client:only`    | 否              | 纯客户端渲染      | render             |
| 无指令           | 是              | 等价于 `ssr:only` | static             |

## 每种策略到底改变了什么

### `ssr:only`

- HTML 在构建期预渲染完成。
- 客户端不会接管这个容器。
- 这是最接近 VitePress 静态优先模型的模式。

::: code-group

```md [playground.md]
<script setup>
  const page = { title: '渲染策略' };
</script>

<script lang="react">
  import { ReactComp2 } from '../rendering-strategy-comps/react/ReactComp2';
</script>

<ReactComp2
  ssr:only
  spa:sr
  render-strategy="ssr:only"
  component-name="ReactComp2"
  :page-title="page.title"
  :render-count="2"
/>
```

```tsx [ReactComp2.tsx]
import { readFileSync } from 'node:fs';
import { join } from 'pathe';
import { type JSX, useState } from 'react';
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

export function ReactComp2(props: CompProps): JSX.Element {
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
  // This is a shared license for rendering strategy, It is used to test the hmr support.
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

```css [css/rc2.css]
.rc2-button {
  padding: 5px;
  border-radius: 8px;
  font-size: 14px;
  margin-right: 8px;
  background-color: pink;
  color: orange;
  border: none;
}
```

:::

渲染效果：

<ReactComp2
  ssr:only
  spa:sr
  render-strategy="ssr:only"
  component-name="ReactComp2"
  :page-title="page.title"
  :render-count="2"
/>

### `client:load`

- 先产出预渲染 HTML。
- 运行时准备好后立即对容器做 hydration。
- 容器会更早变成可交互状态，但也会更早占用关键路径。

::: code-group

```md [playground.md]
<script setup>
  const page = { title: '渲染策略' };
</script>

<script lang="react">
  import ReactComp3 from '../rendering-strategy-comps/react/ReactComp3';
</script>

<ReactComp3
  client:load
  spa:sync-render
  render-strategy="client:load"
  component-name="ReactComp3"
  :page-title="page.title"
  :render-count="3"
/>
```

```tsx [ReactComp3.tsx]
import { useState } from 'react';
import type { CompProps } from '../type';
import './css/rc3.css';

export default function ReactComp3(props: CompProps): JSX.Element {
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

```css [css/rc3.css]
.rc3-button {
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

渲染效果：

<ReactComp3
  client:load
  spa:sync-render
  render-strategy="client:load"
  component-name="ReactComp3"
  :page-title="page.title"
  :render-count="3"
/>

### `client:visible`

- 先产出预渲染 HTML。
- 等组件进入视口后再做 hydration。
- 默认仍会预加载脚本，变化的是接管时机，而不是“完全不加载”。

::: code-group

```md [playground.md]
<script setup>
  const page = { title: '渲染策略' };
</script>

<script lang="react">
  import { ReactComp4 } from '../rendering-strategy-comps/react/ReactComp4';
</script>

<ReactComp4
  client:visible
  render-strategy="client:visible"
  component-name="ReactComp4"
  :page-title="page.title"
  :render-count="4"
/>
```

```tsx [ReactComp4.tsx]
import { type JSX, useState } from 'react';
import type { CompProps } from '../type';

export function ReactComp4(props: CompProps): JSX.Element {
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

渲染效果：

<ReactComp4
  client:visible
  render-strategy="client:visible"
  component-name="ReactComp4"
  :page-title="page.title"
  :render-count="4"
/>

### `client:only`

- 不会为这个容器产出预渲染 HTML。
- 组件完全在客户端渲染。
- 这是最依赖浏览器环境、也最远离静态输出的一种模式。

::: code-group

```md [playground.md]
<script setup>
  const page = { title: '渲染策略' };
</script>

<script lang="react">
  import ReactComp1 from '../rendering-strategy-comps/react/ReactComp1';
</script>

<ReactComp1
  client:only
  render-strategy="client:only"
  component-name="ReactComp1"
  :page-title="page.title"
  :render-count="1"
/>
```

```tsx [ReactComp1.tsx]
import { type JSX, useState } from 'react';
import type { CompProps } from '../type';
import './css/rc1.css';
import { renderSharedLicense } from './shared/renderSharedLicense';

export default function ReactComp1(props: CompProps): JSX.Element {
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
  // This is a shared license for rendering strategy, It is used to test the hmr support.
  return '根据 MIT 许可证发布。[共享模块用于 HMR 测试]';
};
```

```css [css/rc1.css]
.rc1-button {
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

渲染效果：

<ReactComp1
  client:only
  render-strategy="client:only"
  component-name="ReactComp1"
  :page-title="page.title"
  :render-count="1"
/>

### 无指令

- 不写指令时，行为等价于 `ssr:only`。
- 默认保持预渲染且静态输出。

::: code-group

```md [playground.md]
<script setup>
  const page = { title: '渲染策略' };
</script>

<script lang="react">
  import { ReactComp5 } from '../rendering-strategy-comps/react/ReactComp5';
</script>

<ReactComp5
  render-strategy="default"
  component-name="ReactComp5"
  :page-title="page.title"
  :render-count="5"
/>
```

```tsx [ReactComp5.tsx]
import { type JSX, useState } from 'react';
import type { CompProps } from '../type';

export function ReactComp5(props: CompProps): JSX.Element {
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

渲染效果：

<ReactComp5
  render-strategy="default"
  component-name="ReactComp5"
  :page-title="page.title"
  :render-count="5"
/>

## 为什么有 `spa:sync-render`

`VitePress` 在 `SPA` 切页时，`Vue` 主体内容会同步更新，但孤岛组件的预渲染 HTML、CSS 和客户端接管逻辑通常是异步到达的，这个时间差就是闪烁的来源。

`spa:sync-render`（简写 `spa:sr`）的作用，就是把被标记的预渲染孤岛组件更早地并入路由切换流程，让关键的孤岛组件内容尽可能和主内容同步出现。

**下述演示环境在 `CPU: 20x slowdown`、`0.75` 倍速播放：**

![spa:sync-render:disable](/spa-sync-render-disable-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-disable-video.mp4" type="video/mp4">
</video>

未启用 `spa:sr` 时，常见过程是：

1. `Vue` 主体内容先更新。
2. 孤岛组件的 HTML 和样式稍后补上。
3. 用户会看到明显的视觉割裂或布局位移。

启用 `spa:sr` 后，这种割裂会明显减轻：

![spa:sync-render](/spa-sync-render-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-video.mp4" type="video/mp4">
</video>

## `spa:sr` 默认规则

- `client:only` 不支持 `spa:sr`。
- `client:load` 和 `client:visible` 只有在你显式开启时才会使用 `spa:sr`。
- `ssr:only` 和无指令组件默认启用 `spa:sr`，除非你显式写上 `spa:sr:disable` 或 `spa:sync-render:disable`。

::: warning 关键样式阻塞渲染

如果页面里包含 `spa:sr` 组件，运行时可能会先等待这些组件的关键 CSS 完成加载，再渲染主要内容。这样能减少闪烁，但也会在切页阶段引入更多阻塞工作。

<video controls>
  <source src="/spa-sync-render-side-effects-video.mp4" type="video/mp4">
</video>

:::

::: warning 开发阶段限制

`spa:sr` 在本地开发环境下不会完全表现得和生产环境一致。开发态 `VitePress` 会动态求值 `spa` 模块，运行时拿不到和生产构建完全一致的初始 props 上下文。

实际效果上，开发态会尽量贴近你声明的策略，但 `spa:sr` 的真实收益最好还是以构建产物为准。

:::

## 继续阅读

- [快速上手](./getting-started.md)：安装集成并跑通第一个孤岛组件。
- [最佳实践](./best-practices.md)：查看写法规则、策略选择建议、注意事项和常见误区。
- [站点调试](../site-debug-console/)：查看运行时、bundle 和 HMR 的可视化调试信息。
