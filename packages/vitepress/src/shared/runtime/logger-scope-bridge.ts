import type { LoggerConfig, LoggerScopeId } from '@docs-islands/utils/logger';

type DocsIslandsGlobal = typeof globalThis & {
  __DOCS_ISLANDS_LOGGER_CONFIG__?: LoggerConfig | null | undefined;
  __DOCS_ISLANDS_LOGGER_SCOPE_ID__?: LoggerScopeId | undefined;
};

const docsIslandsGlobal = globalThis as DocsIslandsGlobal;
const injectedLoggerConfig = docsIslandsGlobal.__DOCS_ISLANDS_LOGGER_CONFIG__;
const injectedScopeId = docsIslandsGlobal.__DOCS_ISLANDS_LOGGER_SCOPE_ID__;

if (injectedScopeId !== undefined) {
  docsIslandsGlobal.__DOCS_ISLANDS_LOGGER_SCOPE_ID__ = injectedScopeId;
}

if (injectedLoggerConfig !== undefined) {
  docsIslandsGlobal.__DOCS_ISLANDS_LOGGER_CONFIG__ = injectedLoggerConfig;
}
