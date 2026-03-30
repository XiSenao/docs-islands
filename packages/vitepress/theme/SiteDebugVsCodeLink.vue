<script setup lang="ts">
withDefaults(
  defineProps<{
    href: string;
    label?: string;
  }>(),
  {
    label: 'Open in VSCode',
  },
);
</script>

<template>
  <a class="site-debug-vscode-link" :href="href">
    <span class="site-debug-vscode-link__label">{{ label }}</span>
  </a>
</template>
