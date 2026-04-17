<script setup lang="ts">
import { computed } from 'vue';
import type {
  BundleChunkDetail,
  BundleSourceModuleItem,
  BundleSourceModuleSelection,
  PreviewState,
  SiteDevToolsAction,
  SiteDevToolsLoadingProgress,
  SiteDevToolsPreviewStatus,
} from './site-devtools-shared';
import { formatBytes, hasDisplayValue } from './site-devtools-shared';
import type { CodePreviewMode } from './site-devtools-source-preview';
import SiteDevToolsLoadingState from './SiteDevToolsLoadingState.vue';
import SiteDevToolsSourceTextPreview from './SiteDevToolsSourceTextPreview.vue';

const props = defineProps<{
  actionFeedbackAction: SiteDevToolsAction;
  actionFeedbackLabel: string;
  actionFeedbackTarget: string | null;
  chunkDetail: BundleChunkDetail;
  loadingProgress: SiteDevToolsLoadingProgress;
  modules: BundleSourceModuleItem[];
  previewHtml: string;
  previewMode: CodePreviewMode;
  previewStatus: SiteDevToolsPreviewStatus | null;
  selectedModule: BundleSourceModuleSelection | null;
  sourceContent: string;
  state: PreviewState;
  error: string;
}>();

const emit = defineEmits<{
  close: [];
  copy: [];
  'select-module': [item: BundleSourceModuleSelection];
}>();

const showModules = computed(
  () => props.modules.length > 0 || props.chunkDetail.moduleCount > 0,
);
const copyLabel = computed(() =>
  props.actionFeedbackAction === 'copy-chunk' &&
  props.actionFeedbackTarget === props.chunkDetail.file
    ? `✓ ${props.actionFeedbackLabel}`
    : 'Copy Chunk Code',
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
  <div class="site-devtools-chunk-viewer">
    <div
      class="site-devtools-chunk-viewer__panel"
      :class="{ 'is-compact': !showModules }"
      @click.stop
    >
      <div class="site-devtools-source-viewer__header">
        <div class="site-devtools-source-viewer__title">
          <p>Chunk Resource</p>
          <h4>{{ chunkDetail.file.split('/').pop() }}</h4>
        </div>
        <div class="site-devtools-dialog__actions">
          <span class="site-devtools-source-viewer__chip">
            {{ chunkDetail.type.toUpperCase() }}
          </span>
          <span
            class="site-devtools-source-viewer__chip site-devtools-source-viewer__chip--muted"
          >
            {{ formatBytes(chunkDetail.bytes) }}
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
          {{ chunkDetail.file }}
        </span>
      </div>

      <div
        class="site-devtools-chunk-viewer__layout"
        :class="{ 'is-compact': !showModules }"
      >
        <div class="site-devtools-chunk-viewer__code-panel">
          <div class="site-devtools-detail-modal__section-header">
            <div>
              <p class="site-devtools-section__eyebrow">Chunk Code</p>
            </div>
          </div>

          <div class="site-devtools-source-viewer__preview-shell">
            <SiteDevToolsLoadingState
              v-if="state === 'loading'"
              :progress="loadingProgress"
            />
            <p
              v-if="state === 'error'"
              class="site-devtools-overlay__panel-error"
            >
              {{ error }}
            </p>
            <div
              v-if="showPreviewBody"
              class="site-devtools-source-viewer__code"
            >
              <div
                v-if="previewStatus"
                class="site-devtools-source-viewer__status"
                :class="`is-${previewStatus.tone}`"
              >
                <strong>{{ previewStatus.label }}</strong>
                <span>{{ previewStatus.detail }}</span>
              </div>
              <div
                v-if="previewHtml && state === 'ready'"
                v-html="previewHtml"
              />
              <SiteDevToolsSourceTextPreview
                v-else
                :preview-mode="
                  previewMode === 'virtual-highlight'
                    ? 'virtual-highlight'
                    : 'plain-text'
                "
                :source-content="sourceContent"
                :source-path="chunkDetail.file"
                :windowed="shouldUseWindowedPreview"
              />
            </div>
          </div>
        </div>

        <div v-if="showModules" class="site-devtools-chunk-viewer__modules">
          <div class="site-devtools-detail-modal__section-header">
            <div>
              <p class="site-devtools-section__eyebrow">Module Source</p>
            </div>
            <div class="site-devtools-detail-modal__list-meta">
              <span>{{ modules.length }} source modules</span>
            </div>
          </div>
          <div class="site-devtools-detail-modal__list">
            <button
              v-for="item in modules"
              :key="`${item.file}::${item.id}`"
              type="button"
              class="site-devtools-detail-modal__list-item site-devtools-detail-modal__list-item--interactive"
              :class="{
                'is-disabled': !item.canPreview,
                'is-selected':
                  item.canPreview &&
                  selectedModule?.file === item.file &&
                  selectedModule?.id === item.id,
              }"
              :aria-disabled="!item.canPreview"
              :title="
                item.canPreview
                  ? item.isGeneratedVirtualModule
                    ? 'Open generated module preview'
                    : 'Open source module'
                  : item.isGeneratedVirtualModule
                    ? 'Generated virtual module'
                    : 'Source asset is not available'
              "
              @pointerdown.stop
              @click.stop="
                item.canPreview
                  ? $emit('select-module', {
                      file: item.file,
                      id: item.id,
                      isGeneratedVirtualModule: item.isGeneratedVirtualModule,
                      sourceAssetFile: item.sourceAssetFile,
                      sourcePath: item.sourcePath,
                    })
                  : undefined
              "
            >
              <div class="site-devtools-chunk-viewer__module-main">
                <strong class="site-devtools-chunk-viewer__module-title">
                  {{ item.shortFile }}
                </strong>
                <p class="site-devtools-chunk-viewer__module-path">
                  {{ item.id }}
                </p>
                <div
                  v-if="item.isGeneratedVirtualModule || !item.canBrowseSource"
                  class="site-devtools-detail-modal__list-meta site-devtools-chunk-viewer__module-meta"
                >
                  <span v-if="item.isGeneratedVirtualModule">
                    generated virtual module
                  </span>
                  <span v-else>source unavailable</span>
                </div>
              </div>
              <div class="site-devtools-detail-modal__list-values">
                <strong>{{ formatBytes(item.bytes) }}</strong>
                <span
                  v-if="hasDisplayValue(item.percent)"
                  class="site-devtools-chunk-viewer__module-value-metric"
                >
                  Share {{ item.percent }}
                </span>
                <span class="site-devtools-chunk-viewer__module-value-detail">
                  {{ item.sourceSizeLabel }}
                </span>
                <span
                  v-if="item.sizeDeltaLabel"
                  class="site-devtools-chunk-viewer__module-value-detail site-devtools-chunk-viewer__module-value-delta"
                  :class="item.sizeDeltaTone"
                >
                  {{ item.sizeDeltaLabel }}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
