import type { LoggerScopeId } from '../../types';

export const DEFAULT_LOGGER_SCOPE_ID = '__default__';

export const createLoggerScopeId = (): LoggerScopeId => {
  const timestamp = Date.now().toString(36);
  const entropy =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replaceAll('-', '')
      : Array.from({ length: 4 }, () =>
          Math.floor(Math.random() * 0xff_ff_ff_ff)
            .toString(16)
            .padStart(8, '0'),
        ).join('');

  return `docs-islands-logger-scope-${timestamp}-${entropy}`;
};

export const normalizeLoggerScopeId = (
  scopeId?: LoggerScopeId,
): LoggerScopeId => {
  if (typeof scopeId !== 'string') {
    return DEFAULT_LOGGER_SCOPE_ID;
  }

  const normalizedScopeId = scopeId.trim();

  return normalizedScopeId || DEFAULT_LOGGER_SCOPE_ID;
};
