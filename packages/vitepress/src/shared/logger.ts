import type {
  CreateLoggerOptions,
  LoggerType,
} from '@docs-islands/logger/runtime';

export function createLogger(options: CreateLoggerOptions): LoggerType;
export function createLogger(): LoggerType {
  throw new Error(
    '@docs-islands/vitepress/logger must be resolved by createDocsIslands()',
  );
}

export { formatDebugMessage } from '@docs-islands/logger/runtime';
