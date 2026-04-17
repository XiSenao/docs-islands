<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    data?: unknown;
    height?: number | string;
    rootPath?: string;
  }>(),
  {
    height: 320,
    rootPath: 'root',
  },
);

const containerStyle = computed(() => ({
  maxHeight:
    typeof props.height === 'number' ? `${props.height}px` : props.height,
}));

const serializedValue = computed(() => {
  if (props.data === undefined) {
    return 'undefined';
  }

  try {
    const json = JSON.stringify(props.data, null, 2);

    if (typeof json === 'string') {
      return json;
    }
  } catch {}

  return String(props.data);
});
</script>

<template>
  <div class="site-devtools-json-fallback" :style="containerStyle">
    <p class="site-devtools-json-fallback__label">{{ rootPath }}</p>
    <pre
      class="site-devtools-json-fallback__content"
    ><code>{{ serializedValue }}</code></pre>
  </div>
</template>

<style scoped>
.site-devtools-json-fallback {
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 78%, transparent);
  border-radius: 14px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--vp-c-bg-soft) 88%, transparent),
    color-mix(in srgb, var(--vp-c-bg) 94%, transparent)
  );
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04);
}

.site-devtools-json-fallback__label {
  margin: 0;
  padding: 10px 14px;
  border-bottom: 1px solid
    color-mix(in srgb, var(--vp-c-divider) 70%, transparent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.site-devtools-json-fallback__content {
  margin: 0;
  padding: 14px;
  min-height: 100%;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--vp-c-text-1);
}
</style>
