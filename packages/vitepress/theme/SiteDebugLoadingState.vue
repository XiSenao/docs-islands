<script setup lang="ts">
import { computed } from 'vue';
import type { SiteDebugLoadingProgress } from './site-debug-shared';

const props = defineProps<{
  progress: SiteDebugLoadingProgress;
}>();

const clampedProgress = computed(() =>
  Math.min(Math.max(props.progress.value, 0), 1),
);
const progressPercent = computed(
  () => `${(clampedProgress.value * 100).toFixed(1)}%`,
);
const progressLabel = computed(() =>
  props.progress.indeterminate
    ? 'Loading'
    : `${Math.round(clampedProgress.value * 100)}%`,
);
</script>

<template>
  <div class="site-debug-loading-state" aria-live="polite">
    <div class="site-debug-loading-state__header">
      <div class="site-debug-loading-state__copy">
        <strong>{{ progress.label }}</strong>
        <p v-if="progress.detail">{{ progress.detail }}</p>
      </div>
      <span class="site-debug-loading-state__percent">{{ progressLabel }}</span>
    </div>

    <div class="site-debug-loading-state__track" role="progressbar">
      <span
        class="site-debug-loading-state__fill"
        :class="{ 'is-indeterminate': progress.indeterminate }"
        :style="{
          width: progress.indeterminate ? undefined : progressPercent,
        }"
      />
    </div>
  </div>
</template>
