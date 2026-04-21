import { syncRuntimeDefinedLoggerConfig } from './config';
import { emitLoggerMessage } from './console';
import { INSTANT_LOG_OPTIONS } from './constants/levels';
import { normalizeLoggerGroup, normalizeLoggerMain } from './normalize';
import type {
  CreateLoggerOptions,
  LightGeneralLoggerReturn,
  LoggerLogOptions,
  LogKind,
} from './types';

const createScopedLoggerCacheKey = (main: string, group: string): string =>
  JSON.stringify([main, group]);

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
  readonly #scopedLoggers = new Map<string, ScopedLogger>();

  /** Cache for main loggers. */
  static readonly #mainCacheMap = new Map<string, Logger>();

  private constructor(main: string) {
    this.#main = normalizeLoggerMain(main);
  }

  static getOrCreate(main: string): Logger {
    const normalizedMain = normalizeLoggerMain(main);
    const cachedLogger = Logger.#mainCacheMap.get(normalizedMain);

    if (cachedLogger) {
      return cachedLogger;
    }

    const logger = new Logger(normalizedMain);
    Logger.#mainCacheMap.set(normalizedMain, logger);

    return logger;
  }

  /**
   * Gets or creates a logger for a specific group.
   * @param group - The group identifier
   * @returns ScopedLogger instance for the group
   */
  getLoggerByGroup(group: string): ScopedLogger {
    const normalizedGroup = normalizeLoggerGroup(group);
    const cacheKey = createScopedLoggerCacheKey(this.#main, normalizedGroup);
    const cachedLogger = this.#scopedLoggers.get(cacheKey);

    if (cachedLogger) {
      return cachedLogger;
    }

    const logger = ScopedLogger.getOrCreate({
      group: normalizedGroup,
      main: this.#main,
    });

    this.#scopedLoggers.set(cacheKey, logger);
    return logger;
  }
}

export class ScopedLogger {
  readonly #group: string;
  readonly #main: string;

  static readonly #scopedLoggerCacheMap = new Map<string, ScopedLogger>();

  private constructor(main: string, group: string) {
    this.#main = normalizeLoggerMain(main);
    this.#group = normalizeLoggerGroup(group);
  }

  static getOrCreate({
    group,
    main,
  }: {
    group: string;
    main: string;
  }): ScopedLogger {
    const normalizedMain = normalizeLoggerMain(main);
    const normalizedGroup = normalizeLoggerGroup(group);
    const cacheKey = createScopedLoggerCacheKey(
      normalizedMain,
      normalizedGroup,
    );
    const cachedLogger = ScopedLogger.#scopedLoggerCacheMap.get(cacheKey);

    if (cachedLogger) {
      return cachedLogger;
    }

    const scopedLogger = new ScopedLogger(normalizedMain, normalizedGroup);

    ScopedLogger.#scopedLoggerCacheMap.set(cacheKey, scopedLogger);
    return scopedLogger;
  }

  /**
   * Logs an informational message.
   * @param message - The message to log
   */
  public info(message: string, options: LoggerLogOptions): void {
    this.#log('info', message, options);
  }

  /**
   * Logs a success message.
   * @param message - The message to log
   */
  public success(message: string, options: LoggerLogOptions): void {
    this.#log('success', message, options);
  }

  /**
   * Logs a warning message.
   * @param message - The message to log
   */
  public warn(message: string, options: LoggerLogOptions): void {
    this.#log('warn', message, options);
  }

  /**
   * Logs an error message.
   * @param message - The message to log
   */
  public error(message: string, options: LoggerLogOptions): void {
    this.#log('error', message, options);
  }

  /**
   * Logs a debug message.
   * @param message - The message to log
   */
  public debug(message: string): void {
    this.#log('debug', message);
  }

  #log(kind: LogKind, message: string, options?: LoggerLogOptions): void {
    emitLoggerMessage({
      group: this.#group,
      kind,
      main: this.#main,
      message,
      options,
    });
  }
}

export default Logger;

export type LoggerType = Logger;
export type ScopedLoggerType = ScopedLogger;

export function createLogger(options: CreateLoggerOptions): Logger {
  syncRuntimeDefinedLoggerConfig();
  return Logger.getOrCreate(options.main);
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return String(error);
  } catch {
    return 'Unknown error';
  }
}

/**
 * Lightweight logger function for immediate runtime logging.
 *
 * @param logMain - Log subject
 * @param type - The type of log message
 * @param message - The message to log
 * @param group - Logger group identifier
 */
export function lightGeneralLogger(
  logMain: string,
  type: LogKind,
  message: string,
  group: string,
  options?: LoggerLogOptions,
): LightGeneralLoggerReturn {
  if (typeof group !== 'string') {
    throw new TypeError(
      'lightGeneralLogger requires a logger group. Pass createLogger({ main }).getLoggerByGroup(group) or provide the group argument.',
    );
  }

  const normalizedMain = normalizeLoggerMain(logMain);
  const normalizedGroup = normalizeLoggerGroup(group);

  return {
    log: () => {
      const logger = createLogger({
        main: normalizedMain,
      }).getLoggerByGroup(normalizedGroup);

      if (type === 'debug') {
        logger.debug(message);
        return;
      }

      logger[type](message, options ?? INSTANT_LOG_OPTIONS);
    },
  };
}
