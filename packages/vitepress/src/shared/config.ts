import type {
  ConfigType,
  SiteDebugAnalysisBuildReportRunConfig,
  SiteDebugAnalysisUserConfig,
  SiteDebugUserConfig,
} from '#dep-types/utils';
import { getProjectRoot, slash } from '@docs-islands/utils/path';
import { join, resolve } from 'pathe';
import { normalizePath } from 'vite';
import type { DefaultTheme, UserConfig } from 'vitepress';

type SiteDebugBuildReportsInput = SiteDebugAnalysisUserConfig['buildReports'];

const normalizeBuildReportRuns = (
  buildReports: SiteDebugBuildReportsInput,
): SiteDebugAnalysisBuildReportRunConfig[] | undefined => {
  if (!buildReports) {
    return undefined;
  }

  const explicitRuns = Array.isArray(buildReports.runs)
    ? buildReports.runs
    : undefined;
  const legacyModels = Array.isArray(buildReports.models)
    ? buildReports.models
    : undefined;
  const normalizedRuns = explicitRuns ?? legacyModels;

  return normalizedRuns
    ? (normalizedRuns.filter(
        Boolean,
      ) as SiteDebugAnalysisBuildReportRunConfig[])
    : undefined;
};

const normalizeBuildReportsConfig = (
  buildReports: SiteDebugBuildReportsInput,
) =>
  !buildReports || buildReports.enabled === false
    ? undefined
    : ({
        cache: buildReports.cache ?? true,
        ...(buildReports.groupBy
          ? {
              groupBy: buildReports.groupBy,
            }
          : {}),
        includeChunks: buildReports.includeChunks ?? true,
        includeModules: buildReports.includeModules ?? true,
        ...(normalizeBuildReportRuns(buildReports)
          ? {
              runs: normalizeBuildReportRuns(buildReports),
            }
          : {}),
      } satisfies NonNullable<SiteDebugAnalysisUserConfig['buildReports']>);

const normalizeSiteDebugAnalysisConfig = (
  siteDebug: SiteDebugUserConfig | undefined,
): SiteDebugAnalysisUserConfig | undefined => {
  const analysisConfig = siteDebug?.analysis ?? siteDebug?.ai;

  if (!analysisConfig) {
    return undefined;
  }

  const normalizedAnalysis: SiteDebugAnalysisUserConfig = {};

  if (analysisConfig.providers) {
    normalizedAnalysis.providers = {
      ...analysisConfig.providers,
    };
  }

  const normalizedBuildReports = normalizeBuildReportsConfig(
    analysisConfig.buildReports,
  );

  if (normalizedBuildReports) {
    normalizedAnalysis.buildReports = normalizedBuildReports;
  }

  return normalizedAnalysis;
};

export const resolveConfig = (
  rawVitepressConfig: UserConfig<DefaultTheme.Config>,
): ConfigType => {
  const vitepressResolve = (root: string, file: string) =>
    normalizePath(resolve(root, `.vitepress`, file));
  const root = normalizePath(resolve(getProjectRoot()));
  const assetsDir = rawVitepressConfig.assetsDir
    ? slash(rawVitepressConfig.assetsDir).replaceAll(/^\.?\/|\/$/g, '')
    : 'assets';
  const mpa = rawVitepressConfig.mpa ?? false;
  const base = rawVitepressConfig.base
    ? rawVitepressConfig.base.replace(/([^/])$/, '$1/')
    : '/';
  const srcDir = normalizePath(resolve(root, rawVitepressConfig.srcDir || '.'));
  const publicDir = resolve(srcDir, 'public');
  const outDir = rawVitepressConfig.outDir
    ? normalizePath(resolve(root, rawVitepressConfig.outDir))
    : vitepressResolve(root, 'dist');
  const cacheDir = rawVitepressConfig.cacheDir
    ? normalizePath(resolve(root, rawVitepressConfig.cacheDir))
    : vitepressResolve(root, 'cache');
  const cleanUrls = rawVitepressConfig.cleanUrls ?? false;
  const normalizedSiteDebugAnalysis = normalizeSiteDebugAnalysisConfig(
    rawVitepressConfig.siteDebug,
  );
  const siteDebug: SiteDebugUserConfig = normalizedSiteDebugAnalysis
    ? {
        ai: normalizedSiteDebugAnalysis,
        analysis: normalizedSiteDebugAnalysis,
      }
    : {};

  const config: ConfigType = {
    root,
    outDir,
    base,
    srcDir,
    assetsDir,
    mpa,
    publicDir,
    cacheDir,
    cleanUrls,
    siteDebug,
    wrapBaseUrl: (path: string) => {
      return path.startsWith('http') ? path : join('/', base, path);
    },
  };

  return config;
};
