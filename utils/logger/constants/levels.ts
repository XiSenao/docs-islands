import type {
  LoggerLogOptions,
  LoggerVisibilityLevel,
  LogKind,
} from '../types';

export const LOG_KIND_TO_LEVEL: Record<
  Exclude<LogKind, 'debug'>,
  LoggerVisibilityLevel
> = {
  error: 'error',
  info: 'info',
  success: 'success',
  warn: 'warn',
};

export const DEFAULT_RESOLVED_LEVELS: ReadonlySet<LoggerVisibilityLevel> =
  new Set<LoggerVisibilityLevel>(['error', 'warn', 'info', 'success']);

export const ROOT_LOGGER_RULE_LABEL = '<root>';

export const INSTANT_LOG_OPTIONS: LoggerLogOptions = { elapsedTimeMs: 0 };
