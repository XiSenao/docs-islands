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
  - title: Exceptional Performance
    details: Static content renders instantly while interactive components load on-demand. Documentation sites achieve both the speed of static websites and the interactivity of modern applications, delivering a seamless reading experience.
    icon: '🏝️'

  - title: Flexible Rendering Strategies
    details: Fine-grained control over each component's rendering and hydration timing. Supports server-side rendering, eager loading, viewport-triggered loading, and client-only rendering. Eliminates unnecessary JavaScript execution, ensuring interactions happen at precisely the right moment.
    icon: '🎯'

  - title: Extensible Architecture
    details: Design philosophy supports extension to other mainstream documentation frameworks. Currently provides production-grade integration for VitePress, with gradual platform coverage as the community evolves, maintaining flexibility in technology choices.
    icon: '🧩'

  - title: Cross-Framework Support
    details: Freely use React, Vue, Solid, Svelte, or any preferred UI framework within documentation. Teams can leverage existing component libraries and development expertise without learning new technology stacks.
    icon: '⚛️'

  - title: Rapid Integration
    details: Enable Islands capabilities in existing documentation projects with minimal configuration. No code refactoring required, no disruption to existing functionality—progressively enhance interactivity.
    icon: '🔌'

  - title: Polished Developer Experience
    details: Instant feedback through hot module replacement in development, consistent behavior across dev and production environments. Complete TypeScript support and performance optimization options ensure a smooth experience from development to deployment.
    icon: '📦'
---

<script setup>
import CommunitySection from '../.vitepress/theme/components/landing/community-section/CommunitySection.vue'
</script>

<CommunitySection />
