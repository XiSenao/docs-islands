// @ts-expect-error -- picomatch v4 does not ship TypeScript declarations.
import rawPicomatch from 'picomatch';
import { DEFAULT_RESOLVED_LEVELS, LOG_KIND_TO_LEVEL } from './constants/levels';
import {
  normalizeLoggerConfig,
  normalizeLoggerGroup,
  normalizeLoggerLevelsArray,
  normalizeLoggerMain,
} from './normalize';
import { DEFAULT_LOGGER_SCOPE_ID, normalizeLoggerScopeId } from './scope';
import type {
  LoggerConfig,
  LoggerContext,
  LoggerScopeId,
  LoggerVisibilityLevel,
  LogKind,
  NormalizedLoggerConfig,
  NormalizedLoggerRule,
  ResolvedLoggerContext,
} from './types';

const GLOB_PATTERN_RE = /[!()*+?[\]{}]/;

const picomatch = rawPicomatch as unknown as (
  pattern: string | readonly string[],
) => (value: string) => boolean;

const activeLoggerConfigRegistry = new Map<
  LoggerScopeId,
  NormalizedLoggerConfig | null
>();
const syncedRuntimeDefinedLoggerScopes = new Set<LoggerScopeId>();

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
  config: LoggerConfig | undefined,
): NormalizedLoggerConfig | null => {
  const normalizedConfig = normalizeLoggerConfig(config);

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

const getLoggerConfigRegistry = (): Map<
  LoggerScopeId,
  LoggerConfig | undefined
> => (globalThis.__DOCS_ISLANDS_LOGGER_CONFIG_REGISTRY__ ??= new Map());

const readRuntimeDefinedLoggerConfig = (
  scopeId?: LoggerScopeId,
): LoggerConfig | null | undefined => {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    return typeof __DOCS_ISLANDS_LOGGER_CONFIG__ === 'undefined'
      ? undefined
      : __DOCS_ISLANDS_LOGGER_CONFIG__;
  }

  if (
    typeof __DOCS_ISLANDS_LOGGER_SCOPE_ID__ === 'undefined' ||
    __DOCS_ISLANDS_LOGGER_SCOPE_ID__ !== normalizedScopeId
  ) {
    return undefined;
  }

  return typeof __DOCS_ISLANDS_LOGGER_CONFIG__ === 'undefined'
    ? undefined
    : __DOCS_ISLANDS_LOGGER_CONFIG__;
};

const applyLoggerConfigForScope = (
  scopeId: LoggerScopeId,
  config: LoggerConfig | null | undefined,
): void => {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);
  const normalizedConfig = normalizeLoggerConfig(config);

  activeLoggerConfigRegistry.set(
    normalizedScopeId,
    compileLoggerConfig(normalizedConfig),
  );
  getLoggerConfigRegistry().set(normalizedScopeId, normalizedConfig);

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__ = normalizedConfig;
  }
};

const hasLoggerConfigForScope = (scopeId?: LoggerScopeId): boolean => {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);
  const registry = getLoggerConfigRegistry();

  if (registry.has(normalizedScopeId)) {
    return true;
  }

  return (
    normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID &&
    globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__ !== undefined
  );
};

export const syncRuntimeDefinedLoggerConfig = (
  scopeId?: LoggerScopeId,
): void => {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  if (syncedRuntimeDefinedLoggerScopes.has(normalizedScopeId)) {
    return;
  }

  syncedRuntimeDefinedLoggerScopes.add(normalizedScopeId);

  if (getLoggerConfigRegistry().has(normalizedScopeId)) {
    return;
  }

  const runtimeDefinedLoggerConfig =
    readRuntimeDefinedLoggerConfig(normalizedScopeId);

  if (runtimeDefinedLoggerConfig === undefined) {
    return;
  }

  applyLoggerConfigForScope(normalizedScopeId, runtimeDefinedLoggerConfig);
};

const getNormalizedActiveLoggerConfig = (
  scopeId?: LoggerScopeId,
): NormalizedLoggerConfig | null => {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  syncRuntimeDefinedLoggerConfig(normalizedScopeId);

  if (activeLoggerConfigRegistry.has(normalizedScopeId)) {
    return activeLoggerConfigRegistry.get(normalizedScopeId) ?? null;
  }

  if (!hasLoggerConfigForScope(normalizedScopeId)) {
    return null;
  }

  const compiledLoggerConfig = compileLoggerConfig(
    getLoggerConfigForScope(normalizedScopeId),
  );

  activeLoggerConfigRegistry.set(normalizedScopeId, compiledLoggerConfig);
  return compiledLoggerConfig;
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
  const config = getNormalizedActiveLoggerConfig(scopeId);
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

export function getLoggerConfigForScope(
  scopeId: LoggerScopeId,
): LoggerConfig | undefined {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);
  const registry = getLoggerConfigRegistry();

  if (registry.has(normalizedScopeId)) {
    return registry.get(normalizedScopeId);
  }

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    return normalizeLoggerConfig(globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__);
  }

  return undefined;
}

export function setLoggerConfigForScope(
  scopeId: LoggerScopeId,
  config: LoggerConfig | null | undefined,
): void {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  syncedRuntimeDefinedLoggerScopes.add(normalizedScopeId);
  applyLoggerConfigForScope(normalizedScopeId, config);
}

export function resetLoggerConfigForScope(scopeId: LoggerScopeId): void {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  syncedRuntimeDefinedLoggerScopes.delete(normalizedScopeId);
  activeLoggerConfigRegistry.delete(normalizedScopeId);
  getLoggerConfigRegistry().delete(normalizedScopeId);

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    delete globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__;
  }
}

/**
 * Updates the logger config for the default logger scope.
 *
 * This is primarily useful for direct logger usage outside any
 * scope-controlled runtime such as `createDocsIslands()`.
 *
 * Pass `null` or `undefined` to clear the default-scope config.
 */
export function setLoggerConfig(config: LoggerConfig | null | undefined): void {
  setLoggerConfigForScope(DEFAULT_LOGGER_SCOPE_ID, config);
}

export function resetLoggerConfig(): void {
  resetLoggerConfigForScope(DEFAULT_LOGGER_SCOPE_ID);
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
