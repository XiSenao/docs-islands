# Getting Started

## Prerequisites

- Node.js: `^20.19.0` or `>=22.12.0`
- VitePress: `^1.6.3`
- React / ReactDOM: `^18.2.0`
- `@vitejs/plugin-react-swc`: `^3.9.0`

## Install Dependencies

::: code-group

```bash [pnpm]
pnpm add -D @docs-islands/vitepress @vitejs/plugin-react-swc
pnpm add react react-dom
```

:::

## Configure VitePress

1. Integrate `vitepressReactRenderingStrategies()` in `.vitepress/config.ts`:

   ::: code-group

   ```ts [react]
   import { defineConfig } from 'vitepress';
   import vitepressReactRenderingStrategies from '@docs-islands/vitepress/react';

   const vitepressConfig = defineConfig({
     // your VitePress config
   });

   vitepressReactRenderingStrategies(vitepressConfig);

   export default vitepressConfig;
   ```

   :::

2. Register the client runtime in your theme enhancement:

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

## Render Your First React Component in Markdown

Create a component:

::: code-group

```tsx [components/Landing.tsx]
export default function Landing() {
  return <div>Hello Docs Islands</div>;
}
```

:::

Then import and render it inside Markdown:

::: code-group

```md [guide/getting-started.md]
<script lang="react">
  import Landing from '../components/Landing';
</script>

<Landing ssr:only title="Hello" />
```

:::

If you omit a render directive, the default behavior is `ssr:only`. For the strategy matrix, default rules, and `spa:sr` trade-offs, continue with [How It Works](./how-it-works.md).

## Recommended First Adoption Path

If this is your first integration, the safest sequence is:

1. Start with `ssr:only` so Markdown imports, build output, and static rendering all work first.
2. Then decide whether the component actually needs interaction.
3. If it must be interactive immediately above the fold, upgrade it to `client:load`.
4. If it only matters once the user scrolls to it, prefer `client:visible`.
5. Only use `client:only` when the component truly depends on browser-only APIs and cannot be prerendered safely.

This keeps the first milestone focused on “is the integration chain correct?” before you add hydration cost and runtime complexity.

## First Verification Checklist

After the first integration, verify at least these points:

- The page builds successfully and the Markdown component tag is not ignored.
- The component renders correctly as `ssr:only` before you introduce interaction.
- Upgrading to an interactive strategy does not immediately cause hydration mismatch.
- Editing the React component still produces the HMR behavior you expect in development.
- If the component depends on local files or Node APIs, confirm it is rendered exclusively as `ssr:only` on that page.

## Optional: Enable Site Debug Console

If you want a built-in visual debugging surface early, mount `Site Debug Console` in your theme layout:

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

Ways to enable it:

- Use `?site-debug=1` to force it on, or `?site-debug=0` to force it off.
- The choice is persisted and reused on later visits.
- On this docs site, a triple-click on the top-left `logo` also toggles it.

A good first-pass debugging flow is:

1. Click the overlay badge on the component that looks wrong.
2. Open `Bundle Composition` if the issue looks related to `JS`, `CSS`, or emitted assets.
3. Open `Debug Logs` for a page-level snapshot, or call the helper object directly.

The browser console exposes:

```js
globalThis.__DOCS_ISLANDS_SITE_DEBUG__.getRenderMetrics();
globalThis.__DOCS_ISLANDS_SITE_DEBUG__.getHmrMetrics();
globalThis.__DOCS_ISLANDS_SITE_DEBUG__.snapshotRuntime();
```

If you want to learn the console itself next, continue with [Site Debug Getting Started](../site-debug-console/getting-started.md). If you also want build-time AI reports, continue with [Analysis](../site-debug-console/options/analysis.md).

## Suggested Next Reads

- [How It Works](./how-it-works.md): rendering strategies, `spa:sync-render`, and Markdown rules.
- [Site Debug Getting Started](../site-debug-console/getting-started.md): console setup, activation, and first diagnosis workflow.
- [Build Reports](../site-debug-console/options/build-reports.md): cache, `resolvePage`, and model configuration.

## Troubleshooting (FAQ)

- Tags are ignored: ensure the tag starts with an uppercase letter and exactly matches the local import name from the same `<script lang="react">` block.
- Nothing renders: the component must be imported in the same `.md` file and used outside fenced code blocks.
- Flicker on navigation: check whether the component should opt into `spa:sr`.
- Hydration errors: the runtime falls back to client rendering; make sure server output matches client output and avoid passing functions as attributes.
- Node API errors: only components rendered exclusively as `ssr:only` on that page may depend on `node:fs`-style APIs.
- Unsure which strategy to choose: get the component working statically first, then upgrade it according to “above-the-fold interaction” and “browser-only dependency” needs.
