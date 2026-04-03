<script setup lang="ts">
import { computed } from 'vue';
import type { SiteDebugAiAnalysisTarget } from '../src/shared/site-debug-ai';
import { getSiteDebugAiArtifactKindLabel } from '../src/shared/site-debug-ai';
import type { SiteDebugAiBuildReportReference } from './debug-inspector';
import SiteDebugAiAnalysisPanel from './SiteDebugAiAnalysisPanel.vue';

const props = defineProps<{
  analysisTarget: SiteDebugAiAnalysisTarget | null;
  buildReports: SiteDebugAiBuildReportReference[];
  displayPath?: string | null;
  endpoint: string | null;
  title?: string | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const artifactKindLabel = computed(() =>
  props.analysisTarget?.artifactKind
    ? getSiteDebugAiArtifactKindLabel(props.analysisTarget.artifactKind)
    : 'Build Artifact',
);

const modalTitle = computed(
  () =>
    props.title ||
    props.analysisTarget?.artifactLabel ||
    props.analysisTarget?.displayPath ||
    'Build Artifact Review',
);

const modalPath = computed(
  () => props.displayPath || props.analysisTarget?.displayPath || '',
);
</script>

<template>
  <div class="site-debug-ai-modal" @click.self="$emit('close')">
    <div class="site-debug-ai-modal__panel" @click.stop>
      <div class="site-debug-ai-modal__header">
        <div class="site-debug-ai-modal__title">
          <p>AI Review</p>
          <h4>{{ modalTitle }}</h4>
        </div>
        <div class="site-debug-dialog__actions">
          <span class="site-debug-source-viewer__chip">
            {{ artifactKindLabel }}
          </span>
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

      <div v-if="modalPath" class="site-debug-ai-modal__meta">
        <span class="site-debug-ai-modal__path">{{ modalPath }}</span>
      </div>

      <div class="site-debug-ai-modal__body">
        <SiteDebugAiAnalysisPanel
          :analysis-target="analysisTarget"
          :build-reports="buildReports"
          :endpoint="endpoint"
        />
      </div>
    </div>
  </div>
</template>
