import type {
  CreateLoggerOptions,
  LoggerType,
} from '@docs-islands/logger/runtime';

const GENERIC_LOGGER_DOCS_URL = 'https://docs.senao.me/docs-islands/logger';

export function createLogger(options: CreateLoggerOptions): LoggerType;
export function createLogger(): LoggerType {
  throw new Error(
    [
      '@docs-islands/vitepress/logger must be resolved by createDocsIslands() before runtime use.',
      'Use createDocsIslands() to manage the VitePress integration, or use the generic @docs-islands/logger API instead.',
      `See ${GENERIC_LOGGER_DOCS_URL}`,
    ].join(' '),
  );
}

export { formatDebugMessage } from '@docs-islands/logger/runtime';
