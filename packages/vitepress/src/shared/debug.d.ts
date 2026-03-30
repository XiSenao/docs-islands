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

export interface SiteDebugHmrMetricPatch extends Partial<SiteDebugHmrMetric> {
  componentName?: string;
  hmrId: string;
  startedAt?: number;
  status?: SiteDebugHmrMetricStatus;
  updateType?: SiteDebugHmrUpdateType;
}

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

export interface SiteDebugRenderMetricPatch
  extends Partial<SiteDebugRenderMetric> {
  componentName?: string;
  renderId: string;
  status?: SiteDebugRenderMetricStatus;
}

export interface SiteDebugModeChangeDetail {
  enabled: boolean;
  previousEnabled: boolean;
  source?: string;
}

export declare const SITE_DEBUG_EVENT_NAME: 'docs-islands:site-debug-log';
export declare const SITE_DEBUG_RENDER_METRIC_EVENT_NAME: 'docs-islands:site-debug-render-metric';
export declare const SITE_DEBUG_RENDER_METRICS_KEY: '__DOCS_ISLANDS_REACT_RENDER_METRICS__';
export declare const SITE_DEBUG_HMR_METRIC_EVENT_NAME: 'docs-islands:site-debug-hmr-metric';
export declare const SITE_DEBUG_HMR_METRICS_KEY: '__DOCS_ISLANDS_REACT_HMR_METRICS__';
export declare const SITE_DEBUG_MODE_EVENT_NAME: 'docs-islands:site-debug-mode';
export declare const SITE_DEBUG_STORAGE_KEY: 'docs-islands:site-debug-enabled';

export declare const isSiteDebugEnabled: () => boolean;
export declare const dispatchSiteDebugModeChange: (
  detail: SiteDebugModeChangeDetail,
) => boolean;
export declare const setSiteDebugEnabled: (
  enabled: boolean,
  options?: {
    clearQueryOverride?: boolean;
    source?: string;
  },
) => boolean;
export declare const toggleSiteDebugEnabled: (options?: {
  clearQueryOverride?: boolean;
  source?: string;
}) => boolean;
export declare const syncSiteDebugEnabledFromQuery: (options?: {
  source?: string;
}) => boolean;
export declare const dispatchSiteDebugLog: (
  detail: SiteDebugEventDetail,
) => boolean;
export declare const logSiteDebug: (
  source: string,
  message: string,
  payload?: unknown,
  level?: SiteDebugLevel,
) => boolean;
export declare const createSiteDebugLogger: (source: string) => {
  error: (message: string, payload?: unknown) => boolean;
  info: (message: string, payload?: unknown) => boolean;
  log: (message: string, payload?: unknown, level?: SiteDebugLevel) => boolean;
  warn: (message: string, payload?: unknown) => boolean;
};
export declare const getSiteDebugNow: () => number;
export declare const getSiteDebugRenderMetrics: () => SiteDebugRenderMetric[];
export declare const getSiteDebugHmrMetrics: () => SiteDebugHmrMetric[];
export declare const updateSiteDebugRenderMetric: (
  patch: SiteDebugRenderMetricPatch,
) => SiteDebugRenderMetric | null;
export declare const updateSiteDebugHmrMetric: (
  patch: SiteDebugHmrMetricPatch,
) => SiteDebugHmrMetric | null;
export declare const resetSiteDebugRenderMetrics: () => void;
export declare const resetSiteDebugHmrMetrics: () => void;
