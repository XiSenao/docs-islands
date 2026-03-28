<script setup lang="ts">
import { computed } from 'vue';
import type { BundleAssetMetric } from './debug-inspector';
import type {
  BundleChunkResourceItem,
  OverlayMetricDetailKind,
  PreviewState,
  RenderMetricView,
  SiteDebugAction,
} from './site-debug-shared';
import { formatBytes, hasDisplayValue } from './site-debug-shared';
import {
  getBundleChunkResourceItems,
  getBundleSummaryItems,
  getTotalDurationBreakdown,
} from './site-debug-view-model';

const props = defineProps<{
  actionFeedbackAction: SiteDebugAction;
  actionFeedbackLabel: string;
  actionFeedbackTarget: string | null;
  cssAssets: BundleAssetMetric[];
  cssError: string;
  cssHighlightedHtml: string;
  cssState: PreviewState;
  detailKind: OverlayMetricDetailKind;
  htmlError: string;
  htmlHighlightedHtml: string;
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
const bundleChunkItems = computed(() =>
  getBundleChunkResourceItems(props.view),
);
const totalDurationBreakdownItems = computed(() =>
  getTotalDurationBreakdown(props.view.metric),
);
const isBundleMetricUsingModules = computed(
  () => (props.view.buildMetric?.modules?.length ?? 0) > 0,
);
</script>

<template>
  <div class="site-debug-detail-modal">
    <div class="site-debug-detail-modal__panel" @click.stop>
      <div class="site-debug-detail-modal__header">
        <div>
          <p class="site-debug-section__eyebrow">
            {{ view.metric.componentName }}
          </p>
          <h4 class="site-debug-section__title">
            {{
              detailKind === 'bundle'
                ? 'Bundle Composition'
                : detailKind === 'html'
                  ? 'Patched HTML'
                  : detailKind === 'css'
                    ? 'Required CSS'
                    : 'Total Duration Breakdown'
            }}
          </h4>
        </div>
        <div class="site-debug-dialog__actions">
          <button
            v-if="detailKind === 'css'"
            type="button"
            class="site-debug-dialog__action"
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
            class="site-debug-dialog__action site-debug-dialog__action--primary"
            @click="$emit('close')"
          >
            Close
          </button>
        </div>
      </div>

      <template v-if="detailKind === 'bundle'">
        <div class="site-debug-detail-modal__summary">
          <div
            v-for="item in bundleSummaryItems"
            :key="item.key"
            class="site-debug-overlay__side-effect-item"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
        </div>

        <p class="site-debug-overlay__panel-meta">
          {{
            isBundleMetricUsingModules
              ? 'Module sizes are estimated from Rollup chunk render output.'
              : 'Bundle detail is currently using emitted asset and chunk files.'
          }}
        </p>

        <div class="site-debug-detail-modal__section">
          <div class="site-debug-detail-modal__section-header">
            <div>
              <p class="site-debug-section__eyebrow">Chunk Resources</p>
            </div>
          </div>
          <div class="site-debug-detail-modal__list">
            <button
              v-for="item in bundleChunkItems"
              :key="item.file"
              type="button"
              class="site-debug-detail-modal__list-item site-debug-detail-modal__list-item--interactive"
              :class="{
                'is-selected': selectedChunkFile === item.file,
                'is-copied':
                  item.moduleCount === 0 &&
                  actionFeedbackAction === 'copy-chunk' &&
                  actionFeedbackTarget === item.file,
              }"
              :title="
                item.moduleCount > 0 ? 'Open chunk resource' : 'Copy chunk code'
              "
              @pointerdown.stop
              @click.stop="$emit('chunk-click', item)"
            >
              <div class="site-debug-detail-modal__list-header">
                <div>
                  <strong>{{ item.shortFile }}</strong>
                  <p>{{ item.file }}</p>
                </div>
                <div class="site-debug-detail-modal__list-values">
                  <strong>{{ formatBytes(item.bytes) }}</strong>
                  <span v-if="hasDisplayValue(item.percent)">{{
                    item.percent
                  }}</span>
                </div>
              </div>
              <div class="site-debug-detail-modal__list-meta">
                <span>{{ item.type.toUpperCase() }}</span>
                <span v-if="item.moduleCount > 0">
                  {{ item.moduleCount }} source modules
                </span>
                <span
                  v-else-if="
                    actionFeedbackAction === 'copy-chunk' &&
                    actionFeedbackTarget === item.file
                  "
                  class="site-debug-detail-modal__list-meta-tag is-success"
                >
                  Copied
                </span>
              </div>
              <div class="site-debug-meter__track">
                <span
                  class="site-debug-meter__fill is-size"
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
        <div class="site-debug-detail-modal__section">
          <div class="site-debug-detail-modal__section-header">
            <div>
              <p class="site-debug-section__eyebrow">innerHTML Patch</p>
            </div>
            <div class="site-debug-detail-modal__list-meta">
              <span v-if="htmlPatch">{{ formatBytes(htmlPatch.bytes) }}</span>
              <span>renderId {{ view.metric.renderId }}</span>
            </div>
          </div>

          <p
            v-if="htmlState === 'loading'"
            class="site-debug-overlay__panel-meta"
          >
            Loading patched HTML...
          </p>
          <p
            v-else-if="htmlState === 'error'"
            class="site-debug-overlay__panel-error"
          >
            {{ htmlError }}
          </p>
          <div
            v-else-if="htmlState === 'ready'"
            class="site-debug-source-viewer__code"
            v-html="htmlHighlightedHtml"
          />
        </div>
      </template>

      <template v-else-if="detailKind === 'css'">
        <div class="site-debug-detail-modal__section">
          <div class="site-debug-detail-modal__section-header">
            <div>
              <p class="site-debug-section__eyebrow">CSS Assets</p>
            </div>
            <div class="site-debug-detail-modal__list-meta">
              <span v-for="asset in cssAssets" :key="asset.file">
                {{ asset.file.split('/').pop() || asset.file }} ·
                {{ formatBytes(asset.bytes) }}
              </span>
            </div>
          </div>

          <p
            v-if="cssState === 'loading'"
            class="site-debug-overlay__panel-meta"
          >
            Loading required CSS...
          </p>
          <p
            v-else-if="cssState === 'error'"
            class="site-debug-overlay__panel-error"
          >
            {{ cssError }}
          </p>
          <div
            v-else-if="cssState === 'ready'"
            class="site-debug-source-viewer__code"
            v-html="cssHighlightedHtml"
          />
        </div>
      </template>

      <template v-else>
        <div class="site-debug-detail-modal__list">
          <article
            v-for="item in totalDurationBreakdownItems"
            :key="item.key"
            class="site-debug-detail-modal__list-item"
          >
            <div class="site-debug-detail-modal__list-header">
              <div>
                <strong>{{ item.label }}</strong>
                <p>{{ item.description }}</p>
              </div>
              <div class="site-debug-detail-modal__list-values">
                <strong>{{ item.displayValue }}</strong>
                <span v-if="hasDisplayValue(item.percent)">{{
                  item.percent
                }}</span>
              </div>
            </div>
            <div class="site-debug-meter__track">
              <span
                class="site-debug-meter__fill is-duration"
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
