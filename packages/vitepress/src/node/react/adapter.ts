import {
  ALLOWED_RENDER_DIRECTIVES,
  DIRNAME_VAR_NAME,
  NEED_PRE_RENDER_DIRECTIVES,
  RENDER_STRATEGY_CONSTANTS,
} from '@docs-islands/vitepress-shared/constants';
import type { ConfigType } from '@docs-islands/vitepress-types';
import reactPlugin from '@vitejs/plugin-react-swc';
import { dirname } from 'pathe';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import type { Plugin, PluginOption } from 'vite';
import type {
  FrameworkAdapter,
  FrameworkAdapterConstants,
} from '../core/framework-adapter';
import type { RenderController } from '../core/render-controller';

export class ReactAdapter implements FrameworkAdapter {
  public readonly name = 'react';

  public readonly constants: FrameworkAdapterConstants = {
    attr: {
      renderId: RENDER_STRATEGY_CONSTANTS.renderId,
      renderDirective: RENDER_STRATEGY_CONSTANTS.renderDirective,
      renderComponent: RENDER_STRATEGY_CONSTANTS.renderComponent,
      renderWithSpaSync: RENDER_STRATEGY_CONSTANTS.renderWithSpaSync,
    },
    windowKeys: {
      injectComponent: RENDER_STRATEGY_CONSTANTS.injectComponent,
      componentManager: RENDER_STRATEGY_CONSTANTS.componentManager,
      pageMetafile: RENDER_STRATEGY_CONSTANTS.pageMetafile,
    },
    allowedDirectives: ALLOWED_RENDER_DIRECTIVES,
    needPreRenderDirectives: NEED_PRE_RENDER_DIRECTIVES,
  };

  browserBundlerPlugins(): Plugin[] {
    const plugins: PluginOption[] = [
      reactPlugin(),
      this.externalizeRuntimePlugin(),
    ];
    return plugins.filter((plugin): plugin is Plugin => Boolean(plugin));
  }

  ssrBundlerPlugins(): Plugin[] {
    const plugins: PluginOption[] = [
      reactPlugin(),
      {
        name: 'vite-plugin-dirname-var-injection',
        enforce: 'post',
        transform: {
          order: 'post',
          handler(code: string, id: string) {
            if (code.includes(DIRNAME_VAR_NAME)) {
              return code.replaceAll(DIRNAME_VAR_NAME, `"${dirname(id)}"`);
            }
            return code;
          },
        },
      },
    ];
    return plugins.filter((plugin): plugin is Plugin => Boolean(plugin));
  }

  clientEntryModule(): string {
    return '@docs-islands/vitepress/react/client';
  }

  async generateDevRuntime(
    pathname: string,
    cfg: ConfigType,
    rc: RenderController,
  ): Promise<string> {
    const resolveId = `${cfg.base}/${cfg.srcDir}/${pathname}.md`.replaceAll(
      '\\',
      '/',
    );
    const compilationContainer =
      await rc.getCompilationContainerByMarkdownModuleId(resolveId);
    if (compilationContainer.importsByLocalName.size === 0) {
      return '';
    }
    const code = `
      ${compilationContainer.code}
  
      ${compilationContainer.helperCode}
    `;
    return `
import { createRoot as __react_client_render__, hydrateRoot as __react_hydrate__ } from 'react-dom/client';
import { startTransition as __react_start_transition__ } from 'react';

${code}

const targetDoms = document.querySelectorAll('[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}]');
if (targetDoms.length > 0) {
  targetDoms.forEach(dom => {
    const attributes = dom.getAttributeNames();
    const props: Record<string, string> = {} as Record<string, string>;
    attributes.forEach((key) => {
      props[key] = dom.getAttribute(key) as string;
    });
    const __REACT_COMPONENT__ = ${RENDER_STRATEGY_CONSTANTS.reactInlineComponentReference}[props["${RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase()}"]]["component"];
    if (__REACT_COMPONENT__) {
      if (props["${RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase()}"] === 'client:only') {
        __react_start_transition__(() => {
          __react_client_render__(dom).render(window.React.createElement(__REACT_COMPONENT__, props));
        });
      } else if (props["${RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase()}"] !== 'ssr:only') {
        __react_start_transition__(() => {
          __react_hydrate__(dom, window.React.createElement(__REACT_COMPONENT__, props));
        });
      }
    } else {
      throw new Error('Component '+ props["${RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase()}"] + ' not found');  
    }
  });
}
    `;
  }

  renderToString(
    component: React.ComponentType<Record<string, string>>,
    props: Record<string, string>,
  ): string {
    const Component = component;
    return ReactDOMServer.renderToString(React.createElement(Component, props));
  }

  externalizeRuntimePlugin(): Plugin {
    return {
      name: 'vite-plugin-react-external-runtime',
      enforce: 'pre',
      resolveId(id) {
        if (['react', 'react-dom'].includes(id)) {
          return `\0${id}.cjs`;
        }
        return null;
      },
      load(id) {
        if (id === '\0react.cjs') {
          return `module.exports = window.React;`;
        }
        if (id === '\0react-dom.cjs') {
          return `module.exports = window.ReactDOM;`;
        }
        return null;
      },
    };
  }
}

export const reactAdapter: ReactAdapter = new ReactAdapter();
