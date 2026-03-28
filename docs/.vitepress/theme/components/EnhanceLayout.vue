<script setup lang="ts">
import SiteDebugConsole from '@docs-islands/vitepress/debug-console';
import { Analytics } from '@vercel/analytics/vue';
import DefaultTheme from 'vitepress/theme';
</script>

<template>
  <DefaultTheme.Layout />
  <Analytics />
  <SiteDebugConsole />
</template>
