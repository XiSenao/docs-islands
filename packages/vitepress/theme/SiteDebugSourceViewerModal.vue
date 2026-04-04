<script setup lang="ts">
import { computed } from 'vue';
import type {
  PreviewState,
  SiteDebugAction,
  SiteDebugLoadingProgress,
  SiteDebugPreviewStatus,
} from './site-debug-shared';
import type { CodePreviewMode } from './site-debug-source-preview';
import SiteDebugLoadingState from './SiteDebugLoadingState.vue';
import SiteDebugSourceTextPreview from './SiteDebugSourceTextPreview.vue';
import SiteDebugVsCodeLink from './SiteDebugVsCodeLink.vue';

const props = defineProps<{
  actionFeedbackAction: SiteDebugAction;
  actionFeedbackLabel: string;
  browseHref: string | null;
  displayPath: string;
  error: string;
  languageLabel: string;
  loadingProgress: SiteDebugLoadingProgress;
  previewHtml: string;
  previewMode: CodePreviewMode;
  previewStatus: SiteDebugPreviewStatus | null;
  sourceContent: string;
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
const hasPreviewBody = computed(
  () => props.previewHtml.length > 0 || props.sourceContent.length > 0,
);
const showPreviewBody = computed(
  () => props.state !== 'idle' && hasPreviewBody.value,
);
const shouldUseWindowedPreview = computed(
  () => props.state === 'ready' && props.previewMode !== 'rich-html',
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
      <div v-if="browseHref" class="site-debug-source-viewer__browse">
        <SiteDebugVsCodeLink :href="browseHref || ''" />
      </div>

      <div class="site-debug-source-viewer__preview-shell">
        <SiteDebugLoadingState
          v-if="state === 'loading'"
          :progress="loadingProgress"
        />
        <p v-if="state === 'error'" class="site-debug-overlay__panel-error">
          {{ error }}
        </p>
        <div v-if="showPreviewBody" class="site-debug-source-viewer__code">
          <div
            v-if="previewStatus"
            class="site-debug-source-viewer__status"
            :class="`is-${previewStatus.tone}`"
          >
            <strong>{{ previewStatus.label }}</strong>
            <span>{{ previewStatus.detail }}</span>
          </div>
          <div v-if="previewHtml && state === 'ready'" v-html="previewHtml" />
          <SiteDebugSourceTextPreview
            v-else
            :preview-mode="
              previewMode === 'virtual-highlight'
                ? 'virtual-highlight'
                : 'plain-text'
            "
            :source-content="sourceContent"
            :source-path="displayPath"
            :windowed="shouldUseWindowedPreview"
          />
        </div>
      </div>
    </div>
  </div>
</template>
