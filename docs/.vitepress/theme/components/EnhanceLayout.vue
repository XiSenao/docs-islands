<script setup lang="ts">
import { Analytics } from '@vercel/analytics/vue';
import DefaultTheme from 'vitepress/theme';
</script>

<template>
  <DefaultTheme.Layout v-bind="$attrs">
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps"></slot>
    </template>
  </DefaultTheme.Layout>
  <Analytics />
</template>
