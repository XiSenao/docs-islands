import {
  createLogger,
  type LoggerScopeId,
  type LoggerType,
  type ScopedLoggerType,
} from '@docs-islands/logger/internal';

const MAIN_NAME = '@docs-islands/vitepress';

export const createVitePressLogger = (scopeId?: LoggerScopeId): LoggerType =>
  createLogger(
    {
      main: MAIN_NAME,
    },
    scopeId,
  );

export const getVitePressGroupLogger = (
  group: string,
  scopeId?: LoggerScopeId,
): ScopedLoggerType => createVitePressLogger(scopeId).getLoggerByGroup(group);
