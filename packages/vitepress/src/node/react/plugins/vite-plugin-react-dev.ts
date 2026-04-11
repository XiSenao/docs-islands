import type { SSRUpdateData, SSRUpdateRenderData } from '#dep-types/ssr';
import {
  REACT_HMR_EVENT_NAMES,
  REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID,
  RENDER_STRATEGY_CONSTANTS,
} from '#shared/constants';
import { createRequire } from 'node:module';
import { join } from 'pathe';
import type { ModuleNode, PluginOption } from 'vite';
import { normalizePath } from 'vite';
import { collectCssModulesInSSR } from '../../plugins/shared';
import type { ReactIntegrationPluginContext } from '../context';
import { loadReactRuntimeDependencies } from '../dependencies';
import { REACT_FRAMEWORK } from '../framework';
import { REACT_DEV_RUNTIME_PLUGIN_NAME } from '../plugin-names';

export function createReactDevPlugin(
  context: ReactIntegrationPluginContext,
): PluginOption {
  const { renderController, resolution, siteConfig } = context;

  return {
    name: REACT_DEV_RUNTIME_PLUGIN_NAME,
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.ws.on(
        REACT_HMR_EVENT_NAMES.ssrRenderRequest,
        async (
          { pathname, data, updateType, requestId }: SSRUpdateData,
          client,
        ) => {
          const viteResolver = resolution.createRuntimeResolver({
            resolveId: server.pluginContainer.resolveId.bind(
              server.pluginContainer,
            ),
          });
          const markdownModuleId =
            await viteResolver.resolvePagePathToDocumentModuleId(pathname);
          const compilationContainer =
            await renderController.getCompilationContainerByMarkdownModuleId(
              REACT_FRAMEWORK,
              markdownModuleId,
            );

          const needCompile = compilationContainer.importsByLocalName.size > 0;

          if (!needCompile || !Array.isArray(data)) {
            return;
          }

          const { React, ReactDOMServer } =
            await loadReactRuntimeDependencies();

          const importsByLocalName = compilationContainer.importsByLocalName;
          const ssrOnlyComponentNames =
            compilationContainer.ssrOnlyComponentNames;
          const importedNameList: (string | null)[] = [];
          const ssrComponentsPromise: (
            | Promise<Record<string, string>>
            | Promise<ModuleNode | undefined>
            | undefined
          )[] = [];

          for (const preRenderComponent of data) {
            const { componentName } = preRenderComponent;
            const importInfo = importsByLocalName.get(componentName);
            if (!importInfo) {
              continue;
            }

            const { identifier, importedName } = importInfo;
            const isSsrOnlyComponent = ssrOnlyComponentNames.has(componentName);
            importedNameList.push(importedName, null);
            ssrComponentsPromise.push(
              server.ssrLoadModule(identifier),
              isSsrOnlyComponent
                ? server.moduleGraph.getModuleByUrl(identifier)
                : undefined,
            );
          }

          const ssrComponents = await Promise.all(ssrComponentsPromise);
          const ssrComponentsRenderData: SSRUpdateRenderData['data'] = [];

          for (let i = 0; i < ssrComponents.length; i += 2) {
            const ssrComponent = ssrComponents[i] as Record<string, string>;
            const ssrOnlyModuleGraph = ssrComponents[i + 1];
            let ssrOnlyCss: string[] = [];

            if (ssrOnlyModuleGraph) {
              ssrOnlyCss =
                collectCssModulesInSSR(
                  ssrOnlyModuleGraph as ModuleNode,
                  new Set(),
                  siteConfig.srcDir,
                ) || [];
            }

            const importedName = importedNameList[i] as string;
            const renderComponent = (
              importedName === 'default'
                ? ssrComponent.default
                : importedName === '*'
                  ? ssrComponent
                  : ssrComponent[importedName]
            ) as unknown;

            const { renderId, props } = data[i / 2];
            const wrapSSROnlyCss = ssrOnlyCss.map((css) =>
              join(siteConfig.base, css),
            );
            ssrComponentsRenderData.push({
              renderId,
              ssrOnlyCss: wrapSSROnlyCss,
              ssrHtml: ReactDOMServer.renderToString(
                React.createElement(renderComponent, props),
              ),
            });
          }

          const ssrUpdateRenderData: SSRUpdateRenderData = {
            pathname,
            requestId,
            data: ssrComponentsRenderData,
          };

          switch (updateType) {
            case 'mounted': {
              client.send(
                REACT_HMR_EVENT_NAMES.mountRender,
                ssrUpdateRenderData,
              );
              break;
            }
            case 'markdown-update': {
              client.send(
                REACT_HMR_EVENT_NAMES.markdownRender,
                ssrUpdateRenderData,
              );
              break;
            }
            case 'ssr-only-component-update': {
              client.send(
                REACT_HMR_EVENT_NAMES.ssrOnlyRender,
                ssrUpdateRenderData,
              );
              break;
            }
          }
        },
      );
    },
    resolveId: {
      order: 'pre',
      handler(id: string) {
        const normalized = normalizePath(id);

        if (normalized.includes(REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID)) {
          return normalized;
        }

        if (normalized === '@docs-islands/vitepress/internal/logger') {
          const __require = createRequire(import.meta.url);
          return __require.resolve('@docs-islands/vitepress/internal/logger');
        }

        return null;
      },
    },
    async load(id: string) {
      const normalized = normalizePath(id);

      if (!normalized.includes(REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID)) {
        return null;
      }

      const queryString = normalized.split('?')[1] || '';
      const queryStringIterator = queryString.split('&') || [];
      const queryItemString = queryStringIterator.find((queryItemString) =>
        queryItemString.startsWith(RENDER_STRATEGY_CONSTANTS.renderClientInDev),
      );

      if (!queryItemString) {
        return 'throw new Error("Invalid query string")';
      }

      const [key, queryPathname] = queryItemString.split('=');
      if (key !== RENDER_STRATEGY_CONSTANTS.renderClientInDev) {
        return 'throw new Error("Invalid query string")';
      }

      const viteResolver = resolution.createRuntimeResolver({
        resolveId: this.resolve.bind(this),
      });
      const markdownModuleId =
        await viteResolver.resolvePagePathToDocumentModuleId(queryPathname);

      return renderController.generateClientRuntimeInDEV(markdownModuleId);
    },
  };
}
