import type { RenderDirective } from '#dep-types/render';
import {
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '#shared/constants';
import {
  createSiteDebugLogger,
  getSiteDebugNow,
  updateSiteDebugRenderMetric,
  type SiteDebugRenderMode,
} from '#shared/debug';
import getLoggerInstance from '#shared/logger';
import { validateLegalRenderElements } from '#shared/utils';
import { formatErrorMessage } from '@docs-islands/utils/logger';
import { getCleanPathname } from '../../shared/runtime';
import { reactComponentManager } from './react-component-manager';
import { rememberReactRenderState } from './react-render-root-store';

const loggerInstance = getLoggerInstance();
const Logger = loggerInstance.getLoggerByGroup('react-render-strategy');
const DebugLogger = createSiteDebugLogger('react-render-strategy');

interface RenderContext {
  pageId: string;
  isInitialLoad: boolean;
}

interface RenderComponent {
  element: Element;
  renderComponent: string;
  renderId: string;
  renderDirective: RenderDirective;
  renderWithSpaSync: boolean;
  props: Record<string, string>;
}

export class ReactRenderStrategy {
  private renderContext: RenderContext | null = null;
  private visibilityObserver: IntersectionObserver | null = null;

  private getDebugPayload(info: RenderComponent): Record<string, unknown> {
    return {
      pageId: this.getCurrentPageId(),
      renderComponent: info.renderComponent,
      renderDirective: info.renderDirective,
      renderId: info.renderId,
      renderWithSpaSync: info.renderWithSpaSync,
    };
  }

  private getRenderMode(
    info: RenderComponent,
    hasSsrContent: boolean,
  ): SiteDebugRenderMode {
    if (info.renderDirective === 'ssr:only') {
      return 'ssr-only';
    }

    return info.renderDirective === 'client:only' || !hasSsrContent
      ? 'render'
      : 'hydrate';
  }

  private updateRenderMetric(
    info: RenderComponent,
    patch: {
      detectedAt?: number;
      errorMessage?: string;
      hasSsrContent?: boolean;
      invokeDurationMs?: number;
      renderMode?: SiteDebugRenderMode;
      status?:
        | 'detected'
        | 'waiting-visible'
        | 'subscribing'
        | 'rendering'
        | 'completed'
        | 'failed'
        | 'skipped';
      subscribeDurationMs?: number;
      totalDurationMs?: number;
      updatedAt?: number;
      visibleAt?: number;
      waitForVisibilityMs?: number;
    },
  ): void {
    updateSiteDebugRenderMetric({
      componentName: info.renderComponent,
      pageId: this.getCurrentPageId(),
      renderDirective: info.renderDirective,
      renderId: info.renderId,
      renderWithSpaSync: info.renderWithSpaSync,
      source: 'react-render-strategy',
      ...patch,
    });
  }

  private registerDetectedRender(info: RenderComponent): void {
    const detectedAt = getSiteDebugNow();
    const hasSsrContent = info.element.innerHTML.trim().length > 0;

    this.updateRenderMetric(info, {
      detectedAt,
      hasSsrContent,
      renderMode: this.getRenderMode(info, hasSsrContent),
      status:
        info.renderDirective === 'client:visible'
          ? 'waiting-visible'
          : 'detected',
      updatedAt: detectedAt,
    });
  }

  /**
   * Type guard to ensure React runtime is available
   * The React runtime is loaded before any components are rendered
   */
  private isReactRuntimeAvailable(): boolean {
    return (
      globalThis.window?.React !== undefined &&
      globalThis.window?.ReactDOM !== undefined
    );
  }

  private getPropsFromElement(element: Element): Record<string, string> {
    const props: Record<string, string> = {};
    const attrs = element.getAttributeNames();

    for (const attr of attrs) {
      if (!RENDER_STRATEGY_ATTRS.includes(attr)) {
        const value = element.getAttribute(attr) ?? '';
        props[attr] = value;
      }
    }

    return props;
  }

  private getCurrentPageId(): string {
    if (this.renderContext?.pageId) return this.renderContext.pageId;
    return getCleanPathname();
  }

  public collectLegalRenderComponents(): RenderComponent[] {
    const elements = document.querySelectorAll(
      `[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}]`,
    );
    const renderComponents: RenderComponent[] = [];

    for (const element of elements) {
      if (!validateLegalRenderElements(element)) {
        continue;
      }

      const elementRenderAttrs = RENDER_STRATEGY_ATTRS.map((attr) =>
        element.getAttribute(attr),
      );
      const [renderId, renderDirective, renderComponent, renderWithSpaSync] =
        elementRenderAttrs;
      const props = this.getPropsFromElement(element);

      renderComponents.push({
        element,
        renderComponent: renderComponent!,
        renderId: renderId!,
        renderDirective: renderDirective! as RenderDirective,
        renderWithSpaSync: renderWithSpaSync === 'true',
        props,
      });
    }

    return renderComponents;
  }

  private async hydrateComponent(info: RenderComponent): Promise<void> {
    const { element, renderComponent, props } = info;
    const pageId = this.getCurrentPageId();
    const hydrateStart = getSiteDebugNow();
    const hasSsrContent = element.innerHTML.trim().length > 0;

    DebugLogger.info('component hydration started', {
      ...this.getDebugPayload(info),
      hasSsrContent,
    });
    this.updateRenderMetric(info, {
      hasSsrContent,
      renderMode: 'hydrate',
      status: 'subscribing',
      updatedAt: hydrateStart,
    });

    try {
      const subscribed = await reactComponentManager.subscribeComponent(
        pageId,
        renderComponent,
      );
      const subscribeDurationMs = Number(
        (getSiteDebugNow() - hydrateStart).toFixed(2),
      );

      if (!subscribed) {
        Logger.error(`Component ${renderComponent} subscription failed`);
        DebugLogger.error('component hydration subscription failed', {
          ...this.getDebugPayload(info),
          durationMs: subscribeDurationMs,
        });
        this.updateRenderMetric(info, {
          errorMessage: 'Component subscription failed',
          hasSsrContent,
          renderMode: 'hydrate',
          status: 'failed',
          subscribeDurationMs,
          totalDurationMs: subscribeDurationMs,
        });
        return;
      }

      this.updateRenderMetric(info, {
        hasSsrContent,
        renderMode: 'hydrate',
        status: 'rendering',
        subscribeDurationMs,
      });

      const Component = reactComponentManager.getComponent(
        pageId,
        renderComponent,
      );
      if (!Component) {
        Logger.warn(`Component ${renderComponent} not found`);
        DebugLogger.warn(
          'component hydration skipped because component is missing',
          {
            ...this.getDebugPayload(info),
            durationMs: Number((getSiteDebugNow() - hydrateStart).toFixed(2)),
          },
        );
        this.updateRenderMetric(info, {
          errorMessage: 'Component module missing',
          hasSsrContent,
          renderMode: 'hydrate',
          status: 'skipped',
          subscribeDurationMs,
          totalDurationMs: Number(
            (getSiteDebugNow() - hydrateStart).toFixed(2),
          ),
        });
        return;
      }

      /**
       * The React runtime is loaded and injected into the window object before any React components are loaded.
       * Therefore, once subscribeComponent is allowed to proceed, the presence of the React runtime is guaranteed.
       */
      if (!this.isReactRuntimeAvailable()) {
        Logger.error('React runtime is not available');
        DebugLogger.error(
          'component hydration skipped because react runtime is missing',
          {
            ...this.getDebugPayload(info),
            durationMs: Number((getSiteDebugNow() - hydrateStart).toFixed(2)),
          },
        );
        this.updateRenderMetric(info, {
          errorMessage: 'React runtime is missing',
          hasSsrContent,
          renderMode: 'hydrate',
          status: 'skipped',
          subscribeDurationMs,
          totalDurationMs: Number(
            (getSiteDebugNow() - hydrateStart).toFixed(2),
          ),
        });
        return;
      }

      const reactElement = globalThis.window.React!.createElement(
        Component,
        props,
      );
      try {
        const invokeStart = getSiteDebugNow();
        const root = globalThis.window.ReactDOM!.hydrateRoot(
          element,
          reactElement,
        );
        rememberReactRenderState(element, root, Component);
        const invokeDurationMs = Number(
          (getSiteDebugNow() - invokeStart).toFixed(2),
        );
        const totalDurationMs = Number(
          (getSiteDebugNow() - hydrateStart).toFixed(2),
        );
        DebugLogger.info('component hydration completed', {
          ...this.getDebugPayload(info),
          invokeDurationMs,
          totalDurationMs,
        });
        this.updateRenderMetric(info, {
          hasSsrContent,
          invokeDurationMs,
          renderMode: 'hydrate',
          status: 'completed',
          subscribeDurationMs,
          totalDurationMs,
        });
      } catch (error) {
        Logger.error(
          `Hydration failed, fallback to client render, message: ${formatErrorMessage(error)}`,
        );
        const fallbackMessage = formatErrorMessage(error);
        DebugLogger.warn('component hydration fell back to client render', {
          ...this.getDebugPayload(info),
          message: fallbackMessage,
          totalDurationMs: Number(
            (getSiteDebugNow() - hydrateStart).toFixed(2),
          ),
        });
        this.updateRenderMetric(info, {
          errorMessage: fallbackMessage,
          hasSsrContent,
          renderMode: 'render',
          status: 'rendering',
          subscribeDurationMs,
        });
        const root = globalThis.window.ReactDOM!.createRoot(element);
        rememberReactRenderState(element, root, Component);
        const fallbackInvokeStart = getSiteDebugNow();
        root.render(reactElement);
        const invokeDurationMs = Number(
          (getSiteDebugNow() - fallbackInvokeStart).toFixed(2),
        );
        const totalDurationMs = Number(
          (getSiteDebugNow() - hydrateStart).toFixed(2),
        );
        DebugLogger.info(
          'component client render completed after hydration fallback',
          {
            ...this.getDebugPayload(info),
            totalDurationMs,
          },
        );
        this.updateRenderMetric(info, {
          errorMessage: fallbackMessage,
          hasSsrContent,
          invokeDurationMs,
          renderMode: 'render',
          status: 'completed',
          subscribeDurationMs,
          totalDurationMs,
        });
      }
      Logger.success(`Component ${renderComponent} hydration completed`);
    } catch (error) {
      const errorMessage = formatErrorMessage(error);
      Logger.error(`Component hydration failed, message: ${errorMessage}`);
      DebugLogger.error('component hydration failed', {
        ...this.getDebugPayload(info),
        message: errorMessage,
        totalDurationMs: Number((getSiteDebugNow() - hydrateStart).toFixed(2)),
      });
      this.updateRenderMetric(info, {
        errorMessage,
        hasSsrContent,
        renderMode: 'hydrate',
        status: 'failed',
        totalDurationMs: Number((getSiteDebugNow() - hydrateStart).toFixed(2)),
      });
    }
  }

  private async renderComponent(info: RenderComponent): Promise<void> {
    const { element, renderComponent, props } = info;
    const pageId = this.getCurrentPageId();
    const renderStart = getSiteDebugNow();
    const hasSsrContent = element.innerHTML.trim().length > 0;

    DebugLogger.info(
      'component client render started',
      this.getDebugPayload(info),
    );
    this.updateRenderMetric(info, {
      hasSsrContent,
      renderMode: 'render',
      status: 'subscribing',
      updatedAt: renderStart,
    });

    try {
      const subscribed = await reactComponentManager.subscribeComponent(
        pageId,
        renderComponent,
      );
      const subscribeDurationMs = Number(
        (getSiteDebugNow() - renderStart).toFixed(2),
      );

      if (!subscribed) {
        Logger.error(`Component ${renderComponent} subscription failed`);
        DebugLogger.error('component client render subscription failed', {
          ...this.getDebugPayload(info),
          totalDurationMs: subscribeDurationMs,
        });
        this.updateRenderMetric(info, {
          errorMessage: 'Component subscription failed',
          hasSsrContent,
          renderMode: 'render',
          status: 'failed',
          subscribeDurationMs,
          totalDurationMs: subscribeDurationMs,
        });
        return;
      }

      this.updateRenderMetric(info, {
        hasSsrContent,
        renderMode: 'render',
        status: 'rendering',
        subscribeDurationMs,
      });

      const Component = reactComponentManager.getComponent(
        pageId,
        renderComponent,
      );
      if (!Component) {
        Logger.warn(`Component ${renderComponent} not found`);
        DebugLogger.warn(
          'component client render skipped because component is missing',
          {
            ...this.getDebugPayload(info),
            totalDurationMs: Number(
              (getSiteDebugNow() - renderStart).toFixed(2),
            ),
          },
        );
        this.updateRenderMetric(info, {
          errorMessage: 'Component module missing',
          hasSsrContent,
          renderMode: 'render',
          status: 'skipped',
          subscribeDurationMs,
          totalDurationMs: Number((getSiteDebugNow() - renderStart).toFixed(2)),
        });
        return;
      }

      /**
       * The React runtime is loaded and injected into the window object before any React components are loaded.
       * Therefore, once subscribeComponent is allowed to proceed, the presence of the React runtime is guaranteed.
       */
      if (!this.isReactRuntimeAvailable()) {
        Logger.error('React runtime is not available');
        DebugLogger.error(
          'component client render skipped because react runtime is missing',
          {
            ...this.getDebugPayload(info),
            totalDurationMs: Number(
              (getSiteDebugNow() - renderStart).toFixed(2),
            ),
          },
        );
        this.updateRenderMetric(info, {
          errorMessage: 'React runtime is missing',
          hasSsrContent,
          renderMode: 'render',
          status: 'skipped',
          subscribeDurationMs,
          totalDurationMs: Number((getSiteDebugNow() - renderStart).toFixed(2)),
        });
        return;
      }

      const invokeStart = getSiteDebugNow();
      const root = globalThis.window.ReactDOM!.createRoot(element);
      rememberReactRenderState(element, root, Component);
      const reactElement = globalThis.window.React!.createElement(
        Component,
        props,
      );
      root.render(reactElement);
      const invokeDurationMs = Number(
        (getSiteDebugNow() - invokeStart).toFixed(2),
      );
      const totalDurationMs = Number(
        (getSiteDebugNow() - renderStart).toFixed(2),
      );
      DebugLogger.info('component client render completed', {
        ...this.getDebugPayload(info),
        invokeDurationMs,
        totalDurationMs,
      });
      this.updateRenderMetric(info, {
        hasSsrContent,
        invokeDurationMs,
        renderMode: 'render',
        status: 'completed',
        subscribeDurationMs,
        totalDurationMs,
      });
      Logger.success(
        `Component ${renderComponent} client-side rendering completed`,
      );
    } catch (error) {
      const errorMessage = formatErrorMessage(error);
      Logger.error(
        `Component client-side rendering failed, message: ${errorMessage}`,
      );
      DebugLogger.error('component client render failed', {
        ...this.getDebugPayload(info),
        message: errorMessage,
        totalDurationMs: Number((getSiteDebugNow() - renderStart).toFixed(2)),
      });
      this.updateRenderMetric(info, {
        errorMessage,
        hasSsrContent,
        renderMode: 'render',
        status: 'failed',
        totalDurationMs: Number((getSiteDebugNow() - renderStart).toFixed(2)),
      });
    }
  }

  private setupVisibilityObserver(): void {
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
    }

    this.visibilityObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const element = entry.target;
          const renderComponent = element.getAttribute(
            RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
          );
          const renderId = element.getAttribute(
            RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
          );
          const renderDirective = element.getAttribute(
            RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
          ) as RenderDirective;
          const renderWithSpaSync =
            element.getAttribute(
              RENDER_STRATEGY_CONSTANTS.renderWithSpaSync,
            ) === 'true';

          if (renderComponent && renderDirective && renderId) {
            const props = this.getPropsFromElement(element);
            const visibleAt = getSiteDebugNow();
            DebugLogger.info('client:visible component became visible', {
              pageId: this.getCurrentPageId(),
              renderComponent,
              renderDirective,
              renderId,
            });
            this.updateRenderMetric(
              {
                element,
                renderComponent,
                renderDirective,
                renderId,
                renderWithSpaSync,
                props,
              },
              {
                hasSsrContent: element.innerHTML.trim().length > 0,
                renderMode:
                  renderDirective === 'client:only' ||
                  element.innerHTML.trim().length === 0
                    ? 'render'
                    : 'hydrate',
                status: 'subscribing',
                visibleAt,
              },
            );

            this.hydrateComponent({
              element,
              renderComponent,
              renderId,
              renderDirective,
              renderWithSpaSync,
              props,
            }).catch((error) => {
              Logger.error(
                `Visibility rendering failed, message: ${formatErrorMessage(error)}`,
              );
            });
          }

          this.visibilityObserver!.unobserve(element);
        }
      }
    });
  }

  private async executeSpaSyncRender(
    renderComponents: RenderComponent[],
  ): Promise<RenderComponent[]> {
    Logger.info('Executing SPA sync rendering strategy');

    const hydrateComponents = renderComponents.filter(
      (info) =>
        info.renderDirective === 'client:load' && info.renderWithSpaSync,
    );
    const visibleComponents = renderComponents.filter(
      (info) =>
        info.renderDirective === 'client:visible' && info.renderWithSpaSync,
    );
    if (visibleComponents.length > 0) {
      this.setupVisibilityObserver();
      for (const info of visibleComponents) {
        this.visibilityObserver!.observe(info.element);
      }
    }

    const clientRenderTasks: Promise<void>[] = [];

    if (hydrateComponents.length > 0) {
      clientRenderTasks.push(
        ...hydrateComponents.map(async (info) => this.hydrateComponent(info)),
      );
    }

    await Promise.allSettled(clientRenderTasks);

    return [...visibleComponents, ...hydrateComponents];
  }

  private async executeSSRInitialStrategy(
    renderComponents: RenderComponent[],
    excludeComponents?: RenderComponent[],
  ): Promise<void> {
    Logger.info('Executing SSR initialization rendering strategy');

    const filteredRenderComponents =
      Array.isArray(excludeComponents) && excludeComponents.length > 0
        ? renderComponents.filter((info) => !excludeComponents.includes(info))
        : renderComponents;

    const hydrateComponents = filteredRenderComponents.filter(
      (info) => info.renderDirective === 'client:load',
    );
    const clientOnlyComponents = filteredRenderComponents.filter(
      (info) => info.renderDirective === 'client:only',
    );
    const visibleComponents = filteredRenderComponents.filter(
      (info) => info.renderDirective === 'client:visible',
    );

    const clientRenderTasks: Promise<void>[] = [];

    if (hydrateComponents.length > 0) {
      clientRenderTasks.push(
        ...hydrateComponents.map(async (info) => this.hydrateComponent(info)),
      );
    }

    if (clientOnlyComponents.length > 0) {
      clientRenderTasks.push(
        ...clientOnlyComponents.map(async (info) => this.renderComponent(info)),
      );
    }

    if (visibleComponents.length > 0) {
      this.setupVisibilityObserver();
      for (const info of visibleComponents) {
        this.visibilityObserver!.observe(info.element);
      }
    }

    await Promise.allSettled(clientRenderTasks);
  }

  public async executeReactRuntime(context: RenderContext): Promise<void> {
    this.renderContext = context;
    const { isInitialLoad, pageId } = this.renderContext;

    const renderComponents = this.collectLegalRenderComponents();

    for (const info of renderComponents) {
      this.registerDetectedRender(info);
    }

    DebugLogger.info('react runtime execution started', {
      componentCount: renderComponents.length,
      isInitialLoad,
      pageId,
    });

    if (renderComponents.length === 0) {
      Logger.info('No React components on current page');
      return;
    }

    try {
      if (isInitialLoad) {
        await this.executeSSRInitialStrategy(renderComponents);
      } else {
        /**
         * This is an optimization path for hydration.
         * For components with the `client:load` or `client:visible` directive and the `spa:sync-render` or `spa:sr` directive,
         * hydration work is completed during the SPA sync rendering phase.
         */
        const [, spaSyncHydrateComponents] = await Promise.all([
          reactComponentManager.loadPageComponents(),
          this.executeSpaSyncRender(renderComponents),
        ]);
        /**
         * After route switching, it is necessary to obtain the server-rendered HTML
         * and patch it onto the corresponding DOM node.
         */
        const componentInfo =
          reactComponentManager.getPageComponentInfo(pageId);
        if (componentInfo) {
          const { ssrInjectScript } = componentInfo;
          if (ssrInjectScript) {
            const ssrInjectStart = getSiteDebugNow();
            const { __SSR_INJECT_CODE__ } = await import(
              /* @vite-ignore */ ssrInjectScript
            );
            if (typeof __SSR_INJECT_CODE__ === 'function') {
              __SSR_INJECT_CODE__();
              DebugLogger.info('ssr inject script executed', {
                durationMs: Number(
                  (getSiteDebugNow() - ssrInjectStart).toFixed(2),
                ),
                pageId,
                script: ssrInjectScript,
              });
            }
          }
        }
        // The remaining scenarios will be executed using the unoptimized path.
        await this.executeSSRInitialStrategy(
          renderComponents,
          spaSyncHydrateComponents,
        );
      }
    } catch (error) {
      Logger.error(
        `React runtime execution failed, message: ${formatErrorMessage(error)}`,
      );
      DebugLogger.error('react runtime execution failed', {
        componentCount: renderComponents.length,
        isInitialLoad,
        message: formatErrorMessage(error),
        pageId,
      });
    }
  }

  public cleanup(): void {
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
      this.visibilityObserver = null;
    }
    this.renderContext = null;
  }
}

export const reactRenderStrategy: ReactRenderStrategy =
  new ReactRenderStrategy();
