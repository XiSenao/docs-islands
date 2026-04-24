import {
  createLoggerWithScopeId,
  DEFAULT_LOGGER_SCOPE_ID,
  type LoggerScopeId,
  type LoggerType,
  type ScopedLoggerType,
} from '@docs-islands/utils/logger';

const MAIN_NAME = '@docs-islands/core';

export const createCoreLogger = (scopeId?: LoggerScopeId): LoggerType =>
  createLoggerWithScopeId(
    {
      main: MAIN_NAME,
    },
    scopeId ?? DEFAULT_LOGGER_SCOPE_ID,
  );

export const getCoreGroupLogger = (
  group: string,
  scopeId?: LoggerScopeId,
): ScopedLoggerType => createCoreLogger(scopeId).getLoggerByGroup(group);
