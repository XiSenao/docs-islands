import type { PageMetafile } from './page';
import type { RenderDirective } from './render';

export type DocsRuntimeEventLevel = 'info' | 'warn' | 'error';

export interface DocsRuntimeEvent {
  level: DocsRuntimeEventLevel;
  message: string;
  payload?: unknown;
  scope: string;
}

export interface DocsComponentRecord<TComponent = unknown> {
  component: TComponent | null;
  importedName?: string;
  path?: string;
}

export type DocsInjectComponent<TComponent = unknown> = Record<
  string,
  Record<string, DocsComponentRecord<TComponent>>
>;

export interface RenderContainerInfo {
  element: Element;
  props: Record<string, string>;
  renderComponent: string;
  renderDirective: RenderDirective;
  renderId: string;
  renderWithSpaSync: boolean;
}

export type DocsRenderMetricStatus =
  | 'detected'
  | 'waiting-visible'
  | 'subscribing'
  | 'rendering'
  | 'completed'
  | 'failed'
  | 'skipped';

export type DocsRenderMode = 'hydrate' | 'render' | 'ssr-only';

export interface DocsRenderMetricPatch {
  detectedAt?: number;
  errorMessage?: string;
  hasSsrContent?: boolean;
  invokeDurationMs?: number;
  renderMode?: DocsRenderMode;
  status?: DocsRenderMetricStatus;
  subscribeDurationMs?: number;
  totalDurationMs?: number;
  updatedAt?: number;
  visibleAt?: number;
  waitForVisibilityMs?: number;
}

export interface DocsPageMetafileEventDetail<TBuildMetrics = unknown> {
  buildId?: string | null;
  kind: 'page-loaded' | 'state-reset';
  pageCount: number;
  pageId?: string;
  pageMetafile?: PageMetafile<TBuildMetrics> | null;
}

export interface DocsRuntimeHooks<TBuildMetrics = unknown> {
  onEvent?: (event: DocsRuntimeEvent) => void;
  onPageMetafileEvent?: (
    detail: DocsPageMetafileEventDetail<TBuildMetrics>,
  ) => void;
}

export type DocsComponentManagerHooks<TBuildMetrics = unknown> =
  DocsRuntimeHooks<TBuildMetrics>;

export interface DocsRenderStrategyHooks<TBuildMetrics = unknown>
  extends DocsRuntimeHooks<TBuildMetrics> {
  onRenderStateChange?: (
    info: RenderContainerInfo,
    patch: DocsRenderMetricPatch,
  ) => void;
}

export interface DocsRendererInvocation<TComponent>
  extends RenderContainerInfo {
  component: TComponent;
  pageId: string;
}

export interface DocsHydrateResult {
  errorMessage?: string;
  renderMode?: DocsRenderMode;
}

export interface DocsRendererAdapter<TComponent> {
  framework: string;
  ensureRuntime: () => Promise<boolean>;
  hydrate: (
    invocation: DocsRendererInvocation<TComponent>,
  ) => Promise<DocsHydrateResult | void> | DocsHydrateResult | void;
  isRuntimeAvailable: () => boolean;
  render: (
    invocation: DocsRendererInvocation<TComponent>,
  ) => Promise<void> | void;
  executeSsrInjectScript?: (scriptPath: string) => Promise<boolean> | boolean;
}

export interface DocsLifecycleAdapter {
  getPageId: () => string;
  inBrowser: boolean;
  onContentUpdated: (callback: () => void) => void;
}

export interface DocsComponentManagerInitializeOptions {
  currentPageId?: string;
  mode: 'dev' | 'prod';
  mpa?: boolean;
  preferInjectedCurrentMeta?: boolean;
  preloadCurrentPage?: boolean;
}

export interface DocsRuntimeContext {
  isInitialLoad: boolean;
  pageId: string;
}

export interface DocsRuntimeManagerLike {
  ensureFrameworkRuntime: () => Promise<boolean>;
  initialize: (options: DocsComponentManagerInitializeOptions) => Promise<void>;
}

export interface DocsRuntimeExecutorLike {
  cleanup: () => void;
  collectRenderContainers: () => RenderContainerInfo[];
  executeRuntime: (context: DocsRuntimeContext) => Promise<void>;
}

export interface DocsClientIntegrationContext<
  TManager extends DocsRuntimeManagerLike = DocsRuntimeManagerLike,
  TExecutor extends DocsRuntimeExecutorLike = DocsRuntimeExecutorLike,
> {
  lifecycle: DocsLifecycleAdapter;
  manager: TManager;
  renderStrategy: TExecutor;
}

export interface DocsDevBridge<
  TManager extends DocsRuntimeManagerLike = DocsRuntimeManagerLike,
  TExecutor extends DocsRuntimeExecutorLike = DocsRuntimeExecutorLike,
> {
  initialize: (
    context: DocsClientIntegrationContext<TManager, TExecutor>,
  ) => Promise<void> | void;
}
