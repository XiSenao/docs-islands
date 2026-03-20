import {
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '#shared/constants';
import { LightGeneralLogger } from '#shared/logger';
import { RenderController } from '../core/render-controller';

export class ReactRenderController extends RenderController {
  public async generateClientRuntimeInDEV(
    markdownModuleId: string,
  ): Promise<string> {
    const compilationContainer =
      await this.getCompilationContainerByMarkdownModuleId(markdownModuleId);

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

const Logger = getLoggerInstance().getLoggerByGroup('ReactRenderController');

${code}

const __MAX_RENDER_ATTEMPTS__ = 10;
const __RENDER_RETRY_DELAY_MS__ = 120;
const __PENDING_HYDRATION_COMPONENT_MAP__ = new Map();
const __RENDERED_ELEMENTS__ = new WeakSet();
const __MISSING_COMPONENT_LOGGED_ELEMENTS__ = new WeakSet();
let __renderRetryCount__ = 0;
let __renderRetryTimer__ = null;
const clientVisibleObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      __start_transition__(() => {
        if (!__PENDING_HYDRATION_COMPONENT_MAP__.has(entry.target)) return;
        const {
          component: Component,
          props,
          renderMode,
          renderComponentName
        } = __PENDING_HYDRATION_COMPONENT_MAP__.get(entry.target);
        try {
          if (renderMode === 'render') {
            __react_client_render__(entry.target).render(<Component {...props} />);
            Logger.success(\`Component \${ renderComponentName } lazy client-side rendering completed\`);
          } else {
            __react_hydrate__(entry.target, <Component {...props} />);
            Logger.success(\`Component \${ renderComponentName } lazy hydration completed\`);
          }
        } catch (error) {
          Logger.error(\`Component \${ renderComponentName } lazy hydration failed: \${error}\`);
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
  const renderComponentName =
    props["${RENDER_STRATEGY_CONSTANTS.renderComponent.toLocaleLowerCase()}"];
  const __REACT_COMPONENT__ = (
    ${RENDER_STRATEGY_CONSTANTS.reactInlineComponentReference}[renderComponentName] ||
    {}
  )["component"];

  if (!__REACT_COMPONENT__) {
    if (renderDirective === 'ssr:only') {
      __RENDERED_ELEMENTS__.add(dom);
      return true;
    }

    if (
      __renderRetryCount__ >= __MAX_RENDER_ATTEMPTS__ &&
      !__MISSING_COMPONENT_LOGGED_ELEMENTS__.has(dom)
    ) {
      __MISSING_COMPONENT_LOGGED_ELEMENTS__.add(dom);
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
      clientVisibleObserver.observe(dom);
      __PENDING_HYDRATION_COMPONENT_MAP__.set(dom, {
        component: __REACT_COMPONENT__,
        props: userProps,
        renderMode: __hasSsrContent__(dom) ? 'hydrate' : 'render',
        renderComponentName
      });
      __RENDERED_ELEMENTS__.add(dom);
    }
    return true;
  }

  __start_transition__(() => {
    if (renderDirective === 'client:only' || !__hasSsrContent__(dom)) {
      __react_client_render__(dom).render(<__REACT_COMPONENT__ {...userProps} />);
      Logger.success(\`Component \${ renderComponentName } client-side rendering completed\`);
    } else if (renderDirective !== 'ssr:only') {
      __react_hydrate__(dom, <__REACT_COMPONENT__ {...userProps} />);
      Logger.success(\`Component \${ renderComponentName } hydration completed\`);
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
