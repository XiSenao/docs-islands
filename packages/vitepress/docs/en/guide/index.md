# Introduction

`@docs-islands/vitepress` fits `VitePress` sites that stay content-first and only need interaction in a few places. It lets you render React components inside Markdown while keeping pages, routes, themes, and static generation under `VitePress`.

## What It Solves

When a site only has a handful of interactive regions, adding a separate frontend application often makes the structure heavier than necessary. `@docs-islands/vitepress` keeps the decision at the component boundary: you can reuse existing React components, choose a rendering strategy for each one, and reduce visible flicker during `SPA` route changes.

## Good Fit

It works best for documentation sites, product pages, and content-heavy sites that still care most about static output, SEO, and a stable reading experience. Typical examples include demos, visual widgets, search boxes, comparison cards, and other small interactive blocks embedded in otherwise static pages.

## Not a Great Fit

If the page is really a full application, or if components depend on complex shared state across frameworks, this package is not the right primary architecture. It also does not replace application routing, app-shell design, or data-flow choices.

## How It Fits into VitePress

| Part           | Responsibility                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `VitePress`    | Page routing, themes, Markdown rendering, and static site generation.                                                           |
| `docs-islands` | Finds React component tags in Markdown, emits render containers, and decides how prerendering or client takeover should happen. |
| React runtime  | Takes over only the containers that need interaction, not the whole page.                                                       |
