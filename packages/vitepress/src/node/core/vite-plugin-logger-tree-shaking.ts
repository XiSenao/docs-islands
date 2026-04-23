import type { LoggerScopeId } from '@docs-islands/logger/internal';
import {
  loggerTreeShaking,
  type LoggerTreeShakingTransformResult,
  transformLoggerTreeShaking as transformBaseLoggerTreeShaking,
} from '@docs-islands/logger/plugin';
import type { Plugin } from 'vite';

export const VITEPRESS_LOGGER_TREE_SHAKING_MODULE_IDS = [
  '@docs-islands/logger',
  '@docs-islands/logger/internal',
  '@docs-islands/vitepress/logger',
] as const;

export const createLoggerTreeShakingPlugin = (
  loggerScopeId?: LoggerScopeId,
): Plugin =>
  loggerTreeShaking.vite({
    loggerModuleIds: VITEPRESS_LOGGER_TREE_SHAKING_MODULE_IDS,
    loggerScopeId,
  }) as Plugin;

export const transformLoggerTreeShaking = (
  code: string,
  id: string,
  loggerScopeId?: LoggerScopeId,
): Promise<LoggerTreeShakingTransformResult | null> =>
  transformBaseLoggerTreeShaking(code, id, {
    loggerModuleIds: VITEPRESS_LOGGER_TREE_SHAKING_MODULE_IDS,
    loggerScopeId,
  });

export {
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  type LoggerTreeShakingTransformOptions,
  type LoggerTreeShakingTransformResult,
} from '@docs-islands/logger/plugin';
