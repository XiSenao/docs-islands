import { setLoggerConfig } from '@docs-islands/utils/logger';

const runtimeLoggerConfig =
  typeof __DOCS_ISLANDS_LOGGER_CONFIG__ === 'undefined'
    ? undefined
    : __DOCS_ISLANDS_LOGGER_CONFIG__;

setLoggerConfig(runtimeLoggerConfig ?? undefined);
