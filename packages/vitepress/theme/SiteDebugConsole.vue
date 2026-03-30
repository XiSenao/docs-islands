<script setup lang="ts">
import { querySelectorAllToArray } from '@docs-islands/utils/dom-iterable';
import {
  getSiteDebugHmrMetrics,
  getSiteDebugRenderMetrics,
  resetSiteDebugHmrMetrics,
  resetSiteDebugRenderMetrics,
  setSiteDebugEnabled,
  SITE_DEBUG_EVENT_NAME,
  SITE_DEBUG_HMR_METRIC_EVENT_NAME,
  SITE_DEBUG_HMR_METRICS_KEY,
  SITE_DEBUG_MODE_EVENT_NAME,
  SITE_DEBUG_RENDER_METRIC_EVENT_NAME,
  SITE_DEBUG_RENDER_METRICS_KEY,
  syncSiteDebugEnabledFromQuery,
  type SiteDebugEventDetail,
  type SiteDebugHmrMetric,
  type SiteDebugLevel,
  type SiteDebugModeChangeDetail,
  type SiteDebugRenderMetric,
} from '@docs-islands/vitepress/internal/debug';
import { useData } from 'vitepress';
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue';
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
import {
  createMetafileLookup,
  getBuildMetricForRender as getIndexedBuildMetricForRender,
  getSpaSyncEffectForRender as getIndexedSpaSyncEffectForRender,
  getMetricPageId,
  resolvePageMetafileState,
  type ComponentBuildMetric,
  type PageMetafile,
  type SpaSyncComponentEffect,
} from './debug-inspector';
import {
  formatForDisplay,
  isInspectableRecord,
  normalizeConsoleArgs,
  normalizeGlobalPath,
  resolveGlobalPath as resolveInspectableGlobalPath,
  serializeInspectable,
  serializePayload,
} from './site-debug-inspectable';
import './site-debug-panel-shared.css';
import {
  clamp,
  getCurrentPageCandidates as getCurrentRuntimePageCandidates,
  getRenderMetricKey,
  getResourceTargetDetails,
  getDevSourceEndpoint as getRuntimeDevSourceEndpoint,
  getCurrentPageId as getRuntimePageId,
  getRenderContainerElement as getRuntimeRenderContainerElement,
  getRenderContainerLabel as getRuntimeRenderContainerLabel,
  getThemeSnapshot,
} from './site-debug-runtime';
import {
  createSiteDebugLoadingProgress,
  DEFAULT_GLOBAL_PATH,
  ENABLE_HMR_DEBUG_UI,
  formatBytes,
  formatDuration,
  formatSourceLanguageLabel,
  getHmrMechanismDescription,
  getHmrMechanismLabel,
  getHmrUpdateTypeLabel,
  getResolvedRenderMode,
  getStatusLabel,
  getStatusTone,
  getVsCodeFileHref,
  getVsCodeSourceHref,
  GLOBAL_PRESETS,
  hasDisplayValue,
  isGeneratedVirtualModuleId,
  MAX_DEBUG_ENTRIES,
  OVERLAY_PANEL_WIDTH,
  renderMetricComponentAttr,
  renderMetricContainerAttr,
  renderMetricDirectiveAttr,
  renderMetricSpaSyncAttr,
  type BundleChunkDetail,
  type BundleChunkResourceItem,
  type BundleSourceModuleSelection,
  type OverlayMetricDetailKind,
  type PreviewState,
  type RenderMetricOverlay,
  type RenderMetricView,
  type SiteDebugAction,
  type SiteDebugEntry,
  type SiteDebugLoadingProgress,
  type SiteDebugWindow,
} from './site-debug-shared';
import {
  formatPreviewContent,
  highlightCodeContent,
  loadRemoteTextContent,
  type RemoteTextContentProgress,
} from './site-debug-source-preview';
import {
  formatPercent,
  getBundleBreakdownItems,
  getEqualGridStyle,
  getHmrEventItems,
  getHmrStageItems,
  getRenderMetricGridItems,
  getSpaSyncHtmlPatch,
  getSpaSyncSummaryItems,
  shouldShowLatestHmrMetric as shouldShowLatestHmrMetricBase,
} from './site-debug-view-model';
import {
  analyzeSiteDebugRenderMetricWebVitals,
  destroySiteDebugWebVitalsTracking,
  ensureSiteDebugWebVitalsTracking,
  SITE_DEBUG_WEB_VITALS_EVENT_NAME,
} from './site-debug-web-vitals';
import SiteDebugChunkResourceModal from './SiteDebugChunkResourceModal.vue';
import SiteDebugMetricDetailModal from './SiteDebugMetricDetailModal.vue';
import SiteDebugSourceViewerModal from './SiteDebugSourceViewerModal.vue';
import SiteDebugVsCodeLink from './SiteDebugVsCodeLink.vue';

const { isDark } = useData();

const debugDialogRef = ref<HTMLDialogElement | null>(null);
const ENABLE_MPA_DEBUG_UI =
  (import.meta as ImportMeta & { env?: { MPA?: boolean } }).env?.MPA === true;
const DEV_HIDDEN_GLOBAL_PRESET_PATHS = new Set([
  '__DOCS_ISLANDS_SITE_DEBUG__',
  '__PAGE_METAFILE__',
]);
const isGlobalPresetVisible = (path: string) =>
  !(ENABLE_HMR_DEBUG_UI && DEV_HIDDEN_GLOBAL_PRESET_PATHS.has(path)) &&
  !(
    path === DEFAULT_GLOBAL_PATH &&
    (ENABLE_HMR_DEBUG_UI || ENABLE_MPA_DEBUG_UI)
  ) &&
  (ENABLE_HMR_DEBUG_UI || path !== SITE_DEBUG_HMR_METRICS_KEY);
const getDefaultGlobalInspectorPath = () =>
  isGlobalPresetVisible(DEFAULT_GLOBAL_PATH)
    ? DEFAULT_GLOBAL_PATH
    : (GLOBAL_PRESETS.find((preset) => isGlobalPresetVisible(preset.path))
        ?.path ?? DEFAULT_GLOBAL_PATH);
const debugEnabled = ref(false);
const debugOpen = ref(false);
const entries = ref<SiteDebugEntry[]>([]);
const hmrMetrics = ref<SiteDebugHmrMetric[]>([]);
const renderMetrics = ref<SiteDebugRenderMetric[]>([]);
const renderMetricOverlays = ref<RenderMetricOverlay[]>([]);
const allPageMetafiles = ref<PageMetafile[]>([]);
const currentPageMetafile = ref<PageMetafile | null>(null);
const selectedRenderMetricKey = ref<string | null>(null);
const activeOverlayMetricDetail = ref<{
  kind: OverlayMetricDetailKind;
  metricKey: string;
} | null>(null);
const activeBundleChunkDetail = ref<BundleChunkDetail | null>(null);
const activeBundleSourceModule = ref<BundleSourceModuleSelection | null>(null);
const activeBundleChunkContent = ref('');
const activeBundleChunkHighlightedHtml = ref('');
const activeBundleChunkState = ref<PreviewState>('idle');
const activeBundleChunkError = ref('');
const activeBundleChunkLoadingProgress = ref<SiteDebugLoadingProgress>(
  createSiteDebugLoadingProgress('Fetching chunk resource'),
);
const activeBundleSourceContent = ref('');
const activeBundleSourceHighlightedHtml = ref('');
const activeBundleSourceState = ref<PreviewState>('idle');
const activeBundleSourceError = ref('');
const activeBundleSourceLoadingProgress = ref<SiteDebugLoadingProgress>(
  createSiteDebugLoadingProgress('Fetching module source'),
);
const activeSpaSyncCssContent = ref('');
const activeSpaSyncCssHighlightedHtml = ref('');
const activeSpaSyncCssState = ref<PreviewState>('idle');
const activeSpaSyncCssError = ref('');
const activeSpaSyncCssLoadingProgress = ref<SiteDebugLoadingProgress>(
  createSiteDebugLoadingProgress('Fetching required CSS'),
);
const activeSpaSyncHtmlContent = ref('');
const activeSpaSyncHtmlHighlightedHtml = ref('');
const activeSpaSyncHtmlState = ref<PreviewState>('idle');
const activeSpaSyncHtmlError = ref('');
const activeSpaSyncHtmlLoadingProgress = ref<SiteDebugLoadingProgress>(
  createSiteDebugLoadingProgress('Preparing patched HTML'),
);
const globalPath = ref(getDefaultGlobalInspectorPath());
const actionFeedback = ref<{
  action: SiteDebugAction;
  label: string;
}>({
  action: null,
  label: '',
});
const actionFeedbackTarget = ref<string | null>(null);
const webVitalsVersion = ref(0);

let entryId = 0;
let restoreModalScrollLock: (() => void) | null = null;
let lastHref = '';
let routePollTimer: number | undefined;
let originalConsoleLog: typeof console.log | null = null;
let originalConsoleWarn: typeof console.warn | null = null;
let originalConsoleError: typeof console.error | null = null;
let stopDebugListeners: (() => void) | null = null;
let actionFeedbackTimer: number | undefined;
let overlaySyncFrame: number | undefined;
let overlaySyncTimers: number[] = [];
let pageMetafileSyncTimers: number[] = [];

const MAX_OBJECT_KEYS = 40;
const getDebugWindow = () => window as unknown as SiteDebugWindow;
const resetLoadingProgress = (
  target: Ref<SiteDebugLoadingProgress>,
  label: string,
) => {
  target.value = createSiteDebugLoadingProgress(label);
};
const updateLoadingProgress = (
  target: Ref<SiteDebugLoadingProgress>,
  patch: Partial<SiteDebugLoadingProgress>,
) => {
  target.value = {
    ...target.value,
    ...patch,
  };
};
const formatTransferBytes = (value: number) =>
  value > 0 ? formatBytes(value) : '0 B';
const resolveMetricsInspectorValue = (path: string) => {
  const normalizedPath = normalizeGlobalPath(path);

  if (normalizedPath === SITE_DEBUG_HMR_METRICS_KEY) {
    return hmrMetrics.value;
  }

  return null;
};
const applyRemoteFetchProgress = (
  target: Ref<SiteDebugLoadingProgress>,
  progress: RemoteTextContentProgress,
  label: string,
) => {
  const hasKnownTotal =
    typeof progress.totalBytes === 'number' && progress.totalBytes > 0;

  updateLoadingProgress(target, {
    detail: hasKnownTotal
      ? `${formatTransferBytes(progress.loadedBytes)} / ${formatTransferBytes(progress.totalBytes ?? 0)}`
      : `${formatTransferBytes(progress.loadedBytes)} transferred`,
    indeterminate: !hasKnownTotal,
    label,
    value: hasKnownTotal
      ? 0.08 +
        Math.min(progress.loadedBytes / (progress.totalBytes ?? 1), 1) * 0.64
      : 0.22,
  });
};
const resolveGlobalPath = (path: string) =>
  typeof window === 'undefined'
    ? undefined
    : (resolveMetricsInspectorValue(path) ??
      resolveInspectableGlobalPath(path, getDebugWindow()));
const shouldShowLatestHmrMetric = (view: RenderMetricView) =>
  ENABLE_HMR_DEBUG_UI && shouldShowLatestHmrMetricBase(view);
const getCurrentPageCandidates = () =>
  typeof window === 'undefined'
    ? ['/']
    : getCurrentRuntimePageCandidates(getDebugWindow());
const getCurrentPageId = () =>
  typeof window === 'undefined' ? '/' : getRuntimePageId(getDebugWindow());
const getResolvedDevSourceEndpoint = (sourcePath?: string) =>
  typeof window === 'undefined'
    ? null
    : getRuntimeDevSourceEndpoint(getDebugWindow(), sourcePath);
const getResolvedRenderContainerElement = (renderId: string) =>
  getRuntimeRenderContainerElement(renderId, renderMetricContainerAttr);
const getResolvedRenderContainerLabel = (element: HTMLElement | null) =>
  getRuntimeRenderContainerLabel(element);

const pushLog = (
  level: SiteDebugLevel,
  source: string,
  message: string,
  payload?: unknown,
) => {
  const entry: SiteDebugEntry = {
    details: serializePayload(payload),
    id: ++entryId,
    level,
    message,
    source,
    time: new Date().toISOString(),
  };

  const nextEntries = [...entries.value.slice(-(MAX_DEBUG_ENTRIES - 1)), entry];

  entries.value = nextEntries;
  getDebugWindow().__DOCS_ISLANDS_SITE_DEBUG_LOGS__ = nextEntries;
};

const syncRenderMetrics = () => {
  if (typeof window === 'undefined') {
    renderMetrics.value = [];
    return;
  }

  renderMetrics.value = getSiteDebugRenderMetrics();
};

const syncHmrMetrics = () => {
  if (typeof window === 'undefined' || !ENABLE_HMR_DEBUG_UI) {
    hmrMetrics.value = [];
    return;
  }

  hmrMetrics.value = getSiteDebugHmrMetrics();
};

const syncCurrentPageMetafile = () => {
  if (typeof window === 'undefined') {
    currentPageMetafile.value = null;
    allPageMetafiles.value = [];
    return;
  }

  const { allPageMetafiles: nextMetafiles, currentPageMetafile: nextCurrent } =
    resolvePageMetafileState(getDebugWindow());

  allPageMetafiles.value = nextMetafiles;
  currentPageMetafile.value = nextCurrent;
};

const metafileLookup = computed(() => {
  return createMetafileLookup({
    allPageMetafiles: allPageMetafiles.value,
    currentPageMetafile: currentPageMetafile.value,
  });
});

const getBuildMetricForRender = ({
  componentName,
  renderId,
}: {
  componentName: string;
  renderId: string;
}): ComponentBuildMetric | null => {
  return getIndexedBuildMetricForRender(
    metafileLookup.value,
    componentName,
    renderId,
  );
};

const getSpaSyncEffectForRender = ({
  componentName,
  renderId,
}: {
  componentName: string;
  renderId: string;
}): SpaSyncComponentEffect | null => {
  return getIndexedSpaSyncEffectForRender(
    metafileLookup.value,
    componentName,
    renderId,
  );
};

const isCurrentMetricPage = (metric: SiteDebugRenderMetric): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }

  return getMetricPageId(getDebugWindow(), metric);
};

const getHmrMetricsForRender = ({
  componentName,
  renderId,
}: {
  componentName: string;
  renderId: string;
}) => {
  const currentPageCandidates = new Set(getCurrentPageCandidates());

  return [...hmrMetrics.value]
    .filter((metric) => {
      if (
        Array.isArray(metric.renderIds) &&
        metric.renderIds.includes(renderId)
      ) {
        return true;
      }

      if (metric.componentName !== componentName) {
        return false;
      }

      if (!metric.pageId) {
        return true;
      }

      return currentPageCandidates.has(metric.pageId);
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
};

const isSelectedRenderMetric = (metricKey: string) =>
  selectedRenderMetricKey.value === metricKey;

const toggleRenderMetricDetail = (metricKey: string) => {
  selectedRenderMetricKey.value =
    selectedRenderMetricKey.value === metricKey ? null : metricKey;

  if (selectedRenderMetricKey.value !== metricKey) {
    activeOverlayMetricDetail.value = null;
  }

  scheduleRenderMetricOverlaySync();
};

const openOverlayMetricDetail = (
  metricKey: string,
  kind: OverlayMetricDetailKind,
) => {
  activeOverlayMetricDetail.value = {
    kind,
    metricKey,
  };
  activeBundleChunkDetail.value = null;
  activeBundleChunkContent.value = '';
  activeBundleChunkHighlightedHtml.value = '';
  activeBundleChunkState.value = 'idle';
  activeBundleChunkError.value = '';
  resetLoadingProgress(
    activeBundleChunkLoadingProgress,
    'Fetching chunk resource',
  );
  activeBundleSourceModule.value = null;
  activeBundleSourceContent.value = '';
  activeBundleSourceHighlightedHtml.value = '';
  activeBundleSourceState.value = 'idle';
  activeBundleSourceError.value = '';
  resetLoadingProgress(
    activeBundleSourceLoadingProgress,
    'Fetching module source',
  );
  activeSpaSyncCssContent.value = '';
  activeSpaSyncCssHighlightedHtml.value = '';
  activeSpaSyncCssState.value = 'idle';
  activeSpaSyncCssError.value = '';
  resetLoadingProgress(
    activeSpaSyncCssLoadingProgress,
    'Fetching required CSS',
  );
  activeSpaSyncHtmlContent.value = '';
  activeSpaSyncHtmlHighlightedHtml.value = '';
  activeSpaSyncHtmlState.value = 'idle';
  activeSpaSyncHtmlError.value = '';
  resetLoadingProgress(
    activeSpaSyncHtmlLoadingProgress,
    'Preparing patched HTML',
  );

  if (kind === 'css') {
    void loadActiveSpaSyncCssPreview();
  }

  if (kind === 'html') {
    void loadActiveSpaSyncHtmlPreview();
  }
};

const closeOverlayMetricDetail = () => {
  activeOverlayMetricDetail.value = null;
  activeBundleChunkDetail.value = null;
  activeBundleChunkContent.value = '';
  activeBundleChunkHighlightedHtml.value = '';
  activeBundleChunkState.value = 'idle';
  activeBundleChunkError.value = '';
  resetLoadingProgress(
    activeBundleChunkLoadingProgress,
    'Fetching chunk resource',
  );
  activeBundleSourceModule.value = null;
  activeBundleSourceContent.value = '';
  activeBundleSourceHighlightedHtml.value = '';
  activeBundleSourceState.value = 'idle';
  activeBundleSourceError.value = '';
  resetLoadingProgress(
    activeBundleSourceLoadingProgress,
    'Fetching module source',
  );
  activeSpaSyncCssContent.value = '';
  activeSpaSyncCssHighlightedHtml.value = '';
  activeSpaSyncCssState.value = 'idle';
  activeSpaSyncCssError.value = '';
  resetLoadingProgress(
    activeSpaSyncCssLoadingProgress,
    'Fetching required CSS',
  );
  activeSpaSyncHtmlContent.value = '';
  activeSpaSyncHtmlHighlightedHtml.value = '';
  activeSpaSyncHtmlState.value = 'idle';
  activeSpaSyncHtmlError.value = '';
  resetLoadingProgress(
    activeSpaSyncHtmlLoadingProgress,
    'Preparing patched HTML',
  );
};

const getScriptStateSnapshot = () => ({
  cssBundles: querySelectorAllToArray(
    document,
    'link[data-vrite-css-bundle]',
  ).map((link) => ({
    href: link.getAttribute('href') || '',
    rel: link.getAttribute('rel') || '',
  })),
  modulePreloads: querySelectorAllToArray(document, 'link[rel="modulepreload"]')
    .map((link) => link.getAttribute('href') || '')
    .slice(-MAX_OBJECT_KEYS),
  moduleScripts: querySelectorAllToArray(document, 'script[type="module"]')
    .map((script) => script.getAttribute('src') || '[inline-module]')
    .slice(-MAX_OBJECT_KEYS),
});

const getRuntimeSnapshot = () => {
  const debugWindow = getDebugWindow();
  const injectedComponents = debugWindow.__INJECT_COMPONENT__;
  const pageMetafile =
    debugWindow.__PAGE_METAFILE__ ||
    debugWindow.__COMPONENT_MANAGER__?.pageMetafile;
  const currentInjectedPage = getCurrentPageCandidates().find((candidate) =>
    Boolean(injectedComponents?.[candidate]),
  );
  const currentMetafilePage = getCurrentPageCandidates().find((candidate) =>
    Boolean(pageMetafile?.[candidate]),
  );

  return {
    componentManager: serializeInspectable(debugWindow.__COMPONENT_MANAGER__),
    currentInjectedPage: currentInjectedPage ?? null,
    currentInjectedValue: serializeInspectable(
      currentInjectedPage
        ? injectedComponents?.[currentInjectedPage]
        : undefined,
    ),
    currentMetafilePage: currentMetafilePage ?? null,
    currentMetafileValue: serializeInspectable(
      currentMetafilePage ? pageMetafile?.[currentMetafilePage] : undefined,
    ),
    href: window.location.href,
    hmrMetrics: serializeInspectable(hmrMetrics.value),
    injectComponentPages: injectedComponents
      ? Object.keys(injectedComponents)
      : [],
    pageMetafilePages: pageMetafile ? Object.keys(pageMetafile) : [],
    react: serializeInspectable(debugWindow.React),
    reactDom: serializeInspectable(debugWindow.ReactDOM),
    renderMetrics: serializeInspectable(renderMetrics.value),
    scripts: getScriptStateSnapshot(),
    ...(!ENABLE_HMR_DEBUG_UI && !ENABLE_MPA_DEBUG_UI
      ? {
          siteData: serializeInspectable(debugWindow.__VP_SITE_DATA__),
        }
      : {}),
    theme: getThemeSnapshot(),
  };
};

const activeOverlayMetricDetailView = computed<RenderMetricView | null>(() => {
  const metricKey = activeOverlayMetricDetail.value?.metricKey;

  if (!metricKey) {
    return null;
  }

  return (
    renderMetricOverlays.value.find((overlay) => overlay.key === metricKey)
      ?.view ??
    renderMetricViews.value.find((view) => view.metricKey === metricKey) ??
    null
  );
});

const activeBundleSourceModuleMetric = computed(() => {
  const target = activeBundleSourceModule.value;
  const view = activeOverlayMetricDetailView.value;

  if (!target) {
    return null;
  }

  const matchedModule =
    view?.buildMetric?.modules?.find(
      (moduleMetric) =>
        moduleMetric.file === target.file && moduleMetric.id === target.id,
    ) ?? null;

  if (matchedModule) {
    return matchedModule;
  }

  return {
    bytes: 0,
    file: target.file,
    id: target.id,
    sourceAssetFile: target.sourceAssetFile,
    sourcePath: target.sourcePath,
  };
});

const activeBundleSourcePreviewPath = computed(() => {
  if (!activeBundleSourceModule.value) {
    return '';
  }

  return getBundleSourcePreviewPath({
    file: activeBundleSourceModule.value.file,
    id: activeBundleSourceModule.value.id,
    isGeneratedVirtualModule:
      activeBundleSourceModule.value.isGeneratedVirtualModule,
    sourcePath:
      activeBundleSourceModuleMetric.value?.sourcePath ||
      activeBundleSourceModule.value.sourcePath,
  });
});

const activeBundleSourceBrowseHref = computed(() => {
  if (activeBundleSourceModule.value?.isGeneratedVirtualModule) {
    return null;
  }

  return (
    getVsCodeFileHref(
      activeBundleSourceModuleMetric.value?.sourcePath ||
        activeBundleSourceModule.value?.sourcePath,
    ) || null
  );
});

const activeBundleSourceTitle = computed(
  () => activeBundleSourcePreviewPath.value.split('/').pop() || '',
);

const activeSpaSyncCssAssets = computed(
  () =>
    activeOverlayMetricDetailView.value?.spaSyncEffect?.blockingCssFiles ?? [],
);

const activeSpaSyncHtmlPatch = computed(() =>
  getSpaSyncHtmlPatch(
    activeOverlayMetricDetailView.value?.spaSyncEffect ?? null,
    activeOverlayMetricDetailView.value?.metric.renderId ?? null,
  ),
);

const activeSpaSyncHtmlPreview = computed(() => {
  if (activeSpaSyncHtmlPatch.value?.html) {
    return activeSpaSyncHtmlPatch.value;
  }

  const renderId = activeOverlayMetricDetailView.value?.metric.renderId;
  if (!renderId) {
    return null;
  }

  const containerElement = getResolvedRenderContainerElement(renderId);
  const runtimeHtml = containerElement?.innerHTML?.trim();
  if (!runtimeHtml) {
    return null;
  }

  return {
    bytes: new Blob([runtimeHtml]).size,
    html: runtimeHtml,
    renderId,
  };
});

const activeBundleChunkModules = computed(() => {
  const chunkDetail = activeBundleChunkDetail.value;
  const buildMetric = activeOverlayMetricDetailView.value?.buildMetric;

  if (!chunkDetail || !buildMetric?.modules?.length) {
    return [];
  }

  return buildMetric.modules
    .filter((moduleMetric) => moduleMetric.file === chunkDetail.file)
    .sort((left, right) => right.bytes - left.bytes)
    .map((moduleMetric) => {
      const isGeneratedVirtualModule =
        !moduleMetric.sourceAssetFile &&
        !moduleMetric.sourcePath &&
        isGeneratedVirtualModuleId(moduleMetric.id);
      const canBrowseSource = Boolean(
        moduleMetric.sourceAssetFile || moduleMetric.sourcePath,
      );

      return {
        bytes: moduleMetric.bytes,
        canBrowseSource,
        canPreview: canBrowseSource || isGeneratedVirtualModule,
        file: moduleMetric.file,
        id: moduleMetric.id,
        isGeneratedVirtualModule,
        percent: formatPercent(moduleMetric.bytes, chunkDetail.bytes),
        shortFile: moduleMetric.id.split('/').pop() || moduleMetric.id,
        sourceAssetFile: moduleMetric.sourceAssetFile,
        sourcePath: moduleMetric.sourcePath,
      };
    });
});

const loadActiveSpaSyncCssPreview = async () => {
  const cssAssets = activeSpaSyncCssAssets.value;

  activeSpaSyncCssContent.value = '';
  activeSpaSyncCssHighlightedHtml.value = '';
  activeSpaSyncCssError.value = '';
  resetLoadingProgress(
    activeSpaSyncCssLoadingProgress,
    'Fetching required CSS',
  );

  if (!cssAssets.length) {
    activeSpaSyncCssState.value = 'error';
    activeSpaSyncCssError.value =
      'No required CSS assets were found for this render.';
    return;
  }

  activeSpaSyncCssState.value = 'loading';
  updateLoadingProgress(activeSpaSyncCssLoadingProgress, {
    detail: `${cssAssets.length} stylesheet${cssAssets.length > 1 ? 's' : ''}`,
    indeterminate: true,
    label: 'Fetching required CSS',
    value: 0.12,
  });

  try {
    const combinedCssContent = (
      await Promise.all(
        cssAssets.map(async (asset, index) => {
          const rawCssContent = await loadRemoteTextContent([asset.file], {
            onProgress: (progress) => {
              applyRemoteFetchProgress(
                activeSpaSyncCssLoadingProgress,
                progress,
                `Fetching CSS ${index + 1}/${cssAssets.length}`,
              );
            },
          });
          updateLoadingProgress(activeSpaSyncCssLoadingProgress, {
            detail: asset.file,
            indeterminate: false,
            label: `Formatting CSS ${index + 1}/${cssAssets.length}`,
            value: 0.72,
          });
          const formattedCssContent = await formatPreviewContent(
            rawCssContent,
            asset.file,
          );

          return `/* ${asset.file} */\n${formattedCssContent.trim()}`;
        }),
      )
    ).join('\n\n');

    updateLoadingProgress(activeSpaSyncCssLoadingProgress, {
      detail: cssAssets[0]?.file || 'required.css',
      indeterminate: false,
      label: 'Highlighting CSS preview',
      value: 0.9,
    });
    activeSpaSyncCssContent.value = combinedCssContent;
    activeSpaSyncCssHighlightedHtml.value = await highlightCodeContent(
      combinedCssContent,
      cssAssets[0]?.file || 'required.css',
    );
    activeSpaSyncCssState.value = 'ready';
  } catch (error) {
    activeSpaSyncCssState.value = 'error';
    activeSpaSyncCssError.value =
      error instanceof Error ? error.message : String(error);
  }
};

const loadActiveSpaSyncHtmlPreview = async () => {
  const htmlPatch = activeSpaSyncHtmlPreview.value;
  const componentName =
    activeOverlayMetricDetailView.value?.metric.componentName || 'component';

  activeSpaSyncHtmlContent.value = '';
  activeSpaSyncHtmlHighlightedHtml.value = '';
  activeSpaSyncHtmlError.value = '';
  resetLoadingProgress(
    activeSpaSyncHtmlLoadingProgress,
    'Preparing patched HTML',
  );

  if (!htmlPatch?.html) {
    activeSpaSyncHtmlState.value = 'error';
    activeSpaSyncHtmlError.value =
      'No patched HTML was recorded for this render.';
    return;
  }

  activeSpaSyncHtmlState.value = 'loading';
  updateLoadingProgress(activeSpaSyncHtmlLoadingProgress, {
    detail: `${formatTransferBytes(htmlPatch.bytes)} ready`,
    indeterminate: false,
    label: 'Formatting patched HTML',
    value: 0.42,
  });

  try {
    const formattedHtmlContent = await formatPreviewContent(
      htmlPatch.html,
      `${componentName}.spa-sync.html`,
    );

    updateLoadingProgress(activeSpaSyncHtmlLoadingProgress, {
      detail: `${componentName}.spa-sync.html`,
      indeterminate: false,
      label: 'Highlighting patched HTML',
      value: 0.86,
    });
    activeSpaSyncHtmlContent.value = formattedHtmlContent;
    activeSpaSyncHtmlHighlightedHtml.value = await highlightCodeContent(
      formattedHtmlContent,
      `${componentName}.spa-sync.html`,
    );
    activeSpaSyncHtmlState.value = 'ready';
  } catch (error) {
    activeSpaSyncHtmlState.value = 'error';
    activeSpaSyncHtmlError.value =
      error instanceof Error ? error.message : String(error);
  }
};

const copyActiveSpaSyncCss = async () => {
  if (!activeSpaSyncCssContent.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(activeSpaSyncCssContent.value);
    pushLog('info', 'debug-console', 'spa sync css copied', {
      files: activeSpaSyncCssAssets.value.map((asset) => asset.file),
      totalBytes:
        activeOverlayMetricDetailView.value?.spaSyncEffect?.blockingCssBytes,
    });
    showActionFeedback('copy-css', 'CSS Copied');
  } catch (error) {
    pushLog('error', 'debug-console', 'copy spa sync css failed', error);
  }
};

const closeBundleChunkDetail = () => {
  activeBundleChunkDetail.value = null;
  activeBundleChunkContent.value = '';
  activeBundleChunkHighlightedHtml.value = '';
  activeBundleChunkState.value = 'idle';
  activeBundleChunkError.value = '';
  resetLoadingProgress(
    activeBundleChunkLoadingProgress,
    'Fetching chunk resource',
  );
  closeBundleSourcePreview();
};

const openBundleChunkDetail = async (chunkItem: BundleChunkResourceItem) => {
  closeBundleSourcePreview();
  activeBundleChunkDetail.value = {
    bytes: chunkItem.bytes,
    file: chunkItem.file,
    moduleCount: chunkItem.moduleCount,
    type: chunkItem.type,
  };
  activeBundleChunkContent.value = '';
  activeBundleChunkHighlightedHtml.value = '';
  activeBundleChunkError.value = '';
  resetLoadingProgress(
    activeBundleChunkLoadingProgress,
    'Fetching chunk resource',
  );
  activeBundleChunkState.value = 'loading';
  updateLoadingProgress(activeBundleChunkLoadingProgress, {
    detail: chunkItem.file,
    indeterminate: true,
    label: 'Fetching chunk resource',
    value: 0.12,
  });

  try {
    const chunkContent = await loadRemoteTextContent([chunkItem.file], {
      onProgress: (progress) => {
        applyRemoteFetchProgress(
          activeBundleChunkLoadingProgress,
          progress,
          'Fetching chunk resource',
        );
      },
    });
    updateLoadingProgress(activeBundleChunkLoadingProgress, {
      detail: chunkItem.file,
      indeterminate: false,
      label: 'Formatting chunk preview',
      value: 0.76,
    });
    const formattedChunkContent = await formatPreviewContent(
      chunkContent,
      chunkItem.file,
    );

    updateLoadingProgress(activeBundleChunkLoadingProgress, {
      detail: chunkItem.file,
      indeterminate: false,
      label: 'Highlighting chunk preview',
      value: 0.92,
    });
    activeBundleChunkContent.value = formattedChunkContent;
    activeBundleChunkHighlightedHtml.value = await highlightCodeContent(
      formattedChunkContent,
      chunkItem.file,
    );
    activeBundleChunkState.value = 'ready';
  } catch (error) {
    activeBundleChunkState.value = 'error';
    activeBundleChunkError.value =
      error instanceof Error ? error.message : String(error);
  }
};

const copyActiveBundleChunkContent = async () => {
  if (!activeBundleChunkDetail.value || !activeBundleChunkContent.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(activeBundleChunkContent.value);
    pushLog('info', 'debug-console', 'bundle chunk copied', {
      bytes: activeBundleChunkDetail.value.bytes,
      file: activeBundleChunkDetail.value.file,
      moduleCount: activeBundleChunkDetail.value.moduleCount,
    });
    showActionFeedback(
      'copy-chunk',
      'Chunk Copied',
      activeBundleChunkDetail.value.file,
    );
  } catch (error) {
    pushLog('error', 'debug-console', 'copy bundle chunk failed', error);
  }
};

const handleBundleChunkResourceClick = (chunkItem: BundleChunkResourceItem) => {
  void openBundleChunkDetail(chunkItem);
};

const openBundleSourceModule = async (moduleMetric: {
  file: string;
  id: string;
  isGeneratedVirtualModule?: boolean;
  sourceAssetFile?: string;
  sourcePath?: string;
}) => {
  activeBundleSourceModule.value = {
    file: moduleMetric.file,
    id: moduleMetric.id,
    isGeneratedVirtualModule: moduleMetric.isGeneratedVirtualModule,
    sourceAssetFile: moduleMetric.sourceAssetFile,
    sourcePath: moduleMetric.sourcePath,
  };
  activeBundleSourceContent.value = '';
  activeBundleSourceHighlightedHtml.value = '';
  activeBundleSourceError.value = '';
  resetLoadingProgress(
    activeBundleSourceLoadingProgress,
    'Fetching module source',
  );

  if (
    !moduleMetric.sourceAssetFile &&
    !moduleMetric.sourcePath &&
    !moduleMetric.isGeneratedVirtualModule
  ) {
    activeBundleSourceState.value = 'error';
    activeBundleSourceError.value =
      'Source asset is not available for this module.';
    return;
  }

  activeBundleSourceState.value = 'loading';
  updateLoadingProgress(activeBundleSourceLoadingProgress, {
    detail: moduleMetric.sourcePath || moduleMetric.file,
    indeterminate: true,
    label: moduleMetric.isGeneratedVirtualModule
      ? 'Fetching generated module preview'
      : 'Fetching module source',
    value: 0.12,
  });

  try {
    const sourceContent = moduleMetric.isGeneratedVirtualModule
      ? await loadVirtualModulePreviewContent(moduleMetric)
      : await loadBundleSourceContent(moduleMetric);
    const previewPath = getBundleSourcePreviewPath(moduleMetric);
    updateLoadingProgress(activeBundleSourceLoadingProgress, {
      detail: previewPath,
      indeterminate: false,
      label: 'Formatting module source',
      value: 0.76,
    });
    const formattedSourceContent = await formatPreviewContent(
      sourceContent,
      previewPath,
    );

    updateLoadingProgress(activeBundleSourceLoadingProgress, {
      detail: previewPath,
      indeterminate: false,
      label: 'Highlighting module source',
      value: 0.92,
    });
    activeBundleSourceContent.value = formattedSourceContent;
    activeBundleSourceHighlightedHtml.value = await highlightCodeContent(
      formattedSourceContent,
      previewPath,
    );
    activeBundleSourceState.value = 'ready';
  } catch (error) {
    activeBundleSourceState.value = 'error';
    activeBundleSourceError.value =
      error instanceof Error ? error.message : String(error);
  }
};

const downloadActiveBundleSource = () => {
  const moduleMetric = activeBundleSourceModuleMetric.value;

  if (!moduleMetric || !activeBundleSourceContent.value) {
    return;
  }

  const blob = new Blob([activeBundleSourceContent.value], {
    type: 'text/plain;charset=utf-8',
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fileName =
    getBundleSourcePreviewPath({
      file: moduleMetric.file,
      id: moduleMetric.id,
      isGeneratedVirtualModule:
        activeBundleSourceModule.value?.isGeneratedVirtualModule,
      sourcePath: moduleMetric.sourcePath,
    })
      .split('/')
      .pop()
      ?.replace(/\?.*$/, '') || 'module-source.txt';

  link.href = objectUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(objectUrl);
};

const copyActiveBundleSource = async () => {
  const moduleMetric = activeBundleSourceModuleMetric.value;

  if (!moduleMetric || !activeBundleSourceContent.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(activeBundleSourceContent.value);
    pushLog('info', 'debug-console', 'bundle source copied', {
      moduleId: moduleMetric.id,
      sourcePath: moduleMetric.sourcePath || null,
    });
    showActionFeedback('copy-source', 'Source Copied');
  } catch (error) {
    pushLog('error', 'debug-console', 'copy bundle source failed', error);
  }
};

const closeBundleSourcePreview = () => {
  activeBundleSourceModule.value = null;
  activeBundleSourceContent.value = '';
  activeBundleSourceHighlightedHtml.value = '';
  activeBundleSourceState.value = 'idle';
  activeBundleSourceError.value = '';
  resetLoadingProgress(
    activeBundleSourceLoadingProgress,
    'Fetching module source',
  );
};

const loadBundleSourceContent = async (moduleMetric: {
  file: string;
  sourceAssetFile?: string;
  sourcePath?: string;
}) =>
  loadRemoteTextContent(
    [
      moduleMetric.sourceAssetFile,
      getResolvedDevSourceEndpoint(moduleMetric.sourcePath),
    ],
    {
      onProgress: (progress) => {
        applyRemoteFetchProgress(
          activeBundleSourceLoadingProgress,
          progress,
          'Fetching module source',
        );
      },
    },
  );

const loadVirtualModulePreviewContent = async (moduleMetric: {
  file: string;
  id: string;
}) => {
  const chunkContent = await loadRemoteTextContent([moduleMetric.file], {
    onProgress: (progress) => {
      applyRemoteFetchProgress(
        activeBundleSourceLoadingProgress,
        progress,
        'Fetching generated module preview',
      );
    },
  });

  return [
    '/*',
    ' * Generated virtual module preview',
    ` * Module ID: ${moduleMetric.id}`,
    ' * This module is emitted by the bundler/CommonJS interop layer.',
    ' * Preview content is the generated chunk output that contains it.',
    ' */',
    '',
    chunkContent,
  ].join('\n');
};

const getVirtualModuleDisplayId = (moduleId: string) =>
  moduleId.replace(/^\0+/, '').replace(/\?.*$/, '');

const getBundleSourcePreviewPath = (moduleMetric: {
  file: string;
  id: string;
  isGeneratedVirtualModule?: boolean;
  sourcePath?: string;
}) =>
  moduleMetric.isGeneratedVirtualModule
    ? getVirtualModuleDisplayId(moduleMetric.id) || moduleMetric.file
    : moduleMetric.sourcePath || moduleMetric.file || moduleMetric.id;

const renderMetricViews = computed<RenderMetricView[]>(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return [];
  }

  const currentWebVitalsVersion = webVitalsVersion.value;
  void currentWebVitalsVersion;

  const currentPageMetrics = renderMetrics.value.filter(isCurrentMetricPage);
  const scopedMetrics =
    currentPageMetrics.length > 0 ? currentPageMetrics : renderMetrics.value;
  const buildMetrics = scopedMetrics
    .map((metric) =>
      getBuildMetricForRender({
        componentName: metric.componentName,
        renderId: metric.renderId,
      }),
    )
    .filter((metric): metric is ComponentBuildMetric => Boolean(metric));
  const maxDuration = Math.max(
    1,
    ...scopedMetrics.map(
      (metric) =>
        metric.totalDurationMs ??
        metric.invokeDurationMs ??
        metric.waitForVisibilityMs ??
        0,
    ),
  );
  const maxSize = Math.max(
    1,
    ...buildMetrics.map((metric) => metric.estimatedTotalBytes),
  );

  return [...scopedMetrics]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map((metric) => {
      const buildMetric = getBuildMetricForRender({
        componentName: metric.componentName,
        renderId: metric.renderId,
      });
      const matchedHmrMetrics = getHmrMetricsForRender({
        componentName: metric.componentName,
        renderId: metric.renderId,
      });
      const element = getResolvedRenderContainerElement(metric.renderId);
      const durationValue =
        metric.totalDurationMs ??
        metric.invokeDurationMs ??
        metric.waitForVisibilityMs ??
        0;

      return {
        buildMetric,
        containerLabel: getResolvedRenderContainerLabel(element),
        durationRatio:
          durationValue > 0
            ? Math.max(0.08, Math.min(durationValue / maxDuration, 1))
            : 0,
        element,
        hmrMetrics: matchedHmrMetrics,
        isCurrentPage: isCurrentMetricPage(metric),
        isMounted: Boolean(element),
        latestHmrMetric: matchedHmrMetrics[0] ?? null,
        metric,
        metricKey: getRenderMetricKey(metric),
        sizeRatio:
          (buildMetric?.estimatedTotalBytes ?? 0) > 0
            ? Math.max(
                0.08,
                Math.min((buildMetric?.estimatedTotalBytes ?? 0) / maxSize, 1),
              )
            : 0,
        spaSyncEffect: getSpaSyncEffectForRender({
          componentName: metric.componentName,
          renderId: metric.renderId,
        }),
        webVitalsAnalysis: analyzeSiteDebugRenderMetricWebVitals(metric),
      };
    });
});

const getLiveRenderMetricViews = (): RenderMetricView[] => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return [];
  }

  const currentWebVitalsVersion = webVitalsVersion.value;
  void currentWebVitalsVersion;

  const currentPageId = getCurrentPageId();
  const metricByRenderId = new Map<string, SiteDebugRenderMetric>();

  for (const metric of renderMetrics.value) {
    if (!metricByRenderId.has(metric.renderId)) {
      metricByRenderId.set(metric.renderId, metric);
    }
  }

  const elements = querySelectorAllToArray<HTMLElement>(
    document,
    `[${renderMetricContainerAttr}]`,
  );

  const mergedViews: RenderMetricView[] = elements.flatMap((element) => {
    const renderId = element.getAttribute(renderMetricContainerAttr);

    if (!renderId) {
      return [];
    }

    const componentName =
      element.getAttribute(renderMetricComponentAttr) ?? 'UnknownComponent';
    const renderDirective =
      element.getAttribute(renderMetricDirectiveAttr) ?? undefined;
    const metric =
      metricByRenderId.get(renderId) ??
      ({
        componentName,
        pageId: currentPageId,
        renderDirective,
        renderId,
        renderWithSpaSync:
          element.getAttribute(renderMetricSpaSyncAttr) === 'true',
        status: 'detected',
        updatedAt: 0,
      } satisfies SiteDebugRenderMetric);
    const buildMetric = getBuildMetricForRender({
      componentName,
      renderId,
    });
    const matchedHmrMetrics = getHmrMetricsForRender({
      componentName,
      renderId,
    });
    const spaSyncEffect = getSpaSyncEffectForRender({
      componentName,
      renderId,
    });

    return [
      {
        buildMetric,
        containerLabel: getResolvedRenderContainerLabel(element),
        durationRatio: 0,
        element,
        hmrMetrics: matchedHmrMetrics,
        isCurrentPage: true,
        isMounted: true,
        latestHmrMetric: matchedHmrMetrics[0] ?? null,
        metric,
        metricKey: getRenderMetricKey(metric),
        sizeRatio: 0,
        spaSyncEffect,
        webVitalsAnalysis: analyzeSiteDebugRenderMetricWebVitals(metric),
      },
    ];
  });

  const maxDuration = Math.max(
    1,
    ...mergedViews.map(
      (view) =>
        view.metric.totalDurationMs ??
        view.metric.invokeDurationMs ??
        view.metric.waitForVisibilityMs ??
        0,
    ),
  );
  const maxSize = Math.max(
    1,
    ...mergedViews.map((view) => view.buildMetric?.estimatedTotalBytes ?? 0),
  );

  return mergedViews.map((view) => {
    const durationValue =
      view.metric.totalDurationMs ??
      view.metric.invokeDurationMs ??
      view.metric.waitForVisibilityMs ??
      0;
    const sizeValue = view.buildMetric?.estimatedTotalBytes ?? 0;

    return {
      ...view,
      durationRatio:
        durationValue > 0
          ? Math.max(0.08, Math.min(durationValue / maxDuration, 1))
          : 0,
      sizeRatio:
        sizeValue > 0 ? Math.max(0.08, Math.min(sizeValue / maxSize, 1)) : 0,
    };
  });
};

const clearRenderMetricOverlayTimers = () => {
  for (const timer of overlaySyncTimers) {
    window.clearTimeout(timer);
  }

  overlaySyncTimers = [];
};

const clearPageMetafileSyncTimers = () => {
  for (const timer of pageMetafileSyncTimers) {
    window.clearTimeout(timer);
  }

  pageMetafileSyncTimers = [];
};

const syncRenderMetricOverlays = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    renderMetricOverlays.value = [];
    return;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const liveViews = getLiveRenderMetricViews();

  renderMetricOverlays.value = liveViews
    .map((view) => {
      const element = view.element;

      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();

      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.bottom <= 0 ||
        rect.right <= 0 ||
        rect.top >= viewportHeight ||
        rect.left >= viewportWidth
      ) {
        return null;
      }

      const frameTop = clamp(rect.top - 2, 8, Math.max(viewportHeight - 24, 8));
      const frameLeft = clamp(
        rect.left - 2,
        8,
        Math.max(viewportWidth - 24, 8),
      );
      const badgeTop = clamp(
        rect.top - 34,
        8,
        Math.max(viewportHeight - 40, 8),
      );
      const badgeLeft = clamp(rect.left, 8, Math.max(viewportWidth - 220, 8));
      const panelTop = clamp(rect.top, 8, Math.max(viewportHeight - 260, 8));
      const preferRight =
        rect.right + OVERLAY_PANEL_WIDTH + 16 <= viewportWidth;
      const panelLeft = preferRight
        ? clamp(
            rect.right + 12,
            8,
            Math.max(viewportWidth - OVERLAY_PANEL_WIDTH - 8, 8),
          )
        : clamp(
            rect.left - OVERLAY_PANEL_WIDTH - 12,
            8,
            Math.max(viewportWidth - OVERLAY_PANEL_WIDTH - 8, 8),
          );

      return {
        badgeStyle: {
          left: `${badgeLeft}px`,
          top: `${badgeTop}px`,
        },
        frameStyle: {
          height: `${Math.max(rect.height + 4, 28)}px`,
          left: `${frameLeft}px`,
          top: `${frameTop}px`,
          width: `${Math.max(rect.width + 4, 28)}px`,
        },
        key: view.metricKey,
        panelStyle: {
          left: `${panelLeft}px`,
          top: `${panelTop}px`,
        },
        view,
      } as RenderMetricOverlay;
    })
    .filter((overlay): overlay is RenderMetricOverlay => Boolean(overlay));

  if (
    selectedRenderMetricKey.value &&
    !renderMetricOverlays.value.some(
      (overlay) => overlay.key === selectedRenderMetricKey.value,
    )
  ) {
    selectedRenderMetricKey.value = null;
    activeOverlayMetricDetail.value = null;
  }
};

const scheduleRenderMetricOverlaySync = () => {
  if (typeof window === 'undefined') {
    return;
  }

  if (overlaySyncFrame !== undefined) {
    window.cancelAnimationFrame(overlaySyncFrame);
  }

  overlaySyncFrame = window.requestAnimationFrame(() => {
    overlaySyncFrame = undefined;
    syncRenderMetricOverlays();
  });
};

const scheduleRenderMetricOverlayBurst = () => {
  if (typeof window === 'undefined') {
    return;
  }

  clearRenderMetricOverlayTimers();
  scheduleRenderMetricOverlaySync();

  overlaySyncTimers = [80, 220, 480].map((delay) =>
    window.setTimeout(() => {
      scheduleRenderMetricOverlaySync();
    }, delay),
  );
};

const schedulePageMetafileSyncBurst = () => {
  if (typeof window === 'undefined') {
    return;
  }

  clearPageMetafileSyncTimers();
  syncCurrentPageMetafile();

  pageMetafileSyncTimers = [120, 360, 900].map((delay) =>
    window.setTimeout(() => {
      syncCurrentPageMetafile();
      scheduleRenderMetricOverlaySync();
    }, delay),
  );
};

const logRuntimeGlobals = (reason = 'runtime globals snapshot') => {
  pushLog('info', 'globals', reason, getRuntimeSnapshot());
};

const logGlobalPathSnapshot = (path = globalPath.value) => {
  const normalizedPath = normalizeGlobalPath(path) || 'window';

  pushLog('info', 'globals', 'global inspected', {
    path: normalizedPath,
    value: serializeInspectable(resolveGlobalPath(path)),
  });
};

const installDebugHelper = () => {
  const debugWindow = getDebugWindow();

  debugWindow.__DOCS_ISLANDS_SITE_DEBUG__ = {
    getEntries: () => [...entries.value],
    getGlobal: (path = '__COMPONENT_MANAGER__') =>
      serializeInspectable(resolveGlobalPath(path)),
    getHmrMetrics: () => [...hmrMetrics.value],
    getRenderMetrics: () => [...renderMetrics.value],
    logGlobal: (path = '__COMPONENT_MANAGER__') => {
      logGlobalPathSnapshot(path);
    },
    logRuntime: (reason = 'runtime globals snapshot') => {
      logRuntimeGlobals(reason);
    },
    snapshotRuntime: () => getRuntimeSnapshot(),
  };
};

const uninstallDebugHelper = () => {
  delete getDebugWindow().__DOCS_ISLANDS_SITE_DEBUG__;
};

const shouldCaptureDocsIslandsConsoleLog = (args: unknown[]) =>
  args.some(
    (arg) =>
      typeof arg === 'string' &&
      (arg.includes('@docs-islands/vitepress') ||
        arg.includes('react-client-render') ||
        arg.includes('react-render-strategy')),
  );

const shouldCaptureHydrationFailure = (args: unknown[]) =>
  args.some(
    (arg) =>
      typeof arg === 'string' &&
      (arg.toLowerCase().includes('hydration failed') ||
        arg.toLowerCase().includes('subscription timeout') ||
        arg.includes('Failed to load component')),
  );

const captureSnapshot = (reason: string) => {
  pushLog('info', 'snapshot', reason, {
    devicePixelRatio: window.devicePixelRatio,
    href: window.location.href,
    online: navigator.onLine,
    pageTitle: document.title,
    themeDark: isDark.value,
    userAgent: navigator.userAgent,
    viewport: String(window.innerWidth) + 'x' + String(window.innerHeight),
    visibility: document.visibilityState,
    ...getThemeSnapshot(),
  });
};

const startRoutePolling = () => {
  lastHref = window.location.href;
  routePollTimer = window.setInterval(() => {
    if (window.location.href === lastHref) {
      return;
    }

    const previousHref = lastHref;

    lastHref = window.location.href;
    pushLog('info', 'navigation', 'route changed', {
      from: previousHref,
      to: lastHref,
    });
    captureSnapshot('route snapshot');
    scheduleRenderMetricOverlayBurst();
  }, 500);
};

const stopRoutePolling = () => {
  if (routePollTimer === undefined) {
    return;
  }

  window.clearInterval(routePollTimer);
  routePollTimer = undefined;
};

const restoreConsolePatches = () => {
  if (originalConsoleLog) {
    console.log = originalConsoleLog;
    originalConsoleLog = null;
  }

  if (originalConsoleWarn) {
    console.warn = originalConsoleWarn;
    originalConsoleWarn = null;
  }

  if (originalConsoleError) {
    console.error = originalConsoleError;
    originalConsoleError = null;
  }
};

const installConsolePatches = () => {
  if (originalConsoleLog || originalConsoleWarn || originalConsoleError) {
    return;
  }

  originalConsoleLog = console.log.bind(console);
  originalConsoleWarn = console.warn.bind(console);
  originalConsoleError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    if (shouldCaptureDocsIslandsConsoleLog(args)) {
      pushLog('info', 'console', 'console.log', normalizeConsoleArgs(args));

      if (shouldCaptureHydrationFailure(args)) {
        logRuntimeGlobals('runtime globals after docs-islands console.log');
      }
    }

    originalConsoleLog?.(...args);
  };

  console.warn = (...args: unknown[]) => {
    pushLog('warn', 'console', 'console.warn', normalizeConsoleArgs(args));
    originalConsoleWarn?.(...args);
  };

  console.error = (...args: unknown[]) => {
    pushLog('error', 'console', 'console.error', normalizeConsoleArgs(args));

    if (shouldCaptureHydrationFailure(args)) {
      logRuntimeGlobals('runtime globals after hydration failure');
    }

    originalConsoleError?.(...args);
  };
};

const installDebugListeners = () => {
  if (stopDebugListeners) {
    return;
  }

  installConsolePatches();
  installDebugHelper();
  ensureSiteDebugWebVitalsTracking();
  schedulePageMetafileSyncBurst();
  syncHmrMetrics();
  syncRenderMetrics();
  scheduleRenderMetricOverlayBurst();
  startRoutePolling();

  const handleSiteDebugEvent = (event: Event) => {
    const detail = (event as CustomEvent<SiteDebugEventDetail>).detail;

    if (!detail?.message) {
      return;
    }

    schedulePageMetafileSyncBurst();
    pushLog(
      detail.level ?? 'info',
      detail.source ?? 'app',
      detail.message,
      detail.payload,
    );
  };

  const handleRenderMetricEvent = () => {
    schedulePageMetafileSyncBurst();
    syncRenderMetrics();
    scheduleRenderMetricOverlayBurst();
  };

  const handleHmrMetricEvent = () => {
    syncHmrMetrics();
  };

  const handleWebVitalsEvent = () => {
    webVitalsVersion.value += 1;
    scheduleRenderMetricOverlayBurst();
  };

  const handleWindowError = (event: Event) => {
    const target = event.target;

    if (target && target !== window) {
      pushLog(
        'error',
        'resource',
        'resource load failed',
        getResourceTargetDetails(target),
      );
      return;
    }

    const errorEvent = event as ErrorEvent;

    pushLog('error', 'window', errorEvent.message || 'window error', {
      column: errorEvent.colno,
      fileName: errorEvent.filename,
      line: errorEvent.lineno,
      stack:
        errorEvent.error instanceof Error ? errorEvent.error.stack : undefined,
    });
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    pushLog('error', 'promise', 'unhandled rejection', {
      reason: serializePayload(event.reason),
    });
  };

  const handleOnline = () => {
    pushLog('info', 'network', 'browser is online');
  };

  const handleOffline = () => {
    pushLog('warn', 'network', 'browser is offline');
  };

  const handleVisibilityChange = () => {
    pushLog('info', 'document', 'visibility changed', {
      visibility: document.visibilityState,
    });
    scheduleRenderMetricOverlayBurst();
  };

  const handleViewportChange = () => {
    scheduleRenderMetricOverlaySync();
  };

  const handlePointerDown = (event: Event) => {
    const target = event.target as HTMLElement | null;

    if (
      target?.closest('.site-debug-overlay__badge') ||
      target?.closest('.site-debug-overlay__panel') ||
      target?.closest('.site-debug-detail-modal') ||
      target?.closest('.site-debug-chunk-viewer') ||
      target?.closest('.site-debug-source-viewer') ||
      target?.closest('.site-debug-toggle') ||
      target?.closest('.site-debug-dialog')
    ) {
      return;
    }

    selectedRenderMetricKey.value = null;
    activeOverlayMetricDetail.value = null;
  };

  window.addEventListener(
    SITE_DEBUG_EVENT_NAME,
    handleSiteDebugEvent as EventListener,
  );
  window.addEventListener(
    SITE_DEBUG_RENDER_METRIC_EVENT_NAME,
    handleRenderMetricEvent,
  );
  window.addEventListener(
    SITE_DEBUG_HMR_METRIC_EVENT_NAME,
    handleHmrMetricEvent,
  );
  window.addEventListener(
    SITE_DEBUG_WEB_VITALS_EVENT_NAME,
    handleWebVitalsEvent,
  );
  window.addEventListener('error', handleWindowError, true);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('resize', handleViewportChange, true);
  window.addEventListener('scroll', handleViewportChange, true);
  window.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  stopDebugListeners = () => {
    window.removeEventListener(
      SITE_DEBUG_EVENT_NAME,
      handleSiteDebugEvent as EventListener,
    );
    window.removeEventListener(
      SITE_DEBUG_RENDER_METRIC_EVENT_NAME,
      handleRenderMetricEvent,
    );
    window.removeEventListener(
      SITE_DEBUG_HMR_METRIC_EVENT_NAME,
      handleHmrMetricEvent,
    );
    window.removeEventListener(
      SITE_DEBUG_WEB_VITALS_EVENT_NAME,
      handleWebVitalsEvent,
    );
    window.removeEventListener('error', handleWindowError, true);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('resize', handleViewportChange, true);
    window.removeEventListener('scroll', handleViewportChange, true);
    window.removeEventListener('pointerdown', handlePointerDown, true);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    stopRoutePolling();
    clearRenderMetricOverlayTimers();
    clearPageMetafileSyncTimers();
    if (overlaySyncFrame !== undefined) {
      window.cancelAnimationFrame(overlaySyncFrame);
      overlaySyncFrame = undefined;
    }
    renderMetricOverlays.value = [];
    selectedRenderMetricKey.value = null;
    activeOverlayMetricDetail.value = null;
    restoreConsolePatches();
    uninstallDebugHelper();
    destroySiteDebugWebVitalsTracking();
    stopDebugListeners = null;
  };
};

const openDebugConsole = () => {
  schedulePageMetafileSyncBurst();
  syncHmrMetrics();
  syncRenderMetrics();
  scheduleRenderMetricOverlayBurst();
  captureSnapshot('debug dialog opened');
  debugOpen.value = true;
};

const showActionFeedback = (
  action: SiteDebugAction,
  label: string,
  target: string | null = null,
) => {
  actionFeedback.value = {
    action,
    label,
  };
  actionFeedbackTarget.value = target;

  if (actionFeedbackTimer !== undefined) {
    window.clearTimeout(actionFeedbackTimer);
  }

  actionFeedbackTimer = window.setTimeout(() => {
    actionFeedback.value = {
      action: null,
      label: '',
    };
    actionFeedbackTarget.value = null;
    actionFeedbackTimer = undefined;
  }, 1800);
};

const closeDebugConsole = () => {
  debugOpen.value = false;
  activeOverlayMetricDetail.value = null;
};

const inspectSelectedGlobal = () => {
  globalPath.value =
    normalizeGlobalPath(globalPath.value) || getDefaultGlobalInspectorPath();
  showActionFeedback('inspect', 'Inspected');
};

const snapshotRuntimeGlobals = (reason = 'manual runtime globals snapshot') => {
  logRuntimeGlobals(reason);
  showActionFeedback('globals', 'Captured');
};

const resetGlobalInspector = () => {
  globalPath.value = getDefaultGlobalInspectorPath();
  showActionFeedback('clear', 'Reset');
};

const copyGlobalSnapshot = async () => {
  try {
    await navigator.clipboard.writeText(inspectedGlobalText.value);
    pushLog('info', 'debug-console', 'global snapshot copied', {
      helper: 'window.__DOCS_ISLANDS_SITE_DEBUG__',
      path: normalizeGlobalPath(globalPath.value) || 'window',
    });
    showActionFeedback('copy', 'Copied');
  } catch (error) {
    pushLog('error', 'debug-console', 'copy global snapshot failed', error);
  }
};

const clearDebugRuntimeState = () => {
  debugOpen.value = false;
  entries.value = [];
  hmrMetrics.value = [];
  renderMetrics.value = [];
  renderMetricOverlays.value = [];
  selectedRenderMetricKey.value = null;
  activeOverlayMetricDetail.value = null;
  activeBundleChunkDetail.value = null;
  activeBundleChunkContent.value = '';
  activeBundleChunkHighlightedHtml.value = '';
  activeBundleChunkState.value = 'idle';
  activeBundleChunkError.value = '';
  resetLoadingProgress(
    activeBundleChunkLoadingProgress,
    'Fetching chunk resource',
  );
  activeBundleSourceModule.value = null;
  activeBundleSourceContent.value = '';
  activeBundleSourceHighlightedHtml.value = '';
  activeBundleSourceState.value = 'idle';
  activeBundleSourceError.value = '';
  resetLoadingProgress(
    activeBundleSourceLoadingProgress,
    'Fetching module source',
  );
  activeSpaSyncCssContent.value = '';
  activeSpaSyncCssHighlightedHtml.value = '';
  activeSpaSyncCssState.value = 'idle';
  activeSpaSyncCssError.value = '';
  resetLoadingProgress(
    activeSpaSyncCssLoadingProgress,
    'Fetching required CSS',
  );
  activeSpaSyncHtmlContent.value = '';
  activeSpaSyncHtmlHighlightedHtml.value = '';
  activeSpaSyncHtmlState.value = 'idle';
  activeSpaSyncHtmlError.value = '';
  resetLoadingProgress(
    activeSpaSyncHtmlLoadingProgress,
    'Preparing patched HTML',
  );
};

const activateDebugRuntime = () => {
  if (stopDebugListeners) {
    return;
  }

  schedulePageMetafileSyncBurst();
  installDebugListeners();
  pushLog('info', 'debug-console', 'debug console enabled', {
    helper: 'window.__DOCS_ISLANDS_SITE_DEBUG__',
    href: window.location.href,
  });
  captureSnapshot('initial snapshot');
  logRuntimeGlobals('initial runtime globals');
};

const deactivateDebugRuntime = () => {
  stopDebugListeners?.();
  clearDebugRuntimeState();
  getDebugWindow().__DOCS_ISLANDS_SITE_DEBUG_LOGS__ = [];
  resetSiteDebugRenderMetrics();
  resetSiteDebugHmrMetrics();
  delete getDebugWindow()[SITE_DEBUG_HMR_METRICS_KEY];
  delete getDebugWindow()[SITE_DEBUG_RENDER_METRICS_KEY];
};

const disableDebug = () => {
  const nextEnabled = setSiteDebugEnabled(false, {
    clearQueryOverride: true,
    source: 'console',
  });

  if (!nextEnabled) {
    debugEnabled.value = false;
    deactivateDebugRuntime();
  }

  showActionFeedback('disable', 'Disabled');
};

const handleSiteDebugModeChange = (event: Event) => {
  const detail = (event as CustomEvent<SiteDebugModeChangeDetail>).detail;
  const nextEnabled = detail?.enabled ?? false;

  if (nextEnabled === debugEnabled.value) {
    return;
  }

  debugEnabled.value = nextEnabled;

  if (nextEnabled) {
    activateDebugRuntime();
    return;
  }

  deactivateDebugRuntime();
};

const availableGlobalPresets = computed(() => {
  if (typeof window === 'undefined') {
    return GLOBAL_PRESETS.map((preset) => ({
      ...preset,
      available: false,
      isActive:
        normalizeGlobalPath(globalPath.value) ===
        normalizeGlobalPath(preset.path),
    })).filter((preset) => isGlobalPresetVisible(preset.path));
  }

  return GLOBAL_PRESETS.map((preset) => ({
    ...preset,
    available: resolveGlobalPath(preset.path) !== undefined,
    isActive:
      normalizeGlobalPath(globalPath.value) ===
      normalizeGlobalPath(preset.path),
  })).filter((preset) => isGlobalPresetVisible(preset.path));
});

const inspectedGlobalValue = computed(() =>
  serializeInspectable(resolveGlobalPath(globalPath.value)),
);

const inspectedGlobalPathLabel = computed(
  () => normalizeGlobalPath(globalPath.value) || 'window',
);

const inspectedGlobalViewerData = computed(() => {
  const snapshot = inspectedGlobalValue.value;

  if (Array.isArray(snapshot) || isInspectableRecord(snapshot)) {
    return snapshot;
  }

  return {
    value: snapshot,
  };
});

const inspectedGlobalText = computed(() => {
  const snapshot = inspectedGlobalValue.value;

  if (
    snapshot === null ||
    snapshot === undefined ||
    typeof snapshot === 'string' ||
    typeof snapshot === 'number' ||
    typeof snapshot === 'boolean'
  ) {
    return formatForDisplay(snapshot);
  }

  return JSON.stringify(snapshot, null, 2);
});

const hasGlobalModalOverlay = computed(() =>
  Boolean(
    activeOverlayMetricDetail.value ||
      activeBundleChunkDetail.value ||
      activeBundleSourceModule.value,
  ),
);

const setModalScrollLock = (locked: boolean) => {
  if (typeof document === 'undefined') {
    return;
  }

  if (locked) {
    if (restoreModalScrollLock) {
      return;
    }

    const html = document.documentElement;
    const { body } = document;
    const previousHtmlOverflow = html.style.overflow;
    const previousHtmlOverscrollBehavior = html.style.overscrollBehavior;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;

    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    restoreModalScrollLock = () => {
      html.style.overflow = previousHtmlOverflow;
      html.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
    };

    return;
  }

  restoreModalScrollLock?.();
  restoreModalScrollLock = null;
};

watch(isDark, (value, previousValue) => {
  if (!debugEnabled.value) {
    return;
  }

  pushLog('info', 'theme', 'theme changed', {
    from: previousValue,
    to: value,
    ...getThemeSnapshot(),
  });
});

watch(debugOpen, (value) => {
  const dialog = debugDialogRef.value;

  if (!dialog) {
    return;
  }

  if (value) {
    if (!dialog.open) {
      dialog.showModal();
    }

    return;
  }

  if (dialog.open) {
    dialog.close();
  }
});

watch(
  hasGlobalModalOverlay,
  (value) => {
    setModalScrollLock(value);
  },
  {
    flush: 'post',
  },
);

onMounted(() => {
  const dialog = debugDialogRef.value;

  if (dialog) {
    dialog.addEventListener('close', closeDebugConsole);
  }

  window.addEventListener(
    SITE_DEBUG_MODE_EVENT_NAME,
    handleSiteDebugModeChange as EventListener,
  );

  const shouldEnable = syncSiteDebugEnabledFromQuery({
    source: 'query',
  });
  debugEnabled.value = shouldEnable;

  if (!shouldEnable) {
    return;
  }

  activateDebugRuntime();
});

onBeforeUnmount(() => {
  debugDialogRef.value?.removeEventListener('close', closeDebugConsole);
  window.removeEventListener(
    SITE_DEBUG_MODE_EVENT_NAME,
    handleSiteDebugModeChange as EventListener,
  );
  stopDebugListeners?.();
  uninstallDebugHelper();
  clearPageMetafileSyncTimers();
  setModalScrollLock(false);

  if (actionFeedbackTimer !== undefined) {
    window.clearTimeout(actionFeedbackTimer);
  }
});
</script>

<template>
  <div
    v-if="debugEnabled && renderMetricOverlays.length > 0"
    class="site-debug-overlay-layer"
  >
    <template v-for="overlay in renderMetricOverlays" :key="overlay.key">
      <div
        class="site-debug-overlay__frame"
        :class="getStatusTone(overlay.view.metric.status)"
        :style="overlay.frameStyle"
      />
      <button
        type="button"
        class="site-debug-overlay__badge"
        :class="[
          getStatusTone(overlay.view.metric.status),
          { 'is-selected': isSelectedRenderMetric(overlay.key) },
        ]"
        :style="overlay.badgeStyle"
        :title="`Inspect ${overlay.view.metric.componentName}`"
        @click.stop="toggleRenderMetricDetail(overlay.key)"
      >
        <span class="site-debug-overlay__badge-name">
          {{ overlay.view.metric.componentName }}
        </span>
        <span
          v-if="
            hasDisplayValue(formatDuration(overlay.view.metric.totalDurationMs))
          "
          class="site-debug-overlay__badge-value"
        >
          {{ formatDuration(overlay.view.metric.totalDurationMs) }}
        </span>
      </button>

      <section
        v-if="selectedRenderMetricKey === overlay.key"
        class="site-debug-overlay__panel"
        :style="overlay.panelStyle"
      >
        <div class="site-debug-overlay__panel-header">
          <div>
            <p class="site-debug-overlay__panel-eyebrow">
              {{ overlay.view.metric.renderDirective || 'unknown-directive' }}
              <span>·</span>
              {{ getResolvedRenderMode(overlay.view.metric) }}
            </p>
            <h4 class="site-debug-overlay__panel-title">
              {{ overlay.view.metric.componentName }}
            </h4>
          </div>
          <span
            class="site-debug-status"
            :class="getStatusTone(overlay.view.metric.status)"
          >
            {{ getStatusLabel(overlay.view.metric.status) }}
          </span>
        </div>

        <div class="site-debug-overlay__panel-grid">
          <button
            v-for="metricItem in getRenderMetricGridItems(overlay.view)"
            :key="metricItem.key"
            type="button"
            class="site-debug-overlay__metric-card"
            :class="{ 'is-clickable': Boolean(metricItem.detailKind) }"
            :disabled="!metricItem.detailKind"
            @click.stop="
              metricItem.detailKind
                ? openOverlayMetricDetail(overlay.key, metricItem.detailKind)
                : undefined
            "
          >
            <span>{{ metricItem.label }}</span>
            <strong>{{ metricItem.value }}</strong>
          </button>
        </div>

        <p class="site-debug-overlay__panel-meta">
          renderId {{ overlay.view.metric.renderId }}
        </p>
        <div
          v-if="
            shouldShowLatestHmrMetric(overlay.view) &&
            overlay.view.latestHmrMetric
          "
          class="site-debug-overlay__panel-side-effect"
        >
          <p class="site-debug-overlay__panel-side-effect-title">
            Latest React HMR
          </p>
          <div class="site-debug-hmr-summary__chips">
            <span class="site-debug-hmr-chip is-primary">
              {{
                getHmrMechanismLabel(overlay.view.latestHmrMetric.mechanismType)
              }}
            </span>
            <span class="site-debug-hmr-chip">
              {{
                getHmrUpdateTypeLabel(overlay.view.latestHmrMetric.updateType)
              }}
            </span>
          </div>
          <div class="site-debug-hmr-summary__metrics">
            <div
              v-for="stage in getHmrStageItems(overlay.view.latestHmrMetric)"
              :key="stage.label"
              class="site-debug-hmr-summary__metric"
              :class="{ 'is-empty': stage.isEmpty }"
            >
              <span>{{ stage.label }}</span>
              <strong>{{ stage.value }}</strong>
            </div>
          </div>
          <div class="site-debug-hmr-summary__events">
            <div
              v-for="event in getHmrEventItems(overlay.view.latestHmrMetric)"
              :key="event.label"
              class="site-debug-hmr-summary__event"
            >
              <span>{{ event.label }}</span>
              <code>{{ event.value }}</code>
            </div>
          </div>
          <p class="site-debug-hmr-summary__description">
            {{ getHmrMechanismDescription(overlay.view.latestHmrMetric) }}
          </p>
          <div
            v-if="getVsCodeSourceHref(overlay.view.latestHmrMetric)"
            class="site-debug-hmr-summary__browse"
          >
            <SiteDebugVsCodeLink
              :href="getVsCodeSourceHref(overlay.view.latestHmrMetric) || ''"
            />
          </div>
        </div>
        <div
          v-if="getBundleBreakdownItems(overlay.view.buildMetric).length > 0"
          class="site-debug-overlay__bundle-breakdown"
        >
          <span
            v-for="item in getBundleBreakdownItems(overlay.view.buildMetric)"
            :key="item.key"
            class="site-debug-overlay__bundle-chip"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </span>
        </div>
        <div
          v-if="
            (overlay.view.metric.renderWithSpaSync ||
              overlay.view.spaSyncEffect) &&
            getSpaSyncSummaryItems(
              overlay.view.spaSyncEffect,
              overlay.view.metric.renderId,
            ).length > 0
          "
          class="site-debug-overlay__panel-side-effect"
        >
          <div class="site-debug-overlay__panel-side-effect-header">
            <p class="site-debug-overlay__panel-side-effect-title">
              spa:sync-render
            </p>
            <span class="site-debug-summary__chip is-success">Enabled</span>
          </div>
          <div
            class="site-debug-overlay__side-effect-grid"
            :style="
              getEqualGridStyle(
                getSpaSyncSummaryItems(
                  overlay.view.spaSyncEffect,
                  overlay.view.metric.renderId,
                ).length,
              )
            "
          >
            <button
              v-for="item in getSpaSyncSummaryItems(
                overlay.view.spaSyncEffect,
                overlay.view.metric.renderId,
              )"
              :key="item.key"
              class="site-debug-overlay__side-effect-item"
              :class="{ 'is-clickable': Boolean(item.detailKind) }"
              :disabled="!item.detailKind"
              type="button"
              @click.stop="
                item.detailKind
                  ? openOverlayMetricDetail(overlay.key, item.detailKind)
                  : undefined
              "
            >
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </button>
          </div>
        </div>
        <p
          v-if="overlay.view.metric.errorMessage"
          class="site-debug-overlay__panel-error"
        >
          {{ overlay.view.metric.errorMessage }}
        </p>
        <div class="site-debug-overlay__panel-actions">
          <button
            type="button"
            class="site-debug-dialog__action"
            @click.stop="openDebugConsole"
          >
            Open Logs
          </button>
          <button
            type="button"
            class="site-debug-dialog__action site-debug-dialog__action--primary"
            @click.stop="selectedRenderMetricKey = null"
          >
            Close
          </button>
        </div>
      </section>
    </template>
  </div>

  <SiteDebugMetricDetailModal
    v-if="activeOverlayMetricDetail && activeOverlayMetricDetailView"
    :action-feedback-action="actionFeedback.action"
    :action-feedback-label="actionFeedback.label"
    :action-feedback-target="actionFeedbackTarget"
    :css-assets="activeSpaSyncCssAssets"
    :css-error="activeSpaSyncCssError"
    :css-highlighted-html="activeSpaSyncCssHighlightedHtml"
    :css-loading-progress="activeSpaSyncCssLoadingProgress"
    :css-state="activeSpaSyncCssState"
    :detail-kind="activeOverlayMetricDetail.kind"
    :html-error="activeSpaSyncHtmlError"
    :html-highlighted-html="activeSpaSyncHtmlHighlightedHtml"
    :html-loading-progress="activeSpaSyncHtmlLoadingProgress"
    :html-patch="activeSpaSyncHtmlPreview"
    :html-state="activeSpaSyncHtmlState"
    :selected-chunk-file="activeBundleChunkDetail?.file ?? null"
    :view="activeOverlayMetricDetailView"
    @chunk-click="handleBundleChunkResourceClick"
    @close="closeOverlayMetricDetail"
    @copy-css="copyActiveSpaSyncCss"
  />

  <SiteDebugChunkResourceModal
    v-if="activeBundleChunkDetail"
    :action-feedback-action="actionFeedback.action"
    :action-feedback-label="actionFeedback.label"
    :action-feedback-target="actionFeedbackTarget"
    :chunk-detail="activeBundleChunkDetail"
    :error="activeBundleChunkError"
    :highlighted-html="activeBundleChunkHighlightedHtml"
    :loading-progress="activeBundleChunkLoadingProgress"
    :modules="activeBundleChunkModules"
    :selected-module="activeBundleSourceModule"
    :state="activeBundleChunkState"
    @close="closeBundleChunkDetail"
    @copy="copyActiveBundleChunkContent"
    @select-module="openBundleSourceModule"
  />

  <SiteDebugSourceViewerModal
    v-if="activeBundleSourceModule"
    :action-feedback-action="actionFeedback.action"
    :action-feedback-label="actionFeedback.label"
    :browse-href="activeBundleSourceBrowseHref"
    :display-path="activeBundleSourcePreviewPath"
    :error="activeBundleSourceError"
    :highlighted-html="activeBundleSourceHighlightedHtml"
    :language-label="formatSourceLanguageLabel(activeBundleSourcePreviewPath)"
    :loading-progress="activeBundleSourceLoadingProgress"
    :state="activeBundleSourceState"
    :title="activeBundleSourceTitle"
    @close="closeBundleSourcePreview"
    @copy="copyActiveBundleSource"
    @download="downloadActiveBundleSource"
  />

  <button
    v-if="debugEnabled"
    class="site-debug-toggle"
    type="button"
    title="Open Site Debug Console"
    aria-label="Open Site Debug Console"
    @click="openDebugConsole"
  >
    <span>Debug Logs</span>
  </button>

  <dialog
    ref="debugDialogRef"
    class="site-debug-dialog"
    aria-label="Site Debug Logs"
    @cancel.prevent="closeDebugConsole"
  >
    <div class="site-debug-dialog__panel">
      <div class="site-debug-dialog__header">
        <div class="site-debug-dialog__title">
          <p>Global Debug Console</p>
          <h3>docs-islands Runtime Globals</h3>
        </div>
        <div class="site-debug-dialog__actions">
          <button
            type="button"
            class="site-debug-dialog__action"
            :class="{
              'is-success': actionFeedback.action === 'globals',
            }"
            @click="snapshotRuntimeGlobals()"
          >
            {{
              actionFeedback.action === 'globals'
                ? `✓ ${actionFeedback.label}`
                : 'Globals'
            }}
          </button>
          <button
            type="button"
            class="site-debug-dialog__action"
            :class="{
              'is-success': actionFeedback.action === 'copy',
            }"
            @click="copyGlobalSnapshot"
          >
            {{
              actionFeedback.action === 'copy'
                ? `✓ ${actionFeedback.label}`
                : 'Copy JSON'
            }}
          </button>
          <button
            type="button"
            class="site-debug-dialog__action"
            :class="{
              'is-success': actionFeedback.action === 'clear',
            }"
            @click="resetGlobalInspector"
          >
            {{
              actionFeedback.action === 'clear'
                ? `✓ ${actionFeedback.label}`
                : 'Reset View'
            }}
          </button>
          <button
            type="button"
            class="site-debug-dialog__action"
            :class="{
              'is-success': actionFeedback.action === 'disable',
            }"
            @click="disableDebug"
          >
            {{
              actionFeedback.action === 'disable'
                ? `✓ ${actionFeedback.label}`
                : 'Disable'
            }}
          </button>
          <button
            type="button"
            class="site-debug-dialog__action site-debug-dialog__action--primary"
            @click="closeDebugConsole"
          >
            Close
          </button>
        </div>
      </div>

      <div class="site-debug-dialog__body">
        <p class="site-debug-dialog__hint">
          Browse the runtime globals injected by
          <code>@docs-islands/vitepress</code>
          and inspect their current live values.
        </p>

        <div class="site-debug-dialog__inspector">
          <label
            class="site-debug-dialog__inspector-label"
            for="site-debug-global-path"
          >
            Global Path
          </label>
          <div class="site-debug-dialog__inspector-controls">
            <input
              id="site-debug-global-path"
              v-model="globalPath"
              class="site-debug-dialog__input"
              type="text"
              autocapitalize="off"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              :placeholder="getDefaultGlobalInspectorPath()"
            />
            <button
              type="button"
              class="site-debug-dialog__action"
              :class="{
                'is-success': actionFeedback.action === 'inspect',
              }"
              @click="inspectSelectedGlobal"
            >
              {{
                actionFeedback.action === 'inspect'
                  ? `✓ ${actionFeedback.label}`
                  : 'Inspect'
              }}
            </button>
          </div>
          <p class="site-debug-dialog__hint site-debug-dialog__hint--subtle">
            Console helper:
            <code
              >window.__DOCS_ISLANDS_SITE_DEBUG__.getGlobal('__PAGE_METAFILE__')</code
            >
          </p>
        </div>

        <section class="site-debug-global-browser">
          <div class="site-debug-global-browser__header">
            <div>
              <p class="site-debug-section__eyebrow">Injected Globals</p>
              <h4 class="site-debug-section__title">Global Access Shortcuts</h4>
            </div>
            <div class="site-debug-global-browser__presets">
              <button
                v-for="preset in availableGlobalPresets"
                :key="preset.path"
                type="button"
                class="site-debug-global-browser__preset"
                :class="{
                  'is-active': preset.isActive,
                  'is-muted': !preset.available,
                }"
                @click="globalPath = preset.path"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>

          <div class="site-debug-global-browser__notes">
            <p
              v-for="preset in availableGlobalPresets.filter(
                (item) => item.isActive,
              )"
              :key="`${preset.path}-description`"
              class="site-debug-dialog__hint site-debug-dialog__hint--subtle"
            >
              {{ preset.description }}
            </p>
          </div>

          <div class="site-debug-global-browser__tree">
            <VueJsonPretty
              :data="inspectedGlobalViewerData"
              :deep="2"
              :height="440"
              :root-path="inspectedGlobalPathLabel"
              :show-double-quotes="false"
              :show-icon="true"
              :show-length="true"
              :show-line="false"
              :theme="isDark ? 'dark' : 'light'"
              :virtual="true"
              class="site-debug-json-pretty"
            />
          </div>
        </section>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.site-debug-overlay-layer {
  position: fixed;
  inset: 0;
  z-index: 110;
  pointer-events: none;
}

.site-debug-overlay__frame {
  position: fixed;
  border: 2px solid color-mix(in srgb, var(--vp-c-brand-1) 68%, white);
  border-radius: 14px;
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 0.2),
    inset 0 0 0 1px rgb(255 255 255 / 0.08);
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, transparent);
  pointer-events: none;
}

.site-debug-overlay__frame.is-success {
  border-color: rgb(52 154 102);
  background: rgb(52 154 102 / 0.08);
}

.site-debug-overlay__frame.is-danger {
  border-color: rgb(214 78 78);
  background: rgb(214 78 78 / 0.08);
}

.site-debug-overlay__frame.is-muted {
  border-style: dashed;
  opacity: 0.7;
}

.site-debug-overlay__badge,
.site-debug-overlay__panel {
  pointer-events: auto;
}

.site-debug-overlay__badge {
  position: fixed;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  max-width: min(42vw, 240px);
  border: 1px solid
    color-mix(in srgb, var(--vp-c-brand-1) 38%, var(--vp-c-divider));
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-bg) 96%, transparent);
  box-shadow: 0 18px 42px rgb(10 12 18 / 0.18);
  color: var(--vp-c-text-1);
  cursor: pointer;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 700;
  line-height: 1;
  padding: 0.45rem 0.7rem;
  backdrop-filter: blur(14px) saturate(1.08);
}

.site-debug-overlay__badge.is-success {
  border-color: color-mix(in srgb, rgb(52 154 102) 42%, var(--vp-c-divider));
}

.site-debug-overlay__badge.is-danger {
  border-color: color-mix(in srgb, rgb(214 78 78) 42%, var(--vp-c-divider));
}

.site-debug-overlay__badge.is-selected {
  transform: translateY(-1px);
}

.site-debug-overlay__badge-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-debug-overlay__badge-value {
  flex-shrink: 0;
  color: var(--vp-c-text-2);
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.72rem;
}

.site-debug-overlay__panel {
  position: fixed;
  display: grid;
  gap: 0.75rem;
  width: min(calc(100vw - 16px), 296px);
  max-height: min(calc(100vh - 16px), 78vh);
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 82%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--vp-c-bg) 96%, transparent);
  box-shadow: 0 28px 72px rgb(10 12 18 / 0.22);
  padding: 0.9rem;
  backdrop-filter: blur(16px) saturate(1.08);
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--vp-c-brand-1) 42%, transparent)
    color-mix(in srgb, var(--vp-c-bg-soft) 82%, transparent);
}

.site-debug-overlay__panel::-webkit-scrollbar {
  width: 8px;
}

.site-debug-overlay__panel::-webkit-scrollbar-track {
  background: color-mix(in srgb, var(--vp-c-bg-soft) 80%, transparent);
  border-radius: 999px;
}

.site-debug-overlay__panel::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--vp-c-brand-1) 38%, var(--vp-c-divider));
  border-radius: 999px;
}

.site-debug-overlay__panel::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--vp-c-brand-1) 54%, var(--vp-c-divider));
}

.site-debug-overlay__panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.site-debug-overlay__panel-eyebrow {
  margin: 0 0 0.3rem;
  color: var(--vp-c-text-2);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.site-debug-overlay__panel-eyebrow span {
  margin: 0 0.25rem;
}

.site-debug-overlay__panel-title {
  margin: 0;
  border-top: 0;
  color: var(--vp-c-text-1);
  font-size: 0.92rem;
  line-height: 1.25;
}

.site-debug-overlay__panel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 0.55rem;
}

.site-debug-overlay__metric-card {
  appearance: none;
  display: grid;
  gap: 0.22rem;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 12px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 92%, transparent);
  cursor: default;
  font: inherit;
  padding: 0.58rem 0.62rem;
  text-align: left;
}

.site-debug-overlay__metric-card.is-clickable {
  cursor: pointer;
}

.site-debug-overlay__metric-card.is-clickable:hover {
  border-color: color-mix(
    in srgb,
    var(--vp-c-brand-1) 28%,
    var(--vp-c-divider)
  );
  background: color-mix(in srgb, var(--vp-c-brand-1) 10%, var(--vp-c-bg-soft));
}

.site-debug-overlay__metric-card:disabled {
  opacity: 1;
}

.site-debug-overlay__metric-card:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--vp-c-brand-1) 48%, white);
  outline-offset: 2px;
}

.site-debug-overlay__panel-grid > div {
  display: grid;
  gap: 0.22rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 92%, transparent);
  padding: 0.58rem 0.62rem;
}

.site-debug-overlay__panel-grid span,
.site-debug-overlay__panel-meta {
  color: var(--vp-c-text-2);
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}

.site-debug-overlay__panel-grid strong {
  color: var(--vp-c-text-1);
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.76rem;
  word-break: break-word;
}

.site-debug-overlay__panel-side-effect {
  display: grid;
  gap: 0.55rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 90%, transparent);
  padding: 0.68rem 0.72rem;
}

.site-debug-overlay__panel-side-effect-title {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 0.73rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.site-debug-overlay__panel-side-effect-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.site-debug-overlay__bundle-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.site-debug-overlay__bundle-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  min-height: 1.9rem;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 76%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 90%, transparent);
  padding: 0.3rem 0.58rem;
}

.site-debug-overlay__bundle-chip span {
  color: var(--vp-c-text-2);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.site-debug-overlay__bundle-chip strong {
  color: var(--vp-c-text-1);
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.72rem;
}

.site-debug-overlay__panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.site-debug-toggle {
  position: fixed;
  right: 1.1rem;
  bottom: 1.1rem;
  z-index: 120;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 86%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-bg-elv) 92%, transparent);
  box-shadow: 0 18px 48px rgb(16 18 24 / 0.18);
  color: var(--vp-c-text-1);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 0.72rem 0.92rem;
  text-transform: uppercase;
  backdrop-filter: blur(16px) saturate(1.08);
}

.site-debug-toggle:hover {
  transform: translateY(-1px);
}

.site-debug-toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--vp-c-brand-1) 48%, white);
  outline-offset: 4px;
}

.site-debug-dialog {
  border: 0;
  padding: 0;
  width: min(92vw, 980px);
  max-width: none;
  max-height: none;
  background: transparent;
}

.site-debug-dialog::backdrop {
  background: rgb(9 11 16 / 0.48);
  backdrop-filter: blur(10px);
}

.site-debug-dialog__panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 1rem;
  max-height: min(88vh, 920px);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 82%, transparent);
  border-radius: 24px;
  background: color-mix(in srgb, var(--vp-c-bg) 95%, transparent);
  box-shadow: 0 30px 80px rgb(10 12 18 / 0.24);
  padding: 1rem;
}

.site-debug-dialog__body {
  display: grid;
  gap: 1rem;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding-right: 0.18rem;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--vp-c-brand-1) 38%, transparent)
    color-mix(in srgb, var(--vp-c-bg-soft) 82%, transparent);
}

.site-debug-dialog__body::-webkit-scrollbar {
  width: 9px;
}

.site-debug-dialog__body::-webkit-scrollbar-track {
  background: color-mix(in srgb, var(--vp-c-bg-soft) 80%, transparent);
  border-radius: 999px;
}

.site-debug-dialog__body::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--vp-c-brand-1) 38%, var(--vp-c-divider));
  border-radius: 999px;
}

.site-debug-dialog__body::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--vp-c-brand-1) 54%, var(--vp-c-divider));
}

.site-debug-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.site-debug-dialog__title {
  display: grid;
  gap: 0.35rem;
}

.site-debug-dialog__title p,
.site-debug-dialog__hint {
  margin: 0;
  color: var(--vp-c-text-2);
}

.site-debug-dialog__title p {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.site-debug-dialog__title h3 {
  margin: 0;
  border-top: 0;
  color: var(--vp-c-text-1);
  font-size: 1.08rem;
  line-height: 1.15;
}

.site-debug-dialog__hint code {
  font-size: 0.86em;
}

.site-debug-dialog__hint--subtle {
  font-size: 0.76rem;
}

.site-debug-section {
  display: grid;
  gap: 0.8rem;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 72%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 82%, transparent);
  padding: 0.95rem;
}

.site-debug-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.85rem;
}

.site-debug-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem;
}

.site-debug-summary__chip,
.site-debug-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 78%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-bg) 92%, transparent);
  color: var(--vp-c-text-2);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  padding: 0.35rem 0.58rem;
}

.site-debug-summary__chip.is-success,
.site-debug-status.is-success {
  border-color: color-mix(in srgb, rgb(52 154 102) 42%, var(--vp-c-divider));
  background: color-mix(in srgb, rgb(52 154 102) 14%, var(--vp-c-bg-soft));
  color: color-mix(in srgb, rgb(52 154 102) 84%, var(--vp-c-text-1));
}

.site-debug-summary__chip.is-danger,
.site-debug-status.is-danger {
  border-color: color-mix(in srgb, rgb(214 78 78) 42%, var(--vp-c-divider));
  background: color-mix(in srgb, rgb(214 78 78) 12%, var(--vp-c-bg-soft));
  color: color-mix(in srgb, rgb(214 78 78) 88%, var(--vp-c-text-1));
}

.site-debug-summary__chip.is-active,
.site-debug-status.is-active {
  border-color: color-mix(
    in srgb,
    var(--vp-c-brand-1) 40%,
    var(--vp-c-divider)
  );
  background: color-mix(in srgb, var(--vp-c-brand-1) 14%, var(--vp-c-bg-soft));
  color: color-mix(in srgb, var(--vp-c-brand-1) 90%, var(--vp-c-text-1));
}

.site-debug-summary__chip.is-muted,
.site-debug-status.is-muted {
  color: var(--vp-c-text-3);
}

.site-debug-metrics {
  display: grid;
  gap: 0.75rem;
}

.site-debug-metric-card {
  display: grid;
  gap: 0.72rem;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 74%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--vp-c-bg) 95%, transparent);
  padding: 0.9rem;
}

.site-debug-metric-card.is-muted {
  opacity: 0.68;
}

.site-debug-metric-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
}

.site-debug-metric-card__eyebrow {
  margin: 0 0 0.3rem;
  color: var(--vp-c-text-2);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.site-debug-metric-card__eyebrow span {
  margin: 0 0.28rem;
}

.site-debug-metric-card__title {
  margin: 0;
  border-top: 0;
  color: var(--vp-c-text-1);
  font-size: 0.94rem;
  line-height: 1.25;
}

.site-debug-metric-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.8rem;
  color: var(--vp-c-text-2);
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.74rem;
}

.site-debug-metric-card__meta strong {
  color: var(--vp-c-text-1);
  font-weight: 700;
  margin-right: 0.32rem;
}

.site-debug-metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  gap: 0.55rem;
}

.site-debug-metric-grid__item {
  display: grid;
  gap: 0.22rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 92%, transparent);
  padding: 0.65rem 0.7rem;
}

.site-debug-metric-grid__item span {
  color: var(--vp-c-text-2);
  font-size: 0.72rem;
}

.site-debug-metric-grid__item strong {
  color: var(--vp-c-text-1);
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.8rem;
}

.site-debug-meter {
  display: grid;
  gap: 0.4rem;
}

.site-debug-meter__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  color: var(--vp-c-text-2);
  font-size: 0.74rem;
}

.site-debug-meter__label strong {
  color: var(--vp-c-text-1);
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.78rem;
}

.site-debug-metric-card__details,
.site-debug-metric-card__error {
  margin: 0;
  font-size: 0.76rem;
  overflow-wrap: anywhere;
}

.site-debug-metric-card__details {
  color: var(--vp-c-text-2);
}

.site-debug-metric-card__error {
  color: color-mix(in srgb, rgb(214 78 78) 88%, var(--vp-c-text-1));
}

.site-debug-metric-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.site-debug-hmr-summary {
  display: grid;
  gap: 0.7rem;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 62%, transparent);
  border-radius: 14px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--vp-c-bg) 96%, transparent),
    color-mix(in srgb, var(--vp-c-bg-soft) 92%, transparent)
  );
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04);
  padding: 0.82rem 0.88rem;
}

.site-debug-hmr-summary__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.65rem;
}

.site-debug-hmr-summary__header strong {
  color: var(--vp-c-text-1);
  font-size: 0.76rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.site-debug-hmr-summary__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.site-debug-hmr-chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.75rem;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 78%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-bg) 90%, transparent);
  color: var(--vp-c-text-2);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  padding: 0.38rem 0.62rem;
  text-transform: uppercase;
}

.site-debug-hmr-chip.is-primary {
  border-color: color-mix(
    in srgb,
    var(--vp-c-brand-1) 34%,
    var(--vp-c-divider)
  );
  background: color-mix(in srgb, var(--vp-c-brand-1) 14%, var(--vp-c-bg));
  color: color-mix(in srgb, var(--vp-c-brand-1) 88%, var(--vp-c-text-1));
}

.site-debug-hmr-summary__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.site-debug-hmr-summary__metric {
  display: grid;
  gap: 0.22rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 88%, transparent);
  padding: 0.56rem 0.6rem;
}

.site-debug-hmr-summary__metric.is-empty {
  opacity: 0.58;
}

.site-debug-hmr-summary__metric span,
.site-debug-hmr-summary__event span,
.site-debug-hmr-summary__description {
  color: var(--vp-c-text-2);
  font-size: 0.72rem;
}

.site-debug-hmr-summary__metric strong,
.site-debug-hmr-summary__event code {
  color: var(--vp-c-text-1);
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}

.site-debug-hmr-summary__events {
  display: grid;
  gap: 0.48rem;
}

.site-debug-hmr-summary__event {
  display: grid;
  gap: 0.22rem;
}

.site-debug-hmr-summary__description {
  margin: 0;
  line-height: 1.5;
}

.site-debug-hmr-summary__browse {
  display: flex;
  align-items: center;
  padding-top: 0.15rem;
}

.site-debug-dialog__inspector {
  display: grid;
  gap: 0.55rem;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 72%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 88%, transparent);
  padding: 0.9rem;
}

.site-debug-dialog__inspector-label {
  color: var(--vp-c-text-2);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.site-debug-dialog__inspector-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.55rem;
}

.site-debug-dialog__input {
  width: 100%;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 82%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--vp-c-bg) 94%, transparent);
  color: var(--vp-c-text-1);
  font: inherit;
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.82rem;
  padding: 0.72rem 0.82rem;
}

.site-debug-dialog__input::placeholder {
  color: var(--vp-c-text-3);
}

.site-debug-dialog__input:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--vp-c-brand-1) 48%, white);
  outline-offset: 3px;
}

.site-debug-global-browser {
  display: grid;
  gap: 0.9rem;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 72%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 88%, transparent);
  padding: 0.95rem;
}

.site-debug-global-browser__header {
  display: grid;
  gap: 0.8rem;
}

.site-debug-global-browser__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.site-debug-global-browser__preset {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 78%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-bg) 92%, transparent);
  color: var(--vp-c-text-2);
  cursor: pointer;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 700;
  line-height: 1;
  min-height: 2rem;
  padding: 0.48rem 0.72rem;
}

.site-debug-global-browser__preset.is-active {
  border-color: color-mix(
    in srgb,
    var(--vp-c-brand-1) 42%,
    var(--vp-c-divider)
  );
  background: color-mix(in srgb, var(--vp-c-brand-1) 16%, var(--vp-c-bg));
  color: color-mix(in srgb, var(--vp-c-brand-1) 90%, var(--vp-c-text-1));
}

.site-debug-global-browser__preset.is-muted {
  opacity: 0.54;
}

.site-debug-global-browser__notes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.site-debug-global-browser__tree {
  min-height: min(34vh, 260px);
  max-height: min(52vh, 460px);
  overflow: auto;
  border-radius: 16px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--vp-c-bg) 97%, transparent),
    color-mix(in srgb, var(--vp-c-bg-soft) 94%, transparent)
  );
  padding: 0.55rem;
}

.site-debug-json-pretty {
  width: 100%;
}

.site-debug-json-pretty :deep(.vjs-tree) {
  font-family: 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.8rem;
  line-height: 1.7;
  color: var(--vp-c-text-1);
}

.site-debug-json-pretty :deep(.vjs-tree.is-virtual) {
  overflow: auto;
  max-height: min(52vh, 460px);
  padding-right: 0.2rem;
}

.site-debug-json-pretty :deep(.vjs-tree-node) {
  min-height: 1.7rem;
  border-radius: 8px;
  padding-right: 0.45rem;
}

.site-debug-json-pretty :deep(.vjs-tree-node:hover),
.site-debug-json-pretty :deep(.vjs-tree-node.is-highlight) {
  background: color-mix(in srgb, var(--vp-c-brand-1) 10%, var(--vp-c-bg-soft));
}

.site-debug-json-pretty :deep(.vjs-tree-node.dark:hover),
.site-debug-json-pretty :deep(.vjs-tree-node.dark.is-highlight),
.site-debug-json-pretty :deep(.vjs-tree-node.dark .vjs-tree-node-actions) {
  background: color-mix(in srgb, var(--vp-c-brand-1) 14%, rgb(15 23 42));
}

.site-debug-json-pretty :deep(.vjs-key) {
  color: var(--vp-c-text-1);
  font-weight: 700;
}

.site-debug-json-pretty :deep(.vjs-value-string) {
  color: #4fd1c5;
}

.site-debug-json-pretty :deep(.vjs-value-number),
.site-debug-json-pretty :deep(.vjs-value-boolean) {
  color: #60a5fa;
}

.site-debug-json-pretty :deep(.vjs-value-null),
.site-debug-json-pretty :deep(.vjs-value-undefined) {
  color: #f472b6;
}

.site-debug-json-pretty :deep(.vjs-tree-brackets),
.site-debug-json-pretty :deep(.vjs-carets:hover) {
  color: color-mix(in srgb, var(--vp-c-brand-1) 88%, white);
}

.site-debug-json-pretty :deep(.vjs-comment),
.site-debug-json-pretty :deep(.vjs-node-index) {
  color: var(--vp-c-text-3);
}

.site-debug-json-pretty :deep(.vjs-tree-node .vjs-tree-node-actions) {
  background: color-mix(in srgb, var(--vp-c-brand-1) 10%, var(--vp-c-bg));
}

@media (max-width: 720px) {
  .site-debug-overlay__badge {
    max-width: calc(100vw - 1rem);
  }

  .site-debug-overlay__panel-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .site-debug-toggle {
    right: 0.85rem;
    bottom: 0.85rem;
    padding: 0.68rem 0.84rem;
  }

  .site-debug-dialog {
    width: calc(100vw - 1rem);
  }

  .site-debug-dialog__panel {
    gap: 0.9rem;
    padding: 0.9rem;
  }

  .site-debug-dialog__header {
    flex-direction: column;
  }

  .site-debug-dialog__actions {
    justify-content: flex-start;
  }

  .site-debug-section__header,
  .site-debug-metric-card__header,
  .site-debug-meter__label {
    flex-direction: column;
    align-items: flex-start;
  }

  .site-debug-summary {
    justify-content: flex-start;
  }

  .site-debug-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .site-debug-dialog__inspector-controls {
    grid-template-columns: 1fr;
  }

  .site-debug-overlay__side-effect-grid,
  .site-debug-detail-modal__summary {
    grid-template-columns: 1fr;
  }

  .site-debug-detail-modal__list-header {
    flex-direction: column;
  }

  .site-debug-detail-modal__list-values {
    justify-items: start;
  }

  .site-debug-chunk-viewer__layout {
    grid-template-columns: 1fr;
  }

  .site-debug-source-viewer__header {
    flex-direction: column;
  }
}
</style>
