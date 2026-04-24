import {
  createLoggerWithScopeId,
  DEFAULT_LOGGER_SCOPE_ID,
  type LoggerScopeId,
  type LoggerType,
  type ScopedLoggerType,
} from '@docs-islands/utils/logger';

const MAIN_NAME = '@docs-islands/vitepress';

export const createVitePressLogger = (scopeId?: LoggerScopeId): LoggerType =>
  createLoggerWithScopeId(
    {
      main: MAIN_NAME,
    },
    scopeId ?? DEFAULT_LOGGER_SCOPE_ID,
  );

export const getVitePressGroupLogger = (
  group: string,
  scopeId?: LoggerScopeId,
): ScopedLoggerType => createVitePressLogger(scopeId).getLoggerByGroup(group);
