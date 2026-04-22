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
