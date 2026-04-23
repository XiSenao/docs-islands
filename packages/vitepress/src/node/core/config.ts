import type {
  ConfigType,
  LoggingUserConfig,
  SiteDevToolsAnalysisUserConfig,
  SiteDevToolsUserConfig,
} from '#dep-types/utils';
import { VITEPRESS_CONFIG_LOG_GROUPS } from '#shared/constants/log-groups/config';
import { createLogger } from '#shared/logger';
import type { LoggerScopeId } from '@docs-islands/logger/internal';
import {
  createElapsedLogOptions,
  setLoggerConfigForScope,
} from '@docs-islands/logger/internal';
import type { DefaultTheme, UserConfig } from 'vitepress';
import { ensureVitepressViteConfig } from './integration-plugin';
import { createLoggerScopeDefines } from './logger-scope';
import type { LoggerConfig } from './logging-config';
import { resolveLoggingConfig } from './logging-config';
import {
  createLoggerTreeShakingPlugin,
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
} from './vite-plugin-logger-tree-shaking';

const getConfigLogger = (scopeId: LoggerScopeId) =>
  createLogger(
    {
      main: '@docs-islands/vitepress',
    },
    scopeId,
  ).getLoggerByGroup(VITEPRESS_CONFIG_LOG_GROUPS.nodeVersion);

export interface DocsIslandsSharedOptions {
  logging?: LoggingUserConfig;
  siteDevtools?: SiteDevToolsUserConfig;
}

export interface DocsIslandsResolvedUserConfig {
  loggerScopeId: LoggerScopeId;
  logging?: LoggerConfig;
  siteDevtoolsEnabled: boolean;
}

export { resolveLoggingConfig } from './logging-config';

const mergeSiteDevToolsAnalysisConfig = (
  base: SiteDevToolsAnalysisUserConfig | undefined,
  override: SiteDevToolsAnalysisUserConfig | undefined,
): SiteDevToolsAnalysisUserConfig | undefined => {
  if (!base && !override) {
    return undefined;
  }

  const mergedProviders =
    base?.providers || override?.providers
      ? {
          ...base?.providers,
          ...override?.providers,
          ...(base?.providers?.doubao || override?.providers?.doubao
            ? {
                doubao: override?.providers?.doubao ?? base?.providers?.doubao,
              }
            : {}),
        }
      : undefined;

  const mergedBuildReports =
    base?.buildReports || override?.buildReports
      ? {
          ...base?.buildReports,
          ...override?.buildReports,
        }
      : undefined;

  return {
    ...base,
    ...override,
    ...(mergedProviders
      ? {
          providers: mergedProviders,
        }
      : {}),
    ...(mergedBuildReports
      ? {
          buildReports: mergedBuildReports,
        }
      : {}),
  };
};

export const mergeSiteDevToolsConfig = (
  base: SiteDevToolsUserConfig | undefined,
  override: SiteDevToolsUserConfig | undefined,
): SiteDevToolsUserConfig | undefined => {
  if (!base && !override) {
    return undefined;
  }

  const mergedAnalysis = mergeSiteDevToolsAnalysisConfig(
    base?.analysis,
    override?.analysis,
  );

  return {
    ...base,
    ...override,
    ...(mergedAnalysis
      ? {
          analysis: mergedAnalysis,
        }
      : {}),
  };
};

function checkNodeVersion(nodeVersion: string): boolean {
  const currentVersion = nodeVersion.split('.');
  const major = Number.parseInt(currentVersion[0], 10);
  const minor = Number.parseInt(currentVersion[1], 10);

  return (
    (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22
  );
}

function hasVitePluginNamed(
  plugins: NonNullable<UserConfig<DefaultTheme.Config>['vite']>['plugins'],
  name: string,
): boolean {
  if (!plugins) {
    return false;
  }

  for (const plugin of plugins) {
    if (Array.isArray(plugin)) {
      if (hasVitePluginNamed(plugin, name)) {
        return true;
      }
      continue;
    }

    if (
      plugin &&
      typeof plugin === 'object' &&
      'name' in plugin &&
      plugin.name === name
    ) {
      return true;
    }
  }

  return false;
}

export function warnIfUnsupportedNodeVersion(
  loggerScopeId: LoggerScopeId,
): void {
  const warningStartedAt = Date.now();

  if (checkNodeVersion(process.versions.node)) {
    return;
  }

  getConfigLogger(loggerScopeId).warn(
    `You are using Node.js ${process.versions.node}. ` +
      `@docs-islands/vitepress requires Node.js version 20.19+ or 22.12+. ` +
      `Please upgrade your Node.js version.`,
    createElapsedLogOptions(warningStartedAt, Date.now()),
  );
}

export function applyDocsIslandsUserConfig(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  loggerScopeId: LoggerScopeId,
  options?: DocsIslandsSharedOptions,
): DocsIslandsResolvedUserConfig {
  const logging = resolveLoggingConfig(options?.logging);

  setLoggerConfigForScope(loggerScopeId, logging);
  warnIfUnsupportedNodeVersion(loggerScopeId);

  const mergedSiteDevTools = mergeSiteDevToolsConfig(
    vitepressConfig.siteDevtools,
    options?.siteDevtools,
  );

  if (mergedSiteDevTools) {
    vitepressConfig.siteDevtools = mergedSiteDevTools;
  }

  return {
    loggerScopeId,
    logging,
    siteDevtoolsEnabled: mergedSiteDevTools !== undefined,
  };
}

export function applyDocsIslandsViteBaseConfig(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  siteConfig: ConfigType,
  options: DocsIslandsResolvedUserConfig,
): void {
  const viteConfig = ensureVitepressViteConfig(vitepressConfig);

  if (!viteConfig.define) {
    viteConfig.define = {};
  }

  viteConfig.define.__BASE__ = JSON.stringify(siteConfig.base);
  viteConfig.define.__CLEAN_URLS__ = JSON.stringify(siteConfig.cleanUrls);
  Object.assign(
    viteConfig.define,
    createLoggerScopeDefines(options.loggerScopeId, options.logging),
  );

  if (
    !hasVitePluginNamed(viteConfig.plugins, LOGGER_TREE_SHAKING_PLUGIN_NAME)
  ) {
    viteConfig.plugins!.push(
      createLoggerTreeShakingPlugin(options.loggerScopeId),
    );
  }

  if (!options.siteDevtoolsEnabled) {
    return;
  }

  if (!viteConfig.worker) {
    viteConfig.worker = {};
  }

  if (!viteConfig.worker.format) {
    // Site DevTools source preview uses module workers that may code-split during
    // downstream Vite builds. The default IIFE worker output breaks that build.
    viteConfig.worker.format = 'es';
  }
}
