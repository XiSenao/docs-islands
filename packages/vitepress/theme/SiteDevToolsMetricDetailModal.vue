<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BundleAssetMetric } from './debug-inspector';
import type {
  BundleChunkResourceItem,
  BundleResourceTypeFilter,
  OverlayMetricDetailKind,
  PreviewState,
  RenderMetricView,
  SiteDevToolsAction,
  SiteDevToolsLoadingProgress,
} from './site-devtools-shared';
import { formatBytes, hasDisplayValue } from './site-devtools-shared';
import {
  formatWebVitalScore,
  getBundleChunkResourceItems,
  getBundleSummaryItems,
  getTotalDurationBreakdown,
  getWebVitalRatingLabel,
  getWebVitalRatingTone,
  getWebVitalsContextLabel,
  getWebVitalsDetailItems,
} from './site-devtools-view-model';
import SiteDevToolsLoadingState from './SiteDevToolsLoadingState.vue';

const props = defineProps<{
  actionFeedbackAction: SiteDevToolsAction;
  actionFeedbackLabel: string;
  actionFeedbackTarget: string | null;
  cssAssets: BundleAssetMetric[];
  cssError: string;
  cssHighlightedHtml: string;
  cssLoadingProgress: SiteDevToolsLoadingProgress;
  cssState: PreviewState;
  detailKind: OverlayMetricDetailKind;
  htmlError: string;
  htmlHighlightedHtml: string;
  htmlLoadingProgress: SiteDevToolsLoadingProgress;
  htmlPatch: { bytes: number } | null;
  htmlState: PreviewState;
  selectedChunkFile: string | null;
  view: RenderMetricView;
}>();

const emit = defineEmits<{
  'chunk-click': [item: BundleChunkResourceItem];
  close: [];
  'copy-css': [];
}>();

const bundleSummaryItems = computed(() =>
  getBundleSummaryItems(props.view.buildMetric),
);
const selectedBundleResourceFilter = ref<BundleResourceTypeFilter>('total');
const bundleChunkItems = computed(() =>
  getBundleChunkResourceItems(props.view),
);
const filteredBundleChunkItems = computed(() =>
  selectedBundleResourceFilter.value === 'total'
    ? bundleChunkItems.value
    : bundleChunkItems.value.filter(
        (item) => item.type === selectedBundleResourceFilter.value,
      ),
);
const totalDurationBreakdownItems = computed(() =>
  getTotalDurationBreakdown(props.view.metric),
);
const webVitalsAnalysis = computed(() => props.view.webVitalsAnalysis);
const webVitalsDetailItems = computed(() =>
  getWebVitalsDetailItems(webVitalsAnalysis.value),
);
const isBundleMetricUsingModules = computed(
  () => (props.view.buildMetric?.modules?.length ?? 0) > 0,
);
const selectBundleResourceFilter = (filter: string) => {
  selectedBundleResourceFilter.value = filter as BundleResourceTypeFilter;
};

watch(
  () => props.view.metric.renderId,
  () => {
    selectedBundleResourceFilter.value = 'total';
  },
  {
    immediate: true,
  },
);
</script>

<template>
  <div class="site-devtools-detail-modal">
    <div class="site-devtools-detail-modal__panel" @click.stop>
      <div class="site-devtools-detail-modal__header">
        <div>
          <p class="site-devtools-section__eyebrow">
            {{ view.metric.componentName }}
          </p>
          <h4 class="site-devtools-section__title">
            {{
              detailKind === 'bundle'
                ? 'Bundle Composition'
                : detailKind === 'vitals'
                  ? 'Web Vitals Analysis'
                  : detailKind === 'html'
                    ? 'Patched HTML'
                    : detailKind === 'css'
                      ? 'Required CSS'
                      : 'Total Duration Breakdown'
            }}
          </h4>
        </div>
        <div class="site-devtools-dialog__actions">
          <button
            v-if="detailKind === 'css'"
            type="button"
            class="site-devtools-dialog__action"
            :disabled="cssState !== 'ready'"
            @click="$emit('copy-css')"
          >
            {{
              actionFeedbackAction === 'copy-css'
                ? `✓ ${actionFeedbackLabel}`
                : 'Copy CSS'
            }}
          </button>
          <button
            type="button"
            class="site-devtools-dialog__action site-devtools-dialog__action--primary"
            @click="$emit('close')"
          >
            Close
          </button>
        </div>
      </div>

      <template v-if="detailKind === 'bundle'">
        <div class="site-devtools-detail-modal__summary">
          <button
            v-for="item in bundleSummaryItems"
            :key="item.key"
            type="button"
            class="site-devtools-overlay__side-effect-item is-clickable"
            :class="{
              'is-selected': selectedBundleResourceFilter === item.key,
            }"
            @click="selectBundleResourceFilter(item.key)"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </button>
        </div>

        <p class="site-devtools-overlay__panel-meta">
          {{
            isBundleMetricUsingModules
              ? 'Module sizes are estimated from Rollup chunk render output.'
              : 'Bundle detail is currently using emitted asset and chunk files.'
          }}
        </p>

        <div class="site-devtools-detail-modal__section">
          <div class="site-devtools-detail-modal__section-header">
            <div>
              <p class="site-devtools-section__eyebrow">Chunk Resources</p>
            </div>
            <div class="site-devtools-detail-modal__list-meta">
              <span>
                {{ filteredBundleChunkItems.length }} /
                {{ bundleChunkItems.length }}
                resources
              </span>
              <span>{{ selectedBundleResourceFilter.toUpperCase() }}</span>
            </div>
          </div>
          <div class="site-devtools-detail-modal__list">
            <button
              v-for="item in filteredBundleChunkItems"
              :key="item.file"
              type="button"
              class="site-devtools-detail-modal__list-item site-devtools-detail-modal__list-item--interactive"
              :class="{ 'is-selected': selectedChunkFile === item.file }"
              title="Open chunk resource"
              @pointerdown.stop
              @click.stop="$emit('chunk-click', item)"
            >
              <div class="site-devtools-detail-modal__list-header">
                <div>
                  <strong>{{ item.shortFile }}</strong>
                  <p>{{ item.file }}</p>
                </div>
                <div class="site-devtools-detail-modal__list-values">
                  <strong>{{ formatBytes(item.bytes) }}</strong>
                  <span v-if="hasDisplayValue(item.percent)">{{
                    item.percent
                  }}</span>
                </div>
              </div>
              <div class="site-devtools-detail-modal__list-meta">
                <span>{{ item.type.toUpperCase() }}</span>
                <span>{{ item.moduleCount }} source modules</span>
              </div>
              <div class="site-devtools-meter__track">
                <span
                  class="site-devtools-meter__fill is-size"
                  :style="{
                    width:
                      item.bytes > 0 &&
                      (view.buildMetric?.estimatedTotalBytes ?? 0) > 0
                        ? `${Math.max((item.bytes / (view.buildMetric?.estimatedTotalBytes ?? 1)) * 100, 6)}%`
                        : '0%',
                  }"
                />
              </div>
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="detailKind === 'html'">
        <div class="site-devtools-detail-modal__section">
          <div class="site-devtools-detail-modal__section-header">
            <div>
              <p class="site-devtools-section__eyebrow">innerHTML Patch</p>
            </div>
            <div class="site-devtools-detail-modal__list-meta">
              <span v-if="htmlPatch">{{ formatBytes(htmlPatch.bytes) }}</span>
              <span>renderId {{ view.metric.renderId }}</span>
            </div>
          </div>

          <SiteDevToolsLoadingState
            v-if="htmlState === 'loading'"
            :progress="htmlLoadingProgress"
          />
          <p
            v-else-if="htmlState === 'error'"
            class="site-devtools-overlay__panel-error"
          >
            {{ htmlError }}
          </p>
          <div
            v-else-if="htmlState === 'ready'"
            class="site-devtools-source-viewer__code"
            v-html="htmlHighlightedHtml"
          />
        </div>
      </template>

      <template v-else-if="detailKind === 'css'">
        <div class="site-devtools-detail-modal__section">
          <div class="site-devtools-detail-modal__section-header">
            <div>
              <p class="site-devtools-section__eyebrow">CSS Assets</p>
            </div>
            <div class="site-devtools-detail-modal__list-meta">
              <span v-for="asset in cssAssets" :key="asset.file">
                {{ asset.file.split('/').pop() || asset.file }} ·
                {{ formatBytes(asset.bytes) }}
              </span>
            </div>
          </div>

          <SiteDevToolsLoadingState
            v-if="cssState === 'loading'"
            :progress="cssLoadingProgress"
          />
          <p
            v-else-if="cssState === 'error'"
            class="site-devtools-overlay__panel-error"
          >
            {{ cssError }}
          </p>
          <div
            v-else-if="cssState === 'ready'"
            class="site-devtools-source-viewer__code"
            v-html="cssHighlightedHtml"
          />
        </div>
      </template>

      <template v-else-if="detailKind === 'vitals' && webVitalsAnalysis">
        <div class="site-devtools-detail-modal__summary">
          <div class="site-devtools-overlay__side-effect-item">
            <span>Estimated Score</span>
            <strong>{{
              formatWebVitalScore(webVitalsAnalysis.performanceScore)
            }}</strong>
          </div>
          <div class="site-devtools-overlay__side-effect-item">
            <span>Context</span>
            <strong>{{ getWebVitalsContextLabel(webVitalsAnalysis) }}</strong>
          </div>
        </div>

        <div class="site-devtools-hmr-summary__chips">
          <span
            class="site-devtools-summary__chip"
            :class="
              getWebVitalRatingTone(webVitalsAnalysis.performanceScoreRating)
            "
          >
            {{
              getWebVitalRatingLabel(webVitalsAnalysis.performanceScoreRating)
            }}
          </span>
          <span class="site-devtools-summary__chip is-muted">
            renderId {{ view.metric.renderId }}
          </span>
        </div>

        <p class="site-devtools-hmr-summary__description">
          {{ webVitalsAnalysis.summary }}
        </p>

        <div class="site-devtools-detail-modal__list">
          <article
            v-for="item in webVitalsDetailItems"
            :key="item.key"
            class="site-devtools-detail-modal__list-item"
          >
            <div class="site-devtools-detail-modal__list-header">
              <div>
                <strong>{{ item.label }}</strong>
                <p>{{ item.description }}</p>
              </div>
              <div class="site-devtools-detail-modal__list-values">
                <strong>{{ item.value }}</strong>
                <span class="site-devtools-summary__chip" :class="item.tone">
                  {{ item.meta }}
                </span>
              </div>
            </div>
          </article>
        </div>
      </template>

      <template v-else>
        <div class="site-devtools-detail-modal__list">
          <article
            v-for="item in totalDurationBreakdownItems"
            :key="item.key"
            class="site-devtools-detail-modal__list-item"
          >
            <div class="site-devtools-detail-modal__list-header">
              <div>
                <strong>{{ item.label }}</strong>
                <p>{{ item.description }}</p>
              </div>
              <div class="site-devtools-detail-modal__list-values">
                <strong>{{ item.displayValue }}</strong>
                <span v-if="hasDisplayValue(item.percent)">{{
                  item.percent
                }}</span>
              </div>
            </div>
            <div class="site-devtools-meter__track">
              <span
                class="site-devtools-meter__fill is-duration"
                :style="{
                  width:
                    typeof view.metric.totalDurationMs === 'number' &&
                    view.metric.totalDurationMs > 0
                      ? `${Math.max((item.value / view.metric.totalDurationMs) * 100, 6)}%`
                      : '0%',
                }"
              />
            </div>
          </article>
        </div>
      </template>
    </div>
  </div>
</template>
