/**
 * Logger utility for isomorphic code - imported by both Node.js and browser code
 * Needs DOM types for browser environment detection
 */
/// <reference lib="dom" />

import picocolors from 'picocolors';
import picomatch from 'picomatch';

/** Available logger levels */
export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug';

/** Available log kinds */
export type LogKind = LogLevel;

/** Available console methods */
type ConsoleMethod = 'log' | 'warn' | 'error' | 'debug';

/** User-facing allowlist for non-debug log APIs */
export type LoggerVisibilityLevel = 'error' | 'warn' | 'info' | 'success';

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

declare global {
  // Runtime logger config is injected by consumers such as @docs-islands/vitepress.
  var __DOCS_ISLANDS_LOGGER_CONFIG__: LoggerConfig | undefined;
}

const GROUP_NAME_RE =
  /^[\da-z]+(?:[_-][\da-z]+)*(?:\.[\da-z]+(?:[_-][\da-z]+)*)*$/;
const BROWSER_STYLES = {
  debug: 'color: #6c757d;',
  default: '',
  dim: 'color: #6b7280;',
  error: 'color: #dc2626; font-weight: 600;',
  group: 'color: #c2410c;',
  info: '',
  main: 'color: #2563eb; font-weight: 700;',
  success: 'color: #15803d;',
  warn: 'color: #b45309; font-weight: 600;',
} as const;

type ResolvedLogLevel = LoggerVisibilityLevel;
interface LoggerContext {
  group?: string;
  kind: LogKind;
  main: string;
  message: string;
}
interface NormalizedLoggerRule {
  enabled?: boolean;
  groupMatcher?: (value: string) => boolean;
  label: string;
  levels?: ReadonlySet<ResolvedLogLevel>;
  main?: string;
  messageMatcher?: (value: string) => boolean;
}
interface NormalizedLoggerConfig {
  debug?: boolean;
  levels?: ReadonlySet<ResolvedLogLevel>;
  rules?: NormalizedLoggerRule[];
}
interface ResolvedLoggerContext {
  appendElapsedTime: boolean;
  ruleLabels: string[];
  suppress: boolean;
}

const LOG_KIND_TO_LEVEL = {
  error: 'error',
  info: 'info',
  success: 'success',
  warn: 'warn',
} as const satisfies Record<Exclude<LogKind, 'debug'>, ResolvedLogLevel>;
const GLOB_PATTERN_RE = /[!()*+?[\]{}]/;
const DEFAULT_RESOLVED_LEVELS = new Set<ResolvedLogLevel>([
  'error',
  'warn',
  'info',
  'success',
]);
const ROOT_LOGGER_RULE_LABEL = '<root>';
const DEBUG_MESSAGE_MAX_LENGTH = 160;
const DEBUG_SUMMARY_MAX_ITEMS = 6;
const DEBUG_SUMMARY_MAX_KEYS = 8;
const DEBUG_SUMMARY_MAX_DEPTH = 2;

const isColorSupported = Boolean(picocolors.isColorSupported);

interface PicocolorsType {
  blueBright: (str: string) => string;
  bold: (str: string) => string;
  dim: (str: string) => string;
  gray: (str: string) => string;
  green: (str: string) => string;
  red: (str: string) => string;
  yellow: (str: string) => string;
}

const colors = isColorSupported ? (picocolors as PicocolorsType) : null;

let activeLoggerConfig: NormalizedLoggerConfig | null = null;
const readLoggerClockMs = (): number => {
  if (
    globalThis.performance &&
    typeof globalThis.performance.now === 'function'
  ) {
    return globalThis.performance.now();
  }

  return Date.now();
};

let loggerClockStartMs = readLoggerClockMs();

const resetLoggerClockStart = (): void => {
  loggerClockStartMs = readLoggerClockMs();
};

const formatElapsedTime = (): string => {
  const elapsedMs = Math.max(0, readLoggerClockMs() - loggerClockStartMs);

  return `${elapsedMs.toFixed(2)}ms`;
};

const sanitizeDebugText = (
  value: string,
  maxLength = DEBUG_MESSAGE_MAX_LENGTH,
): string => {
  const normalizedValue = value.replaceAll(/\s+/g, ' ').trim();

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength - 3)}...`;
};

const sanitizeDebugSummaryValue = (
  value: unknown,
  depth = 0,
): boolean | number | string | null | Record<string, unknown> | unknown[] => {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeDebugText(value);
  }

  if (typeof value === 'bigint') {
    return sanitizeDebugText(value.toString());
  }

  if (typeof value === 'function') {
    return '[function]';
  }

  if (value instanceof Error) {
    return sanitizeDebugText(value.message);
  }

  if (Array.isArray(value)) {
    if (depth >= DEBUG_SUMMARY_MAX_DEPTH) {
      return `[array(${value.length})]`;
    }

    const sanitizedItems = value
      .slice(0, DEBUG_SUMMARY_MAX_ITEMS)
      .map((item) => sanitizeDebugSummaryValue(item, depth + 1));

    if (value.length > DEBUG_SUMMARY_MAX_ITEMS) {
      sanitizedItems.push(`[+${value.length - DEBUG_SUMMARY_MAX_ITEMS} more]`);
    }

    return sanitizedItems;
  }

  if (typeof value === 'object') {
    if (depth >= DEBUG_SUMMARY_MAX_DEPTH) {
      return '[object]';
    }

    const objectEntries = Object.entries(value as Record<string, unknown>)
      .toSorted(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .slice(0, DEBUG_SUMMARY_MAX_KEYS)
      .map(([key, entryValue]) => [
        key,
        sanitizeDebugSummaryValue(entryValue, depth + 1),
      ]);
    const sanitizedObject = Object.fromEntries(objectEntries);
    const totalKeyCount = Object.keys(value as Record<string, unknown>).length;

    if (totalKeyCount > DEBUG_SUMMARY_MAX_KEYS) {
      sanitizedObject.__truncatedKeys__ =
        totalKeyCount - DEBUG_SUMMARY_MAX_KEYS;
    }

    return sanitizedObject;
  }

  return sanitizeDebugText(String(value));
};

export const sanitizeDebugSummary = (summary: unknown): string => {
  if (summary === undefined) {
    return 'n/a';
  }

  const sanitizedSummary = sanitizeDebugSummaryValue(summary);

  if (typeof sanitizedSummary === 'string') {
    return sanitizedSummary;
  }

  try {
    return sanitizeDebugText(JSON.stringify(sanitizedSummary));
  } catch {
    return '[unserializable summary]';
  }
};

const formatDebugTiming = (timingMs: number | null | undefined): string => {
  if (
    timingMs === null ||
    timingMs === undefined ||
    !Number.isFinite(timingMs)
  ) {
    return 'n/a';
  }

  return `${timingMs.toFixed(2)}ms`;
};

/**
 * Debug logs explain how the system reached a conclusion-oriented info/warn/error
 * outcome. The canonical shape is:
 * `context=... | decision=... | summary=... | timing=...`
 */
export const formatDebugMessage = ({
  context,
  decision,
  summary,
  timingMs,
}: DebugMessageOptions): string =>
  [
    `context=${sanitizeDebugText(context) || 'n/a'}`,
    `decision=${sanitizeDebugText(decision) || 'n/a'}`,
    `summary=${sanitizeDebugSummary(summary)}`,
    `timing=${formatDebugTiming(timingMs)}`,
  ].join(' | ');

const normalizeLoggerMain = (main: string): string => {
  const normalizedMain = main.trim();

  if (!normalizedMain) {
    throw new Error('Logger main must be a non-empty package name.');
  }

  return normalizedMain;
};

const normalizeLoggerGroup = (group: string): string => {
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

const normalizeLoggerLevelsArray = (
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

const normalizeLoggerLevelsSet = (
  levels: LoggerVisibilityLevel[] | undefined,
): ReadonlySet<ResolvedLogLevel> | undefined => {
  if (levels === undefined) {
    return undefined;
  }

  const normalizedLevels = normalizeLoggerLevelsArray(levels) ?? [];

  return new Set(normalizedLevels);
};

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

const compileLoggerRule = (rule: LoggerRule): NormalizedLoggerRule => ({
  ...(rule.enabled === undefined ? {} : { enabled: rule.enabled }),
  ...(rule.group
    ? { groupMatcher: createPatternMatcher(rule.group, 'group') }
    : {}),
  label: rule.label,
  ...(rule.levels === undefined
    ? {}
    : { levels: normalizeLoggerLevelsSet(rule.levels) }),
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
      ? { levels: normalizeLoggerLevelsSet(normalizedConfig.levels) }
      : {}),
    ...(normalizedConfig.rules === undefined
      ? {}
      : {
          rules: normalizedConfig.rules.map((rule) => compileLoggerRule(rule)),
        }),
  };
};

const cloneLevels = (
  levels: ReadonlySet<ResolvedLogLevel>,
): Set<ResolvedLogLevel> => new Set(levels);

const getNormalizedActiveLoggerConfig = (): NormalizedLoggerConfig | null => {
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

  if (rule.groupMatcher && !context.group) {
    return false;
  }

  if (rule.groupMatcher && !rule.groupMatcher(context.group!)) {
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
): ReadonlySet<ResolvedLogLevel> => {
  if (rule.levels !== undefined) {
    return rule.levels;
  }

  if (config.levels !== undefined) {
    return config.levels;
  }

  return DEFAULT_RESOLVED_LEVELS;
};

const resolveLoggerContext = (
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

const formatRuleLabelPrefix = (labels: string[]): string => {
  if (labels.length === 0) {
    return '';
  }

  return `${labels.map((label) => `[${label}]`).join('')} `;
};

const isBrowserConsole = (): boolean =>
  globalThis.window !== undefined && globalThis.document !== undefined;

const formatNodePrefix = (main: string, group: string): string => {
  if (!colors) {
    return `${main}[${group}]: `;
  }

  return (
    colors.bold(colors.blueBright(main)) +
    colors.dim('[') +
    colors.yellow(group) +
    colors.dim(']: ')
  );
};

const formatNodeMessage = (kind: LogKind, message: string): string => {
  if (!colors) {
    return message;
  }

  switch (kind) {
    case 'debug': {
      return colors.gray(message);
    }
    case 'error': {
      return colors.red(message);
    }
    case 'success': {
      return colors.green(message);
    }
    case 'warn': {
      return colors.yellow(message);
    }
    default: {
      return message;
    }
  }
};

const formatBrowserPrefix = (
  main: string,
  group: string,
): { styles: string[]; texts: string[] } => ({
  styles: [
    BROWSER_STYLES.main,
    BROWSER_STYLES.dim,
    BROWSER_STYLES.group,
    BROWSER_STYLES.dim,
  ],
  texts: [`%c${main}`, '%c[', `%c${group}`, '%c]: '],
});

const consoleMethodByKind = (kind: LogKind): ConsoleMethod => {
  switch (kind) {
    case 'debug': {
      return 'debug';
    }
    case 'error': {
      return 'error';
    }
    case 'warn': {
      return 'warn';
    }
    default: {
      return 'log';
    }
  }
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

export function setLoggerConfig(config: LoggerConfig | null | undefined): void {
  const normalizedConfig = normalizeLoggerConfig(config);

  resetLoggerClockStart();
  activeLoggerConfig = compileLoggerConfig(normalizedConfig);
  globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__ = normalizedConfig;
}

export function resetLoggerConfig(): void {
  resetLoggerClockStart();
  activeLoggerConfig = null;
  delete globalThis.__DOCS_ISLANDS_LOGGER_CONFIG__;
}

export function shouldSuppressLog(
  kind: LogKind,
  options: {
    group?: string;
    main: string;
    message?: string;
  },
): boolean {
  return resolveLoggerContext({
    group: options.group,
    kind,
    main: normalizeLoggerMain(options.main),
    message: options.message ?? '',
  }).suppress;
}

export interface CreateLoggerOptions {
  group?: string;
  main: string;
}

/**
 * Main logger class for both Node.js and browser environments
 * @example
 * ```ts
 * const logger = createLogger({ main: '@docs-islands/utils' });
 * const groupLogger = logger.getLoggerByGroup('runtime.react.component-manager');
 * groupLogger.info('Grouped message');
 * ```
 */
class Logger {
  readonly #main: string;
  #group = '';

  /** Cache for grouped loggers */
  static readonly #groupMap = new Map<string, Logger>();

  constructor(main: string) {
    this.#main = normalizeLoggerMain(main);
  }

  /**
   * Gets or creates a logger for a specific group
   * @param group - The group identifier
   * @returns Logger instance for the group
   */
  getLoggerByGroup(group: string): Logger {
    const normalizedGroup = normalizeLoggerGroup(group);
    const cacheKey = `${this.#main}::${normalizedGroup}`;

    if (Logger.#groupMap.has(cacheKey)) {
      return Logger.#groupMap.get(cacheKey)!;
    }

    const logger = new Logger(this.#main);
    logger.setGroup(normalizedGroup);
    Logger.#groupMap.set(cacheKey, logger);

    return logger;
  }

  /**
   * Sets the group for this logger
   * @param group - The group identifier
   * @returns This logger instance for chaining
   */
  setGroup(group: string): this {
    this.#group = normalizeLoggerGroup(group);
    return this;
  }

  #log(kind: LogKind, message: string): void {
    const resolvedContext = resolveLoggerContext({
      group: this.#group || undefined,
      kind,
      main: this.#main,
      message,
    });

    if (resolvedContext.suppress) {
      return;
    }

    const level = consoleMethodByKind(kind);
    const labelPrefix = formatRuleLabelPrefix(resolvedContext.ruleLabels);
    const renderedMessage = resolvedContext.appendElapsedTime
      ? `${message} ${formatElapsedTime()}`
      : message;

    if (!this.#group) {
      console[level](`${labelPrefix}${this.#main}: ${renderedMessage}`);
      return;
    }

    if (!isBrowserConsole()) {
      console[level](
        `${labelPrefix}${formatNodePrefix(this.#main, this.#group)}${formatNodeMessage(kind, renderedMessage)}`,
      );
      return;
    }

    const { texts, styles } = formatBrowserPrefix(this.#main, this.#group);

    texts[0] = `${labelPrefix}${texts[0]}`;
    texts.push(`%c${renderedMessage}`);
    styles.push(BROWSER_STYLES[kind] ?? BROWSER_STYLES.default);

    console[level](texts.join(''), ...styles);
  }

  /**
   * Logs an informational message
   * @param message - The message to log
   */
  public info(message: string): void {
    this.#log('info', message);
  }

  /**
   * Logs a success message
   * @param message - The message to log
   */
  public success(message: string): void {
    this.#log('success', message);
  }

  /**
   * Logs a warning message
   * @param message - The message to log
   */
  public warn(message: string): void {
    this.#log('warn', message);
  }

  /**
   * Logs an error message
   * @param message - The message to log
   */
  public error(message: string): void {
    this.#log('error', message);
  }

  /**
   * Logs a debug message
   * @param message - The message to log
   */
  public debug(message: string): void {
    this.#log('debug', message);
  }
}

export default Logger;

export type LoggerType = InstanceType<typeof Logger>;

export function createLogger(options: CreateLoggerOptions): Logger {
  const logger = new Logger(options.main);

  if (options.group) {
    logger.setGroup(options.group);
  }

  return logger;
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return String(error);
  } catch {
    return 'Unknown error';
  }
}

export interface LightGeneralLoggerReturn {
  formatText: string;
  log: () => void;
}

/**
 * Runtime helper used by generated browser modules.
 *
 * Consumers generating code should import it with:
 * `import { emitRuntimeLog as __docs_islands_runtime_log__ } from '@docs-islands/utils/logger'`
 */
export function emitRuntimeLog(
  logMain: string,
  type: LogKind,
  message: string,
  group?: string,
): void {
  const logger = new Logger(logMain);

  if (group) {
    logger.setGroup(group);
  }

  switch (type) {
    case 'debug': {
      logger.debug(message);
      break;
    }
    case 'error': {
      logger.error(message);
      break;
    }
    case 'success': {
      logger.success(message);
      break;
    }
    case 'warn': {
      logger.warn(message);
      break;
    }
    default: {
      logger.info(message);
    }
  }
}

/**
 * Lightweight logger function that can optionally return executable code string
 * Primarily used for generating log statements to inject into client-side code.
 *
 * `formatText` expects generated modules to import
 * `emitRuntimeLog as __docs_islands_runtime_log__`.
 *
 * @param logMain - Log subject
 * @param type - The type of log message
 * @param message - The message or message expression to log
 * @param group - Optional group identifier
 */
export function lightGeneralLogger(
  logMain: string,
  type: LogKind,
  message: string,
  group?: string,
): LightGeneralLoggerReturn {
  const normalizedMain = normalizeLoggerMain(logMain);
  const normalizedGroup = group ? normalizeLoggerGroup(group) : undefined;

  return {
    formatText: `__docs_islands_runtime_log__(${JSON.stringify(normalizedMain)}, ${JSON.stringify(type)}, ${message}, ${normalizedGroup ? JSON.stringify(normalizedGroup) : 'undefined'});`,
    log: () => {
      emitRuntimeLog(normalizedMain, type, message, normalizedGroup);
    },
  };
}
