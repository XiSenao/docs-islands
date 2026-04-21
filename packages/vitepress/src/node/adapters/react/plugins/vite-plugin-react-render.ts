import type { PluginOption, Rollup } from 'vite';
import { REACT_RUNTIME_BUNDLING_PLUGIN_NAME } from '../../../constants/adapters/react/plugin-names';
import type { ReactIntegrationPluginContext } from '../context';
import { loadReactRuntimeDependencies } from '../dependencies';
import { isReactChunk, isReactClientChunk } from '../shared';

export function createReactRenderPlugins(
  context: ReactIntegrationPluginContext,
): PluginOption[] {
  const { siteConfig } = context;

  return [
    {
      name: REACT_RUNTIME_BUNDLING_PLUGIN_NAME,
      async config(config) {
        const { reactDomPackageVersion, reactPackageVersion } =
          await loadReactRuntimeDependencies();

        if (!config.define) config.define = {};
        if (!config.build) config.build = {};
        if (!config.build.rollupOptions) config.build.rollupOptions = {};
        if (!config.build.rollupOptions.output) {
          config.build.rollupOptions.output = {};
        }

        const originalChunkFileNames =
          (config.build.rollupOptions.output as Rollup.OutputOptions)
            .chunkFileNames || '[name].[hash].js';

        (
          config.build.rollupOptions.output as Rollup.OutputOptions
        ).chunkFileNames = function (chunkInfo) {
          if (isReactChunk(chunkInfo)) {
            return `${siteConfig.assetsDir}/chunks/react@${reactPackageVersion}.js`;
          }
          if (isReactClientChunk(chunkInfo)) {
            return `${siteConfig.assetsDir}/chunks/client@${reactDomPackageVersion}.js`;
          }
          return typeof originalChunkFileNames === 'function'
            ? originalChunkFileNames(chunkInfo)
            : originalChunkFileNames;
        };

        if (config.ssr) {
          if (Array.isArray(config.ssr.noExternal)) {
            config.ssr.noExternal.push('@docs-islands/vitepress');
          } else {
            config.ssr.noExternal = ['@docs-islands/vitepress'];
          }
        }

        return config;
      },
    },
  ];
}
