import Logger, {
  lightGeneralLogger,
  type LightGeneralLoggerReturn,
  type LoggerType,
  type LogKind,
} from '@docs-islands/utils/logger';

const MAIN_NAME = '@docs-islands/vitepress';

let LoggerInstance: LoggerType | null = null;

type BoundLightGeneralLogger = (
  type: LogKind,
  message: string,
  group?: string,
) => LightGeneralLoggerReturn;

export const LightGeneralLogger: BoundLightGeneralLogger =
  lightGeneralLogger.bind(null, MAIN_NAME);

export default function getLoggerInstance(): LoggerType {
  if (LoggerInstance) {
    return LoggerInstance;
  }
  return (LoggerInstance = new Logger(MAIN_NAME));
}
