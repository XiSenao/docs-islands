import type { PageBuildMetrics } from '#dep-types/page';
import {
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '#shared/constants';
import { LightGeneralLogger } from '#shared/logger';
import { RenderController } from '@docs-islands/core/node/render-controller';
import { REACT_FRAMEWORK } from './framework';

export interface ReactRenderControllerOptions {
  enableSiteDebugRuntime?: boolean;
}

export class ReactRenderController extends RenderController<PageBuildMetrics> {
  readonly #enableSiteDebugRuntime: boolean;

  constructor(options: ReactRenderControllerOptions = {}) {
    super();
    this.#enableSiteDebugRuntime = options.enableSiteDebugRuntime ?? false;
  }

  private getSiteDebugRuntimePrelude(): string {
    if (this.#enableSiteDebugRuntime) {
      return `
import { getSiteDebugNow as __site_debug_now__, logSiteDebug as __site_debug_log__, updateSiteDebugRenderMetric as __site_debug_metric__ } from '@docs-islands/vitepress/internal/debug';
      `;
    }

    return `
const __site_debug_now__ = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
const __site_debug_log__ = () => {};
const __site_debug_metric__ = () => {};
    `;
  }

  public async generateClientRuntimeInDEV(
    markdownModuleId: string,
  ): Promise<string> {
    const compilationContainer =
      await this.getCompilationContainerByMarkdownModuleId(
        REACT_FRAMEWORK,
        markdownModuleId,
      );

    const needCompile = compilationContainer.importsByLocalName.size > 0;

    if (!needCompile) {
      return '';
    }

    const code = `
      ${compilationContainer.code}

      ${compilationContainer.helperCode}
    `;
    return `
import { createRoot as __react_client_render__, hydrateRoot as __react_hydrate__ } from 'react-dom/client';
import { startTransition as __start_transition__ } from 'react';
import getLoggerInstance from '@docs-islands/vitepress/internal/logger';

${this.getSiteDebugRuntimePrelude()}

const Logger = getLoggerInstance().getLoggerByGroup('ReactRenderController');

${code}

const __MAX_RENDER_ATTEMPTS__ = 10;
const __RENDER_RETRY_DELAY_MS__ = 120;
const __PENDING_HYDRATION_COMPONENT_MAP__ = new Map();
const __RENDERED_ELEMENTS__ = new WeakSet();
const __MISSING_COMPONENT_LOGGED_ELEMENTS__ = new WeakSet();
let __renderRetryCount__ = 0;
let __renderRetryTimer__ = null;

function __get_page_id__() {
  let pathname = window.location.pathname || '/';
  try {
    pathname = decodeURI(pathname);
  } catch {
    // Keep the raw pathname if decoding fails.
  }

  pathname = pathname.replace(/(^|\\/)index(?:\\.html)?$/, '$1');
  pathname = pathname.replace(/\\.html$/, '');
  return pathname || '/';
}

function __update_render_metric__(patch) {
  __site_debug_metric__({
    pageId: __get_page_id__(),
    source: 'react-dev-runtime',
    ...patch
  });
}

const clientVisibleObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      __start_transition__(() => {
        if (!__PENDING_HYDRATION_COMPONENT_MAP__.has(entry.target)) return;
        const {
          component: Component,
          props,
          renderId,
          renderMode,
          renderComponentName
        } = __PENDING_HYDRATION_COMPONENT_MAP__.get(entry.target);
        const renderStart = __site_debug_now__();
        __site_debug_log__('react-dev-runtime', 'client:visible component became visible', {
          renderComponentName,
          renderId,
          renderMode
        });
        __update_render_metric__({
          componentName: renderComponentName,
          hasSsrContent: renderMode === 'hydrate',
          renderId,
          renderMode,
          status: 'rendering',
          visibleAt: renderStart
        });
        try {
          if (renderMode === 'render') {
            __react_client_render__(entry.target).render(<Component {...props} />);
            Logger.success(\`Component \${ renderComponentName } lazy client-side rendering completed\`);
          } else {
            __react_hydrate__(entry.target, <Component {...props} />);
            Logger.success(\`Component \${ renderComponentName } lazy hydration completed\`);
          }
          const renderEnd = __site_debug_now__();
          __site_debug_log__('react-dev-runtime', 'development lazy render completed', {
            durationMs: Number((renderEnd - renderStart).toFixed(2)),
            renderComponentName,
            renderId,
            renderMode
          });
          __update_render_metric__({
            componentName: renderComponentName,
            hasSsrContent: renderMode === 'hydrate',
            invokeDurationMs: Number((renderEnd - renderStart).toFixed(2)),
            renderId,
            renderMode,
            status: 'completed',
            updatedAt: renderEnd
          });
        } catch (error) {
          const renderEnd = __site_debug_now__();
          Logger.error(\`Component \${ renderComponentName } lazy hydration failed: \${error}\`);
          __site_debug_log__('react-dev-runtime', 'development lazy render failed', {
            durationMs: Number((renderEnd - renderStart).toFixed(2)),
            message: error instanceof Error ? error.message : String(error),
            renderComponentName,
            renderId,
            renderMode
          }, 'error');
          __update_render_metric__({
            componentName: renderComponentName,
            errorMessage: error instanceof Error ? error.message : String(error),
            hasSsrContent: renderMode === 'hydrate',
            renderId,
            renderMode,
            status: 'failed',
            updatedAt: renderEnd
          });
        } finally {
          __RENDERED_ELEMENTS__.add(entry.target);
          clientVisibleObserver.unobserve(entry.target);
          __PENDING_HYDRATION_COMPONENT_MAP__.delete(entry.target);
        }
      });
    }
  });
});

function __hasSsrContent__(dom) {
  return dom.childNodes.length > 0 || dom.innerHTML.trim().length > 0;
}

function __queueRenderRetry__() {
  if (
    __renderRetryTimer__ ||
    __renderRetryCount__ >= __MAX_RENDER_ATTEMPTS__
  ) {
    return;
  }

  __renderRetryTimer__ = window.setTimeout(() => {
    __renderRetryTimer__ = null;
    __renderRetryCount__ += 1;
    __flushRenderTargets__();
  }, __RENDER_RETRY_DELAY_MS__);
}

function __renderTarget__(dom) {
  const attributes = dom.getAttributeNames();
  const props = {};
  const userProps = {};
  const renderStrategyAttrs = [${RENDER_STRATEGY_ATTRS.map((v) => `"${v}"`).join(', ')}];

  attributes.forEach((key) => {
    props[key] = dom.getAttribute(key);
    if (!renderStrategyAttrs.includes(key)) {
      userProps[key] = props[key];
    }
  });

  const renderDirective =
    props["${RENDER_STRATEGY_CONSTANTS.renderDirective.toLocaleLowerCase()}"];
  const renderId =
    props["${RENDER_STRATEGY_CONSTANTS.renderId.toLocaleLowerCase()}"];
  const renderComponentName =
    props["${RENDER_STRATEGY_CONSTANTS.renderComponent.toLocaleLowerCase()}"];
  const __REACT_COMPONENT__ = (
    ${RENDER_STRATEGY_CONSTANTS.reactInlineComponentReference}[renderComponentName] ||
    {}
  )["component"];

  if (!__REACT_COMPONENT__) {
    if (renderDirective === 'ssr:only') {
      __RENDERED_ELEMENTS__.add(dom);
      __site_debug_log__('react-dev-runtime', 'development ssr:only component skipped client render', {
        renderComponentName,
        renderDirective,
        renderId
      });
      __update_render_metric__({
        componentName: renderComponentName,
        detectedAt: __site_debug_now__(),
        hasSsrContent: __hasSsrContent__(dom),
        renderDirective,
        renderId,
        renderMode: 'ssr-only',
        status: 'skipped'
      });
      return true;
    }

    if (
      __renderRetryCount__ >= __MAX_RENDER_ATTEMPTS__ &&
      !__MISSING_COMPONENT_LOGGED_ELEMENTS__.has(dom)
    ) {
      __MISSING_COMPONENT_LOGGED_ELEMENTS__.add(dom);
      __site_debug_log__('react-dev-runtime', 'development render target missing component after retries', {
        renderComponentName,
        renderDirective,
        renderId,
        retryCount: __renderRetryCount__
      }, 'error');
      __update_render_metric__({
        componentName: renderComponentName,
        detectedAt: __site_debug_now__(),
        errorMessage: 'Component not found after retries',
        hasSsrContent: __hasSsrContent__(dom),
        renderDirective,
        renderId,
        renderMode: __hasSsrContent__(dom) ? 'hydrate' : 'render',
        status: 'failed'
      });
      ${LightGeneralLogger('error', `'Component '+ props["${RENDER_STRATEGY_CONSTANTS.renderComponent.toLocaleLowerCase()}"] + ' not found'`, 'generate-client-runtime-in-dev').formatText}
    }
    return false;
  }

  /**
   * During development, React components default to a low-priority rendering strategy,
   * which means they periodically yield the thread.
   *
   * TODO: Provide a priority attribute in the future to specify the rendering priority strategy for React components.
   */
  if (renderDirective === 'client:visible') {
    if (!__PENDING_HYDRATION_COMPONENT_MAP__.has(dom)) {
      const hasSsrContent = __hasSsrContent__(dom);
      const renderMode = hasSsrContent ? 'hydrate' : 'render';
      const detectedAt = __site_debug_now__();
      clientVisibleObserver.observe(dom);
      __PENDING_HYDRATION_COMPONENT_MAP__.set(dom, {
        component: __REACT_COMPONENT__,
        props: userProps,
        renderId,
        renderMode,
        renderComponentName
      });
      __site_debug_log__('react-dev-runtime', 'development client:visible render scheduled', {
        renderComponentName,
        renderDirective,
        renderId,
        renderMode
      });
      __update_render_metric__({
        componentName: renderComponentName,
        detectedAt,
        hasSsrContent,
        renderDirective,
        renderId,
        renderMode,
        status: 'waiting-visible'
      });
      __RENDERED_ELEMENTS__.add(dom);
    }
    return true;
  }

  const hasSsrContent = __hasSsrContent__(dom);
  const renderMode =
    renderDirective === 'client:only' || !hasSsrContent
      ? 'render'
      : 'hydrate';
  const renderStart = __site_debug_now__();
  __site_debug_log__('react-dev-runtime', 'development render started', {
    renderComponentName,
    renderDirective,
    renderId,
    renderMode
  });
  __update_render_metric__({
    componentName: renderComponentName,
    detectedAt: renderStart,
    hasSsrContent,
    renderDirective,
    renderId,
    renderMode,
    status: 'rendering'
  });

  __start_transition__(() => {
    try {
      if (renderMode === 'render') {
        __react_client_render__(dom).render(<__REACT_COMPONENT__ {...userProps} />);
        Logger.success(\`Component \${ renderComponentName } client-side rendering completed\`);
      } else if (renderDirective !== 'ssr:only') {
        __react_hydrate__(dom, <__REACT_COMPONENT__ {...userProps} />);
        Logger.success(\`Component \${ renderComponentName } hydration completed\`);
      }
      const renderEnd = __site_debug_now__();
      __site_debug_log__('react-dev-runtime', 'development render completed', {
        durationMs: Number((renderEnd - renderStart).toFixed(2)),
        renderComponentName,
        renderDirective,
        renderId,
        renderMode
      });
      __update_render_metric__({
        componentName: renderComponentName,
        hasSsrContent,
        invokeDurationMs: Number((renderEnd - renderStart).toFixed(2)),
        renderDirective,
        renderId,
        renderMode,
        status: 'completed',
        updatedAt: renderEnd
      });
    } catch (error) {
      const renderEnd = __site_debug_now__();
      __site_debug_log__('react-dev-runtime', 'development render failed', {
        durationMs: Number((renderEnd - renderStart).toFixed(2)),
        message: error instanceof Error ? error.message : String(error),
        renderComponentName,
        renderDirective,
        renderId,
        renderMode
      }, 'error');
      __update_render_metric__({
        componentName: renderComponentName,
        errorMessage: error instanceof Error ? error.message : String(error),
        hasSsrContent,
        renderDirective,
        renderId,
        renderMode,
        status: 'failed',
        updatedAt: renderEnd
      });
      throw error;
    }
  });
  __RENDERED_ELEMENTS__.add(dom);
  return true;
}

function __flushRenderTargets__() {
  const targetElements = document.querySelectorAll(
    '[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}]'
  );

  if (targetElements.length === 0) {
    __queueRenderRetry__();
    return;
  }

  let hasPendingTargets = false;
  targetElements.forEach((dom) => {
    if (__RENDERED_ELEMENTS__.has(dom)) {
      return;
    }

    if (!__renderTarget__(dom)) {
      hasPendingTargets = true;
    }
  });

  if (hasPendingTargets) {
    __queueRenderRetry__();
  }
}

__flushRenderTargets__();
    `;
  }
}
