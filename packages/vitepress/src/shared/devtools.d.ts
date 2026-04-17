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

export interface SiteDevToolsHmrMetricPatch
  extends Partial<SiteDevToolsHmrMetric> {
  componentName?: string;
  hmrId: string;
  startedAt?: number;
  status?: SiteDevToolsHmrMetricStatus;
  updateType?: SiteDevToolsHmrUpdateType;
}

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

export interface SiteDevToolsRenderMetricPatch
  extends Partial<SiteDevToolsRenderMetric> {
  componentName?: string;
  renderId: string;
  status?: SiteDevToolsRenderMetricStatus;
}

export interface SiteDevToolsModeChangeDetail {
  enabled: boolean;
  previousEnabled: boolean;
  source?: string;
}

export declare const SITE_DEVTOOLS_EVENT_NAME: 'docs-islands:site-devtools-log';
export declare const SITE_DEVTOOLS_RENDER_METRIC_EVENT_NAME: 'docs-islands:site-devtools-render-metric';
export declare const SITE_DEVTOOLS_RENDER_METRICS_KEY: '__DOCS_ISLANDS_REACT_RENDER_METRICS__';
export declare const SITE_DEVTOOLS_HMR_METRIC_EVENT_NAME: 'docs-islands:site-devtools-hmr-metric';
export declare const SITE_DEVTOOLS_HMR_METRICS_KEY: '__DOCS_ISLANDS_REACT_HMR_METRICS__';
export declare const SITE_DEVTOOLS_MODE_EVENT_NAME: 'docs-islands:site-devtools-mode';
export declare const SITE_DEVTOOLS_STORAGE_KEY: 'docs-islands:site-devtools-enabled';

export declare const isSiteDevToolsEnabled: () => boolean;
export declare const dispatchSiteDevToolsModeChange: (
  detail: SiteDevToolsModeChangeDetail,
) => boolean;
export declare const setSiteDevToolsEnabled: (
  enabled: boolean,
  options?: {
    clearQueryOverride?: boolean;
    source?: string;
  },
) => boolean;
export declare const toggleSiteDevToolsEnabled: (options?: {
  clearQueryOverride?: boolean;
  source?: string;
}) => boolean;
export declare const syncSiteDevToolsEnabledFromQuery: (options?: {
  source?: string;
}) => boolean;
export declare const dispatchSiteDevToolsLog: (
  detail: SiteDevToolsEventDetail,
) => boolean;
export declare const logSiteDevTools: (
  source: string,
  message: string,
  payload?: unknown,
  level?: SiteDevToolsLevel,
) => boolean;
export declare const createSiteDevToolsLogger: (source: string) => {
  error: (message: string, payload?: unknown) => boolean;
  info: (message: string, payload?: unknown) => boolean;
  log: (
    message: string,
    payload?: unknown,
    level?: SiteDevToolsLevel,
  ) => boolean;
  warn: (message: string, payload?: unknown) => boolean;
};
export declare const getSiteDevToolsNow: () => number;
export declare const getSiteDevToolsRenderMetrics: () => SiteDevToolsRenderMetric[];
export declare const getSiteDevToolsHmrMetrics: () => SiteDevToolsHmrMetric[];
export declare const updateSiteDevToolsRenderMetric: (
  patch: SiteDevToolsRenderMetricPatch,
) => SiteDevToolsRenderMetric | null;
export declare const updateSiteDevToolsHmrMetric: (
  patch: SiteDevToolsHmrMetricPatch,
) => SiteDevToolsHmrMetric | null;
export declare const resetSiteDevToolsRenderMetrics: () => void;
export declare const resetSiteDevToolsHmrMetrics: () => void;
