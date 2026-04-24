import type { LoggerScopeId } from './types';

export const DEFAULT_LOGGER_SCOPE_ID = '__default__';

type DocsIslandsGlobal = typeof globalThis & {
  __DOCS_ISLANDS_LOGGER_SCOPE_ID__?: LoggerScopeId | undefined;
};

const readGlobalRuntimeLoggerScopeId = (): LoggerScopeId | undefined =>
  (globalThis as DocsIslandsGlobal).__DOCS_ISLANDS_LOGGER_SCOPE_ID__;

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
      ? readGlobalRuntimeLoggerScopeId()
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

  return DEFAULT_LOGGER_SCOPE_ID;
};
