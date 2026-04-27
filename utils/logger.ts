import {
  createLoggerWithScopeId as createBaseLoggerWithScopeId,
  type CreateLoggerOptions,
  type LoggerScopeId,
  type LoggerType,
  type LogKind,
  normalizeLoggerScopeId,
  shouldSuppressLog as shouldSuppressBaseLog,
} from '@docs-islands/logger/runtime';

const INTERNAL_SCOPE_ERROR =
  '@docs-islands/utils/logger.createLogger() requires a bundler-injected __DOCS_ISLANDS_LOGGER_SCOPE_ID__. Use createLoggerWithScopeId(...) for explicit Node/build logger scopes.';

declare const __DOCS_ISLANDS_LOGGER_SCOPE_ID__: LoggerScopeId | undefined;

const readRawInjectedLoggerScopeId = (): string | undefined => {
  if (typeof __DOCS_ISLANDS_LOGGER_SCOPE_ID__ === 'string') {
    return __DOCS_ISLANDS_LOGGER_SCOPE_ID__;
  }
  return undefined;
};

export const tryReadInjectedLoggerScopeId = (): LoggerScopeId | undefined => {
  const injectedScopeId = readRawInjectedLoggerScopeId();

  if (typeof injectedScopeId !== 'string') {
    return undefined;
  }

  const normalizedScopeId = injectedScopeId.trim();

  if (normalizedScopeId.length === 0) {
    return undefined;
  }

  return normalizeLoggerScopeId(normalizedScopeId);
};

export const readInjectedLoggerScopeId = (): LoggerScopeId => {
  const injectedScopeId = tryReadInjectedLoggerScopeId();

  if (injectedScopeId === undefined) {
    throw new Error(INTERNAL_SCOPE_ERROR);
  }

  return injectedScopeId;
};

export function createLogger(options: CreateLoggerOptions): LoggerType {
  return createBaseLoggerWithScopeId(options, readInjectedLoggerScopeId());
}

export function createLoggerWithScopeId(
  options: CreateLoggerOptions,
  scopeId: LoggerScopeId,
): LoggerType {
  return createBaseLoggerWithScopeId(options, normalizeLoggerScopeId(scopeId));
}

export function shouldSuppressLog(
  kind: LogKind,
  options: {
    group: string;
    main: string;
    message?: string;
  },
): boolean {
  return shouldSuppressBaseLog(kind, options, readInjectedLoggerScopeId());
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
  return shouldSuppressBaseLog(kind, options, normalizeLoggerScopeId(scopeId));
}

export {
  createElapsedLogOptions,
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
