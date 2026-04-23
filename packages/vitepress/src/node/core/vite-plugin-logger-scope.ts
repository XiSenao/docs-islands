import type { LoggerScopeId } from '@docs-islands/logger/internal';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'pathe';
import type { Plugin } from 'vite';
import { normalizePath } from 'vite';

const LOGGER_SCOPE_TAKEOVER_VIRTUAL_PREFIX =
  '\0docs-islands:logger-scope:takeover:';
export const LOGGER_SCOPE_TAKEOVER_PLUGIN_NAME =
  'docs-islands:logger-scope:takeover';

type LoggerTakeoverSurface = 'vitepress-shared' | 'core-shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vitepressSharedLoggerPath = normalizePath(
  resolve(__dirname, '../../shared/logger.ts'),
);
const require = createRequire(import.meta.url);
const coreSharedLoggerPath = normalizePath(
  require.resolve('@docs-islands/core/shared/logger'),
);

const normalizeResolvedId = (id: string): string =>
  normalizePath(id).replace(/[#?].*$/s, '');

const getVirtualId = (surface: LoggerTakeoverSurface): string =>
  `${LOGGER_SCOPE_TAKEOVER_VIRTUAL_PREFIX}${surface}`;

const getSurfaceFromVirtualId = (id: string): LoggerTakeoverSurface | null => {
  if (!id.startsWith(LOGGER_SCOPE_TAKEOVER_VIRTUAL_PREFIX)) {
    return null;
  }

  const surface = id.slice(LOGGER_SCOPE_TAKEOVER_VIRTUAL_PREFIX.length);

  if (surface === 'vitepress-shared' || surface === 'core-shared') {
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
} from '@docs-islands/logger/internal';

${getScopePrelude(loggerScopeId)}

export function createLogger(options) {
  return __docs_islands_base_create_logger__(
    options,
    __docs_islands_logger_scope_id__
  );
}

export { formatDebugMessage };
`.trim();

const createCoreSharedWrapperSource = (loggerScopeId: LoggerScopeId): string =>
  `
import {
  createLogger as __docs_islands_base_create_logger__,
  formatDebugMessage,
  ScopedLogger
} from '@docs-islands/logger/internal';

${getScopePrelude(loggerScopeId)}

export function createLogger(options) {
  return __docs_islands_base_create_logger__(
    options,
    __docs_islands_logger_scope_id__
  );
}

export { formatDebugMessage, ScopedLogger };
`.trim();

const createWrapperSource = (
  surface: LoggerTakeoverSurface,
  loggerScopeId: LoggerScopeId,
): string => {
  switch (surface) {
    case 'core-shared': {
      return createCoreSharedWrapperSource(loggerScopeId);
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

      const normalizedResolvedId = normalizeResolvedId(resolved.id);

      if (normalizedResolvedId === vitepressSharedLoggerPath) {
        return getVirtualId('vitepress-shared');
      }

      if (normalizedResolvedId === coreSharedLoggerPath) {
        return getVirtualId('core-shared');
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
