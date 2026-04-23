import type {
  CreateLoggerOptions,
  LoggerScopeId,
  LoggerType,
} from '@docs-islands/logger/internal';
import {
  createLogger as createBaseLogger,
  readRuntimeLoggerScopeId,
} from '@docs-islands/logger/internal';

let hasWarnedAboutMissingRuntimeScope = false;

const GENERIC_LOGGER_DOCS_URL = 'https://docs.senao.me/docs-islands/logger';

const warnAboutMissingRuntimeScope = (): void => {
  if (hasWarnedAboutMissingRuntimeScope) {
    return;
  }

  // eslint-disable-next-line no-console -- check console availability before emitting the intentional public facade warning
  if (typeof console === 'undefined' || typeof console.warn !== 'function') {
    return;
  }

  hasWarnedAboutMissingRuntimeScope = true;

  // eslint-disable-next-line no-console -- this public facade intentionally warns when createDocsIslands() did not inject a logger scope
  console.warn(
    [
      '@docs-islands/vitepress/logger is running without a logger scope injected by createDocsIslands().',
      'Use createDocsIslands() to manage the VitePress integration, or use the generic @docs-islands/logger API instead.',
      `See ${GENERIC_LOGGER_DOCS_URL}`,
    ].join(' '),
  );
};

export function createLogger(
  options: CreateLoggerOptions,
  scopeId?: LoggerScopeId,
): LoggerType {
  if (scopeId === undefined && readRuntimeLoggerScopeId() === undefined) {
    warnAboutMissingRuntimeScope();
  }

  return createBaseLogger(options, scopeId);
}

export { formatDebugMessage } from '@docs-islands/logger/internal';
