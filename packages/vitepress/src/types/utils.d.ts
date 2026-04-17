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
export type SiteDevToolsAnalysisProvider = 'doubao';
export type SiteDevToolsAnalysisDoubaoThinkingType = boolean;
export type SiteDevToolsAnalysisBuildReportCacheStrategy = 'exact' | 'fallback';

export interface SiteDevToolsAnalysisBuildReportsCacheOptions {
  /**
   * Directory for persisted AI reports cache.
   * Relative paths are resolved from the docs root.
   *
   * @default '.vitepress/cache/site-devtools-reports'
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
  strategy?: SiteDevToolsAnalysisBuildReportCacheStrategy;
}

export type SiteDevToolsAnalysisBuildReportsCacheConfig =
  | false
  | true
  | SiteDevToolsAnalysisBuildReportsCacheOptions;

export interface SiteDevToolsAnalysisProviderBaseConfig {
  /**
   * Maximum time to wait for a single analysis request, in milliseconds.
   *
   * When omitted, defaults to `Infinity` and does not enforce a local timeout.
   *
   * @default Infinity
   */
  timeoutMs?: number;
}

export interface SiteDevToolsAnalysisProviderInstanceBaseConfig
  extends SiteDevToolsAnalysisProviderBaseConfig {
  /**
   * Stable identifier used to reference this provider instance.
   */
  id: string;
  /**
   * Optional label shown in the debug console.
   */
  label?: string;
  /**
   * Marks this provider instance as the default for its provider group.
   */
  default?: boolean;
}

export interface SiteDevToolsAnalysisDoubaoConfig
  extends SiteDevToolsAnalysisProviderInstanceBaseConfig {
  /**
   * Volcengine Ark API key used for ChatCompletions requests.
   */
  apiKey?: string;
  /**
   * Base URL for the Ark API endpoint.
   */
  baseUrl?: string;
}

export interface SiteDevToolsAnalysisProviderRef {
  /**
   * Provider group used by this build-time AI report model.
   */
  provider: SiteDevToolsAnalysisProvider;
  /**
   * Optional provider instance id inside the provider group.
   *
   * When omitted, the provider group's default instance is used.
   */
  id?: string;
}

interface SiteDevToolsAnalysisBuildReportModelBaseConfig {
  /**
   * Stable identifier used to reference this build-time AI report model.
   */
  id: string;
  /**
   * Marks this model as the default build-time AI report model.
   */
  default?: boolean;
  /**
   * Optional label shown in the debug console for the generated report.
   */
  label?: string;
  /**
   * Provider instance used for this build-time AI report model.
   */
  providerRef: SiteDevToolsAnalysisProviderRef;
}

export interface SiteDevToolsAnalysisBuildReportDoubaoModelConfig
  extends SiteDevToolsAnalysisBuildReportModelBaseConfig {
  /**
   * Upper bound for generated output tokens in a single response.
   */
  maxTokens?: number;
  /**
   * Doubao model used for this build-time analysis model.
   */
  model: string;
  /**
   * Whether reasoning mode is enabled for this build-time analysis model.
   *
   * @default false
   */
  thinking?: SiteDevToolsAnalysisDoubaoThinkingType;
  /**
   * Sampling temperature for the generated analysis.
   * Lower values are more deterministic; higher values are more creative.
   */
  temperature?: number;
}

export type SiteDevToolsAnalysisBuildReportModelConfig =
  SiteDevToolsAnalysisBuildReportDoubaoModelConfig;

export interface SiteDevToolsAnalysisBuildReportsPageContext {
  /**
   * VitePress page route, e.g. '/guide/getting-started'.
   */
  routePath: string;
  /**
   * Absolute file path of the page source.
   */
  filePath: string;
}

export interface SiteDevToolsAnalysisBuildReportsResolvePageContext {
  /**
   * Current eligible VitePress page being evaluated.
   */
  page: SiteDevToolsAnalysisBuildReportsPageContext;
  /**
   * All configured build-time AI report models.
   */
  models: readonly SiteDevToolsAnalysisBuildReportModelConfig[];
}

export interface SiteDevToolsAnalysisBuildReportsPageOverride {
  /**
   * Page-local cache behavior override.
   * When omitted, the global buildReports.cache setting is reused.
   * When an object is returned, unspecified fields inherit from the global
   * buildReports.cache object.
   */
  cache?: SiteDevToolsAnalysisBuildReportsCacheConfig;
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
  /**
   * Build report model used for this page.
   *
   * When omitted, the global default build report model is used.
   */
  modelId?: string;
}

export interface SiteDevToolsAnalysisBuildReportsConfig {
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
  cache?: SiteDevToolsAnalysisBuildReportsCacheConfig;
  /**
   * Explicit analysis models to execute during build.
   * When omitted or empty, build-time AI report generation is skipped.
   */
  models?: SiteDevToolsAnalysisBuildReportModelConfig[];
  /**
   * Resolves whether a specific eligible page should generate a build report.
   *
   * - return `undefined`, `null`, or `false`: skip build report generation
   *   for this page.
   * - return an object: generate a page report using the returned local overrides.
   *
   * When omitted, all eligible pages generate reports with the global defaults.
   */
  resolvePage?: (
    context: SiteDevToolsAnalysisBuildReportsResolvePageContext,
  ) => false | null | undefined | SiteDevToolsAnalysisBuildReportsPageOverride;
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

export interface SiteDevToolsAnalysisUserConfig {
  /**
   * Build-time analysis report generation for the debug console UI.
   */
  buildReports?: SiteDevToolsAnalysisBuildReportsConfig;
  providers?: {
    doubao?: SiteDevToolsAnalysisDoubaoConfig[];
  };
}

export type SiteDevToolsAiProvider = SiteDevToolsAnalysisProvider;
export type SiteDevToolsAiDoubaoThinkingType =
  SiteDevToolsAnalysisDoubaoThinkingType;
export type SiteDevToolsAiProviderBaseConfig =
  SiteDevToolsAnalysisProviderBaseConfig;
export type SiteDevToolsAiProviderInstanceBaseConfig =
  SiteDevToolsAnalysisProviderInstanceBaseConfig;
export type SiteDevToolsAiDoubaoConfig = SiteDevToolsAnalysisDoubaoConfig;
export type SiteDevToolsAiProviderRef = SiteDevToolsAnalysisProviderRef;
export type SiteDevToolsAiBuildReportDoubaoModelConfig =
  SiteDevToolsAnalysisBuildReportDoubaoModelConfig;
export type SiteDevToolsAiBuildReportModelConfig =
  SiteDevToolsAnalysisBuildReportModelConfig;
export type SiteDevToolsAiBuildReportCacheStrategy =
  SiteDevToolsAnalysisBuildReportCacheStrategy;
export type SiteDevToolsAiBuildReportsCacheOptions =
  SiteDevToolsAnalysisBuildReportsCacheOptions;
export type SiteDevToolsAiBuildReportsCacheConfig =
  SiteDevToolsAnalysisBuildReportsCacheConfig;
export type SiteDevToolsAiBuildReportsPageContext =
  SiteDevToolsAnalysisBuildReportsPageContext;
export type SiteDevToolsAiBuildReportsResolvePageContext =
  SiteDevToolsAnalysisBuildReportsResolvePageContext;
export type SiteDevToolsAiBuildReportsPageOverride =
  SiteDevToolsAnalysisBuildReportsPageOverride;
export type SiteDevToolsAiBuildReportsConfig =
  SiteDevToolsAnalysisBuildReportsConfig;
export type SiteDevToolsAiUserConfig = SiteDevToolsAnalysisUserConfig;

export interface SiteDevToolsUserConfig {
  /**
   * Analysis integration for Site DevTools.
   */
  analysis?: SiteDevToolsAnalysisUserConfig;
}

export type LoggingVisibilityLevel = 'error' | 'warn' | 'info' | 'success';

export interface LoggingRuleUserConfig {
  enabled?: boolean;
  group?: string;
  /**
   * Stable unique identifier for this rule.
   *
   * When `logging.debug` is enabled, emitted logs surface the matched rule label
   * as `[rule:<label>]` before the message body so it is clear which rule won.
   */
  label: string;
  levels?: LoggingVisibilityLevel[];
  main?: string;
  message?: string;
}

export interface LoggingUserConfig {
  /**
   * Global debug gate for project-owned debug logs.
   *
   * When omitted, debug logs stay disabled.
   */
  debug?: boolean;
  levels?: LoggingVisibilityLevel[];
  rules?: LoggingRuleUserConfig[];
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
  siteDevtools: SiteDevToolsUserConfig;
  wrapBaseUrl: (path: string) => string;
}
