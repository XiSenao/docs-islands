// @ts-expect-error -- picomatch v4 does not ship TypeScript declarations.
import rawPicomatch from 'picomatch';
import {
  DEFAULT_RESOLVED_LEVELS,
  LOG_KIND_TO_LEVEL,
} from '../constants/levels';
import type {
  LoggerConfig,
  LoggerConfigRegistryEntry,
  LoggerContext,
  LoggerScopeId,
  LoggerVisibilityLevel,
  LogKind,
  NormalizedLoggerConfig,
  NormalizedLoggerRule,
  ResolvedLoggerContext,
} from '../types';
import {
  normalizeLoggerConfig,
  normalizeLoggerGroup,
  normalizeLoggerLevelsArray,
  normalizeLoggerMain,
} from './helper/normalize';
import {
  DEFAULT_LOGGER_SCOPE_ID,
  normalizeLoggerScopeId,
} from './helper/scope';

export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {};

const GLOB_PATTERN_RE = /[!()*+?[\]{}]/;

const picomatch = rawPicomatch as unknown as (
  pattern: string | readonly string[],
) => (value: string) => boolean;

let hasSyncedRuntimeDefinedDefaultLoggerConfig = false;

const CONTROLLED_SET_LOGGER_CONFIG_ERROR =
  '@docs-islands/logger is controlled by loggerPlugin.vite({ config }). setLoggerConfig(...) cannot be used in this runtime; update the loggerPlugin.vite({ config }) option in your bundler config instead.';
const createMissingScopedLoggerConfigError = (scopeId: LoggerScopeId): string =>
  `Logger config for scope "${scopeId}" is not registered in this runtime. Call setScopedLoggerConfig(scopeId, config) before creating a scoped logger.`;

declare const __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__: boolean | undefined;
declare const __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__:
  | LoggerConfig
  | null
  | undefined;

const createPatternMatcher = (
  pattern: string,
  mode: 'group' | 'message',
): ((value: string) => boolean) => {
  if (
    (mode === 'group' || mode === 'message') &&
    !GLOB_PATTERN_RE.test(pattern)
  ) {
    return (value) => value === pattern;
  }

  const matcher = picomatch(pattern);

  return (value) => matcher(value);
};

const compileLoggerRule = (
  rule: NonNullable<LoggerConfig['rules']>[number],
): NormalizedLoggerRule => ({
  ...(rule.enabled === undefined ? {} : { enabled: rule.enabled }),
  ...(rule.group
    ? { groupMatcher: createPatternMatcher(rule.group, 'group') }
    : {}),
  label: rule.label,
  ...(rule.levels === undefined
    ? {}
    : { levels: new Set(normalizeLoggerLevelsArray(rule.levels)) }),
  ...(rule.main ? { main: rule.main } : {}),
  ...(rule.message
    ? { messageMatcher: createPatternMatcher(rule.message, 'message') }
    : {}),
});

const compileLoggerConfig = (
  normalizedConfig: LoggerConfig | undefined,
): NormalizedLoggerConfig | null => {
  if (!normalizedConfig) {
    return null;
  }

  return {
    ...(normalizedConfig.debug === undefined
      ? {}
      : { debug: normalizedConfig.debug }),
    ...(normalizedConfig.levels
      ? {
          levels: new Set(normalizeLoggerLevelsArray(normalizedConfig.levels)),
        }
      : {}),
    ...(normalizedConfig.rules === undefined
      ? {}
      : {
          rules: normalizedConfig.rules.map((rule) => compileLoggerRule(rule)),
        }),
  };
};

const cloneLevels = (
  levels: ReadonlySet<LoggerVisibilityLevel>,
): Set<LoggerVisibilityLevel> => new Set(levels);

export const isLoggerControlled = (): boolean => {
  if (typeof __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__ === 'boolean') {
    return __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__ === true;
  }
  return false;
};

const getLoggerConfigRegistry = (): Map<
  LoggerScopeId,
  LoggerConfigRegistryEntry
> => {
  globalThis.__DOCS_ISLANDS_LOGGER_CONFIG_REGISTRY__ ??= new Map();
  return globalThis.__DOCS_ISLANDS_LOGGER_CONFIG_REGISTRY__;
};

const createLoggerConfigRegistryEntry = (
  config: LoggerConfig | null | undefined,
): LoggerConfigRegistryEntry => {
  const normalizedConfig = normalizeLoggerConfig(config);

  return {
    compiledConfig: compileLoggerConfig(normalizedConfig),
    config: normalizedConfig,
  };
};

const readDefaultRuntimeLoggerConfig = (): LoggerConfig | null | undefined => {
  if (typeof __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__ === 'object') {
    return __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__;
  }
  return undefined;
};

const applyScopedLoggerConfig = (
  scopeId: LoggerScopeId,
  config: LoggerConfig,
): void => {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  getLoggerConfigRegistry().set(
    normalizedScopeId,
    createLoggerConfigRegistryEntry(config),
  );
};

const syncRuntimeDefinedDefaultLoggerConfig = (): void => {
  const registry = getLoggerConfigRegistry();

  if (
    hasSyncedRuntimeDefinedDefaultLoggerConfig &&
    registry.has(DEFAULT_LOGGER_SCOPE_ID)
  ) {
    return;
  }

  if (registry.has(DEFAULT_LOGGER_SCOPE_ID)) {
    hasSyncedRuntimeDefinedDefaultLoggerConfig = true;
    return;
  }

  const runtimeDefinedDefaultLoggerConfig = readDefaultRuntimeLoggerConfig();

  hasSyncedRuntimeDefinedDefaultLoggerConfig = true;
  applyScopedLoggerConfig(
    DEFAULT_LOGGER_SCOPE_ID,
    runtimeDefinedDefaultLoggerConfig ?? DEFAULT_LOGGER_CONFIG,
  );
};

export const assertLoggerConfigRegisteredForScope = (
  scopeId?: LoggerScopeId,
): LoggerScopeId => {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    syncRuntimeDefinedDefaultLoggerConfig();
    return normalizedScopeId;
  }

  if (getLoggerConfigRegistry().has(normalizedScopeId)) {
    return normalizedScopeId;
  }

  throw new Error(createMissingScopedLoggerConfigError(normalizedScopeId));
};

const getCompiledLoggerConfigForScope = (
  scopeId?: LoggerScopeId,
): NormalizedLoggerConfig | null => {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    syncRuntimeDefinedDefaultLoggerConfig();
  }

  const registry = getLoggerConfigRegistry();

  if (!registry.has(normalizedScopeId)) {
    throw new Error(createMissingScopedLoggerConfigError(normalizedScopeId));
  }

  return registry.get(normalizedScopeId)?.compiledConfig ?? null;
};

const matchesLoggerRule = (
  rule: NormalizedLoggerRule,
  context: LoggerContext,
): boolean => {
  if (rule.main && rule.main !== context.main) {
    return false;
  }

  if (rule.groupMatcher && !rule.groupMatcher(context.group)) {
    return false;
  }

  if (rule.messageMatcher && !rule.messageMatcher(context.message)) {
    return false;
  }

  return true;
};

const getRuleEffectiveLevels = (
  rule: NormalizedLoggerRule,
  config: NormalizedLoggerConfig,
): ReadonlySet<LoggerVisibilityLevel> => {
  if (rule.levels !== undefined) {
    return rule.levels;
  }

  if (config.levels !== undefined) {
    return config.levels;
  }

  return DEFAULT_RESOLVED_LEVELS;
};

export const resolveLoggerContext = (
  context: LoggerContext,
  scopeId?: LoggerScopeId,
): ResolvedLoggerContext => {
  const config = getCompiledLoggerConfigForScope(scopeId);
  const baseEnabledLevels = config?.levels
    ? cloneLevels(config.levels)
    : cloneLevels(DEFAULT_RESOLVED_LEVELS);
  const baseDebugEnabled = config?.debug ?? false;
  const hasRules = config?.rules !== undefined;

  if (context.kind === 'debug') {
    return {
      appendElapsedTime: false,
      ruleLabels: [],
      suppress: hasRules || !baseDebugEnabled,
    };
  }

  const level = LOG_KIND_TO_LEVEL[context.kind];

  if (!hasRules) {
    return {
      appendElapsedTime: baseDebugEnabled,
      ruleLabels: [],
      suppress: !baseEnabledLevels.has(level),
    };
  }

  const matchedRules = (config.rules ?? [])
    .filter((rule) => rule.enabled !== false)
    .filter((rule) => matchesLoggerRule(rule, context));
  const contributingRules = matchedRules.filter((rule) =>
    getRuleEffectiveLevels(rule, config).has(level),
  );

  return {
    appendElapsedTime: baseDebugEnabled && contributingRules.length > 0,
    ruleLabels: baseDebugEnabled
      ? contributingRules.map((rule) => rule.label)
      : [],
    suppress: contributingRules.length === 0,
  };
};

export function getScopedLoggerConfig(
  scopeId: LoggerScopeId,
): LoggerConfig | undefined {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    syncRuntimeDefinedDefaultLoggerConfig();
  }

  const registry = getLoggerConfigRegistry();

  if (registry.has(normalizedScopeId)) {
    return registry.get(normalizedScopeId)?.config;
  }

  return undefined;
}

export function setScopedLoggerConfig(
  scopeId: LoggerScopeId,
  config: LoggerConfig,
): void {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    hasSyncedRuntimeDefinedDefaultLoggerConfig = true;
  }

  applyScopedLoggerConfig(normalizedScopeId, config);
}

export function resetScopedLoggerConfig(scopeId: LoggerScopeId): void {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    hasSyncedRuntimeDefinedDefaultLoggerConfig = false;
  }

  getLoggerConfigRegistry().delete(normalizedScopeId);
}

/**
 * Updates the logger config for the default logger scope.
 *
 * This is primarily useful for direct logger usage outside any
 * runtime with an injected logger scope such as `createDocsIslands()`.
 *
 */
export function setLoggerConfig(config: LoggerConfig): void {
  if (isLoggerControlled()) {
    throw new Error(CONTROLLED_SET_LOGGER_CONFIG_ERROR);
  }

  setScopedLoggerConfig(DEFAULT_LOGGER_SCOPE_ID, config);
}

export function resetLoggerConfig(): void {
  resetScopedLoggerConfig(DEFAULT_LOGGER_SCOPE_ID);
}

export function shouldSuppressLog(
  kind: LogKind,
  options: {
    group: string;
    main: string;
    message?: string;
  },
  scopeId?: LoggerScopeId,
): boolean {
  return resolveLoggerContext(
    {
      group: normalizeLoggerGroup(options.group),
      kind,
      main: normalizeLoggerMain(options.main),
      message: options.message ?? '',
    },
    scopeId,
  ).suppress;
}
