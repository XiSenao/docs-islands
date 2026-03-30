<script setup lang="ts">
import SiteDebugConsole from '@docs-islands/vitepress/debug-console/client';
import '@docs-islands/vitepress/debug-console/client/style.css';
import { Analytics } from '@vercel/analytics/vue';
import DefaultTheme from 'vitepress/theme';
import SiteDebugModeToggle from './SiteDebugModeToggle.vue';
</script>

<template>
  <DefaultTheme.Layout />
  <SiteDebugModeToggle />
  <Analytics />
  <SiteDebugConsole />
</template>
