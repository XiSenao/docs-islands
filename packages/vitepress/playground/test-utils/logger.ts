import {
  createLoggerWithScopeId,
  DEFAULT_LOGGER_SCOPE_ID,
} from '@docs-islands/utils/logger';

const MAIN_NAME = '@docs-islands/vitepress-playground';

const logger = createLoggerWithScopeId(
  {
    main: MAIN_NAME,
  },
  DEFAULT_LOGGER_SCOPE_ID,
);

export const getPlaygroundLogger = (group: string) =>
  logger.getLoggerByGroup(group);
