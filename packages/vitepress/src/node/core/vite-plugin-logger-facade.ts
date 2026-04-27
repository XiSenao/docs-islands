import {
  getLoggerConfigForScope,
  type LoggerConfig,
  type LoggerScopeId,
} from '@docs-islands/logger/runtime';
import type { Plugin } from 'vite';
import { normalizePath } from 'vite';
import { LOGGER_FACADE_PLUGIN_NAME } from '../constants/core/plugin-names';

export const VITEPRESS_LOGGER_MODULE_ID = '@docs-islands/vitepress/logger';
export const UTILS_LOGGER_MODULE_ID = '@docs-islands/utils/logger';

const VITEPRESS_LOGGER_VIRTUAL_MODULE_PREFIX =
  '\0docs-islands:vitepress-logger:';
const UTILS_LOGGER_VIRTUAL_MODULE_PREFIX =
  '\0docs-islands:vitepress-utils-logger:';

const serializeLoggerConfig = (
  config: LoggerConfig | null | undefined,
): string => (config === undefined ? 'undefined' : JSON.stringify(config));

export const createVitePressLoggerVirtualModuleId = (
  loggerScopeId: LoggerScopeId,
): string => `${VITEPRESS_LOGGER_VIRTUAL_MODULE_PREFIX}${loggerScopeId}`;

const createUtilsLoggerVirtualModuleId = (
  loggerScopeId: LoggerScopeId,
): string => `${UTILS_LOGGER_VIRTUAL_MODULE_PREFIX}${loggerScopeId}`;

const createSharedHeader = (
  loggerScopeId: LoggerScopeId,
  logging: LoggerConfig | null | undefined,
): string => `
const loggerScopeId = ${JSON.stringify(loggerScopeId)};
const loggerConfig = ${serializeLoggerConfig(logging)};
setLoggerConfigForScope(loggerScopeId, loggerConfig);
`;

const createVitePressLoggerFacadeSource = (
  loggerScopeId: LoggerScopeId,
  logging: LoggerConfig | null | undefined,
): string => `
import {
  createLoggerWithScopeId,
  formatDebugMessage,
  setLoggerConfigForScope,
} from '@docs-islands/logger/runtime';

${createSharedHeader(loggerScopeId, logging)}

export { formatDebugMessage };
export const createLogger = (options) =>
  createLoggerWithScopeId(options, loggerScopeId);
`;

const createUtilsLoggerFacadeSource = (
  loggerScopeId: LoggerScopeId,
  logging: LoggerConfig | null | undefined,
): string => `
import {
  createLoggerWithScopeId as createBaseLoggerWithScopeId,
  normalizeLoggerScopeId,
  setLoggerConfigForScope,
  shouldSuppressLog as shouldSuppressBaseLog,
} from '@docs-islands/logger/runtime';

${createSharedHeader(loggerScopeId, logging)}

export const createLogger = (options) =>
  createBaseLoggerWithScopeId(options, loggerScopeId);

export const createLoggerWithScopeId = (options, scopeId) =>
  createBaseLoggerWithScopeId(options, normalizeLoggerScopeId(scopeId));

export const shouldSuppressLog = (kind, options) =>
  shouldSuppressBaseLog(kind, options, loggerScopeId);

export const shouldSuppressLogWithScopeId = (kind, options, scopeId) =>
  shouldSuppressBaseLog(kind, options, normalizeLoggerScopeId(scopeId));

export {
  createElapsedLogOptions,
  DEFAULT_LOGGER_SCOPE_ID,
  formatDebugMessage,
  formatErrorMessage,
  getLoggerConfigForScope,
  resetLoggerConfig,
  resetLoggerConfigForScope,
  setLoggerConfig,
  setLoggerConfigForScope,
  syncRuntimeDefinedLoggerConfig,
} from '@docs-islands/logger/runtime';
`;

export const createVitePressLoggerFacadePlugin = (
  loggerScopeId: LoggerScopeId,
  logging: LoggerConfig | null | undefined = getLoggerConfigForScope(
    loggerScopeId,
  ),
): Plugin => {
  const vitepressLoggerVirtualModuleId =
    createVitePressLoggerVirtualModuleId(loggerScopeId);
  const utilsLoggerVirtualModuleId =
    createUtilsLoggerVirtualModuleId(loggerScopeId);

  return {
    name: LOGGER_FACADE_PLUGIN_NAME,
    enforce: 'pre',
    resolveId: {
      order: 'pre',
      handler(id) {
        const normalizedId = normalizePath(id);

        if (normalizedId === VITEPRESS_LOGGER_MODULE_ID) {
          return vitepressLoggerVirtualModuleId;
        }

        if (normalizedId === UTILS_LOGGER_MODULE_ID) {
          return utilsLoggerVirtualModuleId;
        }

        return null;
      },
    },
    load(id) {
      if (id === vitepressLoggerVirtualModuleId) {
        return createVitePressLoggerFacadeSource(loggerScopeId, logging);
      }

      if (id === utilsLoggerVirtualModuleId) {
        return createUtilsLoggerFacadeSource(loggerScopeId, logging);
      }

      return null;
    },
  };
};
