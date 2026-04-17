# Troubleshooting

When the first integration goes wrong, start from the symptom and then decide whether you need `logging` or `Site DevTools`. This page only covers the most common setup-stage problems.

## Markdown Tags Are Ignored

This usually means the recognition pipeline never completed. Make sure the component is imported from the current page's `<script lang="react">`, the Markdown tag name exactly matches the exported name, `.vitepress/config.ts` already calls `createDocsIslands(...).apply(...)`, and the theme runs `reactClient()`. If all of that looks correct, restart the dev server once so you can rule out stale compile output or a stuck `HMR` state.

## You See a Hydration Mismatch

This usually means the server output and the first browser render do not match. The first render may depend on time, randomness, window size, or browser-only APIs, or the component may really belong in `client:only` instead of SSR plus hydration. A reliable recovery order is to move back to `ssr:only`, confirm the static output is stable, push browser-only logic into effects, and switch to `client:only` when the component is truly browser-bound.

## Components Flicker During `SPA` Navigation

Flicker usually appears when the new page is already visible but the component's HTML, `CSS`, or hydration resources arrive later. First decide whether the component really needs interactivity; if it is only presentational, moving back to `ssr:only` is often the most stable fix. If hydration is required, add `spa:sync-render` to `client:load` or `client:visible` components and use `Site DevTools` to inspect `Status`, `Visible Wait`, and `Bundle`.

## The Component Uses Node-Only APIs

The common symptom is that the component looks fine with `ssr:only` and then fails as soon as you move to a client strategy, often with browser errors mentioning `fs`, `path`, `process.cwd()`, or other Node-only features. Keep that logic on the server side, avoid direct Node-only dependencies inside interactive components, and split server data preparation from client rendering when needed.

## `HMR` Logs Are Too Noisy, or You Cannot Tell Where an Update Failed

This is usually a two-tool problem. Use [logging](../options/logging.md) to reduce package-owned log noise first, then open [Site DevTools](../options/site-devtools/index.md) to inspect the page overlay, `Debug Logs`, and `HMR Metrics` so you can see whether the issue happened during trigger, apply, or runtime-ready stages. If you only need to mute one noisy stream for a while, add a rule against the relevant `group` in `logging.rules`.

## Which Tool Should You Open First

| You want to confirm                                                | Start here                                         |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| What the terminal and browser should print                         | [logging](../options/logging.md)                   |
| The page's render state, emitted resources, and `HMR` stage timing | [Site DevTools](../options/site-devtools/index.md) |
