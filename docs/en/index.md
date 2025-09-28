---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'Docs Islands'
  tagline: Cross-framework Islands Architecture for documentation sites
  image:
    src: /favicon.svg
    alt: Docs Islands
  actions:
    - theme: alt
      text: View on GitHub
      link: https://github.com/XiSenao/docs-islands

features:
  - title: Islands Architecture
    details: Static‑first with selective and lazy hydration; per‑component isolation avoids global state conflicts.
    icon: '🏝️'

  - title: Flexible Rendering Strategies
    details: Four modes — ssr:only (default), client:load, client:visible, client:only — choose per component.
    icon: '🎯'

  - title: SPA Navigation Optimization
    details: spa:sync-render merges critical pre‑rendered HTML into page client scripts to eliminate flicker.
    icon: '⚡'

  - title: Cross‑framework UI
    details: React supported today; the design accommodates Solid/Svelte/Preact/Angular adapters.
    icon: '🧩'

  - title: Build‑tool Integration
    details: Unplugin‑style adapter model; plug into host docs systems without lock‑in.
    icon: '🔌'

  - title: Production Ready
    details: HMR in dev, SSG build parity, MPA compatibility, and consistent dev/prod behavior.
    icon: '📦'
---

<script setup>
import CommunitySection from '../.vitepress/theme/components/landing/community-section/CommunitySection.vue'
</script>

<CommunitySection />
