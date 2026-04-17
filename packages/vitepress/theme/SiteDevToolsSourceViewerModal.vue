<script setup lang="ts">
import { computed } from 'vue';
import type {
  PreviewState,
  SiteDevToolsAction,
  SiteDevToolsLoadingProgress,
  SiteDevToolsPreviewStatus,
} from './site-devtools-shared';
import type { CodePreviewMode } from './site-devtools-source-preview';
import SiteDevToolsLoadingState from './SiteDevToolsLoadingState.vue';
import SiteDevToolsSourceTextPreview from './SiteDevToolsSourceTextPreview.vue';
import SiteDevToolsVsCodeLink from './SiteDevToolsVsCodeLink.vue';

const props = defineProps<{
  actionFeedbackAction: SiteDevToolsAction;
  actionFeedbackLabel: string;
  browseHref: string | null;
  displayPath: string;
  error: string;
  languageLabel: string;
  loadingProgress: SiteDevToolsLoadingProgress;
  previewHtml: string;
  previewMode: CodePreviewMode;
  previewStatus: SiteDevToolsPreviewStatus | null;
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
  <div class="site-devtools-source-viewer" @click.self="$emit('close')">
    <div class="site-devtools-source-viewer__panel" @click.stop>
      <div class="site-devtools-source-viewer__header">
        <div class="site-devtools-source-viewer__title">
          <p>Module Source</p>
          <h4>{{ title }}</h4>
        </div>
        <div class="site-devtools-dialog__actions">
          <span class="site-devtools-source-viewer__chip">
            {{ languageLabel }}
          </span>
          <button
            type="button"
            class="site-devtools-dialog__action"
            :disabled="state !== 'ready'"
            @click="$emit('copy')"
          >
            {{ copyLabel }}
          </button>
          <button
            type="button"
            class="site-devtools-dialog__action"
            :disabled="state !== 'ready'"
            @click="$emit('download')"
          >
            Download Source
          </button>
          <button
            type="button"
            class="site-devtools-dialog__action site-devtools-dialog__action--primary"
            @pointerdown.stop.prevent
            @click.stop.prevent="$emit('close')"
          >
            Close
          </button>
        </div>
      </div>

      <div class="site-devtools-source-viewer__meta">
        <span class="site-devtools-source-viewer__path">
          {{ displayPath }}
        </span>
      </div>
      <div v-if="browseHref" class="site-devtools-source-viewer__browse">
        <SiteDevToolsVsCodeLink :href="browseHref || ''" />
      </div>

      <div class="site-devtools-source-viewer__preview-shell">
        <SiteDevToolsLoadingState
          v-if="state === 'loading'"
          :progress="loadingProgress"
        />
        <p v-if="state === 'error'" class="site-devtools-overlay__panel-error">
          {{ error }}
        </p>
        <div v-if="showPreviewBody" class="site-devtools-source-viewer__code">
          <div
            v-if="previewStatus"
            class="site-devtools-source-viewer__status"
            :class="`is-${previewStatus.tone}`"
          >
            <strong>{{ previewStatus.label }}</strong>
            <span>{{ previewStatus.detail }}</span>
          </div>
          <div v-if="previewHtml && state === 'ready'" v-html="previewHtml" />
          <SiteDevToolsSourceTextPreview
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
