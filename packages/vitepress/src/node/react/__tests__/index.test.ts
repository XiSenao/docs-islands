/**
 * @vitest-environment node
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PluginOption } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockError = vi.fn();

vi.mock('@vitejs/plugin-react-swc', () => ({
  default: vi.fn(() => ({
    name: 'mock-react-swc',
  })),
}));

vi.mock('#shared/logger', () => ({
  default: () => ({
    getLoggerByGroup: () => ({
      error: mockError,
      warn: vi.fn(),
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

describe('vitepressReactRenderingStrategies', () => {
  it('merges siteDebug from the second options argument into the VitePress config', async () => {
    const { default: vitepressReactRenderingStrategies } = await import(
      '../index'
    );

    const vitepressConfig: any = {
      siteDebug: {
        analysis: {
          providers: {},
        },
      },
    };

    vitepressReactRenderingStrategies(vitepressConfig, {
      siteDebug: {
        analysis: {
          providers: {
            doubao: [
              {
                apiKey: 'test-key',
                id: 'cn',
              },
            ],
          },
          buildReports: {
            models: [
              {
                id: 'doubao-pro',
                label: 'Doubao Pro',
                maxTokens: 4096,
                model: 'doubao-seed-2-0-pro-260215',
                providerRef: {
                  provider: 'doubao',
                },
                temperature: 0.1,
                thinking: true,
              },
            ],
          },
        },
      },
    });

    expect(
      vitepressConfig.siteDebug.analysis?.providers?.doubao?.[0]?.apiKey,
    ).toBe('test-key');
    expect(vitepressConfig.siteDebug.analysis?.buildReports?.models).toEqual([
      {
        id: 'doubao-pro',
        label: 'Doubao Pro',
        maxTokens: 4096,
        model: 'doubao-seed-2-0-pro-260215',
        providerRef: {
          provider: 'doubao',
        },
        temperature: 0.1,
        thinking: true,
      },
    ]);
    expect(vitepressConfig.vite?.worker?.format).toBe('es');
  });

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

  it('does not intercept __docs-islands/debug-ai in dev and still serves __docs-islands/debug-source', async () => {
    const { default: vitepressReactRenderingStrategies } = await import(
      '../index'
    );

    const vitepressConfig: any = {
      base: '/docs/',
    };

    vitepressReactRenderingStrategies(vitepressConfig);

    const plugin = findPluginByName(
      vitepressConfig.vite?.plugins,
      'vite-plugin-support-react-render-for-vitepress-in-dev',
    );
    expect(plugin).toBeTruthy();
    expect(plugin.configureServer).toBeTypeOf('function');

    let middleware:
      | ((
          req: { url?: string },
          res: {
            end: (chunk?: string | Buffer) => void;
            setHeader: (name: string, value: string) => void;
            statusCode: number;
          },
          next: () => void,
        ) => void)
      | undefined;

    plugin.configureServer({
      middlewares: {
        use(handler: typeof middleware) {
          middleware = handler;
        },
      },
      moduleGraph: {
        getModuleByUrl: vi.fn(),
      },
      pluginContainer: {
        resolveId: vi.fn(),
      },
      ssrLoadModule: vi.fn(),
      ws: {
        on: vi.fn(),
      },
    });

    expect(middleware).toBeTypeOf('function');

    const nextForAi = vi.fn();
    middleware?.(
      {
        url: '/docs/__docs-islands/debug-ai',
      },
      {
        end: vi.fn(),
        setHeader: vi.fn(),
        statusCode: 200,
      },
      nextForAi,
    );

    expect(nextForAi).toHaveBeenCalledTimes(1);

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'vitepress-debug-source-'),
    );
    const tempFile = path.join(tempDir, 'debug-source.txt');
    const tempContent = 'debug source content';
    fs.writeFileSync(tempFile, tempContent, 'utf8');

    try {
      let responseBody = '';
      const setHeader = vi.fn();
      const nextForSource = vi.fn();
      const response = {
        end(chunk?: string | Buffer) {
          responseBody = chunk ? chunk.toString() : '';
        },
        setHeader,
        statusCode: 0,
      };

      middleware?.(
        {
          url: `/docs/__docs-islands/debug-source?path=${encodeURIComponent(tempFile)}`,
        },
        response,
        nextForSource,
      );

      expect(nextForSource).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
      expect(setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/plain; charset=utf-8',
      );
      expect(responseBody).toBe(tempContent);
    } finally {
      fs.rmSync(tempDir, {
        force: true,
        recursive: true,
      });
    }
  });
});
