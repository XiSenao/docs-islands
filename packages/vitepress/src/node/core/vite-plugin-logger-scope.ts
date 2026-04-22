import type { LoggerScopeId } from '@docs-islands/utils/logger';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'pathe';
import type { Plugin } from 'vite';
import { normalizePath } from 'vite';

const LOGGER_SCOPE_TAKEOVER_VIRTUAL_PREFIX =
  '\0docs-islands:logger-scope:takeover:';
export const LOGGER_SCOPE_TAKEOVER_PLUGIN_NAME =
  'docs-islands:logger-scope:takeover';
export const LOGGER_SCOPE_UNCONTROLLED_QUERY = 'docs-islands-uncontrolled';
const CONTROLLED_LOGGER_SET_CONFIG_WARNING =
  'The current logger import is a controlled logger already bound to a docs-islands logger scope. ' +
  'setLoggerConfig(...) only affects the default compatibility scope, so this call is ignored in the current controlled context. ' +
  'Update the logger configuration through createDocsIslands({ logging: ... }) instead.';

type LoggerTakeoverSurface =
  | 'vitepress-shared'
  | 'core-shared'
  | 'vitepress-internal-light';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vitepressSharedLoggerPath = normalizePath(
  resolve(__dirname, '../../shared/logger.ts'),
);
const vitepressInternalLightLoggerPath = normalizePath(
  resolve(__dirname, '../../shared/internal-logger.ts'),
);
const require = createRequire(import.meta.url);
const coreSharedLoggerPath = normalizePath(
  require.resolve('@docs-islands/core/shared/logger'),
);

const normalizeResolvedId = (id: string): string =>
  normalizePath(id).replace(/[#?].*$/s, '');

const hasUncontrolledLoggerQuery = (id: string): boolean =>
  new RegExp(
    String.raw`(?:\?|&)${LOGGER_SCOPE_UNCONTROLLED_QUERY}(?:&|$)`,
  ).test(id);

const getVirtualId = (surface: LoggerTakeoverSurface): string =>
  `${LOGGER_SCOPE_TAKEOVER_VIRTUAL_PREFIX}${surface}`;

const getSurfaceFromVirtualId = (id: string): LoggerTakeoverSurface | null => {
  if (!id.startsWith(LOGGER_SCOPE_TAKEOVER_VIRTUAL_PREFIX)) {
    return null;
  }

  const surface = id.slice(LOGGER_SCOPE_TAKEOVER_VIRTUAL_PREFIX.length);

  if (
    surface === 'vitepress-shared' ||
    surface === 'core-shared' ||
    surface === 'vitepress-internal-light'
  ) {
    return surface;
  }

  return null;
};

const getScopePrelude = (loggerScopeId: LoggerScopeId): string => `
const __docs_islands_logger_scope_id__ =
  typeof __DOCS_ISLANDS_LOGGER_SCOPE_ID__ === 'string'
    ? __DOCS_ISLANDS_LOGGER_SCOPE_ID__
    : ${JSON.stringify(loggerScopeId)};
`;

const createVitePressSharedWrapperSource = (
  loggerScopeId: LoggerScopeId,
): string =>
  `
import {
  createLogger as __docs_islands_base_create_logger__,
  formatDebugMessage
} from '@docs-islands/utils/logger';

${getScopePrelude(loggerScopeId)}

let __docs_islands_controlled_logger_set_config_warned__ = false;

export function createLogger(options) {
  return __docs_islands_base_create_logger__(
    options,
    __docs_islands_logger_scope_id__
  );
}

export function setLoggerConfig(_config) {
  if (__docs_islands_controlled_logger_set_config_warned__) {
    return;
  }

  __docs_islands_controlled_logger_set_config_warned__ = true;
  console.warn(${JSON.stringify(CONTROLLED_LOGGER_SET_CONFIG_WARNING)});
}

export { formatDebugMessage };
`.trim();

const createCoreSharedWrapperSource = (loggerScopeId: LoggerScopeId): string =>
  `
import {
  createLogger as __docs_islands_base_create_logger__,
  formatDebugMessage,
  lightGeneralLogger as __docs_islands_light_general_logger__,
  ScopedLogger
} from '@docs-islands/utils/logger';

${getScopePrelude(loggerScopeId)}

export function createLogger(options) {
  return __docs_islands_base_create_logger__(
    options,
    __docs_islands_logger_scope_id__
  );
}

export { formatDebugMessage, ScopedLogger };

export function createLightGeneralLogger(mainName) {
  return (type, message, group, options, scopeId = __docs_islands_logger_scope_id__) =>
    __docs_islands_light_general_logger__(
      mainName,
      type,
      message,
      group,
      options,
      scopeId
    );
}

const MAIN_NAME = '@docs-islands/core';

export const LightGeneralLogger = createLightGeneralLogger(MAIN_NAME);
`.trim();

const createVitePressInternalLightWrapperSource = (
  loggerScopeId: LoggerScopeId,
): string =>
  `
import {
  createElapsedLogOptions,
  createLogger as __docs_islands_base_create_logger__,
  formatDebugMessage,
  formatErrorMessage,
  lightGeneralLogger as __docs_islands_light_general_logger__,
  ScopedLogger
} from '@docs-islands/utils/logger';

${getScopePrelude(loggerScopeId)}

export function createLogger(options) {
  return __docs_islands_base_create_logger__(
    options,
    __docs_islands_logger_scope_id__
  );
}

export {
  createElapsedLogOptions,
  formatDebugMessage,
  formatErrorMessage,
  ScopedLogger
};

const MAIN_NAME = '@docs-islands/vitepress';

export const LightGeneralLogger = (type, message, group, options, scopeId = __docs_islands_logger_scope_id__) =>
  __docs_islands_light_general_logger__(
    MAIN_NAME,
    type,
    message,
    group,
    options,
    scopeId
  );
`.trim();

const createWrapperSource = (
  surface: LoggerTakeoverSurface,
  loggerScopeId: LoggerScopeId,
): string => {
  switch (surface) {
    case 'core-shared': {
      return createCoreSharedWrapperSource(loggerScopeId);
    }
    case 'vitepress-internal-light': {
      return createVitePressInternalLightWrapperSource(loggerScopeId);
    }
    default: {
      return createVitePressSharedWrapperSource(loggerScopeId);
    }
  }
};

export const createLoggerScopeTakeoverPlugin = (
  loggerScopeId: LoggerScopeId,
): Plugin => ({
  name: LOGGER_SCOPE_TAKEOVER_PLUGIN_NAME,
  enforce: 'pre',
  resolveId: {
    order: 'pre',
    async handler(id, importer) {
      if (hasUncontrolledLoggerQuery(id)) {
        return null;
      }

      const directSurface = (() => {
        if (
          id === '@docs-islands/vitepress/logger' ||
          id === '#shared/logger'
        ) {
          return 'vitepress-shared' as const;
        }

        if (id === '@docs-islands/core/shared/logger') {
          return 'core-shared' as const;
        }

        if (id === '#shared/internal-logger') {
          return 'vitepress-internal-light' as const;
        }

        return null;
      })();

      if (directSurface) {
        return getVirtualId(directSurface);
      }

      if (getSurfaceFromVirtualId(id)) {
        return id;
      }

      const resolved = await this.resolve(id, importer, {
        skipSelf: true,
      });

      if (!resolved) {
        return null;
      }

      if (hasUncontrolledLoggerQuery(resolved.id)) {
        return resolved.id;
      }

      const normalizedResolvedId = normalizeResolvedId(resolved.id);

      if (normalizedResolvedId === vitepressSharedLoggerPath) {
        return getVirtualId('vitepress-shared');
      }

      if (normalizedResolvedId === coreSharedLoggerPath) {
        return getVirtualId('core-shared');
      }

      if (normalizedResolvedId === vitepressInternalLightLoggerPath) {
        return getVirtualId('vitepress-internal-light');
      }

      return null;
    },
  },
  load(id) {
    const surface = getSurfaceFromVirtualId(id);

    if (!surface) {
      return null;
    }

    return createWrapperSource(surface, loggerScopeId);
  },
});
