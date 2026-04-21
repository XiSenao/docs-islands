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
