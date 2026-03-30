import type { DevComponentInfo } from '#dep-types/react';
import type { SSRUpdateData, SSRUpdateRenderData } from '#dep-types/ssr';
import {
  NEED_PRE_RENDER_DIRECTIVES,
  REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID,
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '#shared/constants';
import {
  createSiteDebugLogger,
  getSiteDebugNow,
  type SiteDebugHmrMechanismType,
  type SiteDebugHmrUpdateType,
  updateSiteDebugHmrMetric,
} from '#shared/debug';
import getLoggerInstance from '#shared/logger';
import { validateLegalRenderElements } from '#shared/utils';
import { querySelectorAllToArray } from '@docs-islands/utils/dom-iterable';
import { formatErrorMessage } from '@docs-islands/utils/logger';
import type React from 'react';
import type ReactDOM from 'react-dom/client';
import { getCleanPathname } from '../../shared/runtime';
import { reactComponentManager } from './react-component-manager';
import {
  applyReactMarkdownAfterUpdate,
  createMemoizedReactUpdateState,
  type DevHmrSourceUpdate,
  type ReactUpdateState,
} from './react-hmr-after-update';
import { getReactRenderedComponent } from './react-render-root-store';
import { reactRenderStrategy } from './react-render-strategy';

const loggerInstance = getLoggerInstance();
const DebugLogger = createSiteDebugLogger('react-hmr');

/**
 * Vitepress redirects the default entry point to the vitepress/client entry point
 * during the compilation phase, which is a black box for users.
 * While multi-environment mixed type hints optimize the user DX experience,
 * they also introduce potential problems and can easily lead to compilation failures for users.
 */
import { inBrowser, onContentUpdated } from 'vitepress/client';

let currentLocationPathname = '';
const DEV_MOUNT_RETRY_INTERVAL_MS = 350;
const DEV_MOUNT_RETRY_LIMIT = 4;
const DEV_RUNTIME_FALLBACK_DELAY_MS = 1200;
const DEV_MOUNT_RENDER_REPLAY_INTERVAL_MS = 32;
const DEV_MOUNT_PREPARATION_DELAY_MS = 32;

class ReactIntegration {
  public pendingReactRuntimeLoads: Map<string, Promise<void>> = new Map<
    string,
    Promise<void>
  >();
  private pendingDevHMRReactRuntimeLoad: Promise<void> | null = null;
  private pendingDevMountPathname: string | null = null;
  private pendingDevMountRequestData: SSRUpdateData | null = null;
  private pendingDevMountRenderIds = new Set<string>();
  private pendingDevMountSSROnlyRenderIds = new Set<string>();
  private pendingDevMountRenderData: SSRUpdateRenderData | null = null;
  private pendingDevMountPreparationPathname: string | null = null;
  private devMountRequestSequence = 0;
  private pendingDevMountFallbackTimer: ReturnType<typeof setTimeout> | null =
    null;
  private pendingDevMountRetryTimer: ReturnType<typeof setTimeout> | null =
    null;
  private pendingDevMountRenderReplayTimer: ReturnType<
    typeof setTimeout
  > | null = null;
  private pendingDevMountPreparationTimer: ReturnType<
    typeof setTimeout
  > | null = null;
  private pendingDevMountRetryCount = 0;
  private pendingDevRuntimeFallbackTriggered = false;
  private pendingReactFastRefreshCompletionTimer: ReturnType<
    typeof setTimeout
  > | null = null;
  private activeReactFastRefreshCycle: {
    componentNames: string[];
    startedAt: number;
  } | null = null;
  private didSetupReactFastRefreshObserver = false;
  private devHmrUpdateSequence = 0;
  private readonly pendingDevHmrMetrics = new Map<
    string,
    {
      componentName: string;
      hmrId: string;
      applyEvent: string;
      importedName?: string;
      pageId: string;
      mechanismType: SiteDebugHmrMechanismType;
      renderIds: string[];
      sourceColumn?: number;
      sourceLine?: number;
      sourcePath?: string;
      startedAt: number;
      triggerEvent: string;
      updateType: SiteDebugHmrUpdateType;
    }
  >();
  private isInitialLoad = true;
  private react: typeof React | null = null;
  private reactDOM: typeof ReactDOM | null = null;

  public constructor() {
    this.setupDevMountRenderListener();
  }

  private getCleanPathname(): string {
    return getCleanPathname();
  }

  public detectRenderElementsInDev(): boolean {
    const renderElements = document.querySelectorAll(
      `[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}]`,
    );
    return renderElements.length > 0;
  }

  public getPageId(): string {
    return this.getCleanPathname();
  }

  private createDevHmrMetricId(pageId: string, componentName: string): string {
    this.devHmrUpdateSequence += 1;
    return `${pageId}::${componentName}::hmr::${this.devHmrUpdateSequence}::${Date.now()}`;
  }

  private getDevHmrMechanismDescriptor(updateType: SiteDebugHmrUpdateType): {
    applyEvent: string;
    mechanismType: SiteDebugHmrMechanismType;
    triggerEvent: string;
  } {
    switch (updateType) {
      case 'react-refresh-update': {
        return {
          applyEvent: 'performReactRefresh -> fiber commit',
          mechanismType: 'react-fast-refresh',
          triggerEvent: 'vrite-react-fast-refresh-prepare',
        };
      }
      case 'ssr-only-component-update': {
        return {
          applyEvent: 'vrite-ssr-only-component-update-render',
          mechanismType: 'ssr-only-direct-hmr',
          triggerEvent: 'vrite-react-ssr-only-component-update',
        };
      }
      default: {
        return {
          applyEvent: 'vite:afterUpdate -> react root refresh',
          mechanismType: 'markdown-react-hmr',
          triggerEvent: 'vrite-markdown-update-prepare',
        };
      }
    }
  }

  private startDevHmrMetrics(
    componentEntries: {
      componentName: string;
      importedName?: string;
      renderIds: Iterable<string>;
      sourceColumn?: number;
      sourceLine?: number;
      sourcePath?: string;
    }[],
    updateType: SiteDebugHmrUpdateType,
  ): void {
    const pageId = this.getPageId();
    const mechanism = this.getDevHmrMechanismDescriptor(updateType);

    for (const entry of componentEntries) {
      const hmrId = this.createDevHmrMetricId(pageId, entry.componentName);
      const startedAt = getSiteDebugNow();
      const renderIds = [...entry.renderIds];

      this.pendingDevHmrMetrics.set(entry.componentName, {
        componentName: entry.componentName,
        hmrId,
        applyEvent: mechanism.applyEvent,
        importedName: entry.importedName,
        pageId,
        mechanismType: mechanism.mechanismType,
        renderIds,
        sourceColumn: entry.sourceColumn,
        sourceLine: entry.sourceLine,
        sourcePath: entry.sourcePath,
        startedAt,
        triggerEvent: mechanism.triggerEvent,
        updateType,
      });

      updateSiteDebugHmrMetric({
        applyEvent: mechanism.applyEvent,
        componentName: entry.componentName,
        hmrId,
        importedName: entry.importedName,
        mechanismType: mechanism.mechanismType,
        pageId,
        renderIds,
        sourceColumn: entry.sourceColumn,
        sourceLine: entry.sourceLine,
        sourcePath: entry.sourcePath,
        source: 'react-hmr',
        startedAt,
        status: 'running',
        triggerEvent: mechanism.triggerEvent,
        updateType,
        updatedAt: startedAt,
      });
    }
  }

  private updateDevHmrMetrics(
    componentNames: Iterable<string>,
    patch: {
      clientApplyDurationMs?: number;
      errorMessage?: string;
      runtimeReadyDurationMs?: number;
      ssrApplyDurationMs?: number;
      status?: 'running' | 'completed' | 'failed';
      updatedAt?: number;
    },
    finalize = false,
  ): void {
    const includesRuntimeReadyDuration = Object.prototype.hasOwnProperty.call(
      patch,
      'runtimeReadyDurationMs',
    );
    const includesSsrApplyDuration = Object.prototype.hasOwnProperty.call(
      patch,
      'ssrApplyDurationMs',
    );
    const includesClientApplyDuration = Object.prototype.hasOwnProperty.call(
      patch,
      'clientApplyDurationMs',
    );

    for (const componentName of componentNames) {
      const session = this.pendingDevHmrMetrics.get(componentName);

      if (!session) {
        continue;
      }

      const updatedAt = patch.updatedAt ?? getSiteDebugNow();

      updateSiteDebugHmrMetric({
        componentName: session.componentName,
        hmrId: session.hmrId,
        applyEvent: session.applyEvent,
        importedName: session.importedName,
        mechanismType: session.mechanismType,
        pageId: session.pageId,
        renderIds: session.renderIds,
        sourceColumn: session.sourceColumn,
        sourceLine: session.sourceLine,
        sourcePath: session.sourcePath,
        source: 'react-hmr',
        startedAt: session.startedAt,
        triggerEvent: session.triggerEvent,
        updateType: session.updateType,
        ...patch,
        clientApplyDurationMs: includesClientApplyDuration
          ? (patch.clientApplyDurationMs ??
            Number((updatedAt - session.startedAt).toFixed(2)))
          : undefined,
        runtimeReadyDurationMs: includesRuntimeReadyDuration
          ? (patch.runtimeReadyDurationMs ??
            Number((updatedAt - session.startedAt).toFixed(2)))
          : undefined,
        ssrApplyDurationMs: includesSsrApplyDuration
          ? (patch.ssrApplyDurationMs ??
            Number((updatedAt - session.startedAt).toFixed(2)))
          : undefined,
        updatedAt,
      });

      if (finalize) {
        this.pendingDevHmrMetrics.delete(componentName);
      }
    }
  }

  private failPendingDevHmrMetrics(
    componentNames: Iterable<string>,
    error: unknown,
  ): void {
    const updatedAt = getSiteDebugNow();
    const message = formatErrorMessage(error);

    this.updateDevHmrMetrics(
      componentNames,
      {
        errorMessage: message,
        status: 'failed',
        updatedAt,
      },
      true,
    );

    DebugLogger.error('react component hmr failed', {
      components: [...componentNames],
      message,
      pageId: this.getPageId(),
    });
  }

  private getPendingReactFastRefreshComponentNames(): string[] {
    return [...this.pendingDevHmrMetrics.entries()]
      .filter(([, session]) => session.mechanismType === 'react-fast-refresh')
      .map(([componentName]) => componentName);
  }

  private clearReactFastRefreshCompletionTimer(): void {
    if (this.pendingReactFastRefreshCompletionTimer) {
      clearTimeout(this.pendingReactFastRefreshCompletionTimer);
      this.pendingReactFastRefreshCompletionTimer = null;
    }
  }

  private completeReactFastRefreshCycle(completedAt = getSiteDebugNow()): void {
    const cycle = this.activeReactFastRefreshCycle;

    if (!cycle || cycle.componentNames.length === 0) {
      return;
    }

    this.clearReactFastRefreshCompletionTimer();
    this.activeReactFastRefreshCycle = null;

    this.updateDevHmrMetrics(
      cycle.componentNames,
      {
        clientApplyDurationMs: Number(
          (completedAt - cycle.startedAt).toFixed(2),
        ),
        status: 'completed',
        updatedAt: completedAt,
      },
      true,
    );

    DebugLogger.info('react fast refresh completed', {
      components: cycle.componentNames,
      durationMs: Number((completedAt - cycle.startedAt).toFixed(2)),
      pageId: this.getPageId(),
    });
  }

  private scheduleReactFastRefreshCompletion(delayMs: number): void {
    this.clearReactFastRefreshCompletionTimer();
    this.pendingReactFastRefreshCompletionTimer = setTimeout(() => {
      this.completeReactFastRefreshCycle();
    }, delayMs);
  }

  private startReactFastRefreshCycle(): void {
    const componentNames = this.getPendingReactFastRefreshComponentNames();

    if (componentNames.length === 0) {
      return;
    }

    const startedAt = getSiteDebugNow();
    this.activeReactFastRefreshCycle = {
      componentNames,
      startedAt,
    };

    this.updateDevHmrMetrics(componentNames, {
      runtimeReadyDurationMs: undefined,
      updatedAt: startedAt,
    });

    this.scheduleReactFastRefreshCompletion(320);
  }

  private setupReactFastRefreshObserver(): void {
    if (
      this.didSetupReactFastRefreshObserver ||
      globalThis.window === undefined
    ) {
      return;
    }

    type ReactRefreshWindow = Window & {
      __REACT_DEVTOOLS_GLOBAL_HOOK__?: {
        onCommitFiberRoot?: (...args: unknown[]) => unknown;
      };
      __registerBeforePerformReactRefresh?: (callback: () => unknown) => void;
    };

    const reactRefreshWindow = globalThis as unknown as ReactRefreshWindow;
    const registerBeforePerformReactRefresh =
      reactRefreshWindow.__registerBeforePerformReactRefresh;

    if (typeof registerBeforePerformReactRefresh !== 'function') {
      return;
    }

    registerBeforePerformReactRefresh(() => {
      this.startReactFastRefreshCycle();
    });

    const devtoolsHook = reactRefreshWindow.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    const originalOnCommitFiberRoot = devtoolsHook?.onCommitFiberRoot;

    if (devtoolsHook && typeof originalOnCommitFiberRoot === 'function') {
      devtoolsHook.onCommitFiberRoot = (...args: unknown[]) => {
        const result = originalOnCommitFiberRoot.apply(devtoolsHook, args);

        if (this.activeReactFastRefreshCycle) {
          this.scheduleReactFastRefreshCompletion(36);
        }

        return result;
      };
    }

    this.didSetupReactFastRefreshObserver = true;
  }

  private runAsyncTask(
    task: Promise<void>,
    loggerGroup: string,
    failureMessage: string,
  ): void {
    task.catch((error) => {
      loggerInstance
        .getLoggerByGroup(loggerGroup)
        .error(`${failureMessage}: ${formatErrorMessage(error)}`);
    });
  }

  private ensureDevHMRReactRuntime(): Promise<void> {
    if (this.react && this.reactDOM) {
      return Promise.resolve();
    }

    if (this.pendingDevHMRReactRuntimeLoad) {
      return this.pendingDevHMRReactRuntimeLoad;
    }

    this.pendingDevHMRReactRuntimeLoad = Promise.all([
      import('react'),
      import('react-dom/client'),
    ])
      .then(([React, ReactDOM]) => {
        this.react = React;
        this.reactDOM = ReactDOM;
      })
      .catch((error) => {
        this.pendingDevHMRReactRuntimeLoad = null;
        throw error;
      });

    return this.pendingDevHMRReactRuntimeLoad;
  }

  private clearPendingDevMount(pathname?: string): void {
    if (!pathname || this.pendingDevMountPathname === pathname) {
      this.pendingDevMountPathname = null;
      this.pendingDevMountRequestData = null;
      this.pendingDevMountRenderIds.clear();
      this.pendingDevMountSSROnlyRenderIds.clear();
      this.pendingDevMountRenderData = null;
      this.pendingDevMountRetryCount = 0;
      this.pendingDevRuntimeFallbackTriggered = false;
    }
    if (this.pendingDevMountFallbackTimer) {
      clearTimeout(this.pendingDevMountFallbackTimer);
      this.pendingDevMountFallbackTimer = null;
    }
    if (this.pendingDevMountRetryTimer) {
      clearTimeout(this.pendingDevMountRetryTimer);
      this.pendingDevMountRetryTimer = null;
    }
    if (this.pendingDevMountRenderReplayTimer) {
      clearTimeout(this.pendingDevMountRenderReplayTimer);
      this.pendingDevMountRenderReplayTimer = null;
    }
  }

  private clearPendingDevMountPreparation(pathname?: string): void {
    if (!pathname || this.pendingDevMountPreparationPathname === pathname) {
      this.pendingDevMountPreparationPathname = null;
    }
    if (this.pendingDevMountPreparationTimer) {
      clearTimeout(this.pendingDevMountPreparationTimer);
      this.pendingDevMountPreparationTimer = null;
    }
  }

  private hasPendingDevPreRenderShells(): boolean {
    const renderComponents = reactRenderStrategy.collectLegalRenderComponents();
    return renderComponents.some(
      (info) =>
        NEED_PRE_RENDER_DIRECTIVES.includes(info.renderDirective) &&
        info.element.innerHTML.trim().length === 0,
    );
  }

  private sendPendingDevMountRequest(): boolean {
    if (
      !import.meta.hot ||
      !this.pendingDevMountPathname ||
      !this.pendingDevMountRequestData
    ) {
      return false;
    }

    import.meta.hot.send('vrite-ssr-update', this.pendingDevMountRequestData);
    return true;
  }

  private schedulePendingDevMountRetry(pathname: string): void {
    if (
      this.pendingDevMountPathname !== pathname ||
      this.pendingDevMountRetryCount >= DEV_MOUNT_RETRY_LIMIT
    ) {
      return;
    }

    this.pendingDevMountRetryTimer = setTimeout(() => {
      if (this.pendingDevMountPathname !== pathname) {
        return;
      }

      this.pendingDevMountRetryCount += 1;
      this.sendPendingDevMountRequest();
      this.schedulePendingDevMountRetry(pathname);
    }, DEV_MOUNT_RETRY_INTERVAL_MS);
  }

  private async triggerDevRuntimeFallback(pathname: string): Promise<void> {
    if (
      this.pendingDevMountPathname !== pathname ||
      this.pendingDevRuntimeFallbackTriggered
    ) {
      return;
    }

    this.pendingDevRuntimeFallbackTriggered = true;
    await this.loadDevRenderRuntime(pathname);
    if (this.pendingDevMountPathname === pathname) {
      currentLocationPathname = pathname;
    }
  }

  private schedulePendingDevMountRenderReplay(pathname: string): void {
    if (
      this.pendingDevMountPathname !== pathname ||
      !this.pendingDevMountRenderData ||
      this.pendingDevMountRenderReplayTimer
    ) {
      return;
    }

    this.pendingDevMountRenderReplayTimer = setTimeout(() => {
      this.pendingDevMountRenderReplayTimer = null;

      const pendingRenderData = this.pendingDevMountRenderData;
      if (!pendingRenderData || pendingRenderData.pathname !== pathname) {
        return;
      }

      this.handleDevMountRender(pendingRenderData);
    }, DEV_MOUNT_RENDER_REPLAY_INTERVAL_MS);
  }

  private getPendingDevMountExpectedRenderIds(
    fallbackTriggered: boolean,
  ): Set<string> {
    return fallbackTriggered
      ? this.pendingDevMountSSROnlyRenderIds
      : this.pendingDevMountRenderIds;
  }

  private finalizeDevMountRender(
    pathname: string,
    fallbackTriggered: boolean,
  ): void {
    this.pendingDevMountRenderData = null;
    currentLocationPathname = pathname;
    this.clearPendingDevMount(pathname);
    /**
     * The server has completed rendering, proceed to complete the client-side rendering
     * and client-side hydration process.
     */
    if (!fallbackTriggered) {
      this.runAsyncTask(
        this.loadDevRenderRuntime(pathname),
        'dev-mount-render',
        'Failed to load development render runtime after SSR mount',
      );
    }
  }

  private handleDevMountRender({
    pathname,
    data,
    requestId,
  }: SSRUpdateRenderData): void {
    if (pathname !== this.getPageId()) {
      return;
    }

    if (
      !this.pendingDevMountRequestData ||
      requestId !== this.pendingDevMountRequestData.requestId
    ) {
      return;
    }

    const fallbackTriggered =
      this.pendingDevMountPathname === pathname &&
      this.pendingDevRuntimeFallbackTriggered;
    const expectedRenderIds =
      this.getPendingDevMountExpectedRenderIds(fallbackTriggered);

    if (!this.applyDevMountRenderData(pathname, data, expectedRenderIds)) {
      this.pendingDevMountRenderData = {
        pathname,
        data,
        requestId,
      };
      this.schedulePendingDevMountRenderReplay(pathname);
      return;
    }

    this.finalizeDevMountRender(pathname, fallbackTriggered);
  }

  private setupDevMountRenderListener(): void {
    if (!import.meta.hot) {
      return;
    }

    /**
     * Vite custom HMR events are not replayed for late subscribers.
     * Register this listener during instance construction so a fast SSR response
     * cannot outrun initializeInDev() on hard reload.
     */
    import.meta.hot.on('vrite-ssr-mount-render', (payload) => {
      this.handleDevMountRender(payload);
    });
  }

  private armPendingDevMount(
    requestData: SSRUpdateData,
    ssrOnlyRenderIds: Iterable<string>,
  ): void {
    const { pathname, data } = requestData;
    this.clearPendingDevMount();
    this.clearPendingDevMountPreparation(pathname);
    this.pendingDevMountPathname = pathname;
    this.pendingDevMountRequestData = requestData;
    this.pendingDevMountRenderIds = new Set(data.map((item) => item.renderId));
    this.pendingDevMountSSROnlyRenderIds = new Set(ssrOnlyRenderIds);
    this.pendingDevMountRetryCount = 0;
    this.pendingDevRuntimeFallbackTriggered = false;

    this.sendPendingDevMountRequest();
    this.schedulePendingDevMountRetry(pathname);
    this.pendingDevMountFallbackTimer = setTimeout(() => {
      this.runAsyncTask(
        this.triggerDevRuntimeFallback(pathname),
        'dev-mount-fallback',
        'Failed to execute dev runtime fallback',
      );
    }, DEV_RUNTIME_FALLBACK_DELAY_MS);
  }

  private schedulePendingDevMountPreparation(pathname: string): void {
    if (!import.meta.hot) {
      return;
    }

    this.clearPendingDevMountPreparation();
    this.pendingDevMountPreparationPathname = pathname;
    this.pendingDevMountPreparationTimer = setTimeout(() => {
      this.pendingDevMountPreparationTimer = null;

      if (
        this.pendingDevMountPreparationPathname !== pathname ||
        this.pendingDevMountPathname === pathname ||
        this.getPageId() !== pathname
      ) {
        return;
      }
      this.pendingDevMountPreparationPathname = null;

      const renderComponents =
        reactRenderStrategy.collectLegalRenderComponents();
      const preRenderComponents = renderComponents.filter((info) =>
        NEED_PRE_RENDER_DIRECTIVES.includes(info.renderDirective),
      );
      const pendingPreRenderComponents: SSRUpdateData['data'] =
        preRenderComponents.map((info) => {
          return {
            renderId: info.renderId,
            componentName: info.renderComponent,
            props: info.props,
          };
        });

      if (pendingPreRenderComponents.length === 0) {
        currentLocationPathname = pathname;
        this.runAsyncTask(
          this.loadDevRenderRuntime(pathname),
          'dev-content-updated',
          'Failed to load development render runtime for the current page',
        );
        return;
      }

      this.armPendingDevMount(
        {
          pathname,
          requestId: this.createDevMountRequestId(pathname),
          data: pendingPreRenderComponents,
          updateType: 'mounted',
        },
        preRenderComponents
          .filter((info) => info.renderDirective === 'ssr:only')
          .map((info) => info.renderId),
      );
    }, DEV_MOUNT_PREPARATION_DELAY_MS);
  }

  private createDevMountRequestId(pathname: string): string {
    this.devMountRequestSequence += 1;
    return `${pathname}::${this.devMountRequestSequence}::${Date.now()}`;
  }

  private applyDevMountRenderData(
    pathname: string,
    data: SSRUpdateRenderData['data'],
    expectedRenderIds: Set<string>,
  ): boolean {
    if (pathname !== this.getPageId()) {
      return false;
    }

    if (expectedRenderIds.size === 0) {
      return true;
    }

    const ssrComponentsMap = new Map<string, Element>();
    const renderComponents = reactRenderStrategy.collectLegalRenderComponents();

    for (const info of renderComponents) {
      if (expectedRenderIds.has(info.renderId)) {
        ssrComponentsMap.set(info.renderId, info.element);
      }
    }

    let appliedCount = 0;
    for (const preRenderComponent of data) {
      const { renderId, ssrOnlyCss, ssrHtml } = preRenderComponent;
      if (!expectedRenderIds.has(renderId)) {
        continue;
      }
      const element = ssrComponentsMap.get(renderId);
      if (element) {
        // Inject CSS resources in order for ssr:only components.
        for (const css of ssrOnlyCss) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = css;
          link.dataset.vriteCssInDev = css;
          document.head.append(link);
        }
        element.innerHTML = ssrHtml;
        appliedCount += 1;
      }
    }

    return appliedCount === expectedRenderIds.size;
  }

  public async loadDevRenderRuntime(
    pathname = this.getPageId(),
  ): Promise<void> {
    if (!this.detectRenderElementsInDev()) {
      return;
    }

    const pendingLoad = this.pendingReactRuntimeLoads.get(pathname);
    if (pendingLoad) {
      await pendingLoad;
      return;
    }

    const timestamp = Date.now();
    const base = typeof __BASE__ === 'string' ? __BASE__ : '/';
    /**
     * The `@vite-ignore` comment is intentionally placed on the template
     * literal rather than inside `import()`. During minification, rolldown
     * inlines this const variable — replacing the Identifier node (which
     * would lose any attached comments) with the initializer's AST node.
     * Attaching the comment to the TemplateLiteral ensures it survives
     * inlining and appears in the final `import()` call, preventing Vite
     * from emitting a dynamic import analysis warning.
     *
     * Note: Destructured variables (e.g. `const { source } = obj`) are NOT
     * inlined, so placing `@vite-ignore` inside `import()` preserves the
     * comment as-is — only simple const declarations with literal
     * initializers trigger this issue.
     *
     * @see https://github.com/rolldown/rolldown/issues/8248
     */
    const scriptPath = /* @vite-ignore */ `${base}${REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID}?${RENDER_STRATEGY_CONSTANTS.renderClientInDev}=${pathname}&t=${timestamp}`;

    /**
     * During development, client-side caching should be disabled. A request to the server must be made on each route change
     * and on initial mount, and the server determines whether the cache is hit.
     *
     * Otherwise, when the script within the `<script lang="react">` tag changes,
     * the browser will not detect the change on subsequent route transitions.
     */
    const loadPromise = import(scriptPath).then(() => {
      const Logger = loggerInstance.getLoggerByGroup('load-dev-render-runtime');
      Logger.success('Development render runtime loaded successfully');
    });

    this.pendingReactRuntimeLoads.set(pathname, loadPromise);

    try {
      await loadPromise;
    } finally {
      this.pendingReactRuntimeLoads.delete(pathname);
    }
  }

  private async integrationHMR(): Promise<void> {
    if (import.meta.hot) {
      const memoizedUpdateState = createMemoizedReactUpdateState();

      import.meta.hot.on(
        'vrite-markdown-update-prepare',
        ({ updates, missingImports }: ReactUpdateState) => {
          const currentPageInjectComponents = (window[
            RENDER_STRATEGY_CONSTANTS.injectComponent
          ]?.[this.getPageId()] || {}) as Record<string, DevComponentInfo>;
          // Clear memoized state.
          memoizedUpdateState.state = {};
          memoizedUpdateState.pendingUpdateState = null;
          memoizedUpdateState.memoizedSsrOnlyComponents = new Set();
          memoizedUpdateState.pendingMissingImports = null;

          memoizedUpdateState.pendingUpdateState = updates;
          memoizedUpdateState.pendingMissingImports = missingImports;
          const renderComponentDOMContainers = document.querySelectorAll(
            `[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}]`,
          );
          for (const [componentName, updateInfo] of Object.entries(updates)) {
            const componentReference =
              currentPageInjectComponents[componentName];
            memoizedUpdateState.state[componentName] = {
              component: componentReference?.component || null,
              source: componentReference?.path || updateInfo.path,
              importedName:
                componentReference?.importedName || updateInfo.importedName,
              effectElements: {},
            };
          }
          for (const element of renderComponentDOMContainers) {
            const renderComponentName = element.getAttribute(
              RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
            )!;
            const renderId = element.getAttribute(
              RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
            )!;
            if (
              validateLegalRenderElements(element) &&
              memoizedUpdateState.state[renderComponentName]
            ) {
              if (
                memoizedUpdateState.state[renderComponentName].component ===
                null
              ) {
                memoizedUpdateState.state[renderComponentName].component =
                  getReactRenderedComponent(element) || null;
              }
              const props = new Map<string, string>();
              for (const attr of element.getAttributeNames()) {
                props.set(attr, element.getAttribute(attr) || '');
              }
              if (
                memoizedUpdateState.state[renderComponentName].component ===
                null
              ) {
                memoizedUpdateState.memoizedSsrOnlyComponents.add(
                  renderComponentName,
                );
              }
              memoizedUpdateState.state[renderComponentName].effectElements[
                renderId
              ] = {
                current: element,
                props,
              };
            }
          }

          this.startDevHmrMetrics(
            Object.keys(updates).map((componentName) => ({
              componentName,
              importedName: updates[componentName]?.importedName,
              renderIds: Object.keys(
                memoizedUpdateState.state[componentName]?.effectElements ?? {},
              ),
              sourcePath: updates[componentName]?.sourcePath,
            })),
            'markdown-update',
          );
        },
      );

      /**
       * After the Vue engine renders the Markdown document, perform diff operations.
       */
      import.meta.hot.on('vite:afterUpdate', () => {
        this.runAsyncTask(
          this.ensureDevHMRReactRuntime()
            .then(async () => {
              const runtimeReadyAt = getSiteDebugNow();
              this.updateDevHmrMetrics(this.pendingDevHmrMetrics.keys(), {
                runtimeReadyDurationMs: undefined,
                updatedAt: runtimeReadyAt,
              });
              if (
                !memoizedUpdateState.pendingUpdateState &&
                !memoizedUpdateState.pendingMissingImports
              ) {
                return;
              }
              memoizedUpdateState.pendingUpdateState =
                memoizedUpdateState.pendingUpdateState || {};
              memoizedUpdateState.pendingMissingImports =
                memoizedUpdateState.pendingMissingImports || [];

              // Content changes trigger this hook, filtering HMR not captured by @docs-islands/vitepress.
              await applyReactMarkdownAfterUpdate(
                {
                  getPageId: () => this.getPageId(),
                  getReact: () => this.react!,
                  getReactDOM: () => this.reactDOM!,
                  updateDevHmrMetrics: (
                    componentNames,
                    patch,
                    finalize,
                  ): void =>
                    this.updateDevHmrMetrics(componentNames, patch, finalize),
                  failPendingDevHmrMetrics: (componentNames, error): void =>
                    this.failPendingDevHmrMetrics(componentNames, error),
                  runAsyncTask: (task, loggerGroup, failureMessage): void =>
                    this.runAsyncTask(task, loggerGroup, failureMessage),
                },
                memoizedUpdateState,
              );
            })
            .catch((error) => {
              this.failPendingDevHmrMetrics(
                this.pendingDevHmrMetrics.keys(),
                error,
              );
              throw error;
            }),
          'vite:after-update',
          'Failed to handle React markdown HMR',
        );
      });

      import.meta.hot.on(
        'vrite-ssr-only-component-update-render',
        ({ pathname, data }: SSRUpdateRenderData) => {
          if (pathname === this.getPageId() && data.length > 0) {
            const completedComponentNames = new Set<string>();
            const ssrComponentsMap = new Map<string, Element>();
            const renderComponents =
              reactRenderStrategy.collectLegalRenderComponents();
            const needSSRRenderDirective = NEED_PRE_RENDER_DIRECTIVES;
            const ssrComponents = renderComponents.filter((info) =>
              needSSRRenderDirective.includes(info.renderDirective),
            );
            for (const info of ssrComponents) {
              ssrComponentsMap.set(info.renderId, info.element);
            }
            for (const ssrData of data) {
              const { renderId, ssrOnlyCss, ssrHtml } = ssrData;
              const element = ssrComponentsMap.get(renderId);
              if (element) {
                const componentName = element.getAttribute(
                  RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
                );
                if (componentName) {
                  completedComponentNames.add(componentName);
                }
                if (Array.isArray(ssrOnlyCss)) {
                  for (const css of ssrOnlyCss) {
                    const isExistCssElement = document.querySelector(
                      `link[href="${css}"]`,
                    );
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = css;
                    link.dataset.vriteCssInDev = css;
                    document.head.append(link);
                    // TODO: OPTIMIZE
                    if (isExistCssElement) {
                      isExistCssElement.remove();
                    }
                  }
                }
                element.innerHTML = ssrHtml;
                loggerInstance
                  .getLoggerByGroup('hot-updated')
                  .success('ssr:only component HMR completed.');
              }
            }

            const completedAt = getSiteDebugNow();
            this.updateDevHmrMetrics(
              completedComponentNames,
              {
                ssrApplyDurationMs: undefined,
                status: 'completed',
                updatedAt: completedAt,
              },
              true,
            );
          }
        },
      );

      import.meta.hot.on(
        'vrite-react-fast-refresh-prepare',
        ({ updates }: { updates: Record<string, DevHmrSourceUpdate[]> }) => {
          if (Array.isArray(updates[this.getPageId()])) {
            const updateComponents = updates[this.getPageId()];
            this.startDevHmrMetrics(
              updateComponents.map((updateComponent) => ({
                componentName: updateComponent.componentName,
                importedName: updateComponent.importedName,
                renderIds: querySelectorAllToArray(
                  document,
                  `[${RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase()}="${updateComponent.componentName}"]`,
                ).map(
                  (element) =>
                    element.getAttribute(
                      RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
                    ) || '',
                ),
                sourceColumn: updateComponent.sourceColumn,
                sourceLine: updateComponent.sourceLine,
                sourcePath: updateComponent.sourcePath,
              })),
              'react-refresh-update',
            );
          }
        },
      );

      import.meta.hot.on(
        'vrite-react-ssr-only-component-update',
        ({ updates }: { updates: Record<string, DevHmrSourceUpdate[]> }) => {
          if (Array.isArray(updates[this.getPageId()])) {
            const updateComponents = updates[this.getPageId()];
            this.startDevHmrMetrics(
              updateComponents.map((updateComponent) => ({
                componentName: updateComponent.componentName,
                importedName: updateComponent.importedName,
                renderIds: querySelectorAllToArray(
                  document,
                  `[${RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase()}="${updateComponent.componentName}"]`,
                ).map(
                  (element) =>
                    element.getAttribute(
                      RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
                    ) || '',
                ),
                sourceColumn: updateComponent.sourceColumn,
                sourceLine: updateComponent.sourceLine,
                sourcePath: updateComponent.sourcePath,
              })),
              'ssr-only-component-update',
            );
            const ssrOnlyComponentsUpdates: SSRUpdateData['data'] = [];
            for (const {
              componentName: ssrOnlyComponentName,
            } of updateComponents) {
              const ssrOnlyComponents = document.querySelectorAll(
                `[${RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase()}="${ssrOnlyComponentName}"]`,
              );
              if (ssrOnlyComponents.length > 0) {
                for (const ssrOnlyComponent of ssrOnlyComponents) {
                  if (!validateLegalRenderElements(ssrOnlyComponent)) {
                    continue;
                  }
                  const renderId = ssrOnlyComponent.getAttribute(
                    RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
                  )!;
                  const props: Record<string, string> = {};
                  for (const attr of ssrOnlyComponent.getAttributeNames()) {
                    if (!RENDER_STRATEGY_ATTRS.includes(attr)) {
                      props[attr] = ssrOnlyComponent.getAttribute(attr) || '';
                    }
                  }
                  ssrOnlyComponentsUpdates.push({
                    renderId,
                    componentName: ssrOnlyComponentName,
                    props,
                  });
                }
                const ssrUpdateData: SSRUpdateData = {
                  pathname: this.getPageId(),
                  data: ssrOnlyComponentsUpdates,
                  updateType: 'ssr-only-component-update',
                };

                if (import.meta.hot) {
                  import.meta.hot.send('vrite-ssr-update', ssrUpdateData);
                }
              }
            }
          }
        },
      );

      this.setupReactFastRefreshObserver();
      this.runAsyncTask(
        this.ensureDevHMRReactRuntime().then(() => {
          this.setupReactFastRefreshObserver();
        }),
        'integration-hmr-runtime',
        'Failed to prepare React runtime for development HMR',
      );
    }
  }

  public async initializeInDev(): Promise<void> {
    if (import.meta.env.DEV) {
      await reactComponentManager.initializeInDev();
      await this.integrationHMR();

      onContentUpdated(() => {
        /**
         * The onContentUpdated hook in VitePress may trigger multiple times for the same page.
         * Coalesce these signals so the mount request is built from the final DOM snapshot
         * rather than an intermediate shell tree.
         */
        const pageId = this.getPageId();
        if (
          (currentLocationPathname === pageId &&
            !this.hasPendingDevPreRenderShells()) ||
          this.pendingDevMountPathname === pageId
        ) {
          return;
        }

        // In the development environment, the pre-rendering of components relies on push update events.
        if (import.meta.hot) {
          this.schedulePendingDevMountPreparation(pageId);
        }
      });
    }
  }

  public async initializeInProd(): Promise<void> {
    if (import.meta.env.PROD) {
      await reactComponentManager.initializeInProd();

      /**
       * In MPA mode, JS scripts are not injected by default, so the vite-plugin-mpa-enhance
       * plugin handles the module build process and directly triggers await initializeInProd()
       * to initialize component registration and loading operations.
       */
      if (import.meta.env.MPA) {
        await reactComponentManager.loadReact();
        this.react = globalThis.React ?? null;
        this.reactDOM = globalThis.ReactDOM ?? null;
      }

      /**
       * Upon initial page load (not a route transition),
       * the rendered resources are pre-compiled artifacts.
       *
       * Simultaneously, the executed script is of module type,
       * therefore it can safely access the pre-compiled DOM nodes.
       *
       * We can complete the hydration work in advance without waiting for the `onContentUpdated` hook to be triggered.
       * Using the `onContentUpdated` hook implies a loading delay of approximately a hundred milliseconds.
       */
      if (this.isInitialLoad) {
        reactRenderStrategy.executeReactRuntime({
          isInitialLoad: true,
          pageId: this.getPageId(),
        });
        this.isInitialLoad = false;
        currentLocationPathname = this.getPageId();
      }

      /**
       * The `onContentUpdated` hook in VitePress effectively observes text content changes after client-side hydration,
       * and is therefore used to determine the timing of initial page mounting and route changes.
       *
       * During initial page mounting and route changes, because React components use an island architecture to render specific nodes,
       * full client-side rendering needs to be achieved using `loadDevReactRuntime` each time a new page is reached.
       */
      onContentUpdated(() => {
        if (currentLocationPathname === this.getPageId()) {
          return;
        }
        currentLocationPathname = this.getPageId();
        reactRenderStrategy.executeReactRuntime({
          isInitialLoad: false,
          pageId: this.getPageId(),
        });
      });
    }
  }
}

const reactIntegration = new ReactIntegration();

export default async function reactClientIntegration(): Promise<void> {
  // Only run in browser environment to prevent Node.js execution errors
  if (inBrowser && globalThis.window !== undefined) {
    await (import.meta.env.DEV
      ? reactIntegration.initializeInDev()
      : reactIntegration.initializeInProd());
  }
}
