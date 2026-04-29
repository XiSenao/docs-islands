import {
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  transformLoggerTreeShaking as transformBaseLoggerTreeShaking,
} from '@docs-islands/logger/plugin';
import type { LoggerTreeShakingTransformResult } from '@docs-islands/logger/types';
import type { Plugin } from 'vite';

export const VITEPRESS_LOGGER_TREE_SHAKING_MODULE_ID =
  '@docs-islands/vitepress/logger';

const transformLoggerTreeShakingForModuleIds = async (
  code: string,
  id: string,
  loggerScopeId: string,
): Promise<LoggerTreeShakingTransformResult | null> => {
  return transformBaseLoggerTreeShaking(code, id, {
    loggerModuleId: VITEPRESS_LOGGER_TREE_SHAKING_MODULE_ID,
    loggerScopeId,
  });
};

export const createLoggerTreeShakingPlugin = (
  loggerScopeId: string,
): Plugin => ({
  name: LOGGER_TREE_SHAKING_PLUGIN_NAME,
  enforce: 'post',
  apply: 'build',
  transform: (code, id) =>
    transformLoggerTreeShakingForModuleIds(code, id, loggerScopeId),
});

export const transformLoggerTreeShaking = (
  code: string,
  id: string,
  loggerScopeId: string,
): Promise<LoggerTreeShakingTransformResult | null> =>
  transformLoggerTreeShakingForModuleIds(code, id, loggerScopeId);

export { LOGGER_TREE_SHAKING_PLUGIN_NAME } from '@docs-islands/logger/plugin';
