import {
  createLoggerWithScopeId,
  type LoggerScopeId,
  type ScopedLoggerType,
} from '@docs-islands/logger/runtime';

const MAIN_NAME = '@docs-islands/vitepress';

export const getVitePressGroupLogger = (
  group: string,
  scopeId: LoggerScopeId,
): ScopedLoggerType =>
  createLoggerWithScopeId(
    {
      main: MAIN_NAME,
    },
    scopeId,
  ).getLoggerByGroup(group);
