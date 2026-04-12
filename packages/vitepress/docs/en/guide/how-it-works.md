# How It Works

<script setup>
  import VueComp1 from '../rendering-strategy-comps/vue/VueComp1.vue';

  const page = {
    title: 'Rendering Strategy',
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

The sections below explain the runtime model: how Markdown tags become render containers, what each directive changes, and why `spa:sync-render` exists.

For setup steps, see [Getting Started](./getting-started.md). For authoring rules, strategy heuristics, and caveats, see [Best Practices](./best-practices.md).

## Injection Model

When you write this in Markdown:

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
        <button onClick={() => setCount((count) => count + 1)}>count is {count}</button>
      </div>
    </div>
  );
}

export default App;
```

:::

the page does not become a full client app rooted in another framework. The compiler first turns the component tag into a render container with strategy metadata:

```html
<div
  __render_id__="1194afdb"
  __render_directive__="client:load"
  __render_component__="Landing"
  __spa_sync_render__="true"
  title="Home"
></div>
```

From there, the pipeline is:

1. Markdown processing discovers imports from the page's `<script lang="react">` block.
2. Matching component tags are rewritten into render containers.
3. Build-time bundling decides whether the component should emit prerendered HTML, client takeover code, or both.
4. Runtime code finds the container and either leaves the HTML static, hydrates it, waits for visibility, or renders it entirely on the client.

That is the core design: `VitePress` still owns the page, while the island-component runtime only owns the container that needs it.

## Who Owns Each Stage

| Stage              | Main owner                   | What happens                                                   |
| ------------------ | ---------------------------- | -------------------------------------------------------------- |
| Markdown transform | `VitePress` + `docs-islands` | component imports and tags are discovered and rewritten        |
| Build time         | `docs-islands`               | prerendered HTML and client entries are emitted                |
| First load         | browser runtime              | containers are found and taken over according to the directive |
| SPA navigation     | `VitePress` + runtime        | page content updates and island-component output is re-applied |
| Dev-time HMR       | `vite` + `docs-islands`      | the changed container is refreshed or reused                   |

## Vue to Island-Component Props Snapshot

`Vue` can initialize an island component by writing resolved values into the render container snapshot. That flow is one-way and one-shot.

This example is easiest to understand when you look at the Markdown usage, the `Vue` parent, and the island component together:

::: code-group

```md [playground.md]
<script setup>
  import VueComp1 from '../rendering-strategy-comps/vue/VueComp1.vue';
  const page = { title: 'Rendering Strategy' };
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
    <strong>
      {{ props.renderCount }}: Rendering Strategy:
      {{ props.renderStrategy }}
    </strong>
    <ol>
      <li>
        <strong>Component Name:</strong>
        <span>{{ props.componentName }}</span>
      </li>
      <li>
        <strong>Page Title:</strong>
        <span>{{ props.pageTitle }}</span>
      </li>
      <li>
        <strong>Child Component Rendering:</strong>
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
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <strong>Vue Component Info:</strong> <span>{props['vue-info']}</span>
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
            Click Me!
          </button>
          <strong>Client Only Render Mode, React Instance Count:</strong> <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

:::

The container snapshot looks like this before the island component takes over:

```html
<div
  __render_id__="354a7a63"
  __render_directive__="client:only"
  __render_component__="ReactVueSharedComp"
  __spa_sync_render__="false"
  vue-info="VueComp1"
></div>
```

Rendering result:

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

## Strategy Matrix

| Directive        | Pre-render HTML | Client behavior       | Resolved mode      |
| ---------------- | --------------- | --------------------- | ------------------ |
| `ssr:only`       | Yes             | No takeover           | static             |
| `client:load`    | Yes             | Hydrate immediately   | hydrate            |
| `client:visible` | Yes             | Hydrate when visible  | hydrate-on-visible |
| `client:only`    | No              | Render on client only | render             |
| No directive     | Yes             | Same as `ssr:only`    | static             |

## What Each Strategy Changes

### `ssr:only`

- HTML is prerendered at build time.
- No client takeover happens for that container.
- This is the closest mode to VitePress's static-first behavior.

::: code-group

```md [playground.md]
<script setup>
  const page = { title: 'Rendering Strategy' };
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
          <strong>ID:</strong> {item.id}
        </span>
        <br />
        <span>
          <strong>Name:</strong> {item.name}
        </span>
        <br />
        <span>
          <strong>Email:</strong> {item.email}
        </span>
      </li>
    ));
    return <ul>{showLocalList}</ul>;
  };
  return (
    <div className="react-comp2-demo">
      <strong>
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <button className="rc2-button" onClick={() => setCount(count + 1)} type="button">
            Click Me!
          </button>
          <strong>Pre-rendering Mode Only, React Instance Count:</strong> <span>{count}</span>
        </li>
      </ol>
      <div>{displayLocalData()}</div>
      <div>
        <span>
          <strong>License:</strong> {renderSharedLicense()}
        </span>
      </div>
    </div>
  );
}
```

```ts [shared/renderSharedLicense.ts]
export const renderSharedLicense = () => {
  // This is a shared license for rendering strategy, It is used to test the hmr support.
  return 'Released under the MIT License. [SHARED MODULE FOR HMR TEST]';
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

Rendering result:

<ReactComp2
  ssr:only
  spa:sr
  render-strategy="ssr:only"
  component-name="ReactComp2"
  :page-title="page.title"
  :render-count="2"
/>

### `client:load`

- HTML is prerendered first.
- The client hydrates the container as soon as the runtime is ready.
- The container becomes interactive early, but adds more work to the critical path.

::: code-group

```md [playground.md]
<script setup>
  const page = { title: 'Rendering Strategy' };
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
import { type JSX, useState } from 'react';
import type { CompProps } from '../type';
import './css/rc3.css';

export default function ReactComp3(props: CompProps): JSX.Element {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp3-demo">
      <strong>
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <button className="rc3-button" onClick={() => setCount(count + 1)} type="button">
            Click Me!
          </button>
          <strong>Pre-rendering Client Hydration Mode, React Instance Count:</strong>{' '}
          <span>{count}</span>
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

Rendering result:

<ReactComp3
  client:load
  spa:sync-render
  render-strategy="client:load"
  component-name="ReactComp3"
  :page-title="page.title"
  :render-count="3"
/>

### `client:visible`

- HTML is prerendered first.
- Hydration is delayed until the component enters the viewport.
- Scripts are still preloaded by default; only takeover timing changes.

::: code-group

```md [playground.md]
<script setup>
  const page = { title: 'Rendering Strategy' };
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
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
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
            Click Me!
          </button>
          <strong>Pre-rendering Client Visible Hydration Mode, React Instance Count:</strong>{' '}
          <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

:::

Rendering result:

<ReactComp4
  client:visible
  render-strategy="client:visible"
  component-name="ReactComp4"
  :page-title="page.title"
  :render-count="4"
/>

### `client:only`

- No prerendered HTML is emitted for the container.
- The component is rendered entirely on the client.
- This is the most browser-dependent mode and the farthest from static output.

::: code-group

```md [playground.md]
<script setup>
  const page = { title: 'Rendering Strategy' };
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
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <strong>License:</strong> <span>{renderSharedLicense()}</span>
        </li>
        <li>
          <button className="rc1-button" onClick={() => setCount(count + 1)} type="button">
            Click Me!
          </button>
          <strong>Client-Only Rendering Mode, React Instance Count:</strong> <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

```ts [shared/renderSharedLicense.ts]
export const renderSharedLicense = () => {
  // This is a shared license for rendering strategy, It is used to test the hmr support.
  return 'Released under the MIT License. [SHARED MODULE FOR HMR TEST]';
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

Rendering result:

<ReactComp1
  client:only
  render-strategy="client:only"
  component-name="ReactComp1"
  :page-title="page.title"
  :render-count="1"
/>

### No Directive

- No directive resolves to `ssr:only`.
- The container stays prerendered and static by default.

::: code-group

```md [playground.md]
<script setup>
  const page = { title: 'Rendering Strategy' };
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
import { useState } from 'react';
import type { CompProps } from '../type';

export function ReactComp5(props: CompProps): JSX.Element {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp5-demo">
      <strong>
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
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
            Click Me!
          </button>
          <strong>Default Rendering Mode (Pre-rendering Mode Only), React Instance Count:</strong>{' '}
          <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

:::

Rendering result:

<ReactComp5
  render-strategy="default"
  component-name="ReactComp5"
  :page-title="page.title"
  :render-count="5"
/>

## Why `spa:sync-render` Exists

During `SPA` navigation, `VitePress` updates `Vue` content synchronously, but island components normally receive prerendered HTML, CSS, and client takeover work asynchronously. That timing gap is what causes visible flicker.

`spa:sync-render` (or `spa:sr`) moves selected prerendered island components earlier into the route-transition flow so critical island-component content can appear closer to the main page content.

**The following demo environment runs with `CPU: 20x slowdown` and `0.75x` playback speed:**

![spa:sync-render:disable](/spa-sync-render-disable-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-disable-video.mp4" type="video/mp4">
</video>

Without `spa:sr`, the common pattern is:

1. `Vue` content updates first.
2. Island HTML and styles catch up later.
3. The user sees visual separation or layout shift.

With `spa:sr`, that split is reduced:

![spa:sync-render](/spa-sync-render-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-video.mp4" type="video/mp4">
</video>

## Default `spa:sr` Rules

- `client:only` does not support `spa:sr`.
- `client:load` and `client:visible` only use `spa:sr` when you opt in explicitly.
- `ssr:only` and no-directive components use `spa:sr` by default unless you disable it with `spa:sr:disable` or `spa:sync-render:disable`.

::: warning Critical style blocking

If a page contains `spa:sr` components, the runtime may wait for those components' critical CSS before rendering the main content. This reduces flicker, but it can also add render-blocking work during route transitions.

<video controls>
  <source src="/spa-sync-render-side-effects-video.mp4" type="video/mp4">
</video>

:::

::: warning Development mode limitation

`spa:sr` does not fully behave like production during local development. Dev-mode `VitePress` evaluates `spa` modules dynamically, so the runtime does not receive the exact same fully resolved initial props context that a production build does.

In practice, development still follows the same declared strategies as closely as possible, but the real `spa:sr` benefit should be judged from built output.

:::

## Continue Reading

- [Getting Started](./getting-started.md): install the integration and render your first island component.
- [Best Practices](./best-practices.md): authoring rules, strategy heuristics, caveats, and common mistakes.
- [Site Debug](../site-debug-console/): inspect runtime behavior, bundles, and HMR visually.
