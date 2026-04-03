import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../config';

describe('resolveConfig', () => {
  it('normalizes siteDebug.analysis config in the resolved config object', () => {
    const config = resolveConfig({
      base: '/docs',
      siteDebug: {
        analysis: {
          buildReports: {
            runs: [
              {
                label: 'Doubao Pro',
                model: 'doubao-seed-1-6',
                provider: 'doubao',
                thinking: 'enabled',
              },
            ],
          },
          providers: {
            claudeCode: {
              command: 'claude',
              enabled: true,
              timeoutMs: 180_000,
            },
            doubao: {
              apiKey: 'test-key',
              baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
              enabled: true,
              maxTokens: 4096,
              model: 'doubao-seed-1-6',
              thinking: 'enabled',
              temperature: 0.1,
              timeoutMs: 90_000,
            },
          },
        },
      },
    });

    expect(config.base).toBe('/docs/');
    expect(config.siteDebug.analysis?.buildReports?.cache).toBe(true);
    expect(config.siteDebug.analysis?.buildReports?.includeChunks).toBe(true);
    expect(config.siteDebug.analysis?.buildReports?.includeModules).toBe(true);
    expect(config.siteDebug.analysis?.buildReports?.runs?.[0]).toEqual({
      label: 'Doubao Pro',
      model: 'doubao-seed-1-6',
      provider: 'doubao',
      thinking: 'enabled',
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
    expect(config.siteDebug.analysis?.providers?.doubao?.thinking).toBe(
      'enabled',
    );
    expect(config.siteDebug.analysis?.providers?.doubao?.temperature).toBe(0.1);
    expect(config.siteDebug.analysis?.providers?.doubao?.timeoutMs).toBe(
      90_000,
    );
    expect(config.siteDebug.ai).toEqual(config.siteDebug.analysis);
  });

  it('maps legacy siteDebug.ai and buildReports.models to the new analysis shape', () => {
    const config = resolveConfig({
      siteDebug: {
        ai: {
          buildReports: {
            models: [
              {
                model: 'doubao-seed-2-0',
                provider: 'doubao',
              },
            ],
          },
          providers: {
            doubao: {
              apiKey: 'test-key',
              model: 'doubao-seed-2-0',
            },
          },
        },
      },
    });

    expect(config.siteDebug.analysis?.buildReports?.cache).toBe(true);
    expect(config.siteDebug.analysis?.buildReports?.includeChunks).toBe(true);
    expect(config.siteDebug.analysis?.buildReports?.includeModules).toBe(true);
    expect(config.siteDebug.analysis?.buildReports?.runs).toEqual([
      {
        model: 'doubao-seed-2-0',
        provider: 'doubao',
      },
    ]);
    expect(config.siteDebug.analysis?.providers?.doubao?.model).toBe(
      'doubao-seed-2-0',
    );
  });

  it('treats buildReports presence as enabled and still honors the legacy enabled: false escape hatch', () => {
    const enabledByPresence = resolveConfig({
      siteDebug: {
        analysis: {
          buildReports: {},
        },
      },
    });
    const legacyDisabled = resolveConfig({
      siteDebug: {
        analysis: {
          buildReports: {
            enabled: false,
          },
        },
      },
    });

    expect(enabledByPresence.siteDebug.analysis?.buildReports).toEqual({
      cache: true,
      includeChunks: true,
      includeModules: true,
    });
    expect(legacyDisabled.siteDebug.analysis?.buildReports).toBeUndefined();
  });
});
