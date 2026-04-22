import {
  type LoggerConfig,
  setLoggerConfig as setBaseLoggerConfig,
} from '@docs-islands/utils/logger';

/**
 * Updates the default compatibility logger config used by direct
 * `@docs-islands/vitepress/logger` imports outside `createDocsIslands()`.
 *
 * In scope-controlled builds, this API is ignored and warns once because the
 * active logger config is already managed by `createDocsIslands({ logging })`.
 *
 * Pass `null` or `undefined` to clear the fallback config.
 */
export function setLoggerConfig(config: LoggerConfig | null | undefined): void {
  setBaseLoggerConfig(config);
}

export { createLogger, formatDebugMessage } from '@docs-islands/utils/logger';
