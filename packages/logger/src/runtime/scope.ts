import type { LoggerScopeId } from './types';

export const DEFAULT_LOGGER_SCOPE_ID = '__default__';

export const normalizeLoggerScopeId = (
  scopeId?: LoggerScopeId,
): LoggerScopeId => {
  if (typeof scopeId !== 'string') {
    return DEFAULT_LOGGER_SCOPE_ID;
  }

  const normalizedScopeId = scopeId.trim();

  return normalizedScopeId || DEFAULT_LOGGER_SCOPE_ID;
};

export const readRuntimeLoggerScopeId = (): LoggerScopeId | undefined => {
  const runtimeScopeId =
    typeof __DOCS_ISLANDS_LOGGER_SCOPE_ID__ === 'undefined'
      ? undefined
      : __DOCS_ISLANDS_LOGGER_SCOPE_ID__;

  if (typeof runtimeScopeId !== 'string') {
    return undefined;
  }

  return normalizeLoggerScopeId(runtimeScopeId);
};

export const resolveLoggerScopeId = (
  scopeId?: LoggerScopeId,
): LoggerScopeId => {
  if (typeof scopeId === 'string') {
    return normalizeLoggerScopeId(scopeId);
  }

  return readRuntimeLoggerScopeId() ?? DEFAULT_LOGGER_SCOPE_ID;
};
