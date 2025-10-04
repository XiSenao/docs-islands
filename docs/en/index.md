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
    details: Static-first with selective and lazy hydration. Per-component isolation avoids global state conflicts and enables progressive enhancement.
    icon: '🏝️'

  - title: Flexible Rendering Strategies
    details: Currently supports four rendering modes — ssr:only (default), client:load, client:visible, client:only — with extensible architecture for additional strategies.
    icon: '🎯'

  - title: Framework-Agnostic Design
    details: Built on adapter model, extensible to other documentation frameworks (e.g., Docusaurus, Nextra, Rspress, etc.) and build toolchains with no lock-in.
    icon: '🧩'

  - title: Cross-Framework UI Support
    details: Production-ready React integration, extensible to Solid, Svelte, Preact, Angular and other mainstream UI frameworks.
    icon: '⚛️'

  - title: Zero-Friction Integration
    details: Minimal configuration, works out of the box. Seamlessly integrates into existing documentation projects through adapters without disrupting workflows.
    icon: '🔌'

  - title: Complete Developer Experience
    details: Dev HMR, dev/prod consistency, MPA compatibility. Performance optimization options available for specific scenarios (e.g., SPA navigation).
    icon: '📦'
---

<script setup>
import CommunitySection from '../.vitepress/theme/components/landing/community-section/CommunitySection.vue'
</script>

<CommunitySection />
