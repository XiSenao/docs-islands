import { REACT_HMR_EVENT_NAMES } from '#shared/constants';
import type { Rollup } from 'vite';
import type { RenderingIntegrationPlugin } from '../core/integration-plugin';
import { isMarkdownPageChunk } from '../plugins/shared';
import { createFrameworkComponentHmrPlugin } from '../plugins/vite-plugin-framework-component-hmr';
import { createFrameworkMarkdownHmrPlugin } from '../plugins/vite-plugin-framework-markdown-hmr';
import { createFrameworkSpaSyncPlugin } from '../plugins/vite-plugin-framework-spa-sync';
import { applySiteDebugOptionalDependencyFallbacks } from '../site-debug/optional-dependencies';
import { getSiteDebugVitePlugins } from '../site-debug/vite-plugin-site-debug';
import { registerReactBuildHooks } from './build-hooks';
import {
  applyReactUserConfig,
  type ReactResolvedUserConfig,
  type VitepressReactRenderingStrategiesOptions,
} from './config';
import {
  createReactIntegrationContext,
  type ReactIntegrationPluginContext,
} from './context';
import {
  createReactDependencyBootstrapPlugin,
  createReactVitePluginDelegates,
} from './dependencies';
import { REACT_FRAMEWORK } from './framework';
import { createReactFrameworkParser } from './parser';
import {
  REACT_COMPONENT_HMR_PLUGIN_NAME,
  REACT_MARKDOWN_HMR_PLUGIN_NAME,
  REACT_SITE_DEBUG_SOURCE_PLUGIN_NAME,
  REACT_SPA_SYNC_CHUNK_TRACKER_PLUGIN_NAME,
} from './plugin-names';
import { createReactDevPlugin } from './plugins/vite-plugin-react-dev';
import { createReactRenderPlugins } from './plugins/vite-plugin-react-render';

export function createReactRenderingIntegrationPlugin(
  options?: VitepressReactRenderingStrategiesOptions,
): RenderingIntegrationPlugin<ReactIntegrationPluginContext> {
  let resolvedUserConfig: ReactResolvedUserConfig = {
    siteDebugEnabled: false,
  };

  return {
    applyUserConfig(vitepressConfig) {
      resolvedUserConfig = applyReactUserConfig(vitepressConfig, options);
    },
    createContext(baseContext) {
      return createReactIntegrationContext(baseContext, resolvedUserConfig);
    },
    frameworkParsers(context) {
      return [createReactFrameworkParser(context)];
    },
    registerBuildHooks(context) {
      registerReactBuildHooks(context);
    },
    vitePlugins(context) {
      const {
        frameworkParserManager,
        renderController,
        resolution,
        siteConfig,
        vitepressConfig,
        siteDebug: { enabled: siteDebugEnabled },
      } = context;

      return [
        createReactDependencyBootstrapPlugin({
          onResolutionBaseResolved(resolutionBase) {
            applySiteDebugOptionalDependencyFallbacks(
              vitepressConfig,
              resolutionBase,
            );
          },
        }),
        ...createReactVitePluginDelegates(),
        ...createReactRenderPlugins(context),
        createReactDevPlugin(context),
        createFrameworkMarkdownHmrPlugin({
          framework: REACT_FRAMEWORK,
          frameworkParserManager,
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
        ...getSiteDebugVitePlugins({
          base: siteConfig.base,
          enabled: siteDebugEnabled,
          pluginName: REACT_SITE_DEBUG_SOURCE_PLUGIN_NAME,
        }),
      ];
    },
  };
}
