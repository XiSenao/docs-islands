import type {
  CreateLoggerOptions,
  LoggerScopeId,
  LoggerType,
} from '@docs-islands/logger/internal';
import {
  createLogger as createBaseLogger,
  readRuntimeLoggerScopeId,
} from '@docs-islands/logger/internal';

const GENERIC_LOGGER_DOCS_URL = 'https://docs.senao.me/docs-islands/logger';

export function createLogger(
  options: CreateLoggerOptions,
  scopeId?: LoggerScopeId,
): LoggerType {
  if (scopeId === undefined && readRuntimeLoggerScopeId() === undefined) {
    throw new Error(
      [
        '@docs-islands/vitepress/logger is running without a logger scope injected by createDocsIslands().',
        'Use createDocsIslands() to manage the VitePress integration, or use the generic @docs-islands/logger API instead.',
        `See ${GENERIC_LOGGER_DOCS_URL}`,
      ].join(' '),
    );
  }

  return createBaseLogger(options, scopeId);
}

export { formatDebugMessage } from '@docs-islands/logger/internal';
