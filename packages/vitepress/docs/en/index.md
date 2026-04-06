---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'Docs Islands for VitePress'
  tagline: Cross-framework Islands Architecture for VitePress
  image:
    src: /favicon.svg
    alt: Docs Islands for VitePress
  actions:
    - theme: brand
      text: Guide
      link: /guide/
    - theme: alt
      text: View on GitHub
      link: https://github.com/XiSenao/docs-islands/tree/main/packages/vitepress

features:
  - title: React in Markdown
    details: Import and use React components directly in VitePress Markdown files with zero configuration. Full JSX/TSX support with complete TypeScript typing.
    icon: '⚛️'

  - title: Flexible Rendering Strategies
    details: Currently supports ssr:only (default, static), client:load (immediate hydration), client:visible (hydrate on visible), client:only (client-only) — extensible for additional strategies.
    icon: '🎯'

  - title: SPA Navigation Optimization
    details: spa:sync-render directive designed specifically for VitePress SPA mode. Synchronizes with Vue rendering cycle to inject pre-rendered template, eliminating component flicker during route transitions and optimizing CLS metrics.
    icon: '⚡'

  - title: Static-First, Progressive Enhancement
    details: Built on VitePress SSG architecture, pre-renders component templates at build time. Selective client-side hydration only where interaction is needed, optimizing first-paint performance.
    icon: '🚀'

  - title: Developer Experience First
    details: Full HMR support with instant hot updates for React components and Markdown files, preserving component internal state. Consistent dev/prod rendering behavior prevents production surprises.
    icon: '🛠️'

  - title: Built-in Site Debug Console
    details: Provides a visual debugging panel and AI Reports to analyze rendering behavior, HMR, bundle composition, and spa:sync-render side effects, enabling faster identification of performance and build issues.
    icon: '🔎'
---
