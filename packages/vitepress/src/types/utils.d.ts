/**
 * Configuration and utility types
 */

export type ConsoleThemeValue =
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'redBright';

export interface PrintOptions {
  theme?: ConsoleThemeValue;
  bold?: boolean;
}

/**
 * Build-time analysis providers.
 */
export type SiteDebugAnalysisProvider = 'doubao';
export type SiteDebugAnalysisDoubaoThinkingType = boolean;
export type SiteDebugAnalysisBuildReportCacheStrategy = 'exact' | 'fallback';

export interface SiteDebugAnalysisBuildReportsCacheOptions {
  /**
   * Directory for persisted AI reports cache.
   * Relative paths are resolved from the docs root.
   *
   * @default '.vitepress/cache/site-debug-reports'
   */
  dir?: string;
  /**
   * Cache lookup strategy.
   *
   * - 'exact': require a cacheKey match; regenerate on miss.
   * - 'fallback': reuse any cached report for the same target if present;
   *   regenerate only when no cached report exists.
   *
   * @default 'exact'
   */
  strategy?: SiteDebugAnalysisBuildReportCacheStrategy;
}

export type SiteDebugAnalysisBuildReportsCacheConfig =
  | false
  | true
  | SiteDebugAnalysisBuildReportsCacheOptions;

export interface SiteDebugAnalysisProviderBaseConfig {
  /**
   * Maximum time to wait for a single analysis request, in milliseconds.
   *
   * When omitted, defaults to `Infinity` and does not enforce a local timeout.
   *
   * @default Infinity
   */
  timeoutMs?: number;
}

export interface SiteDebugAnalysisDoubaoConfig
  extends SiteDebugAnalysisProviderBaseConfig {
  /**
   * Volcengine Ark API key used for ChatCompletions requests.
   */
  apiKey?: string;
  /**
   * Base URL for the Ark API endpoint.
   */
  baseUrl?: string;
  /**
   * Upper bound for generated output tokens in a single response.
   */
  maxTokens?: number;
  /**
   * Model identifier passed to the ChatCompletions API.
   */
  model?: string;
  /**
   * Whether reasoning mode is enabled for the ChatCompletions request.
   *
   * @default false
   */
  thinking?: SiteDebugAnalysisDoubaoThinkingType;
  /**
   * Sampling temperature for the generated analysis.
   * Lower values are more deterministic; higher values are more creative.
   */
  temperature?: number;
}

interface SiteDebugAnalysisBuildReportModelBaseConfig {
  /**
   * Optional label shown in the debug console for the generated report.
   */
  label?: string;
  /**
   * Provider used for this build-time AI report.
   */
  provider: SiteDebugAnalysisProvider;
}

export interface SiteDebugAnalysisBuildReportDoubaoModelConfig
  extends SiteDebugAnalysisBuildReportModelBaseConfig {
  /**
   * Doubao model used for this build-time analysis model.
   */
  model: string;
  provider: 'doubao';
  /**
   * Whether reasoning mode is enabled for this build-time analysis model.
   *
   * @default false
   */
  thinking?: SiteDebugAnalysisDoubaoThinkingType;
}

export type SiteDebugAnalysisBuildReportModelConfig =
  SiteDebugAnalysisBuildReportDoubaoModelConfig;

export interface SiteDebugAnalysisBuildReportsPageContext {
  /**
   * VitePress page route, e.g. '/guide/getting-started'.
   */
  routePath: string;
  /**
   * Absolute file path of the page source.
   */
  filePath: string;
}

export interface SiteDebugAnalysisBuildReportsPageOverride {
  /**
   * Page-local cache behavior override.
   * When omitted, the global buildReports.cache setting is reused.
   */
  cache?: SiteDebugAnalysisBuildReportsCacheConfig;
  /**
   * Page-local chunk detail override.
   * When omitted, the global buildReports.includeChunks setting is reused.
   */
  includeChunks?: boolean;
  /**
   * Page-local module detail override.
   * When omitted, the global buildReports.includeModules setting is reused.
   */
  includeModules?: boolean;
}

export interface SiteDebugAnalysisBuildReportsConfig {
  /**
   * Build-time AI report cache behavior.
   *
   * When omitted, defaults to `true`.
   *
   * - false: always regenerate reports during build.
   * - true: persist and reuse cached reports with default options.
   * - object: persist and reuse cached reports with custom options.
   *
   * @default true
   */
  cache?: SiteDebugAnalysisBuildReportsCacheConfig;
  /**
   * Explicit analysis models to execute during build.
   * When omitted or empty, build-time AI report generation is skipped.
   */
  models?: SiteDebugAnalysisBuildReportModelConfig[];
  /**
   * Resolves whether a specific eligible page should generate a build report.
   *
   * - return `false`: skip build report generation for this page.
   * - return an object: generate a page report using the returned local overrides.
   *
   * When omitted, all eligible pages generate reports with the global defaults.
   */
  resolvePage?: (
    page: SiteDebugAnalysisBuildReportsPageContext,
  ) => false | SiteDebugAnalysisBuildReportsPageOverride;
  /**
   * Includes chunk resource reports in the build output.
   *
   * @default false
   */
  includeChunks?: boolean;
  /**
   * Includes module source reports in the build output.
   *
   * @default false
   */
  includeModules?: boolean;
}

export interface SiteDebugAnalysisUserConfig {
  /**
   * Build-time analysis report generation for the debug console UI.
   */
  buildReports?: SiteDebugAnalysisBuildReportsConfig;
  providers?: {
    doubao?: SiteDebugAnalysisDoubaoConfig;
  };
}

export type SiteDebugAiProvider = SiteDebugAnalysisProvider;
export type SiteDebugAiDoubaoThinkingType = SiteDebugAnalysisDoubaoThinkingType;
export type SiteDebugAiProviderBaseConfig = SiteDebugAnalysisProviderBaseConfig;
export type SiteDebugAiDoubaoConfig = SiteDebugAnalysisDoubaoConfig;
export type SiteDebugAiBuildReportDoubaoModelConfig =
  SiteDebugAnalysisBuildReportDoubaoModelConfig;
export type SiteDebugAiBuildReportModelConfig =
  SiteDebugAnalysisBuildReportModelConfig;
export type SiteDebugAiBuildReportCacheStrategy =
  SiteDebugAnalysisBuildReportCacheStrategy;
export type SiteDebugAiBuildReportsCacheOptions =
  SiteDebugAnalysisBuildReportsCacheOptions;
export type SiteDebugAiBuildReportsCacheConfig =
  SiteDebugAnalysisBuildReportsCacheConfig;
export type SiteDebugAiBuildReportsPageContext =
  SiteDebugAnalysisBuildReportsPageContext;
export type SiteDebugAiBuildReportsPageOverride =
  SiteDebugAnalysisBuildReportsPageOverride;
export type SiteDebugAiBuildReportsConfig = SiteDebugAnalysisBuildReportsConfig;
export type SiteDebugAiUserConfig = SiteDebugAnalysisUserConfig;

export interface SiteDebugUserConfig {
  /**
   * Analysis integration for the site debug console.
   */
  analysis?: SiteDebugAnalysisUserConfig;
}

export interface ConfigType {
  root: string;
  outDir: string;
  base: string;
  srcDir: string;
  assetsDir: string;
  mpa: boolean;
  publicDir: string;
  cacheDir: string;
  cleanUrls: boolean;
  siteDebug: SiteDebugUserConfig;
  wrapBaseUrl: (path: string) => string;
}
