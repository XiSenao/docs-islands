---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: '@docs-islands/vitepress'
  tagline: Cross-framework Islands Architecture for VitePress
  image:
    src: /favicon.svg
    alt: \@docs-islands/vitepress
  actions:
    - theme: brand
      text: Get Started
      link: /concept
    - theme: alt
      text: View on GitHub
      link: https://github.com/XiSenao/docs-islands/tree/main/packages/vitepress

features:
  - title: Islands Architecture
    details: Inspired by Astro's Islands Architecture. Each component container completes hydration independently with framework isolation, avoiding global state conflicts.
    icon: '🏝️'
  - title: Flexible Rendering Strategies
    details: Four rendering modes - ssr:only (default), client:only, client:load, and client:visible. Optimize for performance and user experience based on component criticality.
    icon: '🎯'
  - title: SPA Navigation Optimization
    details: spa:sync-render directive eliminates component flicker during route transitions by synchronizing pre-rendered HTML injection with Vue's rendering cycle.
    icon: '⚡'
  - title: Static-First with Progressive Enhancement
    details: SSG-first architecture with build-time pre-rendering. Components are pre-rendered at build time, with selective client-side hydration only where interaction is needed.
    icon: '🚀'
  - title: Development Excellence
    details: Full HMR support, consistent dev/prod behavior, and TypeScript integration. Environment consistency prevents production surprises.
    icon: '🛠️'
  - title: Production Ready
    details: Full MPA mode compatibility and Vue-to-React prop initialization via rendering container. Seamless integration with VitePress production builds.
    icon: '📦'
---
