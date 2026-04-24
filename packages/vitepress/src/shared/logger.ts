import type {
  CreateLoggerOptions,
  LoggerType,
} from '@docs-islands/utils/logger';
import {
  createLogger as createScopedLogger,
  tryReadInjectedLoggerScopeId,
} from '@docs-islands/utils/logger';

const GENERIC_LOGGER_DOCS_URL = 'https://docs.senao.me/docs-islands/logger';

export function createLogger(options: CreateLoggerOptions): LoggerType {
  if (tryReadInjectedLoggerScopeId() === undefined) {
    throw new Error(
      [
        '@docs-islands/vitepress/logger is running without a logger scope injected by createDocsIslands().',
        'Use createDocsIslands() to manage the VitePress integration, or use the generic @docs-islands/logger API instead.',
        `See ${GENERIC_LOGGER_DOCS_URL}`,
      ].join(' '),
    );
  }

  return createScopedLogger(options);
}

export { formatDebugMessage } from '@docs-islands/utils/logger';
