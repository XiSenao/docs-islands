import { createLightGeneralLogger } from '@docs-islands/core/shared/logger';
import type {
  LightGeneralLoggerReturn,
  LoggerLogOptions,
  LogKind,
} from '@docs-islands/utils/logger';

export {
  formatDebugMessage,
  ScopedLogger,
} from '@docs-islands/core/shared/logger';
export {
  createElapsedLogOptions,
  createLogger,
  formatErrorMessage,
} from '@docs-islands/utils/logger';
export type {
  DebugMessageOptions,
  LightGeneralLoggerReturn,
  LoggerElapsedLogOptions,
  LoggerLogOptions,
  LoggerType,
  LogKind,
  ScopedLoggerType,
} from '@docs-islands/utils/logger';

export type BoundLightGeneralLogger = (
  type: LogKind,
  message: string,
  group: string,
  options?: LoggerLogOptions,
) => LightGeneralLoggerReturn;

const MAIN_NAME = '@docs-islands/vitepress';

export const LightGeneralLogger: BoundLightGeneralLogger =
  createLightGeneralLogger(MAIN_NAME);
