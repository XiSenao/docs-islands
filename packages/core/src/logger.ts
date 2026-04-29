import type { Logger } from '@docs-islands/logger/types';

const MANAGED_LOGGER_RUNTIME_ERROR =
  '@docs-islands/core/logger must be resolved by an integration before runtime use.';

export function createLogger(options: { main: string }): Logger;
export function createLogger(): Logger {
  throw new Error(MANAGED_LOGGER_RUNTIME_ERROR);
}
