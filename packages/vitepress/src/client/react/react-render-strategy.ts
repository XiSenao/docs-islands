import type { RenderDirective } from '#dep-types/render';
import {
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '#shared/constants';
import { validateLegalRenderElements } from '#shared/utils';
import logger from '#utils/logger';
import { getCleanPathname } from '../../shared/runtime';
import { reactComponentManager } from './react-component-manager';

const Logger = logger.getLoggerByGroup('ReactRenderStrategy');

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

    try {
      await reactComponentManager.subscribeComponent(pageId, renderComponent);

      const Component = reactComponentManager.getComponent(
        pageId,
        renderComponent,
      );
      if (!Component) {
        Logger.warn(`Component ${renderComponent} not found`);
        return;
      }

      /**
       * The React runtime is loaded and injected into the window object before any React components are loaded.
       * Therefore, once subscribeComponent is allowed to proceed, the presence of the React runtime is guaranteed.
       */
      if (!this.isReactRuntimeAvailable()) {
        Logger.error('React runtime is not available');
        return;
      }

      const reactElement = globalThis.window.React!.createElement(
        Component,
        props,
      );
      try {
        globalThis.window.ReactDOM!.hydrateRoot(element, reactElement);
      } catch (error) {
        Logger.error(
          `Hydration failed, fallback to client render, message: ${error.message}`,
        );
        const root = globalThis.window.ReactDOM!.createRoot(element);
        root.render(reactElement);
      }
      Logger.success(`Component ${renderComponent} hydration completed`);
    } catch (error) {
      Logger.error(`Component hydration failed, message: ${error.message}`);
    }
  }

  private async renderComponent(info: RenderComponent): Promise<void> {
    const { element, renderComponent, props } = info;
    const pageId = this.getCurrentPageId();

    try {
      await reactComponentManager.subscribeComponent(pageId, renderComponent);

      const Component = reactComponentManager.getComponent(
        pageId,
        renderComponent,
      );
      if (!Component) {
        Logger.warn(`Component ${renderComponent} not found`);
        return;
      }

      /**
       * The React runtime is loaded and injected into the window object before any React components are loaded.
       * Therefore, once subscribeComponent is allowed to proceed, the presence of the React runtime is guaranteed.
       */
      if (!this.isReactRuntimeAvailable()) {
        Logger.error('React runtime is not available');
        return;
      }

      const root = globalThis.window.ReactDOM!.createRoot(element);
      const reactElement = globalThis.window.React!.createElement(
        Component,
        props,
      );
      root.render(reactElement);
      Logger.success(
        `Component ${renderComponent} client-side rendering completed`,
      );
    } catch (error) {
      Logger.error(
        `Component client-side rendering failed, message: ${error.message}`,
      );
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

            this.hydrateComponent({
              element,
              renderComponent,
              renderId,
              renderDirective,
              renderWithSpaSync,
              props,
            }).catch((error) => {
              Logger.error(
                `Visibility rendering failed, message: ${error.message}`,
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

    return hydrateComponents;
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
            const { __SSR_INJECT_CODE__ } = await import(
              /* @vite-ignore */ ssrInjectScript
            );
            if (typeof __SSR_INJECT_CODE__ === 'function') {
              __SSR_INJECT_CODE__();
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
      Logger.error(`React runtime execution failed, message: ${error.message}`);
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
