/// <reference lib="dom" />

/** Available log kinds. */
export type LogKind = 'info' | 'success' | 'warn' | 'error' | 'debug';

/** Available console methods. */
export type ConsoleMethod = 'log' | 'warn' | 'error' | 'debug';

/** User-facing allowlist for non-debug log APIs. */
export type LoggerVisibilityLevel = 'error' | 'warn' | 'info' | 'success';

export type LoggerScopeId = string;

export interface LoggerRule {
  enabled?: boolean;
  group?: string;
  label: string;
  levels?: LoggerVisibilityLevel[];
  main?: string;
  message?: string;
}

export interface LoggerConfig {
  debug?: boolean;
  levels?: LoggerVisibilityLevel[];
  rules?: LoggerRule[];
}

export interface DebugMessageOptions {
  context: string;
  decision: string;
  summary?: unknown;
  timingMs?: number | null;
}

export interface LoggerElapsedLogOptions {
  elapsedTimeMs: number;
}

export type LoggerLogOptions = LoggerElapsedLogOptions;

export interface CreateLoggerOptions {
  main: string;
}

export interface LightGeneralLoggerReturn {
  log: () => void;
}

export interface LoggerContext {
  group: string;
  kind: LogKind;
  main: string;
  message: string;
}

export interface NormalizedLoggerRule {
  enabled?: boolean;
  groupMatcher?: (value: string) => boolean;
  label: string;
  levels?: ReadonlySet<LoggerVisibilityLevel>;
  main?: string;
  messageMatcher?: (value: string) => boolean;
}

export interface NormalizedLoggerConfig {
  debug?: boolean;
  levels?: ReadonlySet<LoggerVisibilityLevel>;
  rules?: NormalizedLoggerRule[];
}

export interface ResolvedLoggerContext {
  appendElapsedTime: boolean;
  ruleLabels: string[];
  suppress: boolean;
}

declare global {
  // Runtime logger config is injected by consumers such as @docs-islands/vitepress.
  var __DOCS_ISLANDS_LOGGER_CONFIG__: LoggerConfig | null | undefined;
  var __DOCS_ISLANDS_LOGGER_CONFIG_REGISTRY__:
    | Map<LoggerScopeId, LoggerConfig | undefined>
    | undefined;

  var __DOCS_ISLANDS_LOGGER_SCOPE_ID__: LoggerScopeId | undefined;
}
