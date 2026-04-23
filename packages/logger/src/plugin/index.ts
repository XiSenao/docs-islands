import { createUnplugin, type UnpluginFactory } from 'unplugin';
import {
  type LoggerConfig,
  type LoggerScopeId,
  setLoggerConfigForScope,
} from '../internal';
import {
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  type LoggerTreeShakingTransformOptions,
  transformLoggerTreeShaking,
} from './transform';

let loggerTreeShakingScopeIndex = 0;

export interface LoggerTreeShakingOptions
  extends Omit<LoggerTreeShakingTransformOptions, 'loggerScopeId'> {
  loggerScopeId?: LoggerScopeId;
  logging?: LoggerConfig;
}

const createFallbackLoggerScopeId = (): LoggerScopeId => {
  loggerTreeShakingScopeIndex += 1;
  return `logger-tree-shaking:${loggerTreeShakingScopeIndex}`;
};

const factory: UnpluginFactory<LoggerTreeShakingOptions | undefined> = (
  options = {},
) => {
  const loggerScopeId = options.loggerScopeId ?? createFallbackLoggerScopeId();

  if (options.logging !== undefined) {
    setLoggerConfigForScope(loggerScopeId, options.logging);
  }

  return {
    name: LOGGER_TREE_SHAKING_PLUGIN_NAME,
    enforce: 'post',
    vite: {
      apply: 'build',
    },
    transform(code, id) {
      return transformLoggerTreeShaking(code, id, {
        loggerModuleIds: options.loggerModuleIds,
        loggerScopeId,
      });
    },
  };
};

export const loggerTreeShaking = createUnplugin(factory);

export {
  DEFAULT_LOGGER_MODULE_IDS,
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  transformLoggerTreeShaking,
  type LoggerTreeShakingTransformOptions,
  type LoggerTreeShakingTransformResult,
} from './transform';
