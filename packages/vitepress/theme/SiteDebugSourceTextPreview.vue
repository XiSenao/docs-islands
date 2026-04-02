<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  createBackgroundPlainTextPreviewIndexer,
  createCodePreviewCacheKey,
  isBackgroundCodePreviewAbortError,
  STREAMING_PREVIEW_MAX_CHARACTERS,
  type PlainTextPreviewLineIndex,
} from './site-debug-source-preview';

const props = defineProps<{
  sourceContent: string;
  windowed: boolean;
}>();

const LINE_HEIGHT_PX = 22;
const OVERSCAN_LINES = 40;
const MAX_CACHED_LINE_INDEX_ENTRIES = 8;

const cachedWindowedLineIndexes = new Map<string, PlainTextPreviewLineIndex>();

const getCachedWindowedLineIndex = (cacheKey: string) => {
  const cachedLineIndex = cachedWindowedLineIndexes.get(cacheKey);

  if (!cachedLineIndex) {
    return null;
  }

  cachedWindowedLineIndexes.delete(cacheKey);
  cachedWindowedLineIndexes.set(cacheKey, cachedLineIndex);
  return cachedLineIndex;
};

const setCachedWindowedLineIndex = (
  cacheKey: string,
  nextLineIndex: PlainTextPreviewLineIndex,
) => {
  if (cachedWindowedLineIndexes.has(cacheKey)) {
    cachedWindowedLineIndexes.delete(cacheKey);
  }

  cachedWindowedLineIndexes.set(cacheKey, nextLineIndex);

  while (cachedWindowedLineIndexes.size > MAX_CACHED_LINE_INDEX_ENTRIES) {
    const oldestCacheKey = cachedWindowedLineIndexes.keys().next().value;

    if (typeof oldestCacheKey !== 'string') {
      break;
    }

    cachedWindowedLineIndexes.delete(oldestCacheKey);
  }
};

const rootRef = ref<HTMLDivElement | null>(null);
const containerHeightPx = ref(0);
const lineIndex = ref<PlainTextPreviewLineIndex | null>(null);
const scrollTopPx = ref(0);
const virtualState = ref<'idle' | 'indexing' | 'ready' | 'error'>('idle');
const textIndexer = createBackgroundPlainTextPreviewIndexer();
const lineIndexCacheKey = computed(() =>
  createCodePreviewCacheKey(undefined, props.sourceContent),
);

let previewSessionId = 0;
let resizeObserver: ResizeObserver | null = null;
let scrollContainer: HTMLElement | null = null;
let scrollSyncFrame: number | undefined;

const fallbackPreviewContent = computed(() =>
  props.sourceContent.slice(0, STREAMING_PREVIEW_MAX_CHARACTERS),
);

const flushScrollMetrics = () => {
  scrollSyncFrame = undefined;

  if (!scrollContainer) {
    containerHeightPx.value = 0;
    scrollTopPx.value = 0;
    return;
  }

  containerHeightPx.value = scrollContainer.clientHeight;
  scrollTopPx.value = scrollContainer.scrollTop;
};

const scheduleScrollMetricsSync = () => {
  if (scrollSyncFrame !== undefined) {
    return;
  }

  scrollSyncFrame = globalThis.requestAnimationFrame(() => {
    flushScrollMetrics();
  });
};

const detachScrollContainer = () => {
  scrollContainer?.removeEventListener('scroll', scheduleScrollMetricsSync);
  scrollContainer = null;
  resizeObserver?.disconnect();
  resizeObserver = null;

  if (scrollSyncFrame !== undefined) {
    globalThis.cancelAnimationFrame(scrollSyncFrame);
    scrollSyncFrame = undefined;
  }
};

const attachScrollContainer = () => {
  detachScrollContainer();

  const nextScrollContainer = rootRef.value?.closest(
    '.site-debug-source-viewer__code',
  );

  if (!(nextScrollContainer instanceof HTMLElement)) {
    return;
  }

  scrollContainer = nextScrollContainer;
  scrollContainer.addEventListener('scroll', scheduleScrollMetricsSync, {
    passive: true,
  });
  resizeObserver = new ResizeObserver(() => {
    scheduleScrollMetricsSync();
  });
  resizeObserver.observe(scrollContainer);
  flushScrollMetrics();
};

const refreshWindowedPreview = () => {
  previewSessionId += 1;
  textIndexer.cancel();
  lineIndex.value = null;

  if (!props.windowed || props.sourceContent.length === 0) {
    virtualState.value = 'idle';
    flushScrollMetrics();
    return;
  }

  const cachedLineIndex = getCachedWindowedLineIndex(lineIndexCacheKey.value);

  if (cachedLineIndex) {
    lineIndex.value = cachedLineIndex;
    virtualState.value = 'ready';
    flushScrollMetrics();
    return;
  }

  const currentSessionId = previewSessionId;

  virtualState.value = 'indexing';
  void textIndexer
    .index(props.sourceContent)
    .then((nextLineIndex) => {
      if (currentSessionId !== previewSessionId) {
        return;
      }

      setCachedWindowedLineIndex(lineIndexCacheKey.value, nextLineIndex);
      lineIndex.value = nextLineIndex;
      virtualState.value = 'ready';
      flushScrollMetrics();
    })
    .catch((error) => {
      if (
        currentSessionId !== previewSessionId ||
        isBackgroundCodePreviewAbortError(error)
      ) {
        return;
      }

      virtualState.value = 'error';
    });
};

const visibleRange = computed(() => {
  const totalLineCount = lineIndex.value?.lineCount ?? 0;

  if (
    !props.windowed ||
    !lineIndex.value ||
    totalLineCount <= 0 ||
    containerHeightPx.value <= 0
  ) {
    return {
      endLine: 0,
      startLine: 0,
    };
  }

  const visibleLineCount =
    Math.ceil(containerHeightPx.value / LINE_HEIGHT_PX) + OVERSCAN_LINES * 2;
  const startLine = Math.max(
    Math.floor(scrollTopPx.value / LINE_HEIGHT_PX) - OVERSCAN_LINES,
    0,
  );
  const endLine = Math.min(startLine + visibleLineCount, totalLineCount);

  return {
    endLine,
    startLine,
  };
});

const topSpacerHeightPx = computed(
  () => visibleRange.value.startLine * LINE_HEIGHT_PX,
);

const bottomSpacerHeightPx = computed(() => {
  if (!lineIndex.value) {
    return 0;
  }

  return Math.max(
    (lineIndex.value.lineCount - visibleRange.value.endLine) * LINE_HEIGHT_PX,
    0,
  );
});

const visibleLines = computed(() => {
  if (!lineIndex.value) {
    return [];
  }

  const { endLine, startLine } = visibleRange.value;
  const nextVisibleLines: Array<{ number: number; text: string }> = [];

  for (let lineNumber = startLine; lineNumber < endLine; lineNumber += 1) {
    const startOffset = lineIndex.value.lineStartOffsets[lineNumber] ?? 0;
    const endOffset =
      lineIndex.value.lineStartOffsets[lineNumber + 1] ??
      props.sourceContent.length;
    let lineText = props.sourceContent.slice(startOffset, endOffset);

    if (lineText.endsWith('\r\n')) {
      lineText = lineText.slice(0, -2);
    } else if (lineText.endsWith('\n') || lineText.endsWith('\r')) {
      lineText = lineText.slice(0, -1);
    }

    nextVisibleLines.push({
      number: lineNumber,
      text: lineText,
    });
  }

  return nextVisibleLines;
});

watch(
  () => props.sourceContent,
  () => {
    refreshWindowedPreview();
  },
);

watch(
  () => props.windowed,
  () => {
    refreshWindowedPreview();
  },
);

onMounted(() => {
  attachScrollContainer();
  refreshWindowedPreview();
});

onBeforeUnmount(() => {
  previewSessionId += 1;
  textIndexer.dispose();
  detachScrollContainer();
});
</script>

<template>
  <div ref="rootRef" class="site-debug-source-viewer__text-shell">
    <pre
      v-if="windowed && lineIndex"
      class="site-debug-source-viewer__text site-debug-source-viewer__text--virtual"
    >
      <code class="site-debug-source-viewer__virtual-code">
        <span
          v-if="topSpacerHeightPx > 0"
          class="site-debug-source-viewer__virtual-spacer"
          :style="{ height: `${topSpacerHeightPx}px` }"
        />
        <span
          v-for="line in visibleLines"
          :key="line.number"
          class="site-debug-source-viewer__virtual-line"
        >
          {{ line.text || ' ' }}
        </span>
        <span
          v-if="bottomSpacerHeightPx > 0"
          class="site-debug-source-viewer__virtual-spacer"
          :style="{ height: `${bottomSpacerHeightPx}px` }"
        />
      </code>
    </pre>
    <pre v-else class="site-debug-source-viewer__text">
      <code>{{
        windowed ? fallbackPreviewContent : sourceContent
      }}</code>
    </pre>
    <p
      v-if="windowed && virtualState === 'indexing'"
      class="site-debug-source-viewer__virtual-hint"
    >
      Preparing a windowed preview for smoother scrolling. The first part of the
      file is shown until indexing finishes.
    </p>
    <p
      v-else-if="windowed && virtualState === 'error'"
      class="site-debug-source-viewer__virtual-hint is-error"
    >
      Windowed preview could not be prepared. The visible snippet stays
      available, and Copy/Download still uses the full source.
    </p>
  </div>
</template>
