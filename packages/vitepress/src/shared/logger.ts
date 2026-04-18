import {
  type BoundLightGeneralLogger,
  createLightGeneralLogger,
  createLoggerAccessor,
} from '@docs-islands/core/shared/logger';
import type { LoggerType } from '@docs-islands/utils/logger';

export {
  emitRuntimeLog,
  formatDebugMessage,
} from '@docs-islands/core/shared/logger';

const MAIN_NAME = '@docs-islands/vitepress';

export const LightGeneralLogger: BoundLightGeneralLogger =
  createLightGeneralLogger(MAIN_NAME);

const getLoggerInstance: () => LoggerType = createLoggerAccessor(MAIN_NAME);

export default getLoggerInstance;
