<script setup lang="ts">
import { computed, type Component } from 'vue';
import vueJsonPretty from 'vue-json-pretty';

const props = withDefaults(
  defineProps<{
    data?: unknown;
    deep?: number;
    height?: number | string;
    rootPath?: string;
    showDoubleQuotes?: boolean;
    showIcon?: boolean;
    showLength?: boolean;
    showLine?: boolean;
    theme?: 'dark' | 'light';
    virtual?: boolean;
  }>(),
  {
    deep: 2,
    height: 320,
    rootPath: 'root',
    showDoubleQuotes: false,
    showIcon: true,
    showLength: true,
    showLine: false,
    theme: 'light',
    virtual: true,
  },
);

const jsonViewerComponent = vueJsonPretty as Component & {
  __DOCS_ISLANDS_OPTIONAL_DEPENDENCY_FALLBACK__?: boolean;
};
const jsonTreeFallbackActive =
  jsonViewerComponent.__DOCS_ISLANDS_OPTIONAL_DEPENDENCY_FALLBACK__ === true;

const viewerProps = computed(() => {
  if (jsonTreeFallbackActive) {
    return {
      data: props.data,
      height: props.height,
      rootPath: props.rootPath,
    };
  }

  return {
    data: props.data,
    deep: props.deep,
    height: props.height,
    rootPath: props.rootPath,
    showDoubleQuotes: props.showDoubleQuotes,
    showIcon: props.showIcon,
    showLength: props.showLength,
    showLine: props.showLine,
    theme: props.theme,
    virtual: props.virtual,
  };
});
</script>

<template>
  <div class="site-debug-json-tree">
    <p
      v-if="jsonTreeFallbackActive"
      class="site-debug-dialog__hint site-debug-dialog__hint--subtle site-debug-json-tree__fallback-note"
    >
      Rich JSON tree enhancements are unavailable. Showing a plain JSON fallback
      view instead.
    </p>
    <component
      :is="jsonViewerComponent"
      v-bind="viewerProps"
      class="site-debug-json-tree__viewer"
    />
  </div>
</template>
