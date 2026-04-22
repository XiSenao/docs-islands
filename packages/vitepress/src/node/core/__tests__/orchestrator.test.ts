/**
 * @vitest-environment node
 */
import type { PluginOption } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { react } from '../../adapters/react';
import { REACT_RUNTIME_BUNDLING_PLUGIN_NAME } from '../../constants/adapters/react/plugin-names';
import {
  FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
  INLINE_PAGE_RESOLUTION_PLUGIN_NAME,
  SITE_DEVTOOLS_OPTIONAL_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME,
  SITE_DEVTOOLS_SOURCE_PLUGIN_NAME,
} from '../../constants/core/plugin-names';
import { createLoggerScopeId } from '../logger-scope';
import { LOGGER_SCOPE_TAKEOVER_PLUGIN_NAME } from '../vite-plugin-logger-scope';

vi.mock('@vitejs/plugin-react-swc', () => ({
  default: vi.fn(() => ({
    name: 'mock-react-swc',
  })),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function findPluginByName(
  plugins: PluginOption[] | undefined,
  name: string,
): any {
  if (!plugins) return null;
  for (const plugin of plugins) {
    if (Array.isArray(plugin)) {
      const found = findPluginByName(plugin, name);
      if (found) return found;
      continue;
    }
    if (plugin && typeof plugin === 'object' && 'name' in plugin) {
      if ((plugin as { name?: string }).name === name) {
        return plugin;
      }
    }
  }
  return null;
}

function findPluginIndexByName(
  plugins: PluginOption[] | undefined,
  name: string,
): number {
  if (!plugins) {
    return -1;
  }

  return plugins.findIndex(
    (plugin) =>
      Boolean(plugin) &&
      !Array.isArray(plugin) &&
      typeof plugin === 'object' &&
      'name' in plugin &&
      (plugin as { name?: string }).name === name,
  );
}

describe('createDocsIslands', () => {
  it('creates readable collision-resistant logger scope ids', () => {
    const startedAt = Date.now();
    const firstScopeId = createLoggerScopeId();
    const secondScopeId = createLoggerScopeId();
    const finishedAt = Date.now();

    expect(firstScopeId).toMatch(
      /^docs-islands-logger-scope-[\da-z]+-[\da-f]{32}$/,
    );
    expect(secondScopeId).toMatch(
      /^docs-islands-logger-scope-[\da-z]+-[\da-f]{32}$/,
    );

    const firstTimestamp = firstScopeId.split('-')[4];
    const secondTimestamp = secondScopeId.split('-')[4];

    expect(Number.parseInt(firstTimestamp!, 36)).toBeGreaterThanOrEqual(
      startedAt,
    );
    expect(Number.parseInt(firstTimestamp!, 36)).toBeLessThanOrEqual(
      finishedAt,
    );
    expect(Number.parseInt(secondTimestamp!, 36)).toBeGreaterThanOrEqual(
      startedAt,
    );
    expect(Number.parseInt(secondTimestamp!, 36)).toBeLessThanOrEqual(
      finishedAt,
    );
    expect(firstScopeId).not.toBe(secondScopeId);
  });

  it('registers the React integration when applied', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');

    const vitepressConfig: any = {};
    createDocsIslands({
      adapters: [react()],
    }).apply(vitepressConfig);

    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        INLINE_PAGE_RESOLUTION_PLUGIN_NAME,
      ),
    ).toBeTruthy();
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        REACT_RUNTIME_BUNDLING_PLUGIN_NAME,
      ),
    ).toBeTruthy();
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
      ),
    ).toBeTruthy();
    expect(
      findPluginIndexByName(
        vitepressConfig.vite?.plugins,
        INLINE_PAGE_RESOLUTION_PLUGIN_NAME,
      ),
    ).toBeLessThan(
      findPluginIndexByName(
        vitepressConfig.vite?.plugins,
        FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
      ),
    );
    expect(
      findPluginIndexByName(
        vitepressConfig.vite?.plugins,
        FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
      ),
    ).toBeLessThan(
      findPluginIndexByName(
        vitepressConfig.vite?.plugins,
        REACT_RUNTIME_BUNDLING_PLUGIN_NAME,
      ),
    );
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        LOGGER_SCOPE_TAKEOVER_PLUGIN_NAME,
      ),
    ).toBeTruthy();
  });

  it('keeps loggerScopeId stable per createDocsIslands instance and isolated across instances', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');

    const firstIslands = createDocsIslands({
      adapters: [react()],
    });
    const secondIslands = createDocsIslands({
      adapters: [react()],
    });
    const firstConfigA: any = {};
    const firstConfigB: any = {};
    const secondConfig: any = {};

    firstIslands.apply(firstConfigA);
    firstIslands.apply(firstConfigB);
    secondIslands.apply(secondConfig);

    expect(firstConfigA.vite?.define.__DOCS_ISLANDS_LOGGER_SCOPE_ID__).toBe(
      firstConfigB.vite?.define.__DOCS_ISLANDS_LOGGER_SCOPE_ID__,
    );
    expect(firstConfigA.vite?.define.__DOCS_ISLANDS_LOGGER_SCOPE_ID__).not.toBe(
      secondConfig.vite?.define.__DOCS_ISLANDS_LOGGER_SCOPE_ID__,
    );
  });

  it('registers site-devtools orchestration in core when enabled', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');

    const vitepressConfig: any = {
      base: '/docs/',
    };

    createDocsIslands({
      adapters: [react()],
      siteDevtools: {},
    }).apply(vitepressConfig);

    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        SITE_DEVTOOLS_OPTIONAL_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME,
      ),
    ).toBeTruthy();
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        SITE_DEVTOOLS_SOURCE_PLUGIN_NAME,
      ),
    ).toBeTruthy();
  });

  it('does not register site-devtools orchestration in core when disabled', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');

    const vitepressConfig: any = {};

    createDocsIslands({
      adapters: [react()],
    }).apply(vitepressConfig);

    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        SITE_DEVTOOLS_OPTIONAL_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME,
      ),
    ).toBeNull();
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        SITE_DEVTOOLS_SOURCE_PLUGIN_NAME,
      ),
    ).toBeNull();
  });

  it('throws when adapters is empty', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');

    expect(() =>
      createDocsIslands({
        adapters: [],
      }),
    ).toThrow(
      'createDocsIslands() requires at least one adapter in the adapters array.',
    );
  });

  it('throws when the same framework adapter is registered twice', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');

    expect(() =>
      createDocsIslands({
        adapters: [react(), react()],
      }),
    ).toThrow(
      'createDocsIslands() received multiple adapters for framework "react".',
    );
  });
});
