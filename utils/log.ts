import {
  createLogger,
  lightGeneralLogger,
  type LightGeneralLoggerReturn,
  type LoggerType,
  type LogKind,
} from './logger';

const MAIN_NAME = '@docs-islands/utils';

export type BoundLightGeneralLogger = (
  type: LogKind,
  message: string,
  group?: string,
) => LightGeneralLoggerReturn;

export function createLightGeneralLogger(
  mainName: string,
): BoundLightGeneralLogger {
  return lightGeneralLogger.bind(null, mainName) as BoundLightGeneralLogger;
}

export function createLoggerAccessor(mainName: string): () => LoggerType {
  let loggerInstance: LoggerType | null = null;

  return function getLoggerInstance(): LoggerType {
    if (loggerInstance) {
      return loggerInstance;
    }

    loggerInstance = createLogger({
      main: mainName,
    });
    return loggerInstance;
  };
}

export const LightGeneralLogger: BoundLightGeneralLogger =
  createLightGeneralLogger(MAIN_NAME);

const getLoggerInstance: () => LoggerType = createLoggerAccessor(MAIN_NAME);

export default getLoggerInstance;
