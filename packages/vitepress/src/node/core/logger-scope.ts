import {
  getLoggerConfigForScope,
  type LoggerConfig,
  type LoggerScopeId,
} from '@docs-islands/utils/logger';

let loggerScopeCounter = 0;

export const createLoggerScopeId = (): LoggerScopeId => {
  loggerScopeCounter += 1;

  const sequence = loggerScopeCounter.toString(36);
  const entropy = Math.random().toString(36).slice(2, 8);

  return `docs-islands-logger-scope-${sequence}-${entropy}`;
};

export const createLoggerScopeDefines = (
  loggerScopeId: LoggerScopeId,
  logging?: LoggerConfig,
): Record<
  '__DOCS_ISLANDS_LOGGER_CONFIG__' | '__DOCS_ISLANDS_LOGGER_SCOPE_ID__',
  string
> => ({
  __DOCS_ISLANDS_LOGGER_CONFIG__: JSON.stringify(logging ?? null),
  __DOCS_ISLANDS_LOGGER_SCOPE_ID__: JSON.stringify(loggerScopeId),
});

export const createLoggerScopeDefinesFromRegistry = (
  loggerScopeId: LoggerScopeId,
): Record<
  '__DOCS_ISLANDS_LOGGER_CONFIG__' | '__DOCS_ISLANDS_LOGGER_SCOPE_ID__',
  string
> =>
  createLoggerScopeDefines(
    loggerScopeId,
    getLoggerConfigForScope(loggerScopeId),
  );
