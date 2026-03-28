export type SiteDebugLevel = 'info' | 'warn' | 'error';

export interface SiteDebugEventDetail {
  level?: SiteDebugLevel;
  message: string;
  payload?: unknown;
  source?: string;
}

export type SiteDebugRenderMetricStatus =
  | 'detected'
  | 'waiting-visible'
  | 'subscribing'
  | 'rendering'
  | 'completed'
  | 'failed'
  | 'skipped';

export type SiteDebugRenderMode = 'hydrate' | 'render' | 'ssr-only';

export type SiteDebugHmrMetricStatus = 'running' | 'completed' | 'failed';

export type SiteDebugHmrUpdateType =
  | 'markdown-update'
  | 'ssr-only-component-update'
  | 'react-refresh-update';

export type SiteDebugHmrMechanismType =
  | 'markdown-react-hmr'
  | 'ssr-only-direct-hmr'
  | 'react-fast-refresh';

export interface SiteDebugHmrMetric {
  applyEvent?: string;
  clientApplyDurationMs?: number;
  componentName: string;
  errorMessage?: string;
  hmrId: string;
  importedName?: string;
  mechanismType?: SiteDebugHmrMechanismType;
  pageId?: string;
  renderIds?: string[];
  runtimeReadyDurationMs?: number;
  sourceColumn?: number;
  sourceLine?: number;
  sourcePath?: string;
  source?: string;
  ssrApplyDurationMs?: number;
  startedAt: number;
  status: SiteDebugHmrMetricStatus;
  totalDurationMs?: number;
  triggerEvent?: string;
  updateType: SiteDebugHmrUpdateType;
  updatedAt: number;
}

export type SiteDebugHmrMetricPatch = Partial<SiteDebugHmrMetric> & {
  componentName?: string;
  hmrId: string;
  startedAt?: number;
  status?: SiteDebugHmrMetricStatus;
  updateType?: SiteDebugHmrUpdateType;
};

export interface SiteDebugRenderMetric {
  componentName: string;
  detectedAt?: number;
  errorMessage?: string;
  hasSsrContent?: boolean;
  invokeDurationMs?: number;
  pageId?: string;
  renderDirective?: string;
  renderId: string;
  renderMode?: SiteDebugRenderMode;
  renderWithSpaSync?: boolean;
  source?: string;
  status: SiteDebugRenderMetricStatus;
  subscribeDurationMs?: number;
  totalDurationMs?: number;
  updatedAt: number;
  visibleAt?: number;
  waitForVisibilityMs?: number;
}

export type SiteDebugRenderMetricPatch = Partial<SiteDebugRenderMetric> & {
  componentName?: string;
  renderId: string;
  status?: SiteDebugRenderMetricStatus;
};

export interface SiteDebugLogger {
  error: (message: string, payload?: unknown) => boolean;
  info: (message: string, payload?: unknown) => boolean;
  log: (message: string, payload?: unknown, level?: SiteDebugLevel) => boolean;
  warn: (message: string, payload?: unknown) => boolean;
}

export const SITE_DEBUG_EVENT_NAME = 'docs-islands:site-debug-log';
export const SITE_DEBUG_RENDER_METRIC_EVENT_NAME =
  'docs-islands:site-debug-render-metric';
export const SITE_DEBUG_RENDER_METRICS_KEY =
  '__DOCS_ISLANDS_REACT_RENDER_METRICS__';
export const SITE_DEBUG_HMR_METRIC_EVENT_NAME =
  'docs-islands:site-debug-hmr-metric';
export const SITE_DEBUG_HMR_METRICS_KEY = '__DOCS_ISLANDS_REACT_HMR_METRICS__';
export const SITE_DEBUG_STORAGE_KEY = 'docs-islands:site-debug-enabled';

const canUseWindow = () => globalThis.window !== undefined;

type SiteDebugWindow = Window & {
  __DOCS_ISLANDS_REACT_HMR_METRICS__?: Record<string, SiteDebugHmrMetric>;
  __DOCS_ISLANDS_REACT_RENDER_METRICS__?: Record<string, SiteDebugRenderMetric>;
};

const getSiteDebugWindow = (): SiteDebugWindow =>
  globalThis as unknown as SiteDebugWindow;

const sortSiteDebugItems = <T>(
  items: Iterable<T>,
  compare: (left: T, right: T) => number,
): T[] => {
  const sortedItems = [...items];

  // Keep a copied-array sort so emitted shared runtime stays ES2020-compatible.
  // eslint-disable-next-line unicorn/no-array-sort
  return sortedItems.sort(compare);
};

export const isSiteDebugEnabled = (): boolean => {
  if (!canUseWindow()) {
    return false;
  }

  try {
    const params = new URLSearchParams(globalThis.location.search);
    const queryValue = params.get('site-debug');

    if (queryValue === '1') {
      return true;
    }

    if (queryValue === '0') {
      return false;
    }

    return globalThis.localStorage.getItem(SITE_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export const dispatchSiteDebugLog = (detail: SiteDebugEventDetail): boolean => {
  if (!canUseWindow() || !detail.message || !isSiteDebugEnabled()) {
    return false;
  }

  globalThis.dispatchEvent(
    new CustomEvent<SiteDebugEventDetail>(SITE_DEBUG_EVENT_NAME, {
      detail,
    }),
  );

  return true;
};

export const logSiteDebug = (
  source: string,
  message: string,
  payload?: unknown,
  level: SiteDebugLevel = 'info',
): boolean =>
  dispatchSiteDebugLog({
    level,
    message,
    payload,
    source,
  });

export const createSiteDebugLogger = (source: string): SiteDebugLogger => ({
  error: (message: string, payload?: unknown) =>
    logSiteDebug(source, message, payload, 'error'),
  info: (message: string, payload?: unknown) =>
    logSiteDebug(source, message, payload, 'info'),
  log: (message: string, payload?: unknown, level: SiteDebugLevel = 'info') =>
    logSiteDebug(source, message, payload, level),
  warn: (message: string, payload?: unknown) =>
    logSiteDebug(source, message, payload, 'warn'),
});

export const getSiteDebugNow = (): number => {
  if (
    globalThis.performance !== undefined &&
    typeof globalThis.performance.now === 'function'
  ) {
    return globalThis.performance.now();
  }

  return Date.now();
};

const getSiteDebugRenderMetricStore = (): Record<
  string,
  SiteDebugRenderMetric
> | null => {
  if (!canUseWindow()) {
    return null;
  }

  const debugWindow = getSiteDebugWindow();

  if (!debugWindow[SITE_DEBUG_RENDER_METRICS_KEY]) {
    debugWindow[SITE_DEBUG_RENDER_METRICS_KEY] = {};
  }

  return debugWindow[SITE_DEBUG_RENDER_METRICS_KEY] ?? null;
};

const getSiteDebugHmrMetricStore = (): Record<
  string,
  SiteDebugHmrMetric
> | null => {
  if (!canUseWindow()) {
    return null;
  }

  const debugWindow = getSiteDebugWindow();

  if (!debugWindow[SITE_DEBUG_HMR_METRICS_KEY]) {
    debugWindow[SITE_DEBUG_HMR_METRICS_KEY] = {};
  }

  return debugWindow[SITE_DEBUG_HMR_METRICS_KEY] ?? null;
};

const normalizeDuration = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Number(value.toFixed(2));
};

const getRenderMetricStoreKey = ({
  pageId,
  renderId,
}: {
  pageId?: string;
  renderId: string;
}) => `${pageId ?? 'unknown'}::${renderId}`;

const normalizeSiteDebugRenderMetric = (
  previous: SiteDebugRenderMetric | undefined,
  patch: SiteDebugRenderMetricPatch,
): SiteDebugRenderMetric => {
  const updatedAt = patch.updatedAt ?? getSiteDebugNow();
  const detectedAt = patch.detectedAt ?? previous?.detectedAt ?? updatedAt;
  const visibleAt = patch.visibleAt ?? previous?.visibleAt;
  const waitForVisibilityMs =
    patch.waitForVisibilityMs ??
    previous?.waitForVisibilityMs ??
    (visibleAt === undefined
      ? undefined
      : normalizeDuration(visibleAt - detectedAt));
  const totalDurationMs =
    patch.totalDurationMs ??
    previous?.totalDurationMs ??
    (patch.status === 'completed'
      ? normalizeDuration(updatedAt - detectedAt)
      : undefined);

  return {
    componentName:
      patch.componentName ?? previous?.componentName ?? 'UnknownComponent',
    detectedAt,
    errorMessage: patch.errorMessage ?? previous?.errorMessage,
    hasSsrContent: patch.hasSsrContent ?? previous?.hasSsrContent,
    invokeDurationMs: patch.invokeDurationMs ?? previous?.invokeDurationMs,
    pageId: patch.pageId ?? previous?.pageId,
    renderDirective: patch.renderDirective ?? previous?.renderDirective,
    renderId: patch.renderId,
    renderMode: patch.renderMode ?? previous?.renderMode,
    renderWithSpaSync: patch.renderWithSpaSync ?? previous?.renderWithSpaSync,
    source: patch.source ?? previous?.source,
    status: patch.status ?? previous?.status ?? 'detected',
    subscribeDurationMs:
      patch.subscribeDurationMs ?? previous?.subscribeDurationMs,
    totalDurationMs,
    updatedAt,
    visibleAt,
    waitForVisibilityMs,
  };
};

const normalizeSiteDebugHmrMetric = (
  previous: SiteDebugHmrMetric | undefined,
  patch: SiteDebugHmrMetricPatch,
): SiteDebugHmrMetric => {
  const updatedAt = patch.updatedAt ?? getSiteDebugNow();
  const startedAt = patch.startedAt ?? previous?.startedAt ?? updatedAt;
  const totalDurationMs =
    patch.totalDurationMs ??
    previous?.totalDurationMs ??
    (patch.status === 'completed' || patch.status === 'failed'
      ? normalizeDuration(updatedAt - startedAt)
      : undefined);

  return {
    applyEvent: patch.applyEvent ?? previous?.applyEvent,
    clientApplyDurationMs:
      patch.clientApplyDurationMs ?? previous?.clientApplyDurationMs,
    componentName:
      patch.componentName ?? previous?.componentName ?? 'UnknownComponent',
    errorMessage: patch.errorMessage ?? previous?.errorMessage,
    hmrId: patch.hmrId,
    importedName: patch.importedName ?? previous?.importedName,
    mechanismType: patch.mechanismType ?? previous?.mechanismType,
    pageId: patch.pageId ?? previous?.pageId,
    renderIds: patch.renderIds ?? previous?.renderIds,
    runtimeReadyDurationMs:
      patch.runtimeReadyDurationMs ?? previous?.runtimeReadyDurationMs,
    sourceColumn: patch.sourceColumn ?? previous?.sourceColumn,
    sourceLine: patch.sourceLine ?? previous?.sourceLine,
    sourcePath: patch.sourcePath ?? previous?.sourcePath,
    source: patch.source ?? previous?.source,
    ssrApplyDurationMs:
      patch.ssrApplyDurationMs ?? previous?.ssrApplyDurationMs,
    startedAt,
    status: patch.status ?? previous?.status ?? 'running',
    totalDurationMs,
    triggerEvent: patch.triggerEvent ?? previous?.triggerEvent,
    updateType: patch.updateType ?? previous?.updateType ?? 'markdown-update',
    updatedAt,
  };
};

export const getSiteDebugRenderMetrics = (): SiteDebugRenderMetric[] => {
  const store = getSiteDebugRenderMetricStore();

  if (!store) {
    return [];
  }

  return sortSiteDebugItems(Object.values(store), (left, right) => {
    const leftTime = left.updatedAt ?? left.detectedAt ?? 0;
    const rightTime = right.updatedAt ?? right.detectedAt ?? 0;
    return rightTime - leftTime;
  });
};

export const getSiteDebugHmrMetrics = (): SiteDebugHmrMetric[] => {
  const store = getSiteDebugHmrMetricStore();

  if (!store) {
    return [];
  }

  return sortSiteDebugItems(Object.values(store), (left, right) => {
    const leftTime = left.updatedAt ?? left.startedAt ?? 0;
    const rightTime = right.updatedAt ?? right.startedAt ?? 0;
    return rightTime - leftTime;
  });
};

export const updateSiteDebugRenderMetric = (
  patch: SiteDebugRenderMetricPatch,
): SiteDebugRenderMetric | null => {
  if (!canUseWindow() || !isSiteDebugEnabled()) {
    return null;
  }

  const store = getSiteDebugRenderMetricStore();

  if (!store) {
    return null;
  }

  const storeKey = getRenderMetricStoreKey(patch);
  const nextMetric = normalizeSiteDebugRenderMetric(store[storeKey], patch);
  store[storeKey] = nextMetric;

  globalThis.dispatchEvent(
    new CustomEvent<SiteDebugRenderMetric>(
      SITE_DEBUG_RENDER_METRIC_EVENT_NAME,
      {
        detail: nextMetric,
      },
    ),
  );

  return nextMetric;
};

export const updateSiteDebugHmrMetric = (
  patch: SiteDebugHmrMetricPatch,
): SiteDebugHmrMetric | null => {
  if (!canUseWindow() || !isSiteDebugEnabled()) {
    return null;
  }

  const store = getSiteDebugHmrMetricStore();

  if (!store) {
    return null;
  }

  const nextMetric = normalizeSiteDebugHmrMetric(store[patch.hmrId], patch);
  store[patch.hmrId] = nextMetric;

  globalThis.dispatchEvent(
    new CustomEvent<SiteDebugHmrMetric>(SITE_DEBUG_HMR_METRIC_EVENT_NAME, {
      detail: nextMetric,
    }),
  );

  return nextMetric;
};

export const resetSiteDebugRenderMetrics = (): void => {
  const store = getSiteDebugRenderMetricStore();

  if (!store) {
    return;
  }

  for (const key of Object.keys(store)) {
    delete store[key];
  }
};

export const resetSiteDebugHmrMetrics = (): void => {
  const store = getSiteDebugHmrMetricStore();

  if (!store) {
    return;
  }

  for (const key of Object.keys(store)) {
    delete store[key];
  }
};
