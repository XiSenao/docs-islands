import picomatch from 'picomatch';
import { DEFAULT_RESOLVED_LEVELS, LOG_KIND_TO_LEVEL } from './constants/levels';
import {
  normalizeLoggerConfig,
  normalizeLoggerGroup,
  normalizeLoggerLevelsArray,
  normalizeLoggerMain,
} from './normalize';
import type {
  LoggerConfig,
  LoggerContext,
  LoggerVisibilityLevel,
  LogKind,
  NormalizedLoggerConfig,
  NormalizedLoggerRule,
  ResolvedLoggerContext,
} from './types';

const GLOB_PATTERN_RE = /[!()*+?[\]{}]/;

let activeLoggerConfig: NormalizedLoggerConfig | null = null;
let hasSyncedRuntimeDefinedLoggerConfig = false;

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

const readRuntimeDefinedLoggerConfig = (): LoggerConfig | null | undefined =>
  typeof __DOCS_ISLANDS_LOGGER_CONFIG__ === 'undefined'
    ? undefined
    : __DOCS_ISLANDS_LOGGER_CONFIG__;

const applyLoggerConfig = (config: LoggerConfig | null | undefined): void => {
  const normalizedConfig = normalizeLoggerConfig(config);

  activeLoggerConfig = compileLoggerConfig(normalizedConfig);
  globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__ = normalizedConfig;
};

export const syncRuntimeDefinedLoggerConfig = (): void => {
  if (hasSyncedRuntimeDefinedLoggerConfig) {
    return;
  }

  hasSyncedRuntimeDefinedLoggerConfig = true;

  const runtimeDefinedLoggerConfig = readRuntimeDefinedLoggerConfig();

  if (runtimeDefinedLoggerConfig === undefined) {
    return;
  }

  applyLoggerConfig(runtimeDefinedLoggerConfig);
};

const getNormalizedActiveLoggerConfig = (): NormalizedLoggerConfig | null => {
  syncRuntimeDefinedLoggerConfig();

  if (activeLoggerConfig) {
    return activeLoggerConfig;
  }

  if (globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__) {
    activeLoggerConfig = compileLoggerConfig(
      globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__,
    );
    return activeLoggerConfig;
  }

  return null;
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
): ResolvedLoggerContext => {
  const config = getNormalizedActiveLoggerConfig();
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
    getRuleEffectiveLevels(rule, config!).has(level),
  );

  return {
    appendElapsedTime: baseDebugEnabled && contributingRules.length > 0,
    ruleLabels: baseDebugEnabled
      ? contributingRules.map((rule) => rule.label)
      : [],
    suppress: contributingRules.length === 0,
  };
};

export function setLoggerConfig(config: LoggerConfig | null | undefined): void {
  hasSyncedRuntimeDefinedLoggerConfig = true;
  applyLoggerConfig(config);
}

export function resetLoggerConfig(): void {
  hasSyncedRuntimeDefinedLoggerConfig = false;
  activeLoggerConfig = null;
  delete globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__;
}

export function shouldSuppressLog(
  kind: LogKind,
  options: {
    group: string;
    main: string;
    message?: string;
  },
): boolean {
  return resolveLoggerContext({
    group: normalizeLoggerGroup(options.group),
    kind,
    main: normalizeLoggerMain(options.main),
    message: options.message ?? '',
  }).suppress;
}
