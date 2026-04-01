<script setup lang="ts">
import { computed } from 'vue';
import type {
  BundleChunkDetail,
  BundleSourceModuleItem,
  BundleSourceModuleSelection,
  PreviewState,
  SiteDebugAction,
  SiteDebugLoadingProgress,
} from './site-debug-shared';
import { formatBytes, hasDisplayValue } from './site-debug-shared';
import SiteDebugLoadingState from './SiteDebugLoadingState.vue';

const props = defineProps<{
  actionFeedbackAction: SiteDebugAction;
  actionFeedbackLabel: string;
  actionFeedbackTarget: string | null;
  chunkDetail: BundleChunkDetail;
  highlightedHtml: string;
  loadingProgress: SiteDebugLoadingProgress;
  modules: BundleSourceModuleItem[];
  selectedModule: BundleSourceModuleSelection | null;
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
</script>

<template>
  <div class="site-debug-chunk-viewer">
    <div
      class="site-debug-chunk-viewer__panel"
      :class="{ 'is-compact': !showModules }"
      @click.stop
    >
      <div class="site-debug-source-viewer__header">
        <div class="site-debug-source-viewer__title">
          <p>Chunk Resource</p>
          <h4>{{ chunkDetail.file.split('/').pop() }}</h4>
        </div>
        <div class="site-debug-dialog__actions">
          <span class="site-debug-source-viewer__chip">
            {{ chunkDetail.type.toUpperCase() }}
          </span>
          <span
            class="site-debug-source-viewer__chip site-debug-source-viewer__chip--muted"
          >
            {{ formatBytes(chunkDetail.bytes) }}
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
          {{ chunkDetail.file }}
        </span>
      </div>

      <div
        class="site-debug-chunk-viewer__layout"
        :class="{ 'is-compact': !showModules }"
      >
        <div class="site-debug-chunk-viewer__code-panel">
          <div class="site-debug-detail-modal__section-header">
            <div>
              <p class="site-debug-section__eyebrow">Chunk Code</p>
            </div>
          </div>

          <SiteDebugLoadingState
            v-if="state === 'loading'"
            :progress="loadingProgress"
          />
          <p
            v-else-if="state === 'error'"
            class="site-debug-overlay__panel-error"
          >
            {{ error }}
          </p>
          <div
            v-else-if="state === 'ready'"
            class="site-debug-source-viewer__code"
            v-html="highlightedHtml"
          />
        </div>

        <div v-if="showModules" class="site-debug-chunk-viewer__modules">
          <div class="site-debug-detail-modal__section-header">
            <div>
              <p class="site-debug-section__eyebrow">Module Source</p>
            </div>
            <div class="site-debug-detail-modal__list-meta">
              <span>{{ modules.length }} source modules</span>
            </div>
          </div>
          <div class="site-debug-detail-modal__list">
            <button
              v-for="item in modules"
              :key="`${item.file}::${item.id}`"
              type="button"
              class="site-debug-detail-modal__list-item site-debug-detail-modal__list-item--interactive"
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
              <div class="site-debug-chunk-viewer__module-main">
                <strong class="site-debug-chunk-viewer__module-title">
                  {{ item.shortFile }}
                </strong>
                <p class="site-debug-chunk-viewer__module-path">
                  {{ item.id }}
                </p>
                <div
                  v-if="item.isGeneratedVirtualModule || !item.canBrowseSource"
                  class="site-debug-detail-modal__list-meta site-debug-chunk-viewer__module-meta"
                >
                  <span v-if="item.isGeneratedVirtualModule">
                    generated virtual module
                  </span>
                  <span v-else>source unavailable</span>
                </div>
              </div>
              <div class="site-debug-detail-modal__list-values">
                <strong>{{ formatBytes(item.bytes) }}</strong>
                <span v-if="hasDisplayValue(item.percent)">{{
                  item.percent
                }}</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
