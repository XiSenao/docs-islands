<script setup lang="ts">
export interface Testimonial {
  /**
   * The URL to the avatar image.
   */
  avatar: string;

  /**
   * The name of the Vite user.
   */
  name: string;

  /**
   * Their social media handle.
   */
  handle: string;

  /**
   * Their comment/testimonial about Vite.
   */
  comment: string[];

  /**
   * The link to the website.
   */
  link: string;
}

defineProps<{
  /**
   * A testimonial from a Vite user.
   */
  testimonial: Testimonial;
}>();
</script>

<template>
  <a
    class="community-card"
    :href="testimonial.link"
    target="_blank"
    rel="noopener noreferrer"
  >
    <div class="card__header">
      <img
        :src="testimonial.avatar"
        :alt="testimonial.name"
        class="card__avatar"
      />
      <div class="card__meta">
        <span class="card__name">
          {{ testimonial.name }}
        </span>
        <span class="card__handle">
          {{ testimonial.handle }}
        </span>
      </div>
    </div>
    <div class="card__content">
      <p v-for="p in testimonial.comment">{{ p }}</p>
    </div>
  </a>
</template>

<style scoped>
.community-card {
  break-inside: avoid;
  width: calc((100% - 50px) / 3);
  margin-bottom: 25px;
  border-radius: 12px;
  border: 1px solid var(--vp-c-bg-soft);
  background: var(--vp-c-bg-soft);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.3s ease;
  text-decoration: none !important;

  @media (max-width: 768px) {
    width: 100%;
  }

  &:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--landing-community-section-linear-background);
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: -1;
  }
  &:hover {
    color: #fff;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(93, 97, 101, 0.2);
  }

  .card__avatar {
    width: 48px;
    aspect-ratio: 1;
    border-radius: 100%;
  }

  .card__content {
    color: var(--vp-c-text-2);
    font-family: var(--vp-font-family-base);
    font-size: 16px;
    font-style: normal;
    font-weight: 400;
    line-height: 150%;
    letter-spacing: -0.32px;
    text-wrap: pretty;
    cursor: default;
  }

  .card__content p {
    margin-top: 10px;
    font-size: 14px;
    color: var(--vp-c-text-2);
  }

  .card__header {
    display: flex;
    flex-direction: row;
    gap: 20px;
    align-items: center;
  }

  .card__meta {
    display: flex;
    flex-direction: column;
  }

  .card__name {
    color: var(--vp-c-text-1);
    font-family: Inter, sans-serif;
    font-size: 16px;
    font-style: normal;
    font-weight: 500;
    line-height: 150%;
    letter-spacing: -0.3px;
  }

  .card__handle {
    color: #a3a3a3;
    font-family: Inter, sans-serif;
    font-size: 14px;
    font-style: normal;
    font-weight: 500;
    line-height: 150%;
    letter-spacing: -0.3px;
  }
}
</style>
