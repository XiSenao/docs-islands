export type SiteDebugAnalysisProvider = 'claude-code' | 'doubao';
export type SiteDebugAnalysisDoubaoThinkingType = 'enabled' | 'disabled';
export type SiteDebugAnalysisBuildReportSourceMode = 'read-only' | 'read-write';

export interface SiteDebugAnalysisProviderBaseConfig {
  /**
   * Explicitly enables or disables the provider.
   */
  enabled?: boolean;
  /**
   * Maximum time to wait for a single analysis request, in milliseconds.
   */
  timeoutMs?: number;
}

export interface SiteDebugAnalysisClaudeCodeConfig
  extends SiteDebugAnalysisProviderBaseConfig {
  /**
   * Claude Code CLI command name or absolute path.
   */
  command?: string;
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
   * Reasoning mode forwarded as `thinking.type` in the ChatCompletions request.
   */
  thinking?: SiteDebugAnalysisDoubaoThinkingType;
  /**
   * Sampling temperature for the generated analysis.
   * Lower values are more deterministic; higher values are more creative.
   */
  temperature?: number;
}

interface SiteDebugAnalysisBuildReportRunBaseConfig {
  /**
   * Optional label shown in the debug console for the generated report.
   */
  label?: string;
  /**
   * Provider used for this build-time AI report.
   */
  provider: SiteDebugAnalysisProvider;
}

export interface SiteDebugAnalysisBuildReportClaudeCodeRunConfig
  extends SiteDebugAnalysisBuildReportRunBaseConfig {
  provider: 'claude-code';
}

export interface SiteDebugAnalysisBuildReportDoubaoRunConfig
  extends SiteDebugAnalysisBuildReportRunBaseConfig {
  /**
   * Doubao model used for this build-time analysis run.
   */
  model: string;
  provider: 'doubao';
  /**
   * Optional reasoning mode override for this build-time analysis run.
   */
  thinking?: SiteDebugAnalysisDoubaoThinkingType;
}

export type SiteDebugAnalysisBuildReportRunConfig =
  | SiteDebugAnalysisBuildReportClaudeCodeRunConfig
  | SiteDebugAnalysisBuildReportDoubaoRunConfig;

export interface SiteDebugAnalysisBuildReportsConfig {
  /**
   * Legacy compatibility flag for enabling build-time analysis reports.
   * Prefer omitting `buildReports` entirely to disable the feature.
   */
  enabled?: boolean;
  /**
   * Reuses cached build-time reports when the provider config and artifact input are unchanged.
   * Defaults to `true`. Set to `false` to regenerate reports on every build.
   */
  cache?: boolean;
  /**
   * Optional git-tracked directory used as the canonical source of saved
   * build-time AI reports. Relative paths are resolved from the docs root.
   */
  sourceDir?: string;
  /**
   * Controls whether the build only reads committed reports or is also allowed
   * to generate missing reports and write them back to `sourceDir`.
   *
   * Defaults to `read-only` when `sourceDir` is provided.
   */
  sourceMode?: SiteDebugAnalysisBuildReportSourceMode;
  /**
   * Explicit analysis runs to execute during build.
   * When omitted, configured provider defaults are used.
   */
  runs?: SiteDebugAnalysisBuildReportRunConfig[];
  /**
   * Legacy alias for `runs`.
   */
  models?: SiteDebugAnalysisBuildReportRunConfig[];
  /**
   * Controls whether build-time AI prompts are generated per artifact or per page.
   * When set to `page`, one page-level report is generated and associated with
   * every chunk/module artifact on that page.
   */
  groupBy?: 'artifact' | 'page';
  /**
   * Includes chunk resource reports in the build output.
   */
  includeChunks?: boolean;
  /**
   * Includes module source reports in the build output.
   */
  includeModules?: boolean;
}

export interface SiteDebugAnalysisUserConfig {
  /**
   * Build-time analysis report generation for the debug console UI.
   */
  buildReports?: SiteDebugAnalysisBuildReportsConfig;
  providers?: {
    claudeCode?: SiteDebugAnalysisClaudeCodeConfig;
    doubao?: SiteDebugAnalysisDoubaoConfig;
  };
}

export type SiteDebugAiProvider = SiteDebugAnalysisProvider;
export type SiteDebugAiDoubaoThinkingType = SiteDebugAnalysisDoubaoThinkingType;
export type SiteDebugAiProviderBaseConfig = SiteDebugAnalysisProviderBaseConfig;
export type SiteDebugAiClaudeCodeConfig = SiteDebugAnalysisClaudeCodeConfig;
export type SiteDebugAiDoubaoConfig = SiteDebugAnalysisDoubaoConfig;
export type SiteDebugAiBuildReportClaudeCodeModelConfig =
  SiteDebugAnalysisBuildReportClaudeCodeRunConfig;
export type SiteDebugAiBuildReportDoubaoModelConfig =
  SiteDebugAnalysisBuildReportDoubaoRunConfig;
export type SiteDebugAiBuildReportModelConfig =
  SiteDebugAnalysisBuildReportRunConfig;
export type SiteDebugAiBuildReportsConfig = SiteDebugAnalysisBuildReportsConfig;
export type SiteDebugAiUserConfig = SiteDebugAnalysisUserConfig;

export interface SiteDebugUserConfig {
  /**
   * Analysis integration for the site debug console.
   */
  analysis?: SiteDebugAnalysisUserConfig;
  /**
   * Legacy alias for `analysis`.
   */
  ai?: SiteDebugAiUserConfig;
}

declare module 'vitepress' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- must match upstream VitePress generic default for declaration merging
  interface UserConfig<ThemeConfig = any> {
    themeConfig?: ThemeConfig;
    siteDebug?: SiteDebugUserConfig;
  }
}
