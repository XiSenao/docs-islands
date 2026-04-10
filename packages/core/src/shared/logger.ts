import Logger, {
  lightGeneralLogger,
  type LightGeneralLoggerReturn,
  type LoggerType,
  type LogKind,
} from '@docs-islands/utils/logger';

const MAIN_NAME = '@docs-islands/core';

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

    loggerInstance = new Logger(mainName);
    return loggerInstance;
  };
}

export const LightGeneralLogger = createLightGeneralLogger(MAIN_NAME);

const getLoggerInstance = createLoggerAccessor(MAIN_NAME);

export default getLoggerInstance;
