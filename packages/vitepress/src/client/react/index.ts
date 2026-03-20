import type { DevComponentInfo } from '#dep-types/react';
import type { RenderDirective } from '#dep-types/render';
import type { SSRUpdateData, SSRUpdateRenderData } from '#dep-types/ssr';
import {
  NEED_PRE_RENDER_DIRECTIVES,
  REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID,
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '#shared/constants';
import getLoggerInstance from '#shared/logger';
import { validateLegalRenderElements } from '#shared/utils';
import { formatErrorMessage } from '@docs-islands/utils/logger';
import type React from 'react';
import type ReactDOM from 'react-dom/client';
import { getCleanPathname } from '../../shared/runtime';
import { reactComponentManager } from './react-component-manager';
import {
  getReactRenderedComponent,
  getReactRenderRoot,
  rememberReactRenderState,
} from './react-render-root-store';
import { reactRenderStrategy } from './react-render-strategy';

const loggerInstance = getLoggerInstance();

// Hoisted predicate to satisfy unicorn/consistent-function-scoping.
const __requiresSsrDirective = (
  d: string,
): d is Exclude<RenderDirective, 'client:only'> =>
  NEED_PRE_RENDER_DIRECTIVES.includes(
    d as Exclude<RenderDirective, 'client:only'>,
  );

/**
 * Vitepress redirects the default entry point to the vitepress/client entry point
 * during the compilation phase, which is a black box for users.
 * While multi-environment mixed type hints optimize the user DX experience,
 * they also introduce potential problems and can easily lead to compilation failures for users.
 */
import { inBrowser, onContentUpdated } from 'vitepress/client';

interface ReactUpdateState {
  updates: Record<string, { path: string; importedName: string }>;
  missingImports: string[];
}

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
      const memoizedUpdateState: {
        state: Record<
          string,
          {
            component: React.ComponentType<Record<string, string>> | null;
            source: string;
            importedName: string;
            effectElements: Record<
              string,
              { current: Element; props: Map<string, string> }
            >;
          }
        >;
        pendingUpdateState: ReactUpdateState['updates'] | null;
        memoizedSsrOnlyComponents: Set<string>;
        pendingMissingImports: ReactUpdateState['missingImports'] | null;
      } = {
        state: {},
        pendingUpdateState: null,
        memoizedSsrOnlyComponents: new Set(),
        pendingMissingImports: null,
      };

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
        },
      );

      /**
       * After the Vue engine renders the Markdown document, perform diff operations.
       */
      import.meta.hot.on('vite:afterUpdate', () => {
        this.runAsyncTask(
          this.ensureDevHMRReactRuntime().then(() => {
            // Content changes trigger this hook, filtering HMR not captured by @docs-islands/vitepress.
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

            const Logger = loggerInstance.getLoggerByGroup('vite:after-update');
            const renderComponentDOMContainers = document.querySelectorAll(
              `[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}]`,
            );
            /**
             * `renderUpdates` contains two types of updates:
             * 1. Reuse component: When a node's props change or node order changes but the component reference remains the same,
             *    the component can be reused to complete client-side rendering of those nodes.
             * 2. Replace component: When the component reference changes, fetch the new component version to complete client-side rendering.
             */
            const renderUpdates: Record<
              string,
              {
                component: React.ComponentType<Record<string, string>> | null;
                source: string;
                importedName: string;
                effectElements: Element[];
              }
            > = {};
            /**
             * Cache already rendered React root nodes (with event bindings) before the Vue engine renders,
             * to prevent Vue from removing React-rendered nodes during HMR and losing state.
             */
            const renderIdToReuseRenderedElements = new Map<string, Element>();
            const reusedEffectElementRenderIds = new Set<string>();
            const ssrOnlyComponents = new Map<
              string,
              {
                component: null;
                importedName: string;
                path: string;
              }
            >();
            const reuseInjectComponent = new Map<string, DevComponentInfo>();
            const rerenderExistingRoots: Record<
              string,
              {
                component: React.ComponentType<Record<string, string>> | null;
                source: string;
                importedName: string;
                componentName: string;
                renderDirective: string;
                props: Record<string, string>;
              }
            > = {};
            const renderIdAttr =
              RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase();

            const hasEquivalentRenderContainerAttrs = (
              element: Element,
              memorizedProps: Map<string, string>,
            ): boolean => {
              const currentAttrNames = element
                .getAttributeNames()
                .filter((attr) => attr !== renderIdAttr);
              const memorizedAttrNames = [...memorizedProps.keys()].filter(
                (attr) => attr !== renderIdAttr,
              );

              if (currentAttrNames.length !== memorizedAttrNames.length) {
                return false;
              }

              for (const [
                memorizedAttrKey,
                memorizedAttrValue,
              ] of memorizedProps) {
                if (memorizedAttrKey === renderIdAttr) {
                  continue;
                }
                const attrValue = element.getAttribute(memorizedAttrKey);
                if (attrValue !== memorizedAttrValue) {
                  return false;
                }
              }

              return true;
            };

            const syncRenderContainerAttrs = (
              targetElement: Element,
              sourceElement: Element,
            ): void => {
              const nextAttrs = new Map<string, string>();
              for (const attrName of sourceElement.getAttributeNames()) {
                nextAttrs.set(
                  attrName,
                  sourceElement.getAttribute(attrName) || '',
                );
              }

              for (const attrName of targetElement.getAttributeNames()) {
                if (!nextAttrs.has(attrName)) {
                  targetElement.removeAttribute(attrName);
                }
              }

              for (const [attrName, attrValue] of nextAttrs.entries()) {
                targetElement.setAttribute(attrName, attrValue);
              }
            };

            for (const element of renderComponentDOMContainers) {
              if (validateLegalRenderElements(element)) {
                const renderId = element.getAttribute(
                  RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
                )!;
                const renderComponent = element.getAttribute(
                  RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
                )!;
                const renderDirective = element.getAttribute(
                  RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
                )!;

                const pendingMissingImports =
                  memoizedUpdateState.pendingMissingImports;
                if (pendingMissingImports.includes(renderComponent)) {
                  element.remove();
                  continue;
                }

                const pendingState =
                  memoizedUpdateState.pendingUpdateState[renderComponent];
                if (pendingState) {
                  const { importedName, path } = pendingState;
                  const memorizedState =
                    memoizedUpdateState.state[renderComponent];
                  if (memorizedState) {
                    const {
                      component,
                      source,
                      importedName: memorizedImportedName,
                      effectElements,
                    } = memorizedState;
                    // Component reference has changed.
                    if (
                      importedName !== memorizedImportedName ||
                      source !== path
                    ) {
                      if (renderUpdates[renderComponent]) {
                        renderUpdates[renderComponent].effectElements.push(
                          element,
                        );
                      } else {
                        renderUpdates[renderComponent] = {
                          component: null,
                          source: path,
                          importedName,
                          effectElements: [element],
                        };
                      }
                    } else {
                      const reusableComponent =
                        component || getReactRenderedComponent(element) || null;
                      reuseInjectComponent.set(renderComponent, {
                        component: reusableComponent,
                        path,
                        importedName,
                      });
                      // If both pre- and post-update containers point to the same component, detect reuse vs re-render.
                      if (effectElements[renderId]) {
                        const { props, current } = effectElements[renderId];
                        const hasAttrChanged =
                          !hasEquivalentRenderContainerAttrs(element, props);

                        // Component reference remains the same, but props changed.
                        if (hasAttrChanged) {
                          if (renderUpdates[renderComponent]) {
                            renderUpdates[renderComponent].effectElements.push(
                              element,
                            );
                          } else {
                            renderUpdates[renderComponent] = {
                              component,
                              source: path,
                              importedName,
                              effectElements: [element],
                            };
                          }
                        } else {
                          // If the component reference and props haven't changed, reuse the already-rendered DOM.
                          reusedEffectElementRenderIds.add(renderId);
                          if (current === element) {
                            const props: Record<string, string> = {};
                            for (const attr of element.getAttributeNames()) {
                              if (!RENDER_STRATEGY_ATTRS.includes(attr)) {
                                props[attr] = element.getAttribute(attr) || '';
                              }
                            }
                            rerenderExistingRoots[renderId] = {
                              component: reusableComponent,
                              source: path,
                              importedName,
                              componentName: renderComponent,
                              renderDirective,
                              props,
                            };
                          } else {
                            syncRenderContainerAttrs(current, element);
                            renderIdToReuseRenderedElements.set(
                              renderId,
                              current,
                            );
                          }
                        }
                      } else {
                        let reusableEffectElement: {
                          current: Element;
                          props: Map<string, string>;
                        } | null = null;
                        let reusableEffectElementRenderId = '';

                        for (const [
                          effectRenderId,
                          effectElement,
                        ] of Object.entries(effectElements)) {
                          if (
                            reusedEffectElementRenderIds.has(effectRenderId) ||
                            !hasEquivalentRenderContainerAttrs(
                              element,
                              effectElement.props,
                            )
                          ) {
                            continue;
                          }
                          reusableEffectElement = effectElement;
                          reusableEffectElementRenderId = effectRenderId;
                          break;
                        }

                        if (reusableEffectElement) {
                          reusedEffectElementRenderIds.add(
                            reusableEffectElementRenderId,
                          );
                          syncRenderContainerAttrs(
                            reusableEffectElement.current,
                            element,
                          );
                          renderIdToReuseRenderedElements.set(
                            renderId,
                            reusableEffectElement.current,
                          );
                        } else if (renderUpdates[renderComponent]) {
                          renderUpdates[renderComponent].effectElements.push(
                            element,
                          );
                        } else {
                          // Reuse the rendered component for the new container.
                          renderUpdates[renderComponent] = {
                            component: reusableComponent,
                            source: path,
                            importedName,
                            effectElements: [element],
                          };
                        }
                      }
                    }
                  } else if (renderUpdates[renderComponent]) {
                    renderUpdates[renderComponent].effectElements.push(element);
                  } else {
                    // New render component.
                    renderUpdates[renderComponent] = {
                      component: null,
                      source: path,
                      importedName,
                      effectElements: [element],
                    };
                  }

                  if (renderDirective === 'ssr:only') {
                    ssrOnlyComponents.set(renderComponent, {
                      component: null,
                      importedName,
                      path,
                    });
                  } else if (ssrOnlyComponents.has(renderComponent)) {
                    ssrOnlyComponents.delete(renderComponent);
                  }
                } else {
                  Logger.error(
                    `[${renderComponent}] is not found in container script`,
                  );
                }
              }
            }

            for (const [
              renderId,
              element,
            ] of renderIdToReuseRenderedElements.entries()) {
              const currentElement = document.querySelector(
                `[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}="${renderId}"]`,
              );
              if (currentElement) {
                currentElement.replaceWith(element);
              }
            }

            // SSR client script to complete client hydration.
            const ssrClientComponents: Record<
              string,
              {
                component: React.ComponentType<Record<string, string>> | null;
                source: string;
                importedName: string;
                componentName: string;
                renderDirective: string;
                props: Record<string, string>;
              }
            > = {};

            // Client script to complete client rendering.
            const clientComponents: Record<
              string,
              {
                component: React.ComponentType<Record<string, string>> | null;
                source: string;
                importedName: string;
                componentName: string;
                renderDirective: string;
                props: Record<string, string>;
              }
            > = {};
            const ssrComponentsRenderData: SSRUpdateData['data'] = [];

            for (const componentName of Object.keys(renderUpdates)) {
              const { component, source, importedName, effectElements } =
                renderUpdates[componentName];
              for (const element of effectElements) {
                const renderDirective =
                  element.getAttribute(
                    RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
                  ) || '';
                const renderId =
                  element.getAttribute(
                    RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
                  ) || '';

                // Component props exclude attributes in RENDER_STRATEGY_ATTRS.
                const props: Record<string, string> = {};
                for (const attr of element.getAttributeNames()) {
                  if (!RENDER_STRATEGY_ATTRS.includes(attr)) {
                    props[attr] = element.getAttribute(attr) || '';
                  }
                }

                if (__requiresSsrDirective(renderDirective)) {
                  // A pre-rendered module is required for all SSR components.
                  ssrComponentsRenderData.push({
                    renderId,
                    componentName,
                    props,
                  });

                  /**
                   * If all render containers of the render component have only ssr:only rendering type,
                   * then the client script does not need to be injected.
                   */
                  if (ssrOnlyComponents.has(componentName)) {
                    continue;
                  }

                  ssrClientComponents[renderId] = {
                    component,
                    source,
                    importedName,
                    componentName,
                    renderDirective,
                    props,
                  };
                } else {
                  clientComponents[renderId] = {
                    component,
                    source,
                    importedName,
                    componentName,
                    renderDirective,
                    props,
                  };
                }
              }
            }

            const handleMarkdownUpdateRender = ({
              pathname,
              data,
            }: SSRUpdateRenderData) => {
              if (import.meta.hot) {
                import.meta.hot.off(
                  'vrite-ssr-markdown-update-render',
                  handleMarkdownUpdateRender,
                );
              }
              if (pathname === this.getPageId() && data.length > 0) {
                const ssrComponentsMap = new Map<string, Element>();
                const renderComponents =
                  reactRenderStrategy.collectLegalRenderComponents();
                const ssrRequiredDirectives = NEED_PRE_RENDER_DIRECTIVES;
                const ssrComponents = renderComponents.filter(
                  (renderComponent) =>
                    ssrRequiredDirectives.includes(
                      renderComponent.renderDirective,
                    ),
                );
                for (const ssrComponent of ssrComponents) {
                  ssrComponentsMap.set(
                    ssrComponent.renderId,
                    ssrComponent.element,
                  );
                }
                for (const ssrData of data) {
                  const { renderId, ssrOnlyCss, ssrHtml } = ssrData;
                  const element = ssrComponentsMap.get(renderId);
                  if (element) {
                    if (ssrOnlyCss.length > 0) {
                      for (const css of ssrOnlyCss) {
                        /**
                         * This is an update process, there may be existing old css resources,
                         * so we need to update them first, then remove the old css resources to
                         * avoid style jitter.
                         */
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
                  }
                }
              }
              this.runAsyncTask(
                loadComponentsAndRenderComponentsOrHydrateComponents(),
                'markdown-update-render',
                'Failed to apply React markdown HMR render',
              );
            };

            /**
             * Need to handle the side effects of component containers in the markdown document during the hmr phase,
             * such as:
             * 1. Component container attribute changes.
             * 2. Component container position changes.
             * 3. Component import reference changes.
             * 4. Component rendering strategy changes.
             */
            const loadComponentsAndRenderComponentsOrHydrateComponents =
              async (): Promise<void> => {
                const loadComponents: Record<
                  string,
                  Promise<React.ComponentType<Record<string, string>>>
                > = {};
                const workInProgressInjectComponent: Record<
                  string,
                  DevComponentInfo
                > = {};

                for (const renderId of Object.keys(clientComponents)) {
                  const { component, source, importedName } =
                    clientComponents[renderId];
                  const key = `${source}#${importedName}`;
                  if (component) {
                    loadComponents[key] = Promise.resolve(component);
                  } else if (!loadComponents[key]) {
                    loadComponents[key] = import(
                      /* @vite-ignore */ source
                    ).then((module) => {
                      if (importedName === 'default') {
                        return module.default;
                      }
                      if (importedName === '*') {
                        return module;
                      }
                      return module[importedName];
                    });
                  }
                }

                for (const renderId of Object.keys(ssrClientComponents)) {
                  const { component, source, importedName } =
                    ssrClientComponents[renderId];
                  const key = `${source}#${importedName}`;
                  if (component) {
                    loadComponents[key] = Promise.resolve(component);
                  } else if (!loadComponents[key]) {
                    loadComponents[key] = import(
                      /* @vite-ignore */ source
                    ).then((module) => {
                      if (importedName === 'default') {
                        return module.default;
                      }
                      if (importedName === '*') {
                        return module;
                      }
                      return module[importedName];
                    });
                  }
                }

                for (const [
                  ,
                  { component, path, importedName },
                ] of reuseInjectComponent.entries()) {
                  const key = `${path}#${importedName}`;
                  if (component) {
                    loadComponents[key] = Promise.resolve(component);
                  } else if (!loadComponents[key]) {
                    loadComponents[key] = import(/* @vite-ignore */ path).then(
                      (module) => {
                        if (importedName === 'default') {
                          return module.default;
                        }
                        if (importedName === '*') {
                          return module;
                        }
                        return module[importedName];
                      },
                    );
                  }
                }

                for (const renderId of Object.keys(rerenderExistingRoots)) {
                  const { component, source, importedName } =
                    rerenderExistingRoots[renderId];
                  const key = `${source}#${importedName}`;
                  if (component) {
                    loadComponents[key] = Promise.resolve(component);
                  } else if (!loadComponents[key]) {
                    loadComponents[key] = import(
                      /* @vite-ignore */ source
                    ).then((module) => {
                      if (importedName === 'default') {
                        return module.default;
                      }
                      if (importedName === '*') {
                        return module;
                      }
                      return module[importedName];
                    });
                  }
                }

                const promiseComponents: {
                  component: Promise<
                    React.ComponentType<Record<string, string>>
                  >;
                  key: string;
                }[] = [];

                for (const key of Object.keys(loadComponents)) {
                  const component = loadComponents[key];
                  promiseComponents.push({
                    component,
                    key,
                  });
                }

                const componentsMap = new Map<
                  string,
                  React.ComponentType<Record<string, string>>
                >();
                const components = await Promise.all(
                  promiseComponents.map(async (item) => item.component),
                );
                for (const [index, component] of components.entries()) {
                  componentsMap.set(promiseComponents[index].key, component);
                }

                for (const renderId of Object.keys(rerenderExistingRoots)) {
                  const {
                    source,
                    importedName,
                    props,
                    renderDirective,
                    componentName,
                  } = rerenderExistingRoots[renderId];
                  const key = `${source}#${importedName}`;
                  const Component = componentsMap.get(key);
                  if (!Component) {
                    continue;
                  }

                  const renderElement = document.querySelector(
                    `[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}="${renderId}"]`,
                  );
                  if (!renderElement) {
                    continue;
                  }

                  workInProgressInjectComponent[componentName] = {
                    component: Component,
                    path: source,
                    importedName,
                  };

                  const root = getReactRenderRoot(renderElement);
                  if (root) {
                    root.render(this.react!.createElement(Component, props));
                    continue;
                  }

                  if (renderDirective !== 'ssr:only') {
                    const fallbackRoot =
                      renderDirective === 'client:only'
                        ? this.reactDOM!.createRoot(renderElement)
                        : this.reactDOM!.hydrateRoot(
                            renderElement,
                            this.react!.createElement(Component, props),
                          );
                    rememberReactRenderState(
                      renderElement,
                      fallbackRoot,
                      Component,
                    );
                    if (renderDirective === 'client:only') {
                      fallbackRoot.render(
                        this.react!.createElement(Component, props),
                      );
                    }
                  }
                }

                for (const renderId of Object.keys(clientComponents)) {
                  const { source, importedName, props, componentName } =
                    clientComponents[renderId];
                  const key = `${source}#${importedName}`;
                  const Component = componentsMap.get(key);
                  if (Component) {
                    const renderElement = document.querySelector(
                      `[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}="${renderId}"]`,
                    );
                    if (renderElement) {
                      workInProgressInjectComponent[componentName] = {
                        component: Component,
                        path: source,
                        importedName,
                      };
                      const root = this.reactDOM!.createRoot(renderElement);
                      rememberReactRenderState(renderElement, root, Component);
                      root.render(this.react!.createElement(Component, props));
                    }
                  }
                }

                for (const renderId of Object.keys(ssrClientComponents)) {
                  const {
                    source,
                    importedName,
                    renderDirective,
                    props,
                    componentName,
                  } = ssrClientComponents[renderId];
                  const key = `${source}#${importedName}`;
                  const Component = componentsMap.get(key);
                  if (renderDirective !== 'ssr:only' && Component) {
                    const renderElement = document.querySelector(
                      `[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}="${renderId}"]`,
                    );
                    if (renderElement) {
                      workInProgressInjectComponent[componentName] = {
                        component: Component,
                        path: source,
                        importedName,
                      };
                      const root = this.reactDOM!.hydrateRoot(
                        renderElement,
                        this.react!.createElement(Component, props),
                      );
                      rememberReactRenderState(renderElement, root, Component);
                    }
                  }
                }

                for (const [
                  componentName,
                  { component, path, importedName },
                ] of reuseInjectComponent.entries()) {
                  const key = `${path}#${importedName}`;
                  workInProgressInjectComponent[componentName] = {
                    component: component || componentsMap.get(key) || null,
                    path,
                    importedName,
                  };
                }
                reuseInjectComponent.clear();

                for (const [
                  componentName,
                  { component, importedName, path },
                ] of ssrOnlyComponents.entries()) {
                  workInProgressInjectComponent[componentName] = {
                    component,
                    path,
                    importedName,
                  };
                }
                ssrOnlyComponents.clear();

                // Update global injectComponent.
                window[RENDER_STRATEGY_CONSTANTS.injectComponent][
                  this.getPageId()
                ] = workInProgressInjectComponent;
                reactComponentManager.reset();
                for (const componentName of Object.keys(
                  workInProgressInjectComponent,
                )) {
                  reactComponentManager.notifyComponentLoaded(
                    this.getPageId(),
                    componentName,
                  );
                }
                Logger.success('Markdown HMR completed.');
              };

            if (ssrComponentsRenderData.length > 0) {
              const ssrUpdateData: SSRUpdateData = {
                pathname: this.getPageId(),
                data: ssrComponentsRenderData,
                updateType: 'markdown-update',
              };
              if (import.meta.hot) {
                import.meta.hot.on(
                  'vrite-ssr-markdown-update-render',
                  handleMarkdownUpdateRender,
                );
                import.meta.hot.send('vrite-ssr-update', ssrUpdateData);
              }
            } else {
              this.runAsyncTask(
                loadComponentsAndRenderComponentsOrHydrateComponents(),
                'vite:after-update-render',
                'Failed to finalize React markdown HMR',
              );
            }
          }),
          'vite:after-update',
          'Failed to handle React markdown HMR',
        );
      });

      import.meta.hot.on(
        'vrite-ssr-only-component-update-render',
        ({ pathname, data }: SSRUpdateRenderData) => {
          if (pathname === this.getPageId() && data.length > 0) {
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
          }
        },
      );

      import.meta.hot.on(
        'vrite-react-ssr-only-component-update',
        ({ updates }: { updates: Record<string, string[]> }) => {
          if (Array.isArray(updates[this.getPageId()])) {
            const updateComponentNames = updates[this.getPageId()];
            const ssrOnlyComponentsUpdates: SSRUpdateData['data'] = [];
            for (const ssrOnlyComponentName of updateComponentNames) {
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

      this.runAsyncTask(
        this.ensureDevHMRReactRuntime(),
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
