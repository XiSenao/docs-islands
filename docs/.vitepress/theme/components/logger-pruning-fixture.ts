import { createLogger } from '@docs-islands/logger';

const pruningLogger = createLogger({
  main: 'docs.logger.pruning',
}).getLoggerByGroup('fixture');

pruningLogger.debug('__docs_islands_logger_docs_pruned_debug__');
