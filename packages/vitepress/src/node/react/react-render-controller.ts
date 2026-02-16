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
import logger from '@docs-islands/vitepress/internal/logger';

const Logger = logger.getLoggerByGroup('ReactRenderController');

${code}

const targetElements = document.querySelectorAll('[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}]');
if (targetElements.length > 0) {
  const __PENDING_HYDRATION_COMPONENT_MAP__ = new Map();
  const clientVisibleObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        __start_transition__(() => {
          if (!__PENDING_HYDRATION_COMPONENT_MAP__.has(entry.target)) return;
          const { component: Component, props } = __PENDING_HYDRATION_COMPONENT_MAP__.get(entry.target);
          const renderComponentName = entry.target.getAttribute(
            "${RENDER_STRATEGY_CONSTANTS.renderComponent.toLocaleLowerCase()}"
          );
          try {
            __react_hydrate__(entry.target, <Component {...props} />);
            Logger.success(\`Component \${ renderComponentName } lazy hydration completed\`);
          } catch (error) {
            Logger.error(\`Component \${ renderComponentName } lazy hydration failed: \${error}\`);
          } finally {
            clientVisibleObserver.unobserve(entry.target);
            __PENDING_HYDRATION_COMPONENT_MAP__.delete(entry.target);
          }
        });
      }
    });
  });
  targetElements.forEach(dom => {
    const attributes = dom.getAttributeNames();
    const props: Record<string, string> = {};
    const userProps: Record<string, string> = {};
    const renderStrategyAttrs = [${RENDER_STRATEGY_ATTRS.map((v) => `"${v}"`).join(', ')}];

    attributes.forEach((key) => {
      props[key] = dom.getAttribute(key);
      if (!renderStrategyAttrs.includes(key)) {
        userProps[key] = props[key];
      }
    });

    const __REACT_COMPONENT__ = (${RENDER_STRATEGY_CONSTANTS.reactInlineComponentReference}[props["${RENDER_STRATEGY_CONSTANTS.renderComponent.toLocaleLowerCase()}"]] || {})["component"];
    const renderComponentName = props["${RENDER_STRATEGY_CONSTANTS.renderComponent.toLocaleLowerCase()}"];

    /**
     * During development, React components default to a low-priority rendering strategy,
     * which means they periodically yield the thread.
     *
     * TODO: Provide a priority attribute in the future to specify the rendering priority strategy for React components.
     */
    if (__REACT_COMPONENT__) {
      if (props["${RENDER_STRATEGY_CONSTANTS.renderDirective.toLocaleLowerCase()}"] === 'client:only') {
        __start_transition__(() => {
          __react_client_render__(dom).render(<__REACT_COMPONENT__ { ...userProps } />);
          Logger.success(\`Component \${ renderComponentName } client-side rendering completed\`);
        });
      } else if (props["${RENDER_STRATEGY_CONSTANTS.renderDirective.toLocaleLowerCase()}"] !== 'ssr:only' && props["${RENDER_STRATEGY_CONSTANTS.renderDirective.toLocaleLowerCase()}"] !== 'client:visible') {
        __start_transition__(() => {
          __react_hydrate__(dom, <__REACT_COMPONENT__ { ...userProps } />);
          Logger.success(\`Component \${ renderComponentName } hydration completed\`);
        });
      } else if (props["${RENDER_STRATEGY_CONSTANTS.renderDirective.toLocaleLowerCase()}"] === 'client:visible') {
        clientVisibleObserver.observe(dom);
        __PENDING_HYDRATION_COMPONENT_MAP__.set(dom, {
          component: __REACT_COMPONENT__,
          props: userProps
        });
      }
    } else {
      if (props["${RENDER_STRATEGY_CONSTANTS.renderDirective.toLocaleLowerCase()}"] === 'ssr:only') {
        return;
      }
      ${LightGeneralLogger('error', `'Component '+ props["${RENDER_STRATEGY_CONSTANTS.renderComponent.toLocaleLowerCase()}"] + ' not found'`, 'generate-client-runtime-in-dev').formatText}
    }
  });
}
    `;
  }
}
