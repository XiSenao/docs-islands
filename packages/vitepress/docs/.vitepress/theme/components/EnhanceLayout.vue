<script setup lang="ts">
import SiteDevToolsConsole from '@docs-islands/vitepress/devtools/client';
import '@docs-islands/vitepress/devtools/client/style.css';
import { Analytics } from '@vercel/analytics/vue';
import DefaultTheme from 'vitepress/theme';
</script>

<template>
  <DefaultTheme.Layout />
  <Analytics />
  <SiteDevToolsConsole />
</template>
