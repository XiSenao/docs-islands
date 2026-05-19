import { createLogger } from '@docs-islands/logger';
import { formatErrorMessage } from '@docs-islands/logger/helper';

const logger = createLogger({
  main: '@docs-islands/lattice',
});

export const CliLogger = logger.getLoggerByGroup('task.cli');
export const GraphLogger = logger.getLoggerByGroup('task.graph');
export const PackageBoundaryLogger = logger.getLoggerByGroup(
  'task.package-boundary',
);
export const PathsLogger = logger.getLoggerByGroup('task.paths');
export const ProofLogger = logger.getLoggerByGroup('task.proof');

export { formatErrorMessage };
