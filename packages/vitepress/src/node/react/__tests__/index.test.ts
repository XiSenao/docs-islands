/**
 * @vitest-environment node
 */
import type { PluginOption } from 'vite';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@vitejs/plugin-react-swc', () => ({
  default: vi.fn(() => ({
    name: 'mock-react-swc',
  })),
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
  it('throws when multiple <script lang="react"> blocks exist in one html_block', async () => {
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

    await expect(
      plugin.transform.handler.call(
        {
          resolve: vi.fn(),
        },
        markdownWithInlineDoubleScripts,
        '/virtual/docs/double-script.md',
      ),
    ).rejects.toThrow(
      'Single file can contain only one <script lang="react"> element.',
    );
  });
});
