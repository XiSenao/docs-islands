<script setup lang="ts">
import { computed } from 'vue';
import type { SiteDevToolsAiAnalysisTarget } from '../src/shared/site-devtools-ai';
import { getSiteDevToolsAiArtifactKindLabel } from '../src/shared/site-devtools-ai';
import type { SiteDevToolsAiBuildReportReference } from './debug-inspector';
import SiteDevToolsAiAnalysisPanel from './SiteDevToolsAiAnalysisPanel.vue';

const props = defineProps<{
  analysisTarget: SiteDevToolsAiAnalysisTarget | null;
  buildReports: SiteDevToolsAiBuildReportReference[];
  displayPath?: string | null;
  endpoint: string | null;
  title?: string | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const artifactKindLabel = computed(() =>
  props.analysisTarget?.artifactKind
    ? getSiteDevToolsAiArtifactKindLabel(props.analysisTarget.artifactKind)
    : 'Build Artifact',
);

const modalTitle = computed(
  () =>
    props.title ||
    props.analysisTarget?.artifactLabel ||
    props.analysisTarget?.displayPath ||
    'Artifact Analysis',
);

const modalPath = computed(
  () => props.displayPath || props.analysisTarget?.displayPath || '',
);
</script>

<template>
  <div class="site-devtools-ai-modal" @click.self="$emit('close')">
    <div class="site-devtools-ai-modal__panel" @click.stop>
      <div class="site-devtools-ai-modal__header">
        <div class="site-devtools-ai-modal__title">
          <p>AI Review</p>
          <h4>{{ modalTitle }}</h4>
        </div>
        <div class="site-devtools-dialog__actions">
          <span class="site-devtools-source-viewer__chip">
            {{ artifactKindLabel }}
          </span>
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

      <div v-if="modalPath" class="site-devtools-ai-modal__meta">
        <span class="site-devtools-ai-modal__path">{{ modalPath }}</span>
      </div>

      <div class="site-devtools-ai-modal__body">
        <SiteDevToolsAiAnalysisPanel
          :analysis-target="analysisTarget"
          :build-reports="buildReports"
          :endpoint="endpoint"
        />
      </div>
    </div>
  </div>
</template>
