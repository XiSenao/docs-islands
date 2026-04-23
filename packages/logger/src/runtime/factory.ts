import { syncRuntimeDefinedLoggerConfig } from './config';
import { emitLoggerMessage } from './console';
import { normalizeLoggerGroup, normalizeLoggerMain } from './normalize';
import { normalizeLoggerScopeId, resolveLoggerScopeId } from './scope';
import type {
  CreateLoggerOptions,
  LoggerLogOptions,
  LoggerScopeId,
  LogKind,
} from './types';

const createMainLoggerCacheKey = (
  scopeId: LoggerScopeId,
  main: string,
): string => JSON.stringify([scopeId, main]);

const createScopedLoggerCacheKey = (
  scopeId: LoggerScopeId,
  main: string,
  group: string,
): string => JSON.stringify([scopeId, main, group]);

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
  readonly #scopeId: LoggerScopeId;
  readonly #scopedLoggers = new Map<string, ScopedLogger>();

  /** Cache for main loggers. */
  static readonly #mainCacheMap = new Map<string, Logger>();

  private constructor(scopeId: LoggerScopeId, main: string) {
    this.#main = normalizeLoggerMain(main);
    this.#scopeId = normalizeLoggerScopeId(scopeId);
  }

  static getOrCreate(main: string, scopeId?: LoggerScopeId): Logger {
    const normalizedMain = normalizeLoggerMain(main);
    const normalizedScopeId = normalizeLoggerScopeId(scopeId);
    const cacheKey = createMainLoggerCacheKey(
      normalizedScopeId,
      normalizedMain,
    );
    const cachedLogger = Logger.#mainCacheMap.get(cacheKey);

    if (cachedLogger) {
      return cachedLogger;
    }

    const logger = new Logger(normalizedScopeId, normalizedMain);
    Logger.#mainCacheMap.set(cacheKey, logger);

    return logger;
  }

  /**
   * Gets or creates a logger for a specific group.
   * @param group - The group identifier
   * @returns ScopedLogger instance for the group
   */
  getLoggerByGroup(group: string): ScopedLogger {
    const normalizedGroup = normalizeLoggerGroup(group);
    const cacheKey = createScopedLoggerCacheKey(
      this.#scopeId,
      this.#main,
      normalizedGroup,
    );
    const cachedLogger = this.#scopedLoggers.get(cacheKey);

    if (cachedLogger) {
      return cachedLogger;
    }

    const logger = ScopedLogger.getOrCreate({
      group: normalizedGroup,
      main: this.#main,
      scopeId: this.#scopeId,
    });

    this.#scopedLoggers.set(cacheKey, logger);
    return logger;
  }
}

export class ScopedLogger {
  readonly #group: string;
  readonly #main: string;
  readonly #scopeId: LoggerScopeId;

  static readonly #scopedLoggerCacheMap = new Map<string, ScopedLogger>();

  private constructor(scopeId: LoggerScopeId, main: string, group: string) {
    this.#main = normalizeLoggerMain(main);
    this.#group = normalizeLoggerGroup(group);
    this.#scopeId = normalizeLoggerScopeId(scopeId);
  }

  static getOrCreate({
    group,
    main,
    scopeId,
  }: {
    group: string;
    main: string;
    scopeId?: LoggerScopeId;
  }): ScopedLogger {
    const normalizedMain = normalizeLoggerMain(main);
    const normalizedGroup = normalizeLoggerGroup(group);
    const normalizedScopeId = normalizeLoggerScopeId(scopeId);
    const cacheKey = createScopedLoggerCacheKey(
      normalizedScopeId,
      normalizedMain,
      normalizedGroup,
    );
    const cachedLogger = ScopedLogger.#scopedLoggerCacheMap.get(cacheKey);

    if (cachedLogger) {
      return cachedLogger;
    }

    const scopedLogger = new ScopedLogger(
      normalizedScopeId,
      normalizedMain,
      normalizedGroup,
    );

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
      scopeId: this.#scopeId,
    });
  }
}

export default Logger;

export type LoggerType = Logger;
export type ScopedLoggerType = ScopedLogger;

export function createLogger(
  options: CreateLoggerOptions,
  scopeId?: LoggerScopeId,
): Logger {
  const normalizedScopeId = resolveLoggerScopeId(scopeId);

  syncRuntimeDefinedLoggerConfig(normalizedScopeId);
  return Logger.getOrCreate(options.main, normalizedScopeId);
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return String(error);
  } catch {
    return 'Unknown error';
  }
}
