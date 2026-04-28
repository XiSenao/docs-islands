import type {
  CreateLoggerOptions,
  LoggerScopeId,
  LoggerType,
  LogKind,
} from '@docs-islands/logger/runtime';
import { shouldSuppressLog as shouldSuppressBaseLog } from '@docs-islands/logger/runtime';

const MANAGED_LOGGER_ERROR =
  '@docs-islands/vitepress/internal/logger must be resolved by createDocsIslands() before runtime use.';

export function createLogger(options: CreateLoggerOptions): LoggerType;
export function createLogger(): LoggerType {
  throw new Error(MANAGED_LOGGER_ERROR);
}

export function shouldSuppressLog(
  kind: LogKind,
  options: {
    group: string;
    main: string;
    message?: string;
  },
): boolean;
export function shouldSuppressLog(): boolean {
  throw new Error(MANAGED_LOGGER_ERROR);
}

export function shouldSuppressLogWithScopeId(
  kind: LogKind,
  options: {
    group: string;
    main: string;
    message?: string;
  },
  scopeId: LoggerScopeId,
): boolean {
  return shouldSuppressBaseLog(kind, options, scopeId);
}

export {
  createElapsedLogOptions,
  createLoggerWithScopeId,
  DEFAULT_LOGGER_SCOPE_ID,
  formatDebugMessage,
  formatErrorMessage,
  getLoggerConfigForScope,
  resetLoggerConfig,
  resetLoggerConfigForScope,
  setLoggerConfig,
  setLoggerConfigForScope,
  syncRuntimeDefinedLoggerConfig,
} from '@docs-islands/logger/runtime';

export type {
  CreateLoggerOptions,
  DebugMessageOptions,
  LoggerConfig,
  LoggerElapsedLogOptions,
  LoggerLogOptions,
  LoggerRule,
  LoggerScopeId,
  LoggerType,
  LoggerVisibilityLevel,
  LogKind,
  ScopedLoggerType,
} from '@docs-islands/logger/runtime';
