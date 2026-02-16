/**
 * Logger utility for isomorphic code - imported by both Node.js and browser code
 * Needs DOM types for browser environment detection
 */
/// <reference lib="dom" />

import picocolors from 'picocolors';

/** Available log levels */
export type LogLevel = 'log' | 'warn' | 'error' | 'debug';

/** Available log kinds */
export type LogKind = 'info' | 'success' | 'warn' | 'error' | 'debug';

declare const __SILENCE_LOG__: boolean;
declare const __DEBUG__: boolean;

const MAIN_NAME = 'docs-islands';

/* eslint { no-empty-function: "off", @typescript-eslint/no-empty-function: "off" } */
const noop = function () {};

/** Icons for different log kinds */
const LOG_ICONS = {
  success: '✓',
  warn: '⚠',
  error: '✗',
  info: 'info',
  debug: 'debug',
} as const;

/** Browser CSS styles for different log kinds */
const BROWSER_STYLES = {
  main: 'color: #007bff; font-weight: bold;',
  group: 'color: #ff8c00;',
  dim: 'color: gray;',
  success: 'color: #28a745;',
  warn: 'color: #ffc107;',
  error: 'color: #dc3545; font-weight: bold;',
  debug: 'color: #6c757d;',
  default: '',
} as const;

/** Light logger style configuration */
const LIGHT_LOGGER_STYLES = {
  success: {
    icon: '✓',
    iconColor: 'color: #13ef3e',
    messageColor: 'color: #2ba245',
  },
  error: {
    icon: '✗',
    iconColor: 'color: rgb(233, 63, 80)',
    messageColor: 'color: #dc3545',
  },
  info: {
    icon: 'info',
    iconColor: 'color: rgb(149, 155, 160)',
    messageColor: 'color: #6c757d',
  },
  warn: {
    icon: '⚠',
    iconColor: 'color: rgb(255, 248, 32)',
    messageColor: 'color: #ffc107',
  },
  debug: {
    icon: 'debug',
    iconColor: 'color: rgb(149, 155, 160)',
    messageColor: 'color: #6c757d',
  },
} as const;

/**
 * By injecting `define` via rolldown (utils build),
 * this package exposes `dist` for external consumption,
 * and the `pnpm build` command must be re-executed if the environment changes.
 */
const isSilentLogEnabled: boolean = __SILENCE_LOG__;
const isDebugEnabled: boolean = __DEBUG__;

interface PicocolorsType {
  isColorSupported: boolean;
  bold: (str: string) => string;
  blueBright: (str: string) => string;
  yellowBright: (str: string) => string;
  dim: (str: string) => string;
  green: (str: string) => string;
  yellow: (str: string) => string;
  red: (str: string) => string;
  gray: (str: string) => string;
}

let colors: PicocolorsType | null = null;
let isColorSupported = false;

isColorSupported = Boolean(picocolors.isColorSupported);
colors = isColorSupported ? (picocolors as PicocolorsType) : null;

/**
 * Checks if a log should be suppressed based on environment and kind.
 */
function shouldSuppressLog(kind: LogKind): boolean {
  // Suppress non-critical logs in production environment.
  if (
    isSilentLogEnabled &&
    (kind === 'info' || kind === 'success' || kind === 'debug')
  ) {
    return true;
  }
  if (kind === 'debug') {
    return !isDebugEnabled;
  }
  return false;
}

/**
 * Formats a message with icon and color for Node.js terminal
 */
function formatNodeMessage(
  kind: LogKind,
  message: string,
): { icon: string; message: string } {
  if (!isColorSupported) {
    return { icon: LOG_ICONS[kind], message };
  }

  const iconColorMap = {
    success: colors!.green,
    warn: colors!.yellow,
    error: colors!.red,
    info: (s: string) => s,
    debug: colors!.gray,
  };

  const messageColorMap = {
    success: colors!.green,
    warn: colors!.yellow,
    error: colors!.red,
    info: (s: string) => s,
    debug: colors!.gray,
  };

  return {
    icon: iconColorMap[kind](LOG_ICONS[kind]),
    message: messageColorMap[kind](message),
  };
}

/**
 * Main logger class for both Node.js and browser environments
 * @example
 * ```ts
 * const logger = new Logger();
 * logger.info('Information message');
 * logger.success('Success message');
 * logger.warn('Warning message');
 * logger.error('Error message');
 *
 * // With group
 * const groupLogger = logger.getLoggerByGroup('my-module');
 * groupLogger.info('Grouped message');
 * ```
 */
class Logger {
  readonly #main: string;
  #group = '';

  /** Cache for grouped loggers */
  static readonly #groupMap = new Map<string, Logger>();

  constructor(main: string = MAIN_NAME) {
    this.#main = main;
  }

  /**
   * Gets or creates a logger for a specific group
   * @param group - The group identifier
   * @returns Logger instance for the group
   */
  getLoggerByGroup(group: string): Logger {
    if (Logger.#groupMap.has(group)) {
      return Logger.#groupMap.get(group)!;
    }
    const logger = new Logger(this.#main);
    logger.setGroup(group);
    Logger.#groupMap.set(group, logger);
    return logger;
  }

  /**
   * Sets the group for this logger
   * @param group - The group identifier
   * @returns This logger instance for chaining
   */
  setGroup(group: string): this {
    this.#group = group;
    return this;
  }

  /**
   * Formats the prefix for Node.js terminal output
   */
  #formatNodePrefix(): string {
    if (!colors)
      return `${this.#main}${this.#group ? `[${this.#group}]` : ''}: `;

    const logMain = colors.bold(colors.blueBright(this.#main));
    const group = this.#group
      ? colors.dim('[') + colors.yellowBright(this.#group) + colors.dim(']')
      : '';
    const splitter = this.#group ? colors.dim(' » ') : colors.dim(': ');

    return logMain + group + splitter;
  }

  /**
   * Formats the prefix for browser console output
   */
  #formatBrowserPrefix(): { texts: string[]; styles: string[] } {
    const texts: string[] = [];
    const styles: string[] = [];

    texts.push(`%c${this.#main}`);
    styles.push(BROWSER_STYLES.main);

    if (this.#group) {
      texts.push('%c[', `%c${this.#group}`, '%c]', '%c » ');
      styles.push(
        BROWSER_STYLES.dim,
        BROWSER_STYLES.group,
        BROWSER_STYLES.dim,
        BROWSER_STYLES.dim,
      );
    } else {
      texts.push('%c: ');
      styles.push(BROWSER_STYLES.dim);
    }

    return { texts, styles };
  }

  #log(level: LogLevel, kind: LogKind, ...parts: string[]): void {
    if (shouldSuppressLog(kind)) {
      return;
    }

    const message = parts.join(' ');

    if (isColorSupported) {
      // Node.js with color support
      const prefix = this.#formatNodePrefix();
      console[level](`${prefix}${message}`);
    } else {
      // Browser or Node.js without color support
      const { texts, styles } = this.#formatBrowserPrefix();

      texts.push(`%c${message}`);
      const styleKey = kind === 'info' ? 'default' : kind;
      styles.push(BROWSER_STYLES[styleKey]);

      console[level](texts.join(''), ...styles);
    }
  }

  /**
   * Logs an informational message
   * @param message - The message to log
   */
  public info(message: string): void {
    this.#log('log', 'info', message);
  }

  /**
   * Logs a success message with a checkmark icon
   * @param message - The message to log
   */
  public success(message: string): void {
    const { icon, message: msg } = formatNodeMessage('success', message);
    this.#log('log', 'success', icon, msg);
  }

  /**
   * Logs a warning message with a warning icon
   * @param message - The message to log
   */
  public warn(message: string): void {
    const { icon, message: msg } = formatNodeMessage('warn', message);
    this.#log('warn', 'warn', icon, msg);
  }

  /**
   * Logs an error message with an error icon
   * @param message - The message to log
   */
  public error(message: string): void {
    const { icon, message: msg } = formatNodeMessage('error', message);
    this.#log('error', 'error', icon, msg);
  }

  /**
   * Logs a debug message
   * @param message - The message to log
   */
  public debug(message: string): void {
    const { icon, message: msg } = formatNodeMessage('debug', message);
    this.#log('debug', 'debug', icon, msg);
  }
}

export default Logger;

export interface LightGeneralLoggerReturn {
  log: () => void;
  formatText: string;
}

/**
 * Lightweight logger function that can optionally return executable code string
 * Primarily used for generating log statements to inject into client-side code
 *
 * @param logMain - Log subject
 * @param type - The type of log message
 * @param message - The message to log
 * @param group - Optional group identifier
 */
export function lightGeneralLogger(
  logMain: string = MAIN_NAME,
  type: LogKind,
  message: string,
  group?: string,
): LightGeneralLoggerReturn {
  if (shouldSuppressLog(type)) {
    return {
      log: noop,
      formatText: '',
    };
  }

  const config = LIGHT_LOGGER_STYLES[type];

  const groupText = group ? `[${group}]` : '';

  return {
    log: () => {
      console.log(
        `%c${logMain}%c${groupText}%c: » %c${config.icon}%c ${message}`,
        'color: #2579d9; font-weight: bold;',
        'color: #e28a00; font-weight: bold;',
        'color: gray;',
        config.iconColor,
        config.messageColor,
      );
    },
    formatText: `console.log(\`%c${logMain}%c${groupText}%c: » %c${config.icon}%c ${message}\`,'color: #2579d9; font-weight: bold;','color: #e28a00; font-weight: bold;','color: gray;','${config.iconColor}','${config.messageColor}');`,
  };
}
