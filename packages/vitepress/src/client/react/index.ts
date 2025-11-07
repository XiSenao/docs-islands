import type { DevComponentInfo } from '#dep-types/react';
import type { RenderDirective } from '#dep-types/render';
import type { SSRUpdateData, SSRUpdateRenderData } from '#dep-types/ssr';
import {
  NEED_PRE_RENDER_DIRECTIVES,
  REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID,
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '#shared/constants';
import logger from '#shared/logger';
import { validateLegalRenderElements } from '#shared/utils';
import type React from 'react';
import type ReactDOM from 'react-dom/client';
import { getCleanPathname } from '../../shared/runtime';
import { reactComponentManager } from './react-component-manager';
import { reactRenderStrategy } from './react-render-strategy';

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

class ReactIntegration {
  public pendingReactRuntimeLoads: Map<string, Promise<void>> = new Map<
    string,
    Promise<void>
  >();
  private isInitialLoad = true;
  private react: typeof React | null = null;
  private reactDOM: typeof ReactDOM | null = null;

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

  public loadDevRenderRuntime(): void {
    if (this.detectRenderElementsInDev()) {
      const timestamp = Date.now();
      const base = typeof __BASE__ === 'string' ? __BASE__ : '/';
      const scriptPath = `${base}${REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID}?${RENDER_STRATEGY_CONSTANTS.renderClientInDev}=${this.getPageId()}&t=${timestamp}`;

      /**
       * During development, client-side caching should be disabled. A request to the server must be made on each route change
       * and on initial mount, and the server determines whether the cache is hit.
       *
       * Otherwise, when the script within the `<script lang="react">` tag changes,
       * the browser will not detect the change on subsequent route transitions.
       */
      import(/* @vite-ignore */ scriptPath).then(() => {
        const Logger = logger.getLoggerByGroup('load-dev-render-runtime');
        Logger.success('Development render runtime loaded successfully');
      });
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

      const [React, ReactDOM] = await Promise.all([
        import('react'),
        import('react-dom/client'),
      ]);
      this.react = React;
      this.reactDOM = ReactDOM;

      import.meta.hot.on(
        'vrite-markdown-update-prepare',
        ({ updates, missingImports }: ReactUpdateState) => {
          const currentPageInjectComponents = window[
            RENDER_STRATEGY_CONSTANTS.injectComponent
          ][this.getPageId()] as Record<string, DevComponentInfo>;
          // Clear memoized state.
          memoizedUpdateState.state = {};
          memoizedUpdateState.pendingUpdateState = null;
          memoizedUpdateState.memoizedSsrOnlyComponents = new Set();
          memoizedUpdateState.pendingMissingImports = null;

          memoizedUpdateState.pendingUpdateState = updates;
          memoizedUpdateState.pendingMissingImports = missingImports;
          if (currentPageInjectComponents) {
            for (const componentName of Object.keys(
              currentPageInjectComponents,
            )) {
              const componentReference =
                currentPageInjectComponents[componentName];
              const { path, importedName, component } = componentReference;
              memoizedUpdateState.state[componentName] = {
                component,
                source: path,
                importedName,
                effectElements: {},
              };
            }
            const renderComponentDOMContainers = document.querySelectorAll(
              `[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}]`,
            );
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
                /**
                 * The attribute comparison in HMR also includes the attributes in RENDER_STRATEGY_ATTRS,
                 * so there's no need to filter them out.
                 */
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
          }
        },
      );

      /**
       * After the Vue engine renders the Markdown document, perform diff operations.
       */
      import.meta.hot.on('vite:afterUpdate', () => {
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

        const Logger = logger.getLoggerByGroup('vite:after-update');
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
        const ssrOnlyComponents = new Map<
          string,
          {
            component: null;
            importedName: string;
            path: string;
          }
        >();
        const reuseInjectComponent = new Map<string, DevComponentInfo>();

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
              const memorizedState = memoizedUpdateState.state[renderComponent];
              if (memorizedState) {
                const {
                  component,
                  source,
                  importedName: memorizedImportedName,
                  effectElements,
                } = memorizedState;
                // Component reference has changed.
                if (importedName !== memorizedImportedName || source !== path) {
                  if (renderUpdates[renderComponent]) {
                    renderUpdates[renderComponent].effectElements.push(element);
                  } else {
                    renderUpdates[renderComponent] = {
                      component: null,
                      source: path,
                      importedName,
                      effectElements: [element],
                    };
                  }
                } else {
                  reuseInjectComponent.set(renderComponent, {
                    component,
                    path,
                    importedName,
                  });
                  // If both pre- and post-update containers point to the same component, detect reuse vs re-render.
                  if (effectElements[renderId]) {
                    const { props, current } = effectElements[renderId];
                    let hasAttrChanged = false;
                    const attrKeys = element.getAttributeNames();

                    if (attrKeys.length === props.size) {
                      for (const [
                        memorizedAttrKey,
                        memorizedAttrValue,
                      ] of props.entries()) {
                        const attrValue = element.getAttribute(
                          memorizedAttrKey.toLowerCase(),
                        );
                        if (attrValue !== memorizedAttrValue) {
                          hasAttrChanged = true;
                        }
                      }
                    } else {
                      hasAttrChanged = true;
                    }

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
                      renderIdToReuseRenderedElements.set(renderId, current);
                    }
                  } else if (renderUpdates[renderComponent]) {
                    renderUpdates[renderComponent].effectElements.push(element);
                  } else {
                    // Reuse the rendered component for the new container.
                    renderUpdates[renderComponent] = {
                      component,
                      source: path,
                      importedName,
                      effectElements: [element],
                    };
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
            `[${RENDER_STRATEGY_CONSTANTS.renderId}="${renderId}"]`,
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
            const ssrComponents = renderComponents.filter((renderComponent) =>
              ssrRequiredDirectives.includes(renderComponent.renderDirective),
            );
            for (const ssrComponent of ssrComponents) {
              ssrComponentsMap.set(ssrComponent.renderId, ssrComponent.element);
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
          loadComponentsAndRenderComponentsOrHydrateComponents();
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
          (): void => {
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
                loadComponents[key] = import(/* @vite-ignore */ source).then(
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

            for (const renderId of Object.keys(ssrClientComponents)) {
              const { component, source, importedName } =
                ssrClientComponents[renderId];
              const key = `${source}#${importedName}`;
              if (component) {
                loadComponents[key] = Promise.resolve(component);
              } else if (!loadComponents[key]) {
                loadComponents[key] = import(/* @vite-ignore */ source).then(
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

            const promiseComponents: {
              component: Promise<React.ComponentType<Record<string, string>>>;
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
            Promise.all(
              promiseComponents.map(async (item) => item.component),
            ).then((components) => {
              for (const [index, component] of components.entries()) {
                componentsMap.set(promiseComponents[index].key, component);
              }

              for (const renderId of Object.keys(clientComponents)) {
                const { source, importedName, props, componentName } =
                  clientComponents[renderId];
                const key = `${source}#${importedName}`;
                const Component = componentsMap.get(key);
                if (Component) {
                  const renderElement = document.querySelector(
                    `[${RENDER_STRATEGY_CONSTANTS.renderId}="${renderId}"]`,
                  );
                  if (renderElement) {
                    workInProgressInjectComponent[componentName] = {
                      component: Component,
                      path: source,
                      importedName,
                    };
                    const root = this.reactDOM!.createRoot(renderElement);
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
                    `[${RENDER_STRATEGY_CONSTANTS.renderId}="${renderId}"]`,
                  );
                  if (renderElement) {
                    workInProgressInjectComponent[componentName] = {
                      component: Component,
                      path: source,
                      importedName,
                    };
                    this.reactDOM!.hydrateRoot(
                      renderElement,
                      this.react!.createElement(Component, props),
                    );
                  }
                }
              }
            });

            for (const [
              componentName,
              { component, path, importedName },
            ] of reuseInjectComponent.entries()) {
              workInProgressInjectComponent[componentName] = {
                component,
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
          loadComponentsAndRenderComponentsOrHydrateComponents();
        }
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
                logger
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

      import.meta.hot.on(
        'vrite-ssr-mount-render',
        ({ pathname, data }: SSRUpdateRenderData) => {
          if (pathname === this.getPageId() && data.length > 0) {
            const ssrComponentsMap = new Map<string, Element>();
            const renderComponents =
              reactRenderStrategy.collectLegalRenderComponents();
            const preRenderComponents = renderComponents.filter((info) =>
              NEED_PRE_RENDER_DIRECTIVES.includes(info.renderDirective),
            );
            for (const info of preRenderComponents) {
              ssrComponentsMap.set(info.renderId, info.element);
            }
            for (const preRenderComponent of data) {
              const { renderId, ssrOnlyCss, ssrHtml } = preRenderComponent;
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
              }
            }
          }
          /**
           * The server has completed rendering, proceed to complete the client-side rendering
           * and client-side hydration process.
           */
          this.loadDevRenderRuntime();
        },
      );
    }
  }

  public async initializeInDev(): Promise<void> {
    if (import.meta.env.DEV) {
      await reactComponentManager.initializeInDev();

      onContentUpdated(() => {
        /**
         * The onContentUpdated hook in VitePress triggers multiple times on the same page
         * after a route change, we only handle the first trigger.
         */
        if (currentLocationPathname === this.getPageId()) {
          return;
        }
        currentLocationPathname = this.getPageId();

        // In the development environment, the pre-rendering of components relies on push update events.
        if (import.meta.hot) {
          const renderComponents =
            reactRenderStrategy.collectLegalRenderComponents();
          const preRenderComponents = renderComponents.filter((info) =>
            NEED_PRE_RENDER_DIRECTIVES.includes(info.renderDirective),
          );

          /**
           * When a route changes or the page loads for the first time,
           * all components that require SSR rendering need to be fully rendered.
           */
          const pendingPreRenderComponents: SSRUpdateData['data'] =
            preRenderComponents.map((info) => {
              return {
                renderId: info.renderId,
                componentName: info.renderComponent,
                props: info.props,
              };
            });

          const pendingPreRenderComponentsUpdates: SSRUpdateData = {
            pathname: currentLocationPathname,
            data: pendingPreRenderComponents,
            updateType: 'mounted',
          };

          import.meta.hot.send(
            'vrite-ssr-update',
            pendingPreRenderComponentsUpdates,
          );
        }
      });

      await this.integrationHMR();
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
