# Introduction

<script lang="react">
  import { Landing } from '../rendering-strategy-comps/react/Landing';
</script>

<Landing client:load spa:sync-render />

`@docs-islands/vitepress` brings cross-framework Islands rendering to `VitePress`, so you can use `React` components directly inside Markdown and choose a rendering strategy per component without giving up VitePress's static-first model.

> Today the built-in integration targets `React`. “Cross-framework” describes the rendering model and extension direction, not a promise that every framework is already bundled.

## What Problem It Solves

`VitePress` works naturally with `Vue`, but many docs sites also need interactive pieces that already exist in a `React` codebase. Typical needs include:

- Reusing existing `React` components directly in Markdown.
- Choosing between static-only, eager hydration, visible hydration, or client-only rendering per component.
- Reducing flicker and CLS during `SPA` navigations for non-`Vue` components.
- Keeping development and production rendering behavior aligned while preserving HMR.

## Architecture Direction

This library extends the existing `VitePress + SSG + SPA` model instead of replacing it:

- Static-first: build HTML first.
- Selective hydration: only interactive components are taken over on the client.
- Framework isolation: each non-`Vue` component lives inside its own render container.
- Progressive enhancement: start from static output, then upgrade only where needed.

## Core Mental Model

It helps to think about the system as three layers with separate responsibilities:

- `VitePress` still owns pages, routes, themes, and Markdown rendering.
- `docs-islands` turns cross-framework component usage inside Markdown into render containers that can be analyzed, prerendered, and taken over.
- `React` only takes over the containers that actually need it. It does not take over the whole page.

That is why this approach is a much better fit for “interactive islands inside documentation” than for “the entire page is a heavy interactive app”.

## What You Get

- Direct `React` component usage inside Markdown.
- Four core strategies: `ssr:only`, `client:load`, `client:visible`, and `client:only`.
- `spa:sync-render` / `spa:sr` for smoother navigation-time rendering.
- One-shot props forwarding from `Vue` containers into `React` components.
- A built-in `Site Debug Console` for runtime inspection, bundle analysis, and HMR timing.
- Compatibility with `VitePress` `MPA` mode.

## Good Fit Scenarios

- Documentation-heavy sites that only need a few `React` islands.
- Existing teams with reusable `React` components that should appear in `VitePress`.
- Content sites that care about static output, SEO, and stable page transitions.

## Adoption Advice

- Start with `ssr:only` so your first version stays close to static output.
- Only upgrade a component to `client:load` or `client:visible` once you know it truly needs interaction.
- Evaluate `spa:sr` only when navigation flicker actually affects the core reading experience.
- If the project will maintain a meaningful number of interactive blocks, mount `Site Debug Console` early so runtime evidence stays in one place.

## When It Is Not a Great Fit

- Your page is really a full interactive application, not a docs page with a few islands.
- Components depend on complex cross-framework shared state and you expect `Vue` and `React` to behave like one reactive tree.
- You want this library to replace an application-level router, app shell, or data-flow architecture.

## Next Steps

- Start with [Getting Started](./getting-started.md).
- Read [How It Works](./how-it-works.md) for strategy trade-offs and `spa:sync-render`.
- Open [Site Debug](../site-debug-console/) for runtime diagnostics.
