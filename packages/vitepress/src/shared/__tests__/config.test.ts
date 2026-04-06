import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../config';

const resolveBuildReportsTestPage = () => false as const;

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
                default: true,
                id: 'doubao-pro',
                label: 'Doubao Pro',
                maxTokens: 4096,
                model: 'doubao-seed-1-6',
                providerRef: {
                  provider: 'doubao',
                },
                temperature: 0.1,
                thinking: true,
              },
            ],
            resolvePage: resolveBuildReportsTestPage,
          },
          providers: {
            doubao: [
              {
                apiKey: 'test-key',
                baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
                default: true,
                id: 'cn',
                label: 'Doubao CN',
                timeoutMs: 90_000,
              },
            ],
          },
        },
      },
    });

    expect(config.base).toBe('/docs/');
    expect(config.siteDebug.analysis?.buildReports?.cache).toEqual({
      dir: expect.stringMatching(/site-debug-reports$/),
      strategy: 'fallback',
    });
    expect(config.siteDebug.analysis?.buildReports?.includeChunks).toBe(false);
    expect(config.siteDebug.analysis?.buildReports?.includeModules).toBe(false);
    expect(config.siteDebug.analysis?.buildReports?.resolvePage).toBe(
      resolveBuildReportsTestPage,
    );
    expect(config.siteDebug.analysis?.buildReports?.models?.[0]).toEqual({
      default: true,
      id: 'doubao-pro',
      label: 'Doubao Pro',
      maxTokens: 4096,
      model: 'doubao-seed-1-6',
      providerRef: {
        provider: 'doubao',
      },
      temperature: 0.1,
      thinking: true,
    });
    expect(config.siteDebug.analysis?.providers?.doubao?.[0]?.apiKey).toBe(
      'test-key',
    );
    expect(config.siteDebug.analysis?.providers?.doubao?.[0]?.baseUrl).toBe(
      'https://ark.cn-beijing.volces.com/api/v3',
    );
    expect(config.siteDebug.analysis?.providers?.doubao?.[0]?.default).toBe(
      true,
    );
    expect(config.siteDebug.analysis?.providers?.doubao?.[0]?.id).toBe('cn');
    expect(config.siteDebug.analysis?.providers?.doubao?.[0]?.label).toBe(
      'Doubao CN',
    );
    expect(config.siteDebug.analysis?.providers?.doubao?.[0]?.timeoutMs).toBe(
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
      includeChunks: false,
      includeModules: false,
    });
  });
});
