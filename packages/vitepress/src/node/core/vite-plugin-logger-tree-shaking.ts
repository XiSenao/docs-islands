import {
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  type LoggerScopeId,
  type LoggerTreeShakingTransformResult,
  transformLoggerTreeShaking as transformBaseLoggerTreeShaking,
} from '@docs-islands/logger/internal';
import type { Plugin } from 'vite';
import {
  CORE_LOGGER_RUNTIME_MODULE_ID,
  VITEPRESS_INTERNAL_LOGGER_MODULE_ID,
} from './vite-plugin-logger-facade';

export const VITEPRESS_LOGGER_TREE_SHAKING_MODULE_ID =
  '@docs-islands/vitepress/logger';
const VITEPRESS_LOGGER_TREE_SHAKING_MODULE_IDS = [
  VITEPRESS_LOGGER_TREE_SHAKING_MODULE_ID,
  VITEPRESS_INTERNAL_LOGGER_MODULE_ID,
  CORE_LOGGER_RUNTIME_MODULE_ID,
];

const transformLoggerTreeShakingForModuleIds = async (
  code: string,
  id: string,
  loggerScopeId: LoggerScopeId,
): Promise<LoggerTreeShakingTransformResult | null> => {
  let transformedCode = code;
  let transformedResult: LoggerTreeShakingTransformResult | null = null;

  for (const loggerModuleId of VITEPRESS_LOGGER_TREE_SHAKING_MODULE_IDS) {
    const result = await transformBaseLoggerTreeShaking(transformedCode, id, {
      loggerModuleId,
      loggerScopeId,
    });

    if (!result) {
      continue;
    }

    transformedCode = result.code;
    transformedResult = {
      ...result,
      code: transformedCode,
    };
  }

  return transformedResult;
};

export const createLoggerTreeShakingPlugin = (
  loggerScopeId: LoggerScopeId,
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
  loggerScopeId: LoggerScopeId,
): Promise<LoggerTreeShakingTransformResult | null> =>
  transformLoggerTreeShakingForModuleIds(code, id, loggerScopeId);

export {
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  type LoggerTreeShakingTransformOptions,
  type LoggerTreeShakingTransformResult,
} from '@docs-islands/logger/internal';
