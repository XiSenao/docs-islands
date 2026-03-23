<script setup lang="ts">
import { Analytics } from '@vercel/analytics/vue';
import DefaultTheme from 'vitepress/theme';
</script>

<template>
  <DefaultTheme.Layout>
    <Analytics />
  </DefaultTheme.Layout>
</template>
