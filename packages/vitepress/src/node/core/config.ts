import type {
  ConfigType,
  LoggingUserConfig,
  SiteDevToolsAnalysisUserConfig,
  SiteDevToolsUserConfig,
} from '#dep-types/utils';
import { VITEPRESS_LOG_GROUPS } from '#shared/log-groups';
import getLoggerInstance from '#shared/logger';
import {
  type LoggerConfig,
  normalizeLoggerConfig,
  setLoggerConfig,
} from '@docs-islands/utils/logger';
import type { DefaultTheme, UserConfig } from 'vitepress';
import { ensureVitepressViteConfig } from './integration-plugin';

const loggerInstance = getLoggerInstance();

export interface DocsIslandsSharedOptions {
  logging?: LoggingUserConfig;
  siteDevtools?: SiteDevToolsUserConfig;
}

export interface DocsIslandsResolvedUserConfig {
  logging?: LoggerConfig;
  siteDevtoolsEnabled: boolean;
}

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

export function warnIfUnsupportedNodeVersion(): void {
  if (checkNodeVersion(process.versions.node)) {
    return;
  }

  loggerInstance
    .getLoggerByGroup(VITEPRESS_LOG_GROUPS.configNodeVersion)
    .warn(
      `You are using Node.js ${process.versions.node}. ` +
        `@docs-islands/vitepress requires Node.js version 20.19+ or 22.12+. ` +
        `Please upgrade your Node.js version.`,
    );
}

export function resolveLoggingConfig(
  logging: LoggingUserConfig | undefined,
): LoggerConfig | undefined {
  return normalizeLoggerConfig(logging);
}

export function applyDocsIslandsUserConfig(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  options?: DocsIslandsSharedOptions,
): DocsIslandsResolvedUserConfig {
  const logging = resolveLoggingConfig(options?.logging);

  setLoggerConfig(logging);
  warnIfUnsupportedNodeVersion();

  const mergedSiteDevTools = mergeSiteDevToolsConfig(
    vitepressConfig.siteDevtools,
    options?.siteDevtools,
  );

  if (mergedSiteDevTools) {
    vitepressConfig.siteDevtools = mergedSiteDevTools;
  }

  return {
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
  viteConfig.define.__DOCS_ISLANDS_LOGGER_CONFIG__ = JSON.stringify(
    options.logging ?? null,
  );

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
