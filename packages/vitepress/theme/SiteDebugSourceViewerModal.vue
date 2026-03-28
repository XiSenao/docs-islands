<script setup lang="ts">
import { computed } from 'vue';
import type { PreviewState, SiteDebugAction } from './site-debug-shared';

const props = defineProps<{
  actionFeedbackAction: SiteDebugAction;
  actionFeedbackLabel: string;
  browseHref: string | null;
  displayPath: string;
  error: string;
  highlightedHtml: string;
  languageLabel: string;
  state: PreviewState;
  title: string;
}>();

defineEmits<{
  close: [];
  copy: [];
  download: [];
}>();

const copyLabel = computed(() =>
  props.actionFeedbackAction === 'copy-source'
    ? `✓ ${props.actionFeedbackLabel}`
    : 'Copy Source',
);
</script>

<template>
  <div class="site-debug-source-viewer" @click.self="$emit('close')">
    <div class="site-debug-source-viewer__panel" @click.stop>
      <div class="site-debug-source-viewer__header">
        <div class="site-debug-source-viewer__title">
          <p>Module Source</p>
          <h4>{{ title }}</h4>
        </div>
        <div class="site-debug-dialog__actions">
          <span class="site-debug-source-viewer__chip">
            {{ languageLabel }}
          </span>
          <a
            v-if="browseHref"
            class="site-debug-source-link"
            :href="browseHref"
          >
            <span class="site-debug-source-link__icon">VS</span>
            <span>Open in VSCode</span>
          </a>
          <button
            type="button"
            class="site-debug-dialog__action"
            :disabled="state !== 'ready'"
            @click="$emit('copy')"
          >
            {{ copyLabel }}
          </button>
          <button
            type="button"
            class="site-debug-dialog__action"
            :disabled="state !== 'ready'"
            @click="$emit('download')"
          >
            Download Source
          </button>
          <button
            type="button"
            class="site-debug-dialog__action site-debug-dialog__action--primary"
            @pointerdown.stop.prevent
            @click.stop.prevent="$emit('close')"
          >
            Close
          </button>
        </div>
      </div>

      <div class="site-debug-source-viewer__meta">
        <span class="site-debug-source-viewer__path">
          {{ displayPath }}
        </span>
      </div>

      <p v-if="state === 'loading'" class="site-debug-overlay__panel-meta">
        Highlighting source preview...
      </p>
      <p v-else-if="state === 'error'" class="site-debug-overlay__panel-error">
        {{ error }}
      </p>
      <div
        v-else-if="state === 'ready'"
        class="site-debug-source-viewer__code"
        v-html="highlightedHtml"
      />
    </div>
  </div>
</template>
