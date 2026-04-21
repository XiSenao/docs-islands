import type { PageMetafile } from '#dep-types/page';

export type SiteDevToolsLevel = 'info' | 'warn' | 'error';

export interface SiteDevToolsEventDetail {
  level?: SiteDevToolsLevel;
  message: string;
  payload?: unknown;
  source?: string;
}

export type SiteDevToolsRenderMetricStatus =
  | 'detected'
  | 'waiting-visible'
  | 'subscribing'
  | 'rendering'
  | 'completed'
  | 'failed'
  | 'skipped';

export type SiteDevToolsRenderMode = 'hydrate' | 'render' | 'ssr-only';

export type SiteDevToolsHmrMetricStatus = 'running' | 'completed' | 'failed';

export type SiteDevToolsHmrUpdateType =
  | 'markdown-update'
  | 'ssr-only-component-update'
  | 'react-refresh-update';

export type SiteDevToolsHmrMechanismType =
  | 'markdown-react-hmr'
  | 'ssr-only-direct-hmr'
  | 'react-fast-refresh';

export interface SiteDevToolsHmrMetric {
  applyEvent?: string;
  clientApplyDurationMs?: number;
  componentName: string;
  errorMessage?: string;
  hmrId: string;
  importedName?: string;
  mechanismType?: SiteDevToolsHmrMechanismType;
  pageId?: string;
  renderIds?: string[];
  runtimeReadyDurationMs?: number;
  sourceColumn?: number;
  sourceLine?: number;
  sourcePath?: string;
  source?: string;
  ssrApplyDurationMs?: number;
  startedAt: number;
  status: SiteDevToolsHmrMetricStatus;
  totalDurationMs?: number;
  triggerEvent?: string;
  updateType: SiteDevToolsHmrUpdateType;
  updatedAt: number;
}

export type SiteDevToolsHmrMetricPatch = Partial<SiteDevToolsHmrMetric> & {
  componentName?: string;
  hmrId: string;
  startedAt?: number;
  status?: SiteDevToolsHmrMetricStatus;
  updateType?: SiteDevToolsHmrUpdateType;
};

export interface SiteDevToolsRenderMetric {
  componentName: string;
  detectedAt?: number;
  errorMessage?: string;
  hasSsrContent?: boolean;
  invokeDurationMs?: number;
  pageId?: string;
  renderDirective?: string;
  renderId: string;
  renderMode?: SiteDevToolsRenderMode;
  renderWithSpaSync?: boolean;
  source?: string;
  status: SiteDevToolsRenderMetricStatus;
  subscribeDurationMs?: number;
  totalDurationMs?: number;
  updatedAt: number;
  visibleAt?: number;
  waitForVisibilityMs?: number;
}

export type SiteDevToolsRenderMetricPatch =
  Partial<SiteDevToolsRenderMetric> & {
    componentName?: string;
    renderId: string;
    status?: SiteDevToolsRenderMetricStatus;
  };

export interface SiteDevToolsLogger {
  error: (message: string, payload?: unknown) => boolean;
  info: (message: string, payload?: unknown) => boolean;
  log: (
    message: string,
    payload?: unknown,
    level?: SiteDevToolsLevel,
  ) => boolean;
  warn: (message: string, payload?: unknown) => boolean;
}

export interface SiteDevToolsModeChangeDetail {
  enabled: boolean;
  previousEnabled: boolean;
  source?: string;
}

export interface SiteDevToolsPageMetafileEventDetail {
  buildId?: string | null;
  kind: 'page-loaded' | 'state-reset';
  pageCount: number;
  pageId?: string;
  pageMetafile?: PageMetafile | null;
}

export const SITE_DEVTOOLS_EVENT_NAME = 'docs-islands:site-devtools-log';
export const SITE_DEVTOOLS_RENDER_METRIC_EVENT_NAME =
  'docs-islands:site-devtools-render-metric';
export const SITE_DEVTOOLS_RENDER_METRICS_KEY =
  '__DOCS_ISLANDS_REACT_RENDER_METRICS__';
export const SITE_DEVTOOLS_HMR_METRIC_EVENT_NAME =
  'docs-islands:site-devtools-hmr-metric';
export const SITE_DEVTOOLS_HMR_METRICS_KEY =
  '__DOCS_ISLANDS_REACT_HMR_METRICS__';
export const SITE_DEVTOOLS_MODE_EVENT_NAME = 'docs-islands:site-devtools-mode';
export const SITE_DEVTOOLS_PAGE_METAFILE_EVENT_NAME =
  'docs-islands:site-devtools-page-metafile';
export const SITE_DEVTOOLS_STORAGE_KEY = 'docs-islands:site-devtools-enabled';

const canUseWindow = () => globalThis.window !== undefined;

type SiteDevToolsWindow = Window & {
  __DOCS_ISLANDS_REACT_HMR_METRICS__?: Record<string, SiteDevToolsHmrMetric>;
  __DOCS_ISLANDS_REACT_RENDER_METRICS__?: Record<
    string,
    SiteDevToolsRenderMetric
  >;
};

const getSiteDevToolsWindow = (): SiteDevToolsWindow =>
  globalThis as unknown as SiteDevToolsWindow;

const sortSiteDevToolsItems = <T>(
  items: Iterable<T>,
  compare: (left: T, right: T) => number,
): T[] => {
  const sortedItems = [...items];

  // Keep a copied-array sort so emitted shared runtime stays ES2020-compatible.
  // eslint-disable-next-line unicorn/no-array-sort
  return sortedItems.sort(compare);
};

const getSiteDevToolsQueryOverride = (): boolean | null => {
  if (!canUseWindow()) {
    return null;
  }

  try {
    const params = new URLSearchParams(globalThis.location.search);
    const queryValue = params.get('site-devtools');

    if (queryValue === '1') {
      return true;
    }

    if (queryValue === '0') {
      return false;
    }
  } catch {
    // Ignore malformed search params and fall back to persisted state.
  }

  return null;
};

const getPersistedSiteDevToolsEnabled = () => {
  if (!canUseWindow()) {
    return false;
  }

  try {
    return globalThis.localStorage.getItem(SITE_DEVTOOLS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const clearSiteDevToolsQueryOverride = () => {
  if (!canUseWindow()) {
    return;
  }

  try {
    const url = new URL(globalThis.location.href);

    if (!url.searchParams.has('site-devtools')) {
      return;
    }

    url.searchParams.delete('site-devtools');
    globalThis.history.replaceState(
      globalThis.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    // Ignore history mutation failures.
  }
};

export const isSiteDevToolsEnabled = (): boolean => {
  if (!canUseWindow()) {
    return false;
  }

  const queryOverride = getSiteDevToolsQueryOverride();

  if (queryOverride !== null) {
    return queryOverride;
  }

  return getPersistedSiteDevToolsEnabled();
};

export const dispatchSiteDevToolsModeChange = (
  detail: SiteDevToolsModeChangeDetail,
): boolean => {
  if (!canUseWindow()) {
    return false;
  }

  globalThis.dispatchEvent(
    new CustomEvent<SiteDevToolsModeChangeDetail>(
      SITE_DEVTOOLS_MODE_EVENT_NAME,
      {
        detail,
      },
    ),
  );

  return true;
};

export const dispatchSiteDevToolsPageMetafileEvent = (
  detail: SiteDevToolsPageMetafileEventDetail,
): boolean => {
  if (!canUseWindow() || !isSiteDevToolsEnabled()) {
    return false;
  }

  globalThis.dispatchEvent(
    new CustomEvent<SiteDevToolsPageMetafileEventDetail>(
      SITE_DEVTOOLS_PAGE_METAFILE_EVENT_NAME,
      {
        detail,
      },
    ),
  );

  return true;
};

export const setSiteDevToolsEnabled = (
  enabled: boolean,
  options: {
    clearQueryOverride?: boolean;
    source?: string;
  } = {},
): boolean => {
  const previousEnabled = isSiteDevToolsEnabled();

  if (!canUseWindow()) {
    return enabled;
  }

  try {
    if (enabled) {
      globalThis.localStorage.setItem(SITE_DEVTOOLS_STORAGE_KEY, '1');
    } else {
      globalThis.localStorage.removeItem(SITE_DEVTOOLS_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures and keep resolving from the current URL state.
  }

  if (options.clearQueryOverride) {
    clearSiteDevToolsQueryOverride();
  }

  const nextEnabled = isSiteDevToolsEnabled();

  if (nextEnabled !== previousEnabled) {
    dispatchSiteDevToolsModeChange({
      enabled: nextEnabled,
      previousEnabled,
      source: options.source,
    });
  }

  return nextEnabled;
};

export const toggleSiteDevToolsEnabled = (
  options: {
    clearQueryOverride?: boolean;
    source?: string;
  } = {},
): boolean =>
  setSiteDevToolsEnabled(!isSiteDevToolsEnabled(), {
    clearQueryOverride: options.clearQueryOverride ?? true,
    source: options.source,
  });

export const syncSiteDevToolsEnabledFromQuery = (
  options: {
    source?: string;
  } = {},
): boolean => {
  const queryOverride = getSiteDevToolsQueryOverride();

  if (queryOverride === null) {
    return isSiteDevToolsEnabled();
  }

  return setSiteDevToolsEnabled(queryOverride, {
    source: options.source ?? 'query',
  });
};

export const dispatchSiteDevToolsLog = (
  detail: SiteDevToolsEventDetail,
): boolean => {
  if (!canUseWindow() || !detail.message || !isSiteDevToolsEnabled()) {
    return false;
  }

  globalThis.dispatchEvent(
    new CustomEvent<SiteDevToolsEventDetail>(SITE_DEVTOOLS_EVENT_NAME, {
      detail,
    }),
  );

  return true;
};

export const logSiteDevTools = (
  source: string,
  message: string,
  payload?: unknown,
  level: SiteDevToolsLevel = 'info',
): boolean =>
  dispatchSiteDevToolsLog({
    level,
    message,
    payload,
    source,
  });

export const createSiteDevToolsLogger = (
  source: string,
): SiteDevToolsLogger => ({
  error: (message: string, payload?: unknown) =>
    logSiteDevTools(source, message, payload, 'error'),
  info: (message: string, payload?: unknown) =>
    logSiteDevTools(source, message, payload, 'info'),
  log: (
    message: string,
    payload?: unknown,
    level: SiteDevToolsLevel = 'info',
  ) => logSiteDevTools(source, message, payload, level),
  warn: (message: string, payload?: unknown) =>
    logSiteDevTools(source, message, payload, 'warn'),
});

export const getSiteDevToolsNow = (): number => {
  if (
    globalThis.performance !== undefined &&
    typeof globalThis.performance.now === 'function'
  ) {
    return globalThis.performance.now();
  }

  return Date.now();
};

const getSiteDevToolsRenderMetricStore = (): Record<
  string,
  SiteDevToolsRenderMetric
> | null => {
  if (!canUseWindow()) {
    return null;
  }

  const debugWindow = getSiteDevToolsWindow();

  if (!debugWindow[SITE_DEVTOOLS_RENDER_METRICS_KEY]) {
    debugWindow[SITE_DEVTOOLS_RENDER_METRICS_KEY] = {};
  }

  return debugWindow[SITE_DEVTOOLS_RENDER_METRICS_KEY] ?? null;
};

const getSiteDevToolsHmrMetricStore = (): Record<
  string,
  SiteDevToolsHmrMetric
> | null => {
  if (!canUseWindow()) {
    return null;
  }

  const debugWindow = getSiteDevToolsWindow();

  if (!debugWindow[SITE_DEVTOOLS_HMR_METRICS_KEY]) {
    debugWindow[SITE_DEVTOOLS_HMR_METRICS_KEY] = {};
  }

  return debugWindow[SITE_DEVTOOLS_HMR_METRICS_KEY] ?? null;
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

const normalizeSiteDevToolsRenderMetric = (
  previous: SiteDevToolsRenderMetric | undefined,
  patch: SiteDevToolsRenderMetricPatch,
): SiteDevToolsRenderMetric => {
  const updatedAt = patch.updatedAt ?? getSiteDevToolsNow();
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

const normalizeSiteDevToolsHmrMetric = (
  previous: SiteDevToolsHmrMetric | undefined,
  patch: SiteDevToolsHmrMetricPatch,
): SiteDevToolsHmrMetric => {
  const updatedAt = patch.updatedAt ?? getSiteDevToolsNow();
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

export const getSiteDevToolsRenderMetrics = (): SiteDevToolsRenderMetric[] => {
  const store = getSiteDevToolsRenderMetricStore();

  if (!store) {
    return [];
  }

  return sortSiteDevToolsItems(Object.values(store), (left, right) => {
    const leftTime = left.updatedAt ?? left.detectedAt ?? 0;
    const rightTime = right.updatedAt ?? right.detectedAt ?? 0;
    return rightTime - leftTime;
  });
};

export const getSiteDevToolsHmrMetrics = (): SiteDevToolsHmrMetric[] => {
  const store = getSiteDevToolsHmrMetricStore();

  if (!store) {
    return [];
  }

  return sortSiteDevToolsItems(Object.values(store), (left, right) => {
    const leftTime = left.updatedAt ?? left.startedAt ?? 0;
    const rightTime = right.updatedAt ?? right.startedAt ?? 0;
    return rightTime - leftTime;
  });
};

export const updateSiteDevToolsRenderMetric = (
  patch: SiteDevToolsRenderMetricPatch,
): SiteDevToolsRenderMetric | null => {
  if (!canUseWindow() || !isSiteDevToolsEnabled()) {
    return null;
  }

  const store = getSiteDevToolsRenderMetricStore();

  if (!store) {
    return null;
  }

  const storeKey = getRenderMetricStoreKey(patch);
  const nextMetric = normalizeSiteDevToolsRenderMetric(store[storeKey], patch);
  store[storeKey] = nextMetric;

  globalThis.dispatchEvent(
    new CustomEvent<SiteDevToolsRenderMetric>(
      SITE_DEVTOOLS_RENDER_METRIC_EVENT_NAME,
      {
        detail: nextMetric,
      },
    ),
  );

  return nextMetric;
};

export const updateSiteDevToolsHmrMetric = (
  patch: SiteDevToolsHmrMetricPatch,
): SiteDevToolsHmrMetric | null => {
  if (!canUseWindow() || !isSiteDevToolsEnabled()) {
    return null;
  }

  const store = getSiteDevToolsHmrMetricStore();

  if (!store) {
    return null;
  }

  const nextMetric = normalizeSiteDevToolsHmrMetric(store[patch.hmrId], patch);
  store[patch.hmrId] = nextMetric;

  globalThis.dispatchEvent(
    new CustomEvent<SiteDevToolsHmrMetric>(
      SITE_DEVTOOLS_HMR_METRIC_EVENT_NAME,
      {
        detail: nextMetric,
      },
    ),
  );

  return nextMetric;
};

export const resetSiteDevToolsRenderMetrics = (): void => {
  const store = getSiteDevToolsRenderMetricStore();

  if (!store) {
    return;
  }

  for (const key of Object.keys(store)) {
    delete store[key];
  }
};

export const resetSiteDevToolsHmrMetrics = (): void => {
  const store = getSiteDevToolsHmrMetricStore();

  if (!store) {
    return;
  }

  for (const key of Object.keys(store)) {
    delete store[key];
  }
};
