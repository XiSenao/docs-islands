import {
  createLogger,
  type LoggerScopeId,
  type LoggerType,
  type ScopedLoggerType,
} from '@docs-islands/logger/internal';

const MAIN_NAME = '@docs-islands/core';

export const createCoreLogger = (scopeId?: LoggerScopeId): LoggerType =>
  createLogger(
    {
      main: MAIN_NAME,
    },
    scopeId,
  );

export const getCoreGroupLogger = (
  group: string,
  scopeId?: LoggerScopeId,
): ScopedLoggerType => createCoreLogger(scopeId).getLoggerByGroup(group);
