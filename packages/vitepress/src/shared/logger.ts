import logger, {
  lightGeneralLogger,
  type LightGeneralLoggerOptions,
  type LogKind,
} from '@docs-islands/utils/logger';

const MAIN_NAME = '@docs-islands/vitepress';

const Logger: InstanceType<typeof logger> = new logger(MAIN_NAME);

type BoundLightGeneralLogger = (
  type: LogKind,
  message: string,
  group?: string,
  options?: LightGeneralLoggerOptions,
) => string | void;

export const LightGeneralLogger: BoundLightGeneralLogger =
  lightGeneralLogger.bind(null, MAIN_NAME);

export default Logger;
