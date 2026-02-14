/**
 * @vitest-environment node
 */
import type { PluginOption } from 'vite';
import { describe, expect, it, vi } from 'vitest';

const mockError = vi.fn();

vi.mock('@vitejs/plugin-react-swc', () => ({
  default: vi.fn(() => ({
    name: 'mock-react-swc',
  })),
}));

vi.mock('#shared/logger', () => ({
  default: {
    getLoggerByGroup: () => ({
      error: mockError,
      warn: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

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

describe('vitepressReactRenderingStrategies', () => {
  it('logs error and strips scripts when multiple <script lang="react"> blocks exist in one html_block', async () => {
    const { default: vitepressReactRenderingStrategies } = await import(
      '../index'
    );

    const vitepressConfig: any = {};
    vitepressReactRenderingStrategies(vitepressConfig);

    const plugin = findPluginByName(
      vitepressConfig.vite?.plugins,
      'vite-plugin-support-react-render-for-vitepress',
    );
    expect(plugin).toBeTruthy();
    expect(plugin.transform?.handler).toBeTypeOf('function');

    const markdownWithInlineDoubleScripts = `<script lang="react">import A from './A'</script><script lang="react">import B from './B'</script>
<A />`;

    mockError.mockClear();

    const result = await plugin.transform.handler.call(
      {
        resolve: vi.fn(),
      },
      markdownWithInlineDoubleScripts,
      '/virtual/docs/double-script.md',
    );

    expect(mockError).toHaveBeenCalledWith(
      'Single file can contain only one <script lang="react"> element.',
    );
    expect(result.code).not.toContain('<script lang="react">');
  });
});
