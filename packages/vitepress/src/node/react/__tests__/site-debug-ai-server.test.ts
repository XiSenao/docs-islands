/**
 * @vitest-environment node
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handleSiteDebugAiRequest,
  resolveSiteDebugAiCapabilities,
} from '../site-debug-ai-server';

const createJsonRequest = (body: unknown): IncomingMessage => {
  const stream = new PassThrough();
  const req = stream as IncomingMessage;

  req.method = 'POST';
  process.nextTick(() => {
    stream.end(JSON.stringify(body));
  });

  return req;
};

const createMockResponse = () => {
  const headers = new Map<string, string>();
  let body = '';
  const res = {
    statusCode: 200,
    writableEnded: false,
    end(chunk?: Buffer | string) {
      body = chunk ? chunk.toString() : '';
      this.writableEnded = true;
      return this;
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
      return this;
    },
  } as unknown as ServerResponse;

  return {
    getBody: () => body,
    getJson: () => JSON.parse(body) as Record<string, unknown>,
    headers,
    res,
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('resolveSiteDebugAiCapabilities', () => {
  it('marks providers unavailable until they are configured', async () => {
    const capabilities = await resolveSiteDebugAiCapabilities();

    expect(capabilities.providers['claude-code'].available).toBe(false);
    expect(capabilities.providers['claude-code'].detail).toContain(
      'analysis.providers.claudeCode',
    );
    expect(capabilities.providers.doubao.available).toBe(false);
    expect(capabilities.providers.doubao.detail).toContain(
      'analysis.providers.doubao',
    );
  });

  it('reads the configured Doubao model from siteDebug analysis config', async () => {
    const capabilities = await resolveSiteDebugAiCapabilities({
      providers: {
        doubao: {
          apiKey: 'test-key',
          baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          model: 'doubao-seed-1-6',
        },
      },
    });

    expect(capabilities.providers.doubao.available).toBe(true);
    expect(capabilities.providers.doubao.model).toBe('doubao-seed-1-6');
    expect(capabilities.providers['claude-code'].available).toBe(false);
  });

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

    const request = createJsonRequest({
      provider: 'doubao',
      target: {
        artifactKind: 'bundle-chunk',
        artifactLabel: 'app.js',
        content: 'console.log("hello")',
        displayPath: '/assets/app.js',
        language: 'js',
      },
    });
    const response = createMockResponse();

    await handleSiteDebugAiRequest(request, response.res, {
      providers: {
        doubao: {
          apiKey: 'test-key',
          maxTokens: 2048,
          model: 'doubao-seed-2-0-pro-260215',
          thinking: true,
          temperature: 0.1,
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.res.statusCode).toBe(200);
    expect(response.getJson().ok).toBe(true);
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

    const request = createJsonRequest({
      provider: 'doubao',
      target: {
        artifactKind: 'bundle-module',
        artifactLabel: 'component.ts',
        content: 'export const value = 1;',
        displayPath: '/src/component.ts',
        language: 'ts',
      },
    });
    const response = createMockResponse();

    await handleSiteDebugAiRequest(request, response.res, {
      providers: {
        doubao: {
          apiKey: 'test-key',
          model: 'doubao-seed-2-0-pro-260215',
          timeoutMs: 5,
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.res.statusCode).toBe(504);
    const payload = response.getJson();

    expect(payload.error).toContain('Doubao analysis timed out.');
    expect(payload.error).toContain('Trace ');
    expect(payload.error).toContain('bundle-module /src/component.ts');
    expect(payload.error).toContain('timeout 5 ms');
  });
});
