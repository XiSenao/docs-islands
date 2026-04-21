import {
  createLogger,
  lightGeneralLogger,
  type LightGeneralLoggerReturn,
  type LoggerLogOptions,
  type LoggerType,
  type LogKind,
} from './logger';

const MAIN_NAME = '@docs-islands/utils';

export type BoundLightGeneralLogger = (
  type: LogKind,
  message: string,
  group: string,
  options?: LoggerLogOptions,
) => LightGeneralLoggerReturn;

export function createLightGeneralLogger(
  mainName: string,
): BoundLightGeneralLogger {
  return lightGeneralLogger.bind(null, mainName) as BoundLightGeneralLogger;
}

export const LightGeneralLogger: BoundLightGeneralLogger =
  createLightGeneralLogger(MAIN_NAME);

export const UtilsLogger: LoggerType = createLogger({
  main: MAIN_NAME,
});

export { createLogger, ScopedLogger, type ScopedLoggerType } from './logger';
