import { version as reactPackageVersion } from 'react';
import { version as reactDomPackageVersion } from 'react-dom';
import type { PluginOption, Rollup } from 'vite';
import type { ReactIntegrationPluginContext } from '../context';
import { REACT_RUNTIME_BUNDLING_PLUGIN_NAME } from '../plugin-names';
import { isReactChunk, isReactClientChunk } from '../shared';

export function createReactRenderPlugins(
  context: ReactIntegrationPluginContext,
): PluginOption[] {
  const { siteConfig } = context;

  return [
    {
      name: REACT_RUNTIME_BUNDLING_PLUGIN_NAME,
      config(config) {
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
