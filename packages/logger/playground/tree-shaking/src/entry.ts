import { createLogger } from '@docs-islands/logger';

const logger = createLogger({
  main: '@docs-islands/logger-playground',
}).getLoggerByGroup('tree-shaking.playground');

logger.info('logger playground hidden info', {
  elapsedTimeMs: 1,
});
logger.warn('logger playground visible warning', {
  elapsedTimeMs: 5,
});
