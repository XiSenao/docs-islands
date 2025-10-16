# Quick Start

## Prerequisites

- Node.js: ^20.19.0 or >=22.12.0
- VitePress: ^1.6.3
- React/ReactDOM (optional): ^18.2.0
- @vitejs/plugin-react-swc (optional): ^3.9.0

## Install Dependencies

```bash
pnpm add -D @docs-islands/vitepress @vitejs/plugin-react-swc
pnpm add react react-dom
```

## Configure VitePress

1. Integrate `UI` framework compilation support in your `VitePress` config:

   ::: code-group

   ```ts [react]
   // .vitepress/config.ts
   import { defineConfig } from 'vitepress';
   import vitepressReactRenderingStrategies from '@docs-islands/vitepress/react';

   const vitePressConfig = defineConfig({
     // Setup VitePress config...
   });

   // Inject React rendering support and build-time optimizations into Vite
   vitepressReactRenderingStrategies(vitePressConfig);

   export default vitePressConfig;
   ```

   :::

2. Register the framework's corresponding client runtime in theme enhancement:

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

## Using React Components in Markdown

1. Write `UI` components:

   ::: code-group

   ```tsx [react]
   // components/Landing.tsx
   import { useState } from 'react';

   export default function Landing() {
     return <div>Hello World</div>;
   }
   ```

   :::

2. Import `UI` components in `Markdown` and apply directives:

   ::: code-group

   ```md [react]
   <script lang="react">
     import Landing from '../components/Landing';
   </script>

   <Landing ssr:only spa:sr title="Hello" />
   ```

   :::

## Rendering Directives and Behavior

### Directive Overview

- `ssr:only` (default)

  - Pre-render at build time and output static `HTML`; no client `Hydration`.
  - Best for static content and `SEO`‑critical sections; benefits `FCP`/`LCP`/`SEO` and avoids adding client‑side `JS` weight.

- `client:load`

  - Pre-render `HTML` and immediately `Hydration` on the client to take over interactivity.
  - Suited for above‑the‑fold interactive components; can add pressure to TTI.

- `client:visible`

  - Pre-render `HTML`; perform `Hydration` when the component becomes visible.
  - Suited for offscreen interactive components (comments, charts, etc.); scripts are preloaded by default (not pure lazy).

- `client:only`

  - Client‑side rendering only; no SSR/SSG pre-rendering.
  - Suited for strong host‑environment dependencies or non‑critical, lightweight widgets.

### Directives quick reference

| Directive        | Pre-render HTML | Client Hydration | Load timing                      | Typical usage                            | `spa:sr` default |
| ---------------- | --------------- | ---------------- | -------------------------------- | ---------------------------------------- | ---------------- |
| `ssr:only`       | Yes             | No               | N/A                              | Static/SEO‑critical sections             | Enabled          |
| `client:load`    | Yes             | Immediate        | Preload module, hydrate on load  | Above‑the‑fold interactive components    | Disabled         |
| `client:visible` | Yes             | On visible       | Preload; hydrate on intersection | Offscreen interactions (comments/charts) | Disabled         |
| `client:only`    | No              | N/A              | Client‑only                      | Host‑dependent/lightweight widgets       | Disabled         |

### SPA Synchronous Rendering (`spa:sync-render` / `spa:sr`)

During `SPA` navigations in `VitePress`, `Vue` content updates synchronously; however, pre-rendered `HTML` for non‑`Vue` components (e.g., `React`) and their scripts load asynchronously, which can easily cause **flicker** on weak networks and low-performance devices. `spa:sr` merges the pre-rendered output of components marked with this directive into the `Vue` client script, prioritizes blocking download and parsing of all `CSS` modules for components using the `spa:sr` directive, and renders synchronously to eliminate flicker.

Default rules:

- `client:only` components do not support `spa:sr`.
- Components using `client:*` do not enable `spa:sr` by default; explicitly add (`spa:sr`/`spa:sync-render`) to enable.
- Components using `ssr:only` (and components without any directive) enable `spa:sr` by default unless explicitly disabled via (`spa:sr:disable`/`spa:sync-render:disable`).

Trade‑off: `spa:sr` improves navigation smoothness but increases client script size during navigations. Prefer enabling it only for **critical rendering components**.

Example:

```md
<Landing client:load spa:sr title="Home" />
<Hero ssr:only />
<Chart client:visible />
<Widget client:only />
```

Bundle size note: the size increase applies only to page client scripts loaded during SPA navigations, and does not affect the initial `.lean.js` used for first‑load hydration in VitePress.

## Usage Notes

1. **Component tag naming**

   - Must start with an uppercase letter (PascalCase style), e.g. `MyComp`.
   - The tag name must exactly match the locally imported name in the same `.md` file’s `<script lang="react">` block. If you alias like `import { Landing as HomeLanding } from '...';`, then the tag must be `<HomeLanding ... />`.
   - Any mismatch will be skipped at compile time with a warning.

2. **Self-closing only**

   - `React` components in `Markdown` must be self-closing: `<Comp ... />`.
   - Non‑self‑closing forms like `<Comp>...</Comp>` are skipped with a warning.

3. **Location and imports**

   - Components must be imported in the same `Markdown` page inside a `<script lang="react">` block. Unimported components are ignored.
   - Components can be used inside `Vue` slots/templates (e.g. within `<template #default>...</template>`); they will still be correctly discovered and transformed.

4. **Props passing (initialization)**

   - All non‑strategy attributes on the tag are passed to the `React` component as string props. `Vue` bindings like `:page-title="page.title"` are evaluated by `Vue` first and written as `DOM` attributes, then forwarded as props during `React` render/hydration. This is a one‑time data pass, not reactive.
   - Do not pass functions or event handlers via attributes (e.g. `onClick`); bridging callable props/events across frameworks is not supported.

5. **Supported directives**

   - `client:only`, `client:load`, `client:visible`, `ssr:only` (default).
   - `spa:sync-render` (aka `spa:sr`) is disabled by default for `client:*` and enabled by default for `ssr:only` unless explicitly disabled via `spa:sync-render:disable` / `spa:sr:disable`.

6. **Constraints for Using Node APIs with `ssr:only`**

   - A component can only rely on Node APIs (e.g., `node:fs`) if it is rendered _exclusively_ with the `ssr:only` directive on a given page. If the same component is also used with any `client:*` directive on the same page, it must not depend on Node APIs.
   - When using environment APIs like `node:fs` to read local files, use `import.meta.dirname` as the base path to resolve the target path.

   ```ts
   import { readFileSync } from 'node:fs';
   import { join } from 'pathe';

   const targetPath = join(import.meta.dirname, 'local-data.json');
   const data = JSON.parse(readFileSync(targetPath, 'utf-8')) as {
     data: unknown;
   };
   ```

> **Constraint: only static `ESM import` is supported inside `<script lang="react">`. During the initial render, `props` are a one‑off snapshot, not a reactive binding (values passed from the parent `Vue` component are used for initialization only).**

## Troubleshooting (FAQ)

- Tags are ignored: ensure the tag starts with an uppercase letter and exactly matches the local import name; React tags must be self‑closing.
- Nothing renders: the component must be imported in the same `.md` inside `<script lang="react">` and used outside fenced code blocks.
- Flicker on navigation: enable `spa:sr` for components critical to above‑the‑fold rendering.
- Hydration errors: the runtime falls back to client rendering; verify that server‑rendered markup matches client output and avoid passing functions as attributes.
- Node API usage errors: only use Node APIs when the component is rendered exclusively with **`ssr:only`** on that page and resolve paths with `import.meta.dirname`.
