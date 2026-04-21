import { ROOT_LOGGER_RULE_LABEL } from './constants/levels';
import type { LoggerConfig, LoggerRule, LoggerVisibilityLevel } from './types';

const GROUP_NAME_RE =
  /^[\da-z]+(?:[_-][\da-z]+)*(?:\.[\da-z]+(?:[_-][\da-z]+)*)*$/;

export const normalizeLoggerMain = (main: string): string => {
  const normalizedMain = main.trim();

  if (!normalizedMain) {
    throw new Error('Logger main must be a non-empty package name.');
  }

  return normalizedMain;
};

export const normalizeLoggerGroup = (group: string): string => {
  const normalizedGroup = group.trim();

  if (!normalizedGroup) {
    throw new Error('Logger group must be a non-empty string.');
  }

  if (
    !GROUP_NAME_RE.test(normalizedGroup) ||
    normalizedGroup.includes('@') ||
    normalizedGroup.includes(':')
  ) {
    throw new Error(
      `Logger group "${normalizedGroup}" must use lowercase dot namespaces without package identifiers.`,
    );
  }

  return normalizedGroup;
};

const normalizeStringValue = (
  value: string | undefined,
): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue || undefined;
};

const normalizeLoggerRuleLabel = (label: string | undefined): string => {
  const normalizedLabel = normalizeStringValue(label);

  if (!normalizedLabel) {
    throw new Error('Every logger rule must provide a non-empty label.');
  }

  if (normalizedLabel === ROOT_LOGGER_RULE_LABEL) {
    throw new Error(
      `Logger rule label "${ROOT_LOGGER_RULE_LABEL}" is reserved for the root logging baseline.`,
    );
  }

  return normalizedLabel;
};

export const normalizeLoggerLevelsArray = (
  levels: LoggerVisibilityLevel[] | undefined,
): LoggerVisibilityLevel[] | undefined => {
  if (!Array.isArray(levels)) {
    return undefined;
  }

  const normalizedLevels: LoggerVisibilityLevel[] = [];
  const seenLevels = new Set<LoggerVisibilityLevel>();

  for (const level of levels) {
    if (
      level !== 'error' &&
      level !== 'warn' &&
      level !== 'info' &&
      level !== 'success'
    ) {
      continue;
    }

    if (seenLevels.has(level)) {
      continue;
    }

    seenLevels.add(level);
    normalizedLevels.push(level);
  }

  return normalizedLevels;
};

const normalizeLoggerRule = (rule: LoggerRule): LoggerRule | undefined => {
  const normalizedLabel = normalizeLoggerRuleLabel(rule.label);
  const normalizedMain = rule.main ? normalizeLoggerMain(rule.main) : undefined;
  const normalizedGroup = normalizeStringValue(rule.group);
  const normalizedMessage = normalizeStringValue(rule.message);
  const normalizedLevels =
    rule.levels === undefined
      ? undefined
      : (normalizeLoggerLevelsArray(rule.levels) ?? []);

  return {
    ...(rule.enabled === undefined ? {} : { enabled: rule.enabled }),
    ...(normalizedGroup === undefined ? {} : { group: normalizedGroup }),
    label: normalizedLabel,
    ...(normalizedLevels === undefined ? {} : { levels: normalizedLevels }),
    ...(normalizedMain === undefined ? {} : { main: normalizedMain }),
    ...(normalizedMessage === undefined ? {} : { message: normalizedMessage }),
  };
};

export function normalizeLoggerConfig(
  config: LoggerConfig | null | undefined,
): LoggerConfig | undefined {
  if (!config) {
    return undefined;
  }

  const normalizedLevels =
    config.levels === undefined
      ? undefined
      : (normalizeLoggerLevelsArray(config.levels) ?? []);
  const normalizedRules = config.rules
    ?.map((rule) => normalizeLoggerRule(rule))
    .filter((rule): rule is LoggerRule => Boolean(rule));

  if (normalizedRules && normalizedRules.length > 0) {
    const seenLabels = new Set<string>();

    for (const rule of normalizedRules) {
      if (seenLabels.has(rule.label)) {
        throw new Error(
          `Logger rule label "${rule.label}" must be unique within logging.rules.`,
        );
      }

      seenLabels.add(rule.label);
    }
  }

  if (
    normalizedLevels === undefined &&
    normalizedRules?.length === 0 &&
    config.debug === undefined
  ) {
    return undefined;
  }

  return {
    ...(config.debug === undefined ? {} : { debug: config.debug }),
    ...(normalizedLevels === undefined ? {} : { levels: normalizedLevels }),
    ...(normalizedRules && normalizedRules.length > 0
      ? { rules: normalizedRules }
      : {}),
  };
}
