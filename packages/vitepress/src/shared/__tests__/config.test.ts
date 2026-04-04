import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../config';

describe('resolveConfig', () => {
  it('normalizes siteDebug.analysis config in the resolved config object', () => {
    const config = resolveConfig({
      base: '/docs',
      siteDebug: {
        analysis: {
          buildReports: {
            cache: {
              dir: '.vitepress/site-debug-reports',
              strategy: 'fallback',
            },
            models: [
              {
                label: 'Doubao Pro',
                model: 'doubao-seed-1-6',
                provider: 'doubao',
                thinking: true,
              },
            ],
          },
          providers: {
            claudeCode: {
              command: 'claude',
              timeoutMs: 180_000,
            },
            doubao: {
              apiKey: 'test-key',
              baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
              maxTokens: 4096,
              model: 'doubao-seed-1-6',
              thinking: true,
              temperature: 0.1,
              timeoutMs: 90_000,
            },
          },
        },
      },
    });

    expect(config.base).toBe('/docs/');
    expect(config.siteDebug.analysis?.buildReports?.cache).toEqual({
      dir: expect.stringMatching(/site-debug-reports$/),
      strategy: 'fallback',
    });
    expect(config.siteDebug.analysis?.buildReports?.groupBy).toBe('page');
    expect(config.siteDebug.analysis?.buildReports?.includeChunks).toBe(false);
    expect(config.siteDebug.analysis?.buildReports?.includeModules).toBe(false);
    expect(config.siteDebug.analysis?.buildReports?.models?.[0]).toEqual({
      label: 'Doubao Pro',
      model: 'doubao-seed-1-6',
      provider: 'doubao',
      thinking: true,
    });
    expect(config.siteDebug.analysis?.providers?.claudeCode?.command).toBe(
      'claude',
    );
    expect(config.siteDebug.analysis?.providers?.claudeCode?.timeoutMs).toBe(
      180_000,
    );
    expect(config.siteDebug.analysis?.providers?.doubao?.maxTokens).toBe(4096);
    expect(config.siteDebug.analysis?.providers?.doubao?.model).toBe(
      'doubao-seed-1-6',
    );
    expect(config.siteDebug.analysis?.providers?.doubao?.thinking).toBe(true);
    expect(config.siteDebug.analysis?.providers?.doubao?.temperature).toBe(0.1);
    expect(config.siteDebug.analysis?.providers?.doubao?.timeoutMs).toBe(
      90_000,
    );
    expect(config.siteDebug).not.toHaveProperty('ai');
  });

  it('fills cache option defaults when cache is true', () => {
    const config = resolveConfig({
      siteDebug: {
        analysis: {
          buildReports: {
            cache: true,
          },
        },
      },
    });

    expect(config.siteDebug.analysis?.buildReports?.cache).toEqual({
      dir: expect.stringMatching(/\.vitepress\/cache\/site-debug-reports$/),
      strategy: 'exact',
    });
  });

  it('fills cache option defaults when cache config is enabled', () => {
    const config = resolveConfig({
      siteDebug: {
        analysis: {
          buildReports: {
            cache: {},
          },
        },
      },
    });

    expect(config.siteDebug.analysis?.buildReports?.cache).toEqual({
      dir: expect.stringMatching(/\.vitepress\/cache\/site-debug-reports$/),
      strategy: 'exact',
    });
  });

  it('treats buildReports presence as enabled and defaults cache to true', () => {
    const config = resolveConfig({
      siteDebug: {
        analysis: {
          buildReports: {},
        },
      },
    });

    expect(config.siteDebug.analysis?.buildReports).toEqual({
      cache: {
        dir: expect.stringMatching(/\.vitepress\/cache\/site-debug-reports$/),
        strategy: 'exact',
      },
      groupBy: 'page',
      includeChunks: false,
      includeModules: false,
    });
  });
});
