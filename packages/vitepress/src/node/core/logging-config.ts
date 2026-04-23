import type {
  LoggingPresetPlugin,
  LoggingPresetRulesUserConfig,
  LoggingUserConfig,
} from '#dep-types/utils';
import {
  type LoggerConfig,
  type LoggerRule,
  normalizeLoggerConfig,
} from '@docs-islands/logger/internal';

type LoggingPluginMap = NonNullable<LoggingUserConfig['plugins']>;

const PLUGIN_RULE_REFERENCE_SEPARATOR = '/';
const PRESET_RULE_OVERRIDE_KEYS = new Set(['enabled', 'levels', 'message']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePluginNamespace(namespace: string): string {
  const normalizedNamespace = namespace.trim();

  if (!normalizedNamespace) {
    throw new Error('logging.plugins keys must be non-empty strings.');
  }

  if (normalizedNamespace.includes(PLUGIN_RULE_REFERENCE_SEPARATOR)) {
    throw new Error(
      `logging.plugins key "${normalizedNamespace}" cannot contain "${PLUGIN_RULE_REFERENCE_SEPARATOR}".`,
    );
  }

  return normalizedNamespace;
}

function parsePluginRuleReference(ruleReference: string): {
  namespace: string;
  ruleName: string;
} {
  const separatorIndex = ruleReference.indexOf(PLUGIN_RULE_REFERENCE_SEPARATOR);

  if (separatorIndex <= 0 || separatorIndex === ruleReference.length - 1) {
    throw new Error(
      `logging.rules key "${ruleReference}" must use "<plugin>/<rule>" format.`,
    );
  }

  const namespace = normalizePluginNamespace(
    ruleReference.slice(0, separatorIndex),
  );
  const ruleName = ruleReference.slice(separatorIndex + 1).trim();

  if (!ruleName) {
    throw new Error(
      `logging.rules key "${ruleReference}" must reference a non-empty plugin rule name.`,
    );
  }

  return {
    namespace,
    ruleName,
  };
}

function extractLoggerRuleShape(
  value: unknown,
): Omit<LoggerRule, 'enabled' | 'label'> {
  if (!isRecord(value)) {
    return {};
  }

  return {
    ...(typeof value.group === 'string' ? { group: value.group } : {}),
    ...(Array.isArray(value.levels)
      ? {
          levels: value.levels as LoggerRule['levels'],
        }
      : {}),
    ...(typeof value.main === 'string' ? { main: value.main } : {}),
    ...(typeof value.message === 'string' ? { message: value.message } : {}),
  };
}

function extractPluginRuleOverrideShape(
  ruleReference: string,
  value: unknown,
): Pick<LoggerRule, 'enabled' | 'levels' | 'message'> {
  if (!isRecord(value)) {
    return {};
  }

  const invalidKeys = Object.keys(value).filter(
    (key) => !PRESET_RULE_OVERRIDE_KEYS.has(key),
  );

  if (invalidKeys.length > 0) {
    throw new Error(
      `logging.rules["${ruleReference}"] preset overrides only support "enabled", "message", and "levels".`,
    );
  }

  return {
    ...(typeof value.enabled === 'boolean' ? { enabled: value.enabled } : {}),
    ...(Array.isArray(value.levels)
      ? {
          levels: value.levels as LoggerRule['levels'],
        }
      : {}),
    ...(typeof value.message === 'string' ? { message: value.message } : {}),
  };
}

function normalizeLoggingPlugins(
  plugins: LoggingUserConfig['plugins'],
): Record<string, LoggingPresetPlugin> {
  if (!isRecord(plugins)) {
    return {};
  }

  const normalizedPlugins: Record<string, LoggingPresetPlugin> = {};

  for (const [rawNamespace, plugin] of Object.entries(plugins)) {
    const namespace = normalizePluginNamespace(rawNamespace);

    if (!isRecord(plugin) || !isRecord(plugin.rules)) {
      throw new Error(
        `logging.plugins["${namespace}"] must be a logging preset plugin with a rules object.`,
      );
    }

    if (Object.hasOwn(normalizedPlugins, namespace)) {
      throw new Error(`Duplicate logging.plugins key "${namespace}".`);
    }

    normalizedPlugins[namespace] = plugin as LoggingPresetPlugin;
  }

  return normalizedPlugins;
}

function expandPluginRules(
  plugins: Record<string, LoggingPresetPlugin>,
  rules: LoggingPresetRulesUserConfig,
): LoggerRule[] {
  const expandedRules: LoggerRule[] = [];

  for (const [ruleReference, rawState] of Object.entries(rules)) {
    const { namespace, ruleName } = parsePluginRuleReference(ruleReference);
    const plugin = plugins[namespace];

    if (!plugin) {
      throw new Error(
        `logging.rules key "${ruleReference}" references unknown logging plugin "${namespace}".`,
      );
    }

    const pluginRule = plugin.rules[ruleName];

    if (!isRecord(pluginRule)) {
      throw new Error(
        `logging.rules key "${ruleReference}" references unknown logging plugin rule "${ruleName}".`,
      );
    }

    const normalizedState =
      rawState === false || rawState === 'off' ? { enabled: false } : rawState;

    if (!isRecord(normalizedState)) {
      throw new Error(
        `logging.rules["${ruleReference}"] must be false, "off", or an override object.`,
      );
    }

    expandedRules.push({
      label: ruleReference,
      ...extractLoggerRuleShape(pluginRule),
      ...extractPluginRuleOverrideShape(ruleReference, normalizedState),
    });
  }

  return expandedRules;
}

function isRulesArrayConfig(
  rules: LoggingUserConfig['rules'],
): rules is LoggerRule[] {
  return Array.isArray(rules);
}

function isRulesObjectConfig(
  rules: LoggingUserConfig['rules'],
): rules is LoggingPresetRulesUserConfig {
  return isRecord(rules);
}

function hasRegisteredPlugins(plugins: LoggingPluginMap): boolean {
  return Object.keys(plugins).length > 0;
}

export function resolveLoggingConfig(
  logging: LoggingUserConfig | undefined,
): LoggerConfig | undefined {
  if (!logging) {
    return undefined;
  }

  const normalizedPlugins = normalizeLoggingPlugins(logging.plugins);
  const hasPlugins = hasRegisteredPlugins(normalizedPlugins);

  if (isRulesArrayConfig(logging.rules)) {
    if (hasPlugins) {
      throw new Error(
        'logging.plugins can only be used with object-style logging.rules entries such as "hmr/viteAfterUpdate".',
      );
    }

    return normalizeLoggerConfig({
      ...(logging.debug === undefined ? {} : { debug: logging.debug }),
      ...(logging.levels === undefined ? {} : { levels: logging.levels }),
      rules: logging.rules,
    });
  }

  if (isRulesObjectConfig(logging.rules) || hasPlugins) {
    const expandedRules = expandPluginRules(
      normalizedPlugins,
      isRulesObjectConfig(logging.rules) ? logging.rules : {},
    );

    return normalizeLoggerConfig({
      ...(logging.debug === undefined ? {} : { debug: logging.debug }),
      ...(logging.levels === undefined ? {} : { levels: logging.levels }),
      ...(expandedRules.length > 0 ? { rules: expandedRules } : {}),
    });
  }

  return normalizeLoggerConfig({
    ...(logging.debug === undefined ? {} : { debug: logging.debug }),
    ...(logging.levels === undefined ? {} : { levels: logging.levels }),
  });
}

export { type LoggerConfig } from '@docs-islands/logger/internal';
