import {
  lightGeneralLogger,
  type LightGeneralLoggerReturn,
  type LoggerLogOptions,
  type LoggerScopeId,
  type LogKind,
} from '@docs-islands/utils/logger';
export {
  createLogger,
  formatDebugMessage,
  ScopedLogger,
  type ScopedLoggerType,
} from '@docs-islands/utils/logger';

const MAIN_NAME = '@docs-islands/core';

export type BoundLightGeneralLogger = (
  type: LogKind,
  message: string,
  group: string,
  options?: LoggerLogOptions,
  scopeId?: LoggerScopeId,
) => LightGeneralLoggerReturn;

export function createLightGeneralLogger(
  mainName: string,
): BoundLightGeneralLogger {
  return lightGeneralLogger.bind(null, mainName) as BoundLightGeneralLogger;
}

export const LightGeneralLogger: BoundLightGeneralLogger =
  createLightGeneralLogger(MAIN_NAME);
