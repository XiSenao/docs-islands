# How It Works

`@docs-islands/vitepress` does not replace `VitePress`. It extends the Markdown compile step, build-time prerendering, and runtime takeover path so non-`Vue` components can participate in the existing `VitePress` page model.

## Rendering Pipeline

A typical render goes through four steps:

1. Imports from `<script lang="react">` are discovered during Markdown processing.
2. Matching component tags are transformed into render containers with strategy metadata.
3. Build-time logic decides whether to prerender HTML and whether client takeover code should be emitted.
4. The runtime applies the declared strategy and either hydrates, client-renders, or leaves the output static.

That means the page is still a normal `VitePress` page. The difference is that non-`Vue` components now have a controlled lifecycle.

## Who Owns Which Stage

Breaking the system into stages makes it easier to understand where to debug:

| Stage          | Main owner              | What you should watch for                                                |
| -------------- | ----------------------- | ------------------------------------------------------------------------ |
| Markdown       | `VitePress` + transform | whether imports are discovered and component tags follow the conventions |
| Build time     | `docs-islands`          | whether HTML is prerendered and whether takeover code is emitted         |
| First load     | browser runtime         | whether containers are discovered, hydrated, or mismatched               |
| SPA navigation | `VitePress` + runtime   | whether flicker appears and whether `spa:sr` is worth the trade-off      |
| Dev-time HMR   | `vite` + `docs-islands` | whether updates hit the right container and preserve the right state     |

## Strategy Matrix

| Directive        | Pre-render HTML | Client behavior    | Typical usage              | `spa:sr` default |
| ---------------- | --------------- | ------------------ | -------------------------- | ---------------- |
| `ssr:only`       | Yes             | No takeover        | Static content, SEO blocks | Enabled          |
| `client:load`    | Yes             | Immediate hydrate  | Above-the-fold interaction | Disabled         |
| `client:visible` | Yes             | Hydrate on visible | Offscreen interaction      | Disabled         |
| `client:only`    | No              | Client render only | Host-dependent widgets     | Unsupported      |
| No directive     | Yes             | Same as `ssr:only` | Default static rendering   | Enabled          |

## What Each Strategy Means

### `ssr:only`

- Fully prerendered at build time.
- No hydration cost on the client.
- Best for static copy, SEO-critical regions, and stable first paint.
- Components rendered only as `ssr:only` on the page may safely rely on Node APIs.

### `client:load`

- HTML is prerendered, then hydrated as soon as the client is ready.
- Good for interactive elements that matter immediately after first paint.
- Hydration starts early, so it can put more pressure on the critical path.

### `client:visible`

- HTML is prerendered first, then hydrated after the component enters the viewport.
- Good for comments, charts, or lower-page interactions.
- Scripts are still preloaded by default, so it is not a “do nothing until visible” mode.

### `client:only`

- No prerendered HTML, client render only.
- Good for components that require `window`, `document`, or browser-only APIs.
- Easiest mental model, but worst for SEO and static first paint.

## How to Choose a Strategy

If you do not want to overthink the decision for every component, these rules usually work well:

- Static content, branding, callouts, and code examples: start with `ssr:only`.
- Above-the-fold components that must be usable immediately: prefer `client:load`.
- Below-the-fold comments, charts, and secondary interaction blocks: prefer `client:visible`.
- Strong browser-host dependencies or tiny utility widgets: consider `client:only`.

In practice, it is usually safer to optimize for “stable page output first” and only then optimize “when should interactivity start?”

## Why `spa:sync-render` Exists

During `SPA` navigation, `VitePress` updates `Vue` content synchronously, while prerendered HTML, CSS, and scripts for non-`Vue` components usually arrive asynchronously. That gap is what causes visible flicker.

`spa:sync-render` (or `spa:sr`) moves marked components earlier into the page transition flow so critical non-`Vue` content can appear closer to the main body content.

**The following demo environment runs with `CPU: 20x slowdown` and `0.75x` playback speed:**

![spa:sync-render:disable](/spa-sync-render-disable-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-disable-video.mp4" type="video/mp4">
</video>

Without `spa:sr`, two things usually happen:

1. The main `Vue` content updates first.
2. Non-`Vue` markup and styles catch up later, producing visible layout instability.

With `spa:sr`, that split is reduced:

![spa:sync-render](/spa-sync-render-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-video.mp4" type="video/mp4">
</video>

## Default Rules and Trade-offs of `spa:sr`

- `client:only` does not support `spa:sr`.
- `client:*` strategies do not enable `spa:sr` unless you opt in explicitly.
- `ssr:only` and no-directive components enable `spa:sr` by default unless you opt out.

The trade-off is straightforward:

- Benefit: smoother navigation and less visual separation between `Vue` and non-`Vue` content.
- Cost: larger client script cost during navigation, and sometimes render-blocking critical styles.

## When `spa:sr` Is Worth It

It is usually worth enabling when:

- the component is part of the main reading or product story on the page
- a short empty state during navigation would feel visibly broken
- debugging already showed that the issue is mostly asynchronous injection timing, not slow component logic

It is usually better to keep it off when:

- the component is supportive rather than critical content
- the page already contains many `spa:sr` components and navigation cost is growing
- you care more about smaller navigation bundles than perfectly synchronized component appearance

::: warning Critical style blocking

If a page contains `spa:sr` components, the runtime may wait for those components' critical CSS before rendering the main content. That reduces flicker, but it also adds blocking work during navigation.

<video controls>
  <source src="/spa-sync-render-side-effects-video.mp4" type="video/mp4">
</video>

:::

::: warning Development mode limitation

`spa:sr` does not fully behave like production during local development. Dev-mode `VitePress` evaluates `spa` modules dynamically, so the runtime does not receive the same fully resolved initial props context that production builds do. The production benefit is therefore best judged from built output.

:::

## Markdown Rules

### Component Tags and Imports

- Tags must start with an uppercase letter.
- The tag name must exactly match a local import from the same `<script lang="react">` block.
- Only self-closing tags are supported, such as `<Comp ... />`.
- The component must be imported in the current page, or it will be ignored.

### Props Passing

- Non-strategy attributes are forwarded to the `React` component as string props.
- `Vue` bindings are evaluated first, then copied into the container snapshot.
- This is one-shot initialization, not reactive cross-framework state.
- Do not pass functions or event handlers as attributes.

That also means later `Vue` state changes do not automatically flow into the `React` island the way they would in a normal Vue child component. When you need state to keep evolving, it is usually better to keep that interaction inside one framework boundary.

### Re-exports and Slots

- Re-export chains such as `export * from '...'` and `export { Foo } from '...'` are supported.
- Components can appear inside `Vue` slots and templates and still be discovered.
- If a barrel module contains side effects, do not rely on it as the side-effect injection point; runtime imports target the final export owner.

### Node API Constraints

If the same component is rendered both as `ssr:only` and as any `client:*` strategy on the same page, it must not depend on `node:fs`-style APIs. Node APIs are only safe when the component is rendered exclusively as `ssr:only` on that page.

## Common Mistakes

- Treating this as a way to let React own the whole page: it is designed for component islands.
- Defaulting to `client:only` too early: that makes adoption simpler, but gives up static output and first-paint quality.
- Hiding side effects inside barrel modules: runtime imports resolve to the final export owner, not the intermediate re-export module.
- Enabling `spa:sr` everywhere as soon as you see flicker: that often trades one problem for a heavier navigation path.

## Representative Snippets

### Minimal usage

```md
<script lang="react">
  import { Landing } from '../rendering-strategy-comps/react/Landing';
</script>

<Landing client:load spa:sr title="Home" />
```

### One-shot props from Vue into React

```md
<script setup>
  import VueComp1 from '../rendering-strategy-comps/vue/VueComp1.vue';
  const page = { title: 'Rendering Strategy' };
</script>

<script lang="react">
  import ReactVueSharedComp from '../rendering-strategy-comps/react/ReactVueSharedComp';
</script>

<VueComp1 :page-title="page.title">
  <template #default="{ vueInfo }">
    <ReactVueSharedComp client:only :vue-info="vueInfo" />
  </template>
</VueComp1>
```

### Reading local files in pure `ssr:only`

```ts
import { readFileSync } from 'node:fs';
import { join } from 'pathe';

const targetPath = join(import.meta.dirname, 'local-data.json');
const data = JSON.parse(readFileSync(targetPath, 'utf8')) as {
  data: unknown;
};
```

If you also want local file changes to participate in HMR, you need to bridge that yourself with `vite`'s `handleHotUpdate`.

## Continue Reading

- [Getting Started](./getting-started.md): integrate the feature set with the shortest path.
- [Site Debug](../site-debug-console/): inspect runtime behavior visually.
- [Build Reports](../site-debug-console/options/build-reports.md): configure cache, `resolvePage`, and model selection.
