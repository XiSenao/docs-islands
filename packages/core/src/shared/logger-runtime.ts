import type {
  CreateLoggerOptions,
  LoggerType,
} from '@docs-islands/logger/runtime';

const MANAGED_LOGGER_RUNTIME_ERROR =
  '@docs-islands/core/shared/logger-runtime must be resolved by an integration before runtime use.';

export function createLogger(options: CreateLoggerOptions): LoggerType;
export function createLogger(): LoggerType {
  throw new Error(MANAGED_LOGGER_RUNTIME_ERROR);
}

export {
  createElapsedLogOptions,
  formatErrorMessage,
} from '@docs-islands/logger/runtime';

export type {
  CreateLoggerOptions,
  LoggerElapsedLogOptions,
  LoggerLogOptions,
  LoggerType,
  ScopedLoggerType,
} from '@docs-islands/logger/runtime';
