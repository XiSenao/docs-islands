import type { SiteDebugAnalysisUserConfig } from '#dep-types/utils';
import { spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  buildSiteDebugAiAnalysisPrompt,
  getSiteDebugAiProviderLabel,
  type SiteDebugAiAnalysisTarget,
  type SiteDebugAiAnalyzeRequest,
  type SiteDebugAiAnalyzeResponse,
  type SiteDebugAiCapabilitiesResponse,
  type SiteDebugAiProvider,
  type SiteDebugAiProviderCapability,
} from '../../shared/site-debug-ai';

const DEFAULT_DOUBAO_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const REQUEST_BODY_LIMIT_BYTES = 1024 * 1024;
const CLAUDE_PROBE_CACHE_TTL_MS = 30_000;
const CLAUDE_PROBE_TIMEOUT_MS = 4000;
const DEFAULT_CLAUDE_ANALYSIS_TIMEOUT_MS = 240_000;
const DEFAULT_DOUBAO_ANALYSIS_TIMEOUT_MS = 120_000;

export interface SiteDebugAnalysisRuntimeConfig {
  buildReports?: SiteDebugAnalysisUserConfig['buildReports'];
  providers?: NonNullable<SiteDebugAnalysisUserConfig['providers']>;
}

export type SiteDebugAnalysisConfig =
  | SiteDebugAnalysisRuntimeConfig
  | undefined;
export type SiteDebugAiRuntimeConfig = SiteDebugAnalysisRuntimeConfig;
export type SiteDebugAiConfig = SiteDebugAnalysisConfig;

export interface SiteDebugAiExecutionResult {
  detail?: string;
  model?: string;
  result: string;
}

interface ClaudeProbeCacheEntry {
  capability: SiteDebugAiProviderCapability;
  command: string;
  expiresAt: number;
}

interface JsonRequestError {
  message: string;
  statusCode: number;
}

let claudeProbeCache: ClaudeProbeCacheEntry | null = null;

const createJsonError = (
  statusCode: number,
  message: string,
): JsonRequestError => ({
  message,
  statusCode,
});

const isJsonRequestError = (value: unknown): value is JsonRequestError =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'message' in value &&
      'statusCode' in value,
  );

const sendJson = (
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const readJsonBody = async <T>(
  req: IncomingMessage,
  limitBytes = REQUEST_BODY_LIMIT_BYTES,
) =>
  new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      totalBytes += buffer.byteLength;
      if (totalBytes > limitBytes) {
        reject(createJsonError(413, 'AI analysis payload is too large.'));
        req.destroy();
        return;
      }

      chunks.push(buffer);
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('end', () => {
      try {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(bodyText || '{}') as T);
      } catch {
        reject(createJsonError(400, 'AI analysis request must be valid JSON.'));
      }
    });
  });

const getClaudeProviderConfig = (config: SiteDebugAiConfig) =>
  config?.providers?.claudeCode;

const getDoubaoProviderConfig = (config: SiteDebugAiConfig) =>
  config?.providers?.doubao;

const normalizePositiveInteger = (value: number | undefined) => {
  let normalizedValue: number | undefined;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value);

    if (normalized > 0) {
      normalizedValue = normalized;
    }
  }

  return normalizedValue;
};

const normalizeTemperature = (value: number | undefined) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 2
    ? value
    : undefined;

const getClaudeCommand = (config: SiteDebugAiConfig) =>
  getClaudeProviderConfig(config)?.command?.trim() || 'claude';

const getClaudeTimeoutMs = (config: SiteDebugAiConfig) =>
  normalizePositiveInteger(getClaudeProviderConfig(config)?.timeoutMs) ||
  DEFAULT_CLAUDE_ANALYSIS_TIMEOUT_MS;

const resolveDoubaoBaseUrl = (config: SiteDebugAiConfig) =>
  (
    getDoubaoProviderConfig(config)?.baseUrl?.trim() || DEFAULT_DOUBAO_BASE_URL
  ).replace(/\/+$/, '');

const getDoubaoTimeoutMs = (config: SiteDebugAiConfig) =>
  normalizePositiveInteger(getDoubaoProviderConfig(config)?.timeoutMs) ||
  DEFAULT_DOUBAO_ANALYSIS_TIMEOUT_MS;

const getDoubaoTemperature = (config: SiteDebugAiConfig) =>
  normalizeTemperature(getDoubaoProviderConfig(config)?.temperature);

const getDoubaoMaxTokens = (config: SiteDebugAiConfig) =>
  normalizePositiveInteger(getDoubaoProviderConfig(config)?.maxTokens);

const getDoubaoThinkingType = (config: SiteDebugAiConfig) => {
  const thinking = getDoubaoProviderConfig(config)?.thinking;

  return thinking === 'enabled' || thinking === 'disabled'
    ? thinking
    : undefined;
};
const resolveTextContent = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (
          item &&
          typeof item === 'object' &&
          'text' in item &&
          typeof item.text === 'string'
        ) {
          return item.text;
        }

        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
};

const probeClaudeCode = async (
  config: SiteDebugAiConfig,
): Promise<SiteDebugAiProviderCapability> => {
  const providerConfig = getClaudeProviderConfig(config);

  if (!providerConfig) {
    return {
      available: false,
      detail:
        'Configure siteDebug.analysis.providers.claudeCode to enable Claude Code analysis.',
      provider: 'claude-code',
    };
  }

  if (providerConfig?.enabled === false) {
    return {
      available: false,
      detail:
        'Claude Code is disabled by siteDebug.analysis.providers.claudeCode.enabled.',
      provider: 'claude-code',
    };
  }

  const command = getClaudeCommand(config);
  const now = Date.now();

  if (
    claudeProbeCache &&
    claudeProbeCache.command === command &&
    claudeProbeCache.expiresAt > now
  ) {
    return claudeProbeCache.capability;
  }

  const capability = await new Promise<SiteDebugAiProviderCapability>(
    (resolve) => {
      const child = spawn(command, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let resolved = false;

      const finish = (nextCapability: SiteDebugAiProviderCapability) => {
        if (resolved) {
          return;
        }

        resolved = true;
        resolve(nextCapability);
      };

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        finish({
          available: false,
          detail: `Timed out while probing "${command} --version".`,
          provider: 'claude-code',
        });
      }, CLAUDE_PROBE_TIMEOUT_MS);

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdoutChunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
        );
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderrChunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
        );
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        finish({
          available: false,
          detail: error.message || `Unable to start "${command}".`,
          provider: 'claude-code',
        });
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();

        if (code === 0) {
          finish({
            available: true,
            detail: stdout || `Using "${command}" in headless mode.`,
            model: stdout || undefined,
            provider: 'claude-code',
          });
          return;
        }

        finish({
          available: false,
          detail:
            stderr ||
            stdout ||
            `The "${command}" CLI is not available for site-debug AI analysis.`,
          provider: 'claude-code',
        });
      });
    },
  );

  claudeProbeCache = {
    capability,
    command,
    expiresAt: now + CLAUDE_PROBE_CACHE_TTL_MS,
  };

  return capability;
};

const getDoubaoCapability = (
  config: SiteDebugAiConfig,
): SiteDebugAiProviderCapability => {
  const providerConfig = getDoubaoProviderConfig(config);

  if (!providerConfig) {
    return {
      available: false,
      detail:
        'Configure siteDebug.analysis.providers.doubao to enable Doubao analysis.',
      provider: 'doubao',
    };
  }

  if (providerConfig?.enabled === false) {
    return {
      available: false,
      detail:
        'Doubao is disabled by siteDebug.analysis.providers.doubao.enabled.',
      provider: 'doubao',
    };
  }

  if (!providerConfig?.apiKey?.trim()) {
    return {
      available: false,
      detail:
        'Missing siteDebug.analysis.providers.doubao.apiKey in the VitePress config.',
      provider: 'doubao',
    };
  }

  if (!providerConfig.model?.trim()) {
    return {
      available: false,
      detail:
        'Missing siteDebug.analysis.providers.doubao.model in the VitePress config.',
      provider: 'doubao',
    };
  }

  return {
    available: true,
    detail: `Using ${resolveDoubaoBaseUrl(config)}/chat/completions`,
    model: providerConfig.model.trim(),
    provider: 'doubao',
  };
};

export const resolveSiteDebugAiCapabilities = async (
  config: SiteDebugAiConfig,
): Promise<SiteDebugAiCapabilitiesResponse> => {
  return {
    ok: true,
    providers: {
      'claude-code': await probeClaudeCode(config),
      doubao: getDoubaoCapability(config),
    },
  };
};

const runClaudeCodeAnalysis = async (
  prompt: string,
  config: SiteDebugAiConfig,
): Promise<SiteDebugAiExecutionResult> =>
  new Promise((resolve, reject) => {
    const command = getClaudeCommand(config);
    const child = spawn(
      command,
      [
        '-p',
        prompt,
        '--output-format',
        'json',
        '--allowedTools',
        'Read,Grep,Glob',
        '--permission-mode',
        'plan',
        '--cwd',
        process.cwd(),
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let completed = false;

    const fail = (message: string) => {
      if (completed) {
        return;
      }

      completed = true;
      reject(new Error(message));
    };

    const finish = (payload: {
      detail?: string;
      model?: string;
      result: string;
    }) => {
      if (completed) {
        return;
      }

      completed = true;
      resolve(payload);
    };

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      fail('Claude Code analysis timed out.');
    }, getClaudeTimeoutMs(config));

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdoutChunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
      );
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
      );
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      fail(error.message || 'Failed to launch Claude Code.');
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();

      if (code !== 0) {
        fail(stderr || stdout || 'Claude Code analysis failed.');
        return;
      }

      try {
        const payload = JSON.parse(stdout) as {
          result?: string;
          subtype?: string;
          total_cost_usd?: number;
        };
        const result = payload.result?.trim();

        if (!result) {
          fail('Claude Code returned an empty analysis result.');
          return;
        }

        finish({
          detail:
            typeof payload.total_cost_usd === 'number'
              ? `Cost $${payload.total_cost_usd.toFixed(4)}`
              : payload.subtype,
          result,
        });
      } catch {
        if (!stdout) {
          fail(stderr || 'Claude Code returned invalid JSON output.');
          return;
        }

        finish({
          detail: 'Claude Code returned plain-text output.',
          result: stdout,
        });
      }
    });
  });

const runDoubaoAnalysis = async (
  prompt: string,
  config: SiteDebugAiConfig,
): Promise<SiteDebugAiExecutionResult> => {
  const capability = getDoubaoCapability(config);
  const providerConfig = getDoubaoProviderConfig(config);
  const maxTokens = getDoubaoMaxTokens(config);
  const thinking = getDoubaoThinkingType(config);
  const temperature = getDoubaoTemperature(config);

  if (
    !capability.available ||
    !providerConfig?.apiKey ||
    !providerConfig.model
  ) {
    throw new Error(capability.detail);
  }

  const providerApiKey = providerConfig.apiKey;
  const providerModel = providerConfig.model;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, getDoubaoTimeoutMs(config));

  try {
    const response = await fetch(
      `${resolveDoubaoBaseUrl(config)}/chat/completions`,
      {
        body: JSON.stringify({
          messages: [
            {
              content:
                'You are a senior frontend performance and bundling engineer. Help analyze generated build artifacts accurately and pragmatically.',
              role: 'system',
            },
            {
              content: prompt,
              role: 'user',
            },
          ],
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          model: providerModel,
          ...(thinking ? { thinking: { type: thinking } } : {}),
          ...(temperature === undefined ? {} : { temperature }),
        }),
        headers: {
          Authorization: `Bearer ${providerApiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal: controller.signal,
      },
    );
    const payload = (await response.json()) as {
      choices?: {
        message?: {
          content?: unknown;
        };
      }[];
      error?: {
        code?: string;
        message?: string;
      };
    };

    if (!response.ok) {
      throw new Error(
        payload.error?.message ||
          `Doubao request failed with HTTP ${response.status}.`,
      );
    }

    const content = resolveTextContent(payload.choices?.[0]?.message?.content);

    if (!content) {
      throw new Error('Doubao returned an empty analysis result.');
    }

    return {
      detail: capability.detail,
      model: providerModel,
      result: content,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Doubao analysis timed out.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const resolveAnalysisHandler = (provider: SiteDebugAiProvider) => {
  switch (provider) {
    case 'claude-code': {
      return runClaudeCodeAnalysis;
    }
    case 'doubao': {
      return runDoubaoAnalysis;
    }
    default: {
      return null;
    }
  }
};

export const analyzeSiteDebugAiTarget = async ({
  config,
  provider,
  target,
}: {
  config: SiteDebugAiConfig;
  provider: SiteDebugAiProvider;
  target: SiteDebugAiAnalysisTarget;
}): Promise<SiteDebugAiExecutionResult> => {
  const handler = resolveAnalysisHandler(provider);

  if (!handler) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const capabilityResponse = await resolveSiteDebugAiCapabilities(config);
  const capability = capabilityResponse.providers[provider];

  if (!capability?.available) {
    throw new Error(
      capability?.detail ||
        `${getSiteDebugAiProviderLabel(provider)} is not available in the current siteDebug.analysis configuration.`,
    );
  }

  return handler(buildSiteDebugAiAnalysisPrompt(target), config);
};

export const handleSiteDebugAiRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  config: SiteDebugAiConfig,
): Promise<void> => {
  if (req.method === 'GET') {
    sendJson(res, 200, await resolveSiteDebugAiCapabilities(config));
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, {
      error: 'Method not allowed.',
      ok: false,
    });
    return;
  }

  try {
    const body = await readJsonBody<SiteDebugAiAnalyzeRequest>(req);
    const provider = body.provider;
    const prompt = buildSiteDebugAiAnalysisPrompt(body.target);
    const capabilityResponse = await resolveSiteDebugAiCapabilities(config);
    const capability = capabilityResponse.providers[provider];

    if (!capability) {
      sendJson(res, 400, {
        error: `Unsupported provider: ${provider}`,
        ok: false,
        prompt,
        provider,
      } satisfies SiteDebugAiAnalyzeResponse);
      return;
    }

    if (!capability.available) {
      sendJson(res, 400, {
        detail: capability.detail,
        error: `${getSiteDebugAiProviderLabel(provider)} is not available in the current siteDebug.analysis configuration.`,
        ok: false,
        prompt,
        provider,
      } satisfies SiteDebugAiAnalyzeResponse);
      return;
    }

    const result = await analyzeSiteDebugAiTarget({
      config,
      provider,
      target: body.target,
    });

    sendJson(res, 200, {
      ...result,
      ok: true,
      prompt,
      provider,
    } satisfies SiteDebugAiAnalyzeResponse);
  } catch (error) {
    if (isJsonRequestError(error)) {
      sendJson(res, error.statusCode, {
        error: error.message,
        ok: false,
      });
      return;
    }

    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'AI analysis failed.',
      ok: false,
    });
  }
};
