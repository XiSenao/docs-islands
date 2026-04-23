import { createLogger } from '@docs-islands/logger/internal';

const MAIN_NAME = '@docs-islands/vitepress-playground';

const logger = createLogger({
  main: MAIN_NAME,
});

export const getPlaygroundLogger = (group: string) =>
  logger.getLoggerByGroup(group);
