<script setup lang="ts">
import { useData } from 'vitepress';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  createBackgroundPlainTextPreviewIndexer,
  createBackgroundWindowedCodePreviewHighlighter,
  createCodePreviewCacheKey,
  isBackgroundCodePreviewAbortError,
  STREAMING_PREVIEW_MAX_CHARACTERS,
  WINDOWED_HIGHLIGHT_BATCH_LINES,
  WINDOWED_HIGHLIGHT_OVERSCAN_LINES,
  type CodePreviewTheme,
  type PlainTextPreviewLineIndex,
  type WindowedCodePreviewLine,
} from './site-devtools-source-preview';

const props = defineProps<{
  previewMode: 'plain-text' | 'virtual-highlight';
  sourceContent: string;
  sourcePath?: string;
  windowed: boolean;
}>();

const LINE_HEIGHT_PX = 22;
const OVERSCAN_LINES = 40;
const MAX_CACHED_LINE_INDEX_ENTRIES = 8;
const MAX_CACHED_HIGHLIGHT_ENTRIES = 6;

const cachedWindowedLineIndexes = new Map<string, PlainTextPreviewLineIndex>();
const cachedWindowedHighlights = new Map<
  string,
  {
    loadedBatchStarts: number[];
    rootStyle: string;
    tokenLines: Array<[number, WindowedCodePreviewLine['tokens']]>;
  }
>();

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

const getCachedWindowedHighlight = (cacheKey: string) => {
  const cachedHighlight = cachedWindowedHighlights.get(cacheKey);

  if (!cachedHighlight) {
    return null;
  }

  cachedWindowedHighlights.delete(cacheKey);
  cachedWindowedHighlights.set(cacheKey, cachedHighlight);
  return {
    loadedBatchStarts: new Set(cachedHighlight.loadedBatchStarts),
    rootStyle: cachedHighlight.rootStyle,
    tokenLines: new Map(cachedHighlight.tokenLines),
  };
};

const setCachedWindowedHighlight = (
  cacheKey: string,
  nextHighlight: {
    loadedBatchStarts: Set<number>;
    rootStyle: string;
    tokenLines: Map<number, WindowedCodePreviewLine['tokens']>;
  },
) => {
  if (cachedWindowedHighlights.has(cacheKey)) {
    cachedWindowedHighlights.delete(cacheKey);
  }

  cachedWindowedHighlights.set(cacheKey, {
    loadedBatchStarts: [...nextHighlight.loadedBatchStarts],
    rootStyle: nextHighlight.rootStyle,
    tokenLines: [...nextHighlight.tokenLines.entries()],
  });

  while (cachedWindowedHighlights.size > MAX_CACHED_HIGHLIGHT_ENTRIES) {
    const oldestCacheKey = cachedWindowedHighlights.keys().next().value;

    if (typeof oldestCacheKey !== 'string') {
      break;
    }

    cachedWindowedHighlights.delete(oldestCacheKey);
  }
};

const { isDark } = useData();
const rootRef = ref<HTMLDivElement | null>(null);
const containerHeightPx = ref(0);
const highlightRootStyle = ref('');
const lineIndex = ref<PlainTextPreviewLineIndex | null>(null);
const loadedHighlightBatchStarts = ref<Set<number>>(new Set());
const scrollTopPx = ref(0);
const tokenLineCache = ref<Map<number, WindowedCodePreviewLine['tokens']>>(
  new Map(),
);
const highlightState = ref<'error' | 'idle' | 'ready' | 'rendering'>('idle');
const virtualState = ref<'idle' | 'indexing' | 'ready' | 'error'>('idle');
const textIndexer = createBackgroundPlainTextPreviewIndexer();
const textHighlighter = createBackgroundWindowedCodePreviewHighlighter();
const sourceCacheKey = computed(() =>
  createCodePreviewCacheKey(props.sourcePath, props.sourceContent),
);
const themeKey = computed<CodePreviewTheme>(() =>
  isDark.value ? 'dark' : 'light',
);
const highlightCacheKey = computed(
  () => `${sourceCacheKey.value}::${themeKey.value}::${props.previewMode}`,
);

let previewSessionId = 0;
let highlightSessionId = 0;
let resizeObserver: ResizeObserver | null = null;
let scrollContainer: HTMLElement | null = null;
let scrollSyncFrame: number | undefined;

const fallbackPreviewContent = computed(() =>
  props.sourceContent.slice(0, STREAMING_PREVIEW_MAX_CHARACTERS),
);
const shouldHighlightWindow = computed(
  () => props.windowed && props.previewMode === 'virtual-highlight',
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
    '.site-devtools-source-viewer__code',
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

const resetWindowedHighlightState = () => {
  highlightSessionId += 1;
  textHighlighter.cancel();
  highlightRootStyle.value = '';
  loadedHighlightBatchStarts.value = new Set();
  tokenLineCache.value = new Map();
  highlightState.value = 'idle';
};

const hydrateCachedWindowedHighlight = () => {
  resetWindowedHighlightState();

  if (!shouldHighlightWindow.value || props.sourceContent.length === 0) {
    return;
  }

  const cachedHighlight = getCachedWindowedHighlight(highlightCacheKey.value);

  if (!cachedHighlight) {
    return;
  }

  loadedHighlightBatchStarts.value = cachedHighlight.loadedBatchStarts;
  highlightRootStyle.value = cachedHighlight.rootStyle;
  tokenLineCache.value = cachedHighlight.tokenLines;
  highlightState.value = 'ready';
};

const refreshWindowedPreview = () => {
  previewSessionId += 1;
  textIndexer.cancel();
  lineIndex.value = null;
  hydrateCachedWindowedHighlight();

  if (!props.windowed || props.sourceContent.length === 0) {
    virtualState.value = 'idle';
    flushScrollMetrics();
    return;
  }

  const cachedLineIndex = getCachedWindowedLineIndex(sourceCacheKey.value);

  if (cachedLineIndex) {
    lineIndex.value = cachedLineIndex;
    virtualState.value = 'ready';
    flushScrollMetrics();
    return;
  }

  const currentSessionId = previewSessionId;

  virtualState.value = 'indexing';
  textIndexer
    .index(props.sourceContent)
    .then((nextLineIndex) => {
      if (currentSessionId !== previewSessionId) {
        return;
      }

      setCachedWindowedLineIndex(sourceCacheKey.value, nextLineIndex);
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

const viewportRange = computed(() => {
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

  const visibleLineCount = Math.ceil(containerHeightPx.value / LINE_HEIGHT_PX);
  const startLine = Math.max(Math.floor(scrollTopPx.value / LINE_HEIGHT_PX), 0);
  const endLine = Math.min(startLine + visibleLineCount, totalLineCount);

  return {
    endLine,
    startLine,
  };
});

const visibleRange = computed(() => {
  const totalLineCount = lineIndex.value?.lineCount ?? 0;

  if (totalLineCount <= 0) {
    return {
      endLine: 0,
      startLine: 0,
    };
  }

  return {
    endLine: Math.min(
      viewportRange.value.endLine + OVERSCAN_LINES,
      totalLineCount,
    ),
    startLine: Math.max(viewportRange.value.startLine - OVERSCAN_LINES, 0),
  };
});

const highlightedRange = computed(() => {
  const totalLineCount = lineIndex.value?.lineCount ?? 0;

  if (!shouldHighlightWindow.value || totalLineCount <= 0) {
    return {
      endLine: 0,
      startLine: 0,
    };
  }

  return {
    endLine: Math.min(
      viewportRange.value.endLine + WINDOWED_HIGHLIGHT_OVERSCAN_LINES,
      totalLineCount,
    ),
    startLine: Math.max(
      viewportRange.value.startLine - WINDOWED_HIGHLIGHT_OVERSCAN_LINES,
      0,
    ),
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
  const nextVisibleLines: Array<{
    number: number;
    text: string;
    tokens: WindowedCodePreviewLine['tokens'] | null;
  }> = [];

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
      tokens: tokenLineCache.value.get(lineNumber) ?? null,
    });
  }

  return nextVisibleLines;
});

const previewClasses = computed(() => [
  'site-devtools-source-viewer__text',
  props.windowed && lineIndex.value
    ? 'site-devtools-source-viewer__text--virtual'
    : '',
  shouldHighlightWindow.value
    ? 'site-devtools-source-viewer__text--highlighted'
    : '',
  shouldHighlightWindow.value ? 'shiki' : '',
  shouldHighlightWindow.value ? 'shiki-themes' : '',
  shouldHighlightWindow.value ? 'vitesse-light' : '',
  shouldHighlightWindow.value ? 'vitesse-dark' : '',
]);

const isHighlightRangeCovered = () => {
  if (
    !shouldHighlightWindow.value ||
    highlightedRange.value.endLine <= highlightedRange.value.startLine
  ) {
    return true;
  }

  for (
    let batchStartLine =
      Math.floor(
        highlightedRange.value.startLine / WINDOWED_HIGHLIGHT_BATCH_LINES,
      ) * WINDOWED_HIGHLIGHT_BATCH_LINES;
    batchStartLine < highlightedRange.value.endLine;
    batchStartLine += WINDOWED_HIGHLIGHT_BATCH_LINES
  ) {
    if (!loadedHighlightBatchStarts.value.has(batchStartLine)) {
      return false;
    }
  }

  return true;
};

const requestWindowedHighlightRange = () => {
  if (!lineIndex.value || !shouldHighlightWindow.value) {
    textHighlighter.cancel();

    if (!shouldHighlightWindow.value) {
      highlightState.value = 'idle';
    }

    return;
  }

  if (
    highlightedRange.value.endLine <= highlightedRange.value.startLine ||
    isHighlightRangeCovered()
  ) {
    if (tokenLineCache.value.size > 0) {
      highlightState.value = 'ready';
    }

    return;
  }

  const currentSessionId = ++highlightSessionId;

  highlightState.value = 'rendering';
  textHighlighter
    .render({
      rangeEnd: highlightedRange.value.endLine,
      rangeStart: highlightedRange.value.startLine,
      sourceContent: props.sourceContent,
      sourceKey: sourceCacheKey.value,
      sourcePath: props.sourcePath,
      theme: themeKey.value,
    })
    .then((result) => {
      if (currentSessionId !== highlightSessionId) {
        return;
      }

      const nextTokenLineCache = new Map(tokenLineCache.value);

      for (const tokenLine of result.tokenLines) {
        nextTokenLineCache.set(tokenLine.lineNumber, tokenLine.tokens);
      }

      const nextLoadedBatchStarts = new Set(loadedHighlightBatchStarts.value);

      for (
        let batchStartLine = result.resolvedStartLine;
        batchStartLine < result.resolvedEndLine;
        batchStartLine += WINDOWED_HIGHLIGHT_BATCH_LINES
      ) {
        nextLoadedBatchStarts.add(batchStartLine);
      }

      tokenLineCache.value = nextTokenLineCache;
      loadedHighlightBatchStarts.value = nextLoadedBatchStarts;
      highlightRootStyle.value = result.rootStyle;
      highlightState.value = 'ready';
      setCachedWindowedHighlight(highlightCacheKey.value, {
        loadedBatchStarts: nextLoadedBatchStarts,
        rootStyle: result.rootStyle,
        tokenLines: nextTokenLineCache,
      });
    })
    .catch((error) => {
      if (
        currentSessionId !== highlightSessionId ||
        isBackgroundCodePreviewAbortError(error)
      ) {
        return;
      }

      highlightState.value = 'error';
    });
};

watch(
  () => `${props.sourcePath || ''}::${props.sourceContent}`,
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

watch(
  () => props.previewMode,
  () => {
    hydrateCachedWindowedHighlight();
    requestWindowedHighlightRange();
  },
);

watch(themeKey, () => {
  hydrateCachedWindowedHighlight();
  requestWindowedHighlightRange();
});

watch(
  () =>
    [
      highlightedRange.value.startLine,
      highlightedRange.value.endLine,
      props.previewMode,
      props.sourceContent,
      props.sourcePath,
      props.windowed,
      themeKey.value,
      lineIndex.value?.lineCount ?? 0,
    ].join(':'),
  () => {
    requestWindowedHighlightRange();
  },
);

onMounted(() => {
  attachScrollContainer();
  refreshWindowedPreview();
});

onBeforeUnmount(() => {
  previewSessionId += 1;
  highlightSessionId += 1;
  textIndexer.dispose();
  textHighlighter.dispose();
  detachScrollContainer();
});
</script>

<template>
  <div ref="rootRef" class="site-devtools-source-viewer__text-shell">
    <pre
      v-if="windowed && lineIndex"
      :class="previewClasses"
      :style="
        shouldHighlightWindow && highlightRootStyle
          ? highlightRootStyle
          : undefined
      "
    >
      <code class="site-devtools-source-viewer__virtual-code">
        <span
          v-if="topSpacerHeightPx > 0"
          class="site-devtools-source-viewer__virtual-spacer"
          :style="{ height: `${topSpacerHeightPx}px` }"
        />
        <span
          v-for="line in visibleLines"
          :key="line.number"
          class="site-devtools-source-viewer__virtual-line"
          ><template v-if="line.tokens && line.tokens.length > 0"
            ><span
              v-for="(token, index) in line.tokens"
              :key="`${line.number}:${index}`"
              class="site-devtools-source-viewer__virtual-token"
              :style="token.htmlStyle"
              >{{ token.content }}</span
            ></template
          ><template v-else>{{ line.text || ' ' }}</template></span
        >
        <span
          v-if="bottomSpacerHeightPx > 0"
          class="site-devtools-source-viewer__virtual-spacer"
          :style="{ height: `${bottomSpacerHeightPx}px` }"
        />
      </code>
    </pre>
    <pre v-else class="site-devtools-source-viewer__text">
      <code>{{
        windowed ? fallbackPreviewContent : sourceContent
      }}</code>
    </pre>
    <p
      v-if="windowed && virtualState === 'indexing'"
      class="site-devtools-source-viewer__virtual-hint"
    >
      Preparing a windowed preview for smoother scrolling. The first part of the
      file is shown until indexing finishes.
    </p>
    <p
      v-else-if="shouldHighlightWindow && highlightState === 'rendering'"
      class="site-devtools-source-viewer__virtual-hint"
    >
      Coloring the visible range in the background. Uncolored lines stay
      readable while syntax tokens catch up.
    </p>
    <p
      v-else-if="shouldHighlightWindow && highlightState === 'error'"
      class="site-devtools-source-viewer__virtual-hint"
    >
      Syntax highlighting is unavailable for this large file right now. The
      windowed plain-text preview stays available.
    </p>
    <p
      v-else-if="windowed && virtualState === 'error'"
      class="site-devtools-source-viewer__virtual-hint is-error"
    >
      Windowed preview could not be prepared. The visible snippet stays
      available, and Copy/Download still uses the full source.
    </p>
  </div>
</template>
