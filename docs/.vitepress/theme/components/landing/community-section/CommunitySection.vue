<script setup lang="ts">
import type { Testimonial } from './CommunityCard.vue';
import CommunityCard from './CommunityCard.vue';
import vitepressLogo from './images/vitepress-logo.svg';

const testimonials: Testimonial[] = [
  {
    name: 'VitePress',
    handle: '@vuejs',
    avatar: vitepressLogo,
    comment: ['Vite & Vue Powered Static Site Generator.'],
    link: 'https://vitepress.dev/',
  },
];
</script>

<template>
  <section class="community-section">
    <h2>Integrations</h2>
    <div class="community-grid-container">
      <div class="community-grid">
        <CommunityCard
          v-for="testimonial in testimonials"
          :key="testimonial.name"
          :testimonial="testimonial"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.community-section {
  margin-top: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  h2 {
    background: var(--landing-community-section-linear-background);
    background-clip: text;
    padding-top: 16px;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin: 0 auto 10px;
    text-align: center;
    font-size: 44px;
    letter-spacing: -0.88px;
    font-weight: 700;
    line-height: 68px;
    display: inline-block;
    font-size: 44px;
    border-top: 1px solid var(--vp-c-divider);
  }

  h3 {
    width: 455px;
    max-width: 100%;
    margin: 0 auto;
    text-align: center;
  }

  .community-grid-container {
    position: relative;
    padding: 0 24px;
  }

  .community-grid {
    column-count: 2;
    column-gap: 25px;
    margin: 40px auto 0;
    display: flex;
    flex-wrap: wrap;

    @media (min-width: 1150px) {
      column-count: 3;
      width: 1100px;
    }
  }
}
</style>
