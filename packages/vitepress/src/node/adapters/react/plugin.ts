import { REACT_HMR_EVENT_NAMES } from '#shared/constants/react-hmr';
import type { Rollup } from 'vite';
import { REACT_FRAMEWORK } from '../../constants/adapters/react/framework';
import {
  REACT_COMPONENT_HMR_PLUGIN_NAME,
  REACT_MARKDOWN_HMR_PLUGIN_NAME,
  REACT_SPA_SYNC_CHUNK_TRACKER_PLUGIN_NAME,
} from '../../constants/adapters/react/plugin-names';
import type { DocsIslandsResolvedUserConfig } from '../../core/config';
import type { RenderingIntegrationPlugin } from '../../core/integration-plugin';
import { isMarkdownPageChunk } from '../../plugins/shared';
import { createFrameworkComponentHmrPlugin } from '../../plugins/vite-plugin-framework-component-hmr';
import { createFrameworkMarkdownHmrPlugin } from '../../plugins/vite-plugin-framework-markdown-hmr';
import { createFrameworkSpaSyncPlugin } from '../../plugins/vite-plugin-framework-spa-sync';
import { registerReactBuildHooks } from './build-hooks';
import {
  createReactIntegrationContext,
  type ReactIntegrationPluginContext,
} from './context';
import {
  createReactDependencyBootstrapPlugin,
  createReactVitePluginDelegates,
} from './dependencies';
import { createReactFrameworkParser } from './parser';
import { createReactDevPlugin } from './plugins/vite-plugin-react-dev';
import { createReactRenderPlugins } from './plugins/vite-plugin-react-render';

export function createReactRenderingIntegrationPlugin(
  resolvedUserConfig: DocsIslandsResolvedUserConfig,
): RenderingIntegrationPlugin<ReactIntegrationPluginContext> {
  return {
    createContext(baseContext) {
      return createReactIntegrationContext(baseContext, resolvedUserConfig);
    },
    frameworkParsers(context) {
      return [createReactFrameworkParser(context)];
    },
    loggerScopeId: resolvedUserConfig.loggerScopeId,
    registerBuildHooks(context) {
      registerReactBuildHooks(context);
    },
    vitePlugins(context) {
      const {
        frameworkParserManager,
        loggerScopeId,
        renderController,
        resolution,
        siteConfig,
      } = context;

      return [
        createReactDependencyBootstrapPlugin(),
        ...createReactVitePluginDelegates(),
        ...createReactRenderPlugins(context),
        createReactDevPlugin(context),
        createFrameworkMarkdownHmrPlugin({
          framework: REACT_FRAMEWORK,
          frameworkParserManager,
          loggerScopeId,
          name: REACT_MARKDOWN_HMR_PLUGIN_NAME,
          renderController,
          resolution,
          siteConfig,
          wsEvent: REACT_HMR_EVENT_NAMES.markdownPrepare,
        }),
        createFrameworkComponentHmrPlugin({
          fastRefreshEvent: REACT_HMR_EVENT_NAMES.fastRefreshPrepare,
          framework: REACT_FRAMEWORK,
          name: REACT_COMPONENT_HMR_PLUGIN_NAME,
          renderController,
          resolution,
          siteConfig,
          ssrOnlyEvent: REACT_HMR_EVENT_NAMES.ssrOnlyPrepare,
        }),
        createFrameworkSpaSyncPlugin({
          framework: REACT_FRAMEWORK,
          isTrackedChunk(
            name,
            chunk,
          ): chunk is Rollup.OutputChunk & { facadeModuleId: string } {
            return !name.endsWith('-lean') && isMarkdownPageChunk(chunk);
          },
          name: REACT_SPA_SYNC_CHUNK_TRACKER_PLUGIN_NAME,
          renderController,
        }),
      ];
    },
  };
}
