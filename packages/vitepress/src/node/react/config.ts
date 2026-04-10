import type {
  ConfigType,
  SiteDebugAnalysisUserConfig,
  SiteDebugUserConfig,
} from '#dep-types/utils';
import getLoggerInstance from '#shared/logger';
import type { DefaultTheme, UserConfig } from 'vitepress';
import { ensureVitepressViteConfig } from '../core/integration-plugin';

const loggerInstance = getLoggerInstance();

export interface VitepressReactRenderingStrategiesOptions {
  siteDebug?: SiteDebugUserConfig;
}

export interface ReactResolvedUserConfig {
  siteDebugEnabled: boolean;
}

const mergeSiteDebugAnalysisConfig = (
  base: SiteDebugAnalysisUserConfig | undefined,
  override: SiteDebugAnalysisUserConfig | undefined,
): SiteDebugAnalysisUserConfig | undefined => {
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

export const mergeSiteDebugConfig = (
  base: SiteDebugUserConfig | undefined,
  override: SiteDebugUserConfig | undefined,
): SiteDebugUserConfig | undefined => {
  if (!base && !override) {
    return undefined;
  }

  const mergedAnalysis = mergeSiteDebugAnalysisConfig(
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
    .getLoggerByGroup('@docs-islands/vitepress')
    .warn(
      `You are using Node.js ${process.versions.node}. ` +
        `@docs-islands/vitepress requires Node.js version 20.19+ or 22.12+. ` +
        `Please upgrade your Node.js version.`,
    );
}

export function applyReactUserConfig(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  options?: VitepressReactRenderingStrategiesOptions,
): ReactResolvedUserConfig {
  warnIfUnsupportedNodeVersion();

  const mergedSiteDebug = mergeSiteDebugConfig(
    vitepressConfig.siteDebug,
    options?.siteDebug,
  );

  if (mergedSiteDebug) {
    vitepressConfig.siteDebug = mergedSiteDebug;
  }

  return {
    siteDebugEnabled: mergedSiteDebug !== undefined,
  };
}

export function applyReactViteBaseConfig(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  siteConfig: ConfigType,
  options: ReactResolvedUserConfig,
): void {
  const viteConfig = ensureVitepressViteConfig(vitepressConfig);

  if (!viteConfig.define) {
    viteConfig.define = {};
  }

  viteConfig.define.__BASE__ = JSON.stringify(siteConfig.base);
  viteConfig.define.__CLEAN_URLS__ = JSON.stringify(siteConfig.cleanUrls);

  if (!options.siteDebugEnabled) {
    return;
  }

  if (!viteConfig.worker) {
    viteConfig.worker = {};
  }

  if (!viteConfig.worker.format) {
    // Site debug source preview uses module workers that may code-split during
    // downstream Vite builds. The default IIFE worker output breaks that build.
    viteConfig.worker.format = 'es';
  }
}
