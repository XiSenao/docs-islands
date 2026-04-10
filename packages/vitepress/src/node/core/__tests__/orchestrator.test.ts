/**
 * @vitest-environment node
 */
import type { PluginOption } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REACT_RUNTIME_BUNDLING_PLUGIN_NAME } from '../../react/plugin-names';
import {
  FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
  INLINE_PAGE_RESOLUTION_PLUGIN_NAME,
} from '../plugin-names';

const mockWarn = vi.fn();

vi.mock('@vitejs/plugin-react-swc', () => ({
  default: vi.fn(() => ({
    name: 'mock-react-swc',
  })),
}));

vi.mock('#shared/logger', () => ({
  default: () => ({
    getLoggerByGroup: () => ({
      error: vi.fn(),
      warn: mockWarn,
      info: vi.fn(),
      success: vi.fn(),
      debug: vi.fn(),
    }),
  }),
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

describe('createRenderingStrategies', () => {
  it('registers the React integration by default', async () => {
    const { default: createRenderingStrategies } = await import(
      '../orchestrator'
    );

    const vitepressConfig: any = {};
    createRenderingStrategies(vitepressConfig);

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

  it('ignores unknown integrations and logs a warning', async () => {
    const { default: createRenderingStrategies } = await import(
      '../orchestrator'
    );

    const vitepressConfig: any = {};
    mockWarn.mockClear();

    createRenderingStrategies(vitepressConfig, {
      frameworks: ['react', 'solid'],
    });

    expect(mockWarn).toHaveBeenCalledWith(
      'Unknown rendering integration "solid" was ignored. Supported integrations: react.',
    );
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        REACT_RUNTIME_BUNDLING_PLUGIN_NAME,
      ),
    ).toBeTruthy();
  });
});
