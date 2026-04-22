import {
  getLoggerConfigForScope,
  type LoggerConfig,
  type LoggerScopeId,
} from '@docs-islands/utils/logger';
import { randomUUID } from 'node:crypto';

export const createLoggerScopeId = (): LoggerScopeId => {
  const timestamp = Date.now().toString(36);
  const entropy = randomUUID().replaceAll('-', '');

  return `docs-islands-logger-scope-${timestamp}-${entropy}`;
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
