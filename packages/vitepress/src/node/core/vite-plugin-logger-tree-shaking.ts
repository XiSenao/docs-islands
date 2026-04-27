import {
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  type LoggerScopeId,
  type LoggerTreeShakingTransformResult,
  transformLoggerTreeShaking as transformBaseLoggerTreeShaking,
} from '@docs-islands/logger/internal';
import type { Plugin } from 'vite';

export const VITEPRESS_LOGGER_TREE_SHAKING_MODULE_ID =
  '@docs-islands/vitepress/logger';

export const createLoggerTreeShakingPlugin = (
  loggerScopeId: LoggerScopeId,
): Plugin => ({
  name: LOGGER_TREE_SHAKING_PLUGIN_NAME,
  enforce: 'post',
  apply: 'build',
  transform(code, id) {
    return transformBaseLoggerTreeShaking(code, id, {
      loggerModuleId: VITEPRESS_LOGGER_TREE_SHAKING_MODULE_ID,
      loggerScopeId,
    });
  },
});

export const transformLoggerTreeShaking = (
  code: string,
  id: string,
  loggerScopeId: LoggerScopeId,
): Promise<LoggerTreeShakingTransformResult | null> =>
  transformBaseLoggerTreeShaking(code, id, {
    loggerModuleId: VITEPRESS_LOGGER_TREE_SHAKING_MODULE_ID,
    loggerScopeId,
  });

export {
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  type LoggerTreeShakingTransformOptions,
  type LoggerTreeShakingTransformResult,
} from '@docs-islands/logger/internal';
