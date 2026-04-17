/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SiteDevToolsAiAnalysisTarget } from '../../../shared/site-devtools-ai';
import {
  analyzeSiteDevToolsAiTarget,
  resolveSiteDevToolsAiCapabilities,
} from '../ai-server';

const createAnalysisTarget = (
  overrides: Partial<SiteDevToolsAiAnalysisTarget> = {},
): SiteDevToolsAiAnalysisTarget => ({
  artifactKind: 'bundle-chunk',
  artifactLabel: 'app.js',
  content: 'console.log("hello")',
  displayPath: '/assets/app.js',
  language: 'js',
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('resolveSiteDevToolsAiCapabilities', () => {
  it('marks providers unavailable until they are configured', async () => {
    const capabilities = await resolveSiteDevToolsAiCapabilities();

    expect(capabilities.providers.doubao.available).toBe(false);
    expect(capabilities.providers.doubao.detail).toContain(
      'analysis.providers.doubao',
    );
  });

  it('reads the configured Doubao model from buildReports.models', async () => {
    const capabilities = await resolveSiteDevToolsAiCapabilities({
      buildReports: {
        models: [
          {
            id: 'doubao-default',
            model: 'doubao-seed-1-6',
            providerRef: {
              provider: 'doubao',
            },
          },
        ],
      },
      providers: {
        doubao: [
          {
            apiKey: 'test-key',
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
            default: true,
            id: 'cn',
          },
        ],
      },
    });

    expect(capabilities.providers.doubao.available).toBe(true);
    expect(capabilities.providers.doubao.model).toBe('doubao-seed-1-6');
  });
});

describe('analyzeSiteDevToolsAiTarget', () => {
  it('passes Doubao thinking, temperature and max tokens to chat completions', async () => {
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
      });

      const requestBody = JSON.parse(String(init?.body)) as {
        max_tokens?: number;
        thinking?: {
          type?: string;
        };
        temperature?: number;
      };

      expect(requestBody.thinking?.type).toBe('enabled');
      expect(requestBody.temperature).toBe(0.1);
      expect(requestBody.max_tokens).toBe(2048);

      return Response.json(
        {
          choices: [
            {
              message: {
                content: 'analysis result',
              },
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeSiteDevToolsAiTarget({
      config: {
        buildReports: {
          models: [
            {
              id: 'doubao-default',
              maxTokens: 2048,
              model: 'doubao-seed-2-0-pro-260215',
              providerRef: {
                provider: 'doubao',
              },
              temperature: 0.1,
              thinking: true,
            },
          ],
        },
        providers: {
          doubao: [
            {
              apiKey: 'test-key',
              default: true,
              id: 'cn',
            },
          ],
        },
      },
      provider: 'doubao',
      target: createAnalysisTarget(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      model: 'doubao-seed-2-0-pro-260215',
      result: 'analysis result',
    });
  });

  it('uses provider timeoutMs for Doubao requests', async () => {
    const fetchMock = vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        }),
    );

    vi.stubGlobal('fetch', fetchMock);

    try {
      await analyzeSiteDevToolsAiTarget({
        config: {
          buildReports: {
            models: [
              {
                id: 'doubao-default',
                model: 'doubao-seed-2-0-pro-260215',
                providerRef: {
                  provider: 'doubao',
                },
              },
            ],
          },
          providers: {
            doubao: [
              {
                apiKey: 'test-key',
                default: true,
                id: 'cn',
                timeoutMs: 5,
              },
            ],
          },
        },
        provider: 'doubao',
        target: createAnalysisTarget({
          artifactKind: 'bundle-module',
          artifactLabel: 'component.ts',
          content: 'export const value = 1;',
          displayPath: '/src/component.ts',
          language: 'ts',
        }),
      });
    } catch (error) {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('Doubao analysis timed out.');
      expect((error as Error).message).toContain('Trace ');
      expect((error as Error).message).toContain(
        'bundle-module /src/component.ts',
      );
      expect((error as Error).message).toContain('timeout 5 ms');
      return;
    }

    throw new Error('Expected timeout rejection');
  });

  it('uses the first Doubao provider entry when no default is configured', async () => {
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        Authorization: 'Bearer first-key',
        'Content-Type': 'application/json',
      });

      return Response.json(
        {
          choices: [
            {
              message: {
                content: 'analysis result',
              },
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeSiteDevToolsAiTarget({
      config: {
        buildReports: {
          models: [
            {
              id: 'doubao-default',
              model: 'doubao-seed-2-0-pro-260215',
              providerRef: {
                provider: 'doubao',
              },
            },
          ],
        },
        providers: {
          doubao: [
            {
              apiKey: 'first-key',
              id: 'first',
            },
            {
              apiKey: 'second-key',
              id: 'second',
            },
          ],
        },
      },
      provider: 'doubao',
      target: createAnalysisTarget(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.result).toBe('analysis result');
  });
});
