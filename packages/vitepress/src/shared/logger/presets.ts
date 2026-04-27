import type {
  LoggingPresetPlugin,
  LoggingPresetRuleUserConfig,
} from '#dep-types/utils';
import {
  CORE_RUNTIME_LOG_GROUPS,
  getFrameworkComponentManagerLogGroup,
  getFrameworkRenderStrategyLogGroup,
} from '@docs-islands/core/shared/constants/log-groups/runtime';
import { CORE_TRANSFORM_LOG_GROUPS } from '@docs-islands/core/shared/constants/log-groups/transform';
import { VITEPRESS_BUILD_LOG_GROUPS } from '../constants/log-groups/build';
import { VITEPRESS_CONFIG_LOG_GROUPS } from '../constants/log-groups/config';
import { VITEPRESS_HMR_LOG_GROUPS } from '../constants/log-groups/hmr';
import { VITEPRESS_PARSER_LOG_GROUPS } from '../constants/log-groups/parser';
import { VITEPRESS_PLUGIN_LOG_GROUPS } from '../constants/log-groups/plugin';
import { VITEPRESS_RESOLVER_LOG_GROUPS } from '../constants/log-groups/resolver';
import { VITEPRESS_RUNTIME_LOG_GROUPS } from '../constants/log-groups/runtime';
import { VITEPRESS_SITE_DEVTOOLS_LOG_GROUPS } from '../constants/log-groups/site-devtools';

const CORE_MAIN_NAME = '@docs-islands/core';
const VITEPRESS_MAIN_NAME = '@docs-islands/vitepress';

const createPresetPlugin = <
  TRules extends Record<string, LoggingPresetRuleUserConfig>,
>(
  rules: TRules,
): LoggingPresetPlugin => ({
  rules,
});

export const build: LoggingPresetPlugin = createPresetPlugin({
  browserBundle: {
    group: VITEPRESS_BUILD_LOG_GROUPS.frameworkBrowserBundle,
    main: VITEPRESS_MAIN_NAME,
  },
  finalize: {
    group: VITEPRESS_BUILD_LOG_GROUPS.frameworkBuildFinalize,
    main: VITEPRESS_MAIN_NAME,
  },
  mpaIntegration: {
    group: VITEPRESS_BUILD_LOG_GROUPS.frameworkMpaIntegration,
    main: VITEPRESS_MAIN_NAME,
  },
  sharedClientRuntimeMetafile: {
    group: VITEPRESS_BUILD_LOG_GROUPS.sharedClientRuntimeMetafile,
    main: VITEPRESS_MAIN_NAME,
  },
  ssrBundle: {
    group: VITEPRESS_BUILD_LOG_GROUPS.frameworkSsrBundle,
    main: VITEPRESS_MAIN_NAME,
  },
  ssrIntegration: {
    group: VITEPRESS_BUILD_LOG_GROUPS.frameworkBuildSsrIntegration,
    main: VITEPRESS_MAIN_NAME,
  },
  transformHtml: {
    group: VITEPRESS_BUILD_LOG_GROUPS.frameworkBuildTransformHtml,
    main: VITEPRESS_MAIN_NAME,
  },
});

export const config: LoggingPresetPlugin = createPresetPlugin({
  nodeVersion: {
    group: VITEPRESS_CONFIG_LOG_GROUPS.nodeVersion,
    main: VITEPRESS_MAIN_NAME,
  },
});

export const hmr: LoggingPresetPlugin = createPresetPlugin({
  markdownUpdate: {
    group: VITEPRESS_HMR_LOG_GROUPS.markdownUpdate,
    main: VITEPRESS_MAIN_NAME,
  },
  reactRuntimePrepare: {
    group: VITEPRESS_HMR_LOG_GROUPS.reactRuntimePrepare,
    main: VITEPRESS_MAIN_NAME,
  },
  reactSsrOnlyRender: {
    group: VITEPRESS_HMR_LOG_GROUPS.reactSsrOnlyRender,
    main: VITEPRESS_MAIN_NAME,
  },
  viteAfterUpdate: {
    group: VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdate,
    main: VITEPRESS_MAIN_NAME,
  },
  viteAfterUpdateRender: {
    group: VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdateRender,
    main: VITEPRESS_MAIN_NAME,
  },
});

export const parser: LoggingPresetPlugin = createPresetPlugin({
  framework: {
    group: VITEPRESS_PARSER_LOG_GROUPS.framework,
    main: VITEPRESS_MAIN_NAME,
  },
  react: {
    group: VITEPRESS_PARSER_LOG_GROUPS.react,
    main: VITEPRESS_MAIN_NAME,
  },
});

export const plugin: LoggingPresetPlugin = createPresetPlugin({
  renderingStrategies: {
    group: VITEPRESS_PLUGIN_LOG_GROUPS.renderingStrategies,
    main: VITEPRESS_MAIN_NAME,
  },
});

export const resolver: LoggingPresetPlugin = createPresetPlugin({
  inlinePage: {
    group: VITEPRESS_RESOLVER_LOG_GROUPS.inlinePage,
    main: VITEPRESS_MAIN_NAME,
  },
});

export const runtime: LoggingPresetPlugin = createPresetPlugin({
  coreReactComponentManager: {
    group: getFrameworkComponentManagerLogGroup('react'),
    main: CORE_MAIN_NAME,
  },
  coreReactRenderStrategy: {
    group: getFrameworkRenderStrategyLogGroup('react'),
    main: CORE_MAIN_NAME,
  },
  reactClientLoader: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactClientLoader,
    main: VITEPRESS_MAIN_NAME,
  },
  reactComponentManager: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactComponentManager,
    main: VITEPRESS_MAIN_NAME,
  },
  reactDevContentUpdated: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactDevContentUpdated,
    main: VITEPRESS_MAIN_NAME,
  },
  reactDevMountFallback: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactDevMountFallback,
    main: VITEPRESS_MAIN_NAME,
  },
  reactDevMountRender: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactDevMountRender,
    main: VITEPRESS_MAIN_NAME,
  },
  reactDevRender: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRender,
    main: VITEPRESS_MAIN_NAME,
  },
  reactDevRuntimeLoader: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRuntimeLoader,
    main: VITEPRESS_MAIN_NAME,
  },
  renderValidation: {
    group: CORE_RUNTIME_LOG_GROUPS.renderValidation,
    main: CORE_MAIN_NAME,
  },
});

export const siteDevtools: LoggingPresetPlugin = createPresetPlugin({
  aiBuildReports: {
    group: VITEPRESS_SITE_DEVTOOLS_LOG_GROUPS.aiBuildReports,
    main: VITEPRESS_MAIN_NAME,
  },
  aiServer: {
    group: VITEPRESS_SITE_DEVTOOLS_LOG_GROUPS.aiServer,
    main: VITEPRESS_MAIN_NAME,
  },
});

export const transform: LoggingPresetPlugin = createPresetPlugin({
  markdownComponentTags: {
    group: CORE_TRANSFORM_LOG_GROUPS.transformComponentTags,
    main: CORE_MAIN_NAME,
  },
  ssrContainerIntegration: {
    group: CORE_TRANSFORM_LOG_GROUPS.ssrContainerIntegration,
    main: CORE_MAIN_NAME,
  },
  ssrCssInjection: {
    group: CORE_TRANSFORM_LOG_GROUPS.ssrCssInjection,
    main: CORE_MAIN_NAME,
  },
});

const presets: {
  build: LoggingPresetPlugin;
  config: LoggingPresetPlugin;
  hmr: LoggingPresetPlugin;
  parser: LoggingPresetPlugin;
  plugin: LoggingPresetPlugin;
  resolver: LoggingPresetPlugin;
  runtime: LoggingPresetPlugin;
  siteDevtools: LoggingPresetPlugin;
  transform: LoggingPresetPlugin;
} = {
  build,
  config,
  hmr,
  parser,
  plugin,
  resolver,
  runtime,
  siteDevtools,
  transform,
};

export default presets;
