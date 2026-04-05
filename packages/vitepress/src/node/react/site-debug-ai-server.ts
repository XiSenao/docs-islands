import type { SiteDebugAnalysisUserConfig } from '#dep-types/utils';
import Logger, { formatErrorMessage } from '@docs-islands/utils/logger';
import { createHash } from 'node:crypto';
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
  type SiteDebugAiRequestTrace,
} from '../../shared/site-debug-ai';

const DEFAULT_DOUBAO_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const REQUEST_BODY_LIMIT_BYTES = 1024 * 1024;
const DEFAULT_ANALYSIS_TIMEOUT_MS = Number.POSITIVE_INFINITY;
const SiteDebugAiLogger = new Logger(
  '@docs-islands/vitepress',
).getLoggerByGroup('site-debug-ai');

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

class SiteDebugAiExecutionError extends Error {
  declare readonly detail?: string;
  declare readonly statusCode: number;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      detail?: string;
      statusCode?: number;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'SiteDebugAiExecutionError';
    Object.defineProperty(this, 'detail', {
      configurable: true,
      value: options?.detail,
      writable: true,
    });
    Object.defineProperty(this, 'statusCode', {
      configurable: true,
      value: options?.statusCode ?? 500,
      writable: true,
    });
  }
}

interface JsonRequestError {
  message: string;
  statusCode: number;
}

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

const normalizeTimeoutMs = (value: number | undefined) => {
  if (value === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }

  return normalizePositiveInteger(value);
};

const normalizeTemperature = (value: number | undefined) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 2
    ? value
    : undefined;

const resolveDoubaoBaseUrl = (config: SiteDebugAiConfig) =>
  (
    getDoubaoProviderConfig(config)?.baseUrl?.trim() || DEFAULT_DOUBAO_BASE_URL
  ).replace(/\/+$/, '');

const getDoubaoTimeoutMs = (config: SiteDebugAiConfig) =>
  normalizeTimeoutMs(getDoubaoProviderConfig(config)?.timeoutMs) ??
  DEFAULT_ANALYSIS_TIMEOUT_MS;

const getDoubaoTemperature = (config: SiteDebugAiConfig) =>
  normalizeTemperature(getDoubaoProviderConfig(config)?.temperature);

const getDoubaoMaxTokens = (config: SiteDebugAiConfig) =>
  normalizePositiveInteger(getDoubaoProviderConfig(config)?.maxTokens);

const getDoubaoThinkingType = (
  config: SiteDebugAiConfig,
): 'enabled' | 'disabled' | undefined => {
  const thinking = getDoubaoProviderConfig(config)?.thinking;

  return thinking === true
    ? 'enabled'
    : thinking === false
      ? 'disabled'
      : undefined;
};

const formatDurationMs = (value: number) => {
  if (!Number.isFinite(value)) {
    return 'Infinity';
  }

  if (value < 1000) {
    return `${value} ms`;
  }

  const seconds = value / 1000;

  if (seconds < 60) {
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`;
  }

  const minutes = seconds / 60;

  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
};

const formatByteCount = (value: number) => {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let normalizedValue = value;
  let unitIndex = -1;

  while (normalizedValue >= 1024 && unitIndex < units.length - 1) {
    normalizedValue /= 1024;
    unitIndex += 1;
  }

  const formattedValue =
    normalizedValue >= 10 || Number.isInteger(normalizedValue)
      ? normalizedValue.toFixed(0)
      : normalizedValue.toFixed(1);

  return `${formattedValue} ${units[unitIndex]}`;
};

const createProviderRequestId = ({
  prompt,
  provider,
  target,
}: {
  prompt: string;
  provider: SiteDebugAiProvider;
  target: SiteDebugAiAnalysisTarget;
}) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        artifactKind: target.artifactKind,
        displayPath: target.displayPath,
        prompt,
        provider,
      }),
    )
    .digest('hex')
    .slice(0, 12);

const createRequestTrace = ({
  model,
  prompt,
  provider,
  target,
  timeoutMs,
}: {
  model?: string;
  prompt: string;
  provider: SiteDebugAiProvider;
  target: SiteDebugAiAnalysisTarget;
  timeoutMs: number;
}): SiteDebugAiRequestTrace => ({
  artifactKind: target.artifactKind,
  displayPath: target.displayPath,
  ...(model ? { model } : {}),
  promptBytes: Buffer.byteLength(prompt, 'utf8'),
  provider,
  providerRequestId: createProviderRequestId({
    prompt,
    provider,
    target,
  }),
  timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 'infinite',
});

const formatRequestTraceDetail = (trace: SiteDebugAiRequestTrace) =>
  [
    `Trace ${trace.providerRequestId}`,
    `${getSiteDebugAiProviderLabel(trace.provider)}`,
    trace.model ? `model ${trace.model}` : null,
    `${trace.artifactKind} ${trace.displayPath}`,
    `prompt ${formatByteCount(trace.promptBytes)}`,
    trace.timeoutMs === 'infinite'
      ? 'timeout disabled'
      : `timeout ${formatDurationMs(trace.timeoutMs)}`,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');

const logAiRequestStarted = (trace: SiteDebugAiRequestTrace) => {
  SiteDebugAiLogger.info(
    `Starting AI analysis: ${formatRequestTraceDetail(trace)}`,
  );
};

const logAiRequestSucceeded = ({
  elapsedMs,
  result,
  trace,
}: {
  elapsedMs: number;
  result: string;
  trace: SiteDebugAiRequestTrace;
}) => {
  SiteDebugAiLogger.success(
    `AI analysis returned data: ${formatRequestTraceDetail(trace)} · response ${formatByteCount(
      Buffer.byteLength(result, 'utf8'),
    )} · elapsed ${formatDurationMs(elapsedMs)}`,
  );
};

const logAiRequestFailed = ({
  elapsedMs,
  error,
  trace,
}: {
  elapsedMs: number;
  error: unknown;
  trace: SiteDebugAiRequestTrace;
}) => {
  SiteDebugAiLogger.error(
    `AI analysis returned no data: ${formatRequestTraceDetail(trace)} · elapsed ${formatDurationMs(
      elapsedMs,
    )} · reason ${formatErrorMessage(error)}`,
  );
};

const createTimeoutExecutionError = ({
  trace,
}: {
  trace: SiteDebugAiRequestTrace;
}) => {
  const detail = formatRequestTraceDetail(trace);

  return new SiteDebugAiExecutionError(
    `${getSiteDebugAiProviderLabel(trace.provider)} analysis timed out. ${detail}`,
    {
      detail,
      statusCode: 504,
    },
  );
};

const createExecutionFailure = ({
  detail,
  message,
  statusCode,
}: {
  detail: string;
  message: string;
  statusCode?: number;
}) =>
  new SiteDebugAiExecutionError(`${message} ${detail}`.trim(), {
    detail,
    statusCode,
  });

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

const getDoubaoCapability = (
  config: SiteDebugAiConfig,
): SiteDebugAiProviderCapability => {
  const providerConfig = getDoubaoProviderConfig(config);

  if (!providerConfig) {
    return {
      available: false,
      detail:
        'Configure siteDebug.analysis.providers.doubao to use Doubao analysis.',
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
      doubao: getDoubaoCapability(config),
    },
  };
};

const runDoubaoAnalysis = async (
  prompt: string,
  config: SiteDebugAiConfig,
  target: SiteDebugAiAnalysisTarget,
): Promise<SiteDebugAiExecutionResult> => {
  const capability = getDoubaoCapability(config);
  const providerConfig = getDoubaoProviderConfig(config);
  const maxTokens = getDoubaoMaxTokens(config);
  const thinking = getDoubaoThinkingType(config);
  const temperature = getDoubaoTemperature(config);
  const timeoutMs = getDoubaoTimeoutMs(config);
  const trace = createRequestTrace({
    model: providerConfig?.model,
    prompt,
    provider: 'doubao',
    target,
    timeoutMs,
  });
  const startedAt = Date.now();

  if (
    !capability.available ||
    !providerConfig?.apiKey ||
    !providerConfig.model
  ) {
    throw createExecutionFailure({
      detail: formatRequestTraceDetail(trace),
      message: capability.detail,
      statusCode: 400,
    });
  }

  logAiRequestStarted(trace);

  const providerApiKey = providerConfig.apiKey;
  const providerModel = providerConfig.model;

  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs)
    ? setTimeout(() => {
        controller.abort();
      }, timeoutMs)
    : null;

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
      throw createExecutionFailure({
        detail: formatRequestTraceDetail(trace),
        message:
          payload.error?.message ||
          `Doubao request failed with HTTP ${response.status}.`,
        statusCode:
          response.status === 408 || response.status === 504
            ? 504
            : response.status,
      });
    }

    const content = resolveTextContent(payload.choices?.[0]?.message?.content);

    if (!content) {
      throw createExecutionFailure({
        detail: formatRequestTraceDetail(trace),
        message: 'Doubao returned an empty analysis result.',
        statusCode: 502,
      });
    }

    logAiRequestSucceeded({
      elapsedMs: Date.now() - startedAt,
      result: content,
      trace,
    });

    return {
      detail: capability.detail,
      model: providerModel,
      result: content,
    };
  } catch (error) {
    logAiRequestFailed({
      elapsedMs: Date.now() - startedAt,
      error,
      trace,
    });

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw createTimeoutExecutionError({ trace });
    }

    if (error instanceof SiteDebugAiExecutionError) {
      throw error;
    }

    throw createExecutionFailure({
      detail: formatRequestTraceDetail(trace),
      message:
        error instanceof Error
          ? error.message
          : 'Doubao analysis request failed.',
      statusCode: 500,
    });
  } finally {
    if (timeout) {
      clearTimeout(timeout);
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
  const capabilityResponse = await resolveSiteDebugAiCapabilities(config);
  const capability = capabilityResponse.providers[provider];

  if (!capability?.available) {
    throw createExecutionFailure({
      detail: `${provider} ${target.artifactKind} ${target.displayPath}`,
      message:
        capability?.detail ||
        `${getSiteDebugAiProviderLabel(provider)} is not available in the current siteDebug.analysis configuration.`,
      statusCode: 400,
    });
  }

  return runDoubaoAnalysis(
    buildSiteDebugAiAnalysisPrompt(target),
    config,
    target,
  );
};

export const handleSiteDebugAiRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  config: SiteDebugAiConfig,
): Promise<void> => {
  let provider: SiteDebugAiProvider | undefined;
  let prompt: string | undefined;

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
    provider = body.provider;
    prompt = buildSiteDebugAiAnalysisPrompt(body.target);
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

    if (error instanceof SiteDebugAiExecutionError) {
      if (provider && prompt) {
        sendJson(res, error.statusCode, {
          detail: error.detail,
          error: error.message,
          ok: false,
          prompt,
          provider,
        } satisfies SiteDebugAiAnalyzeResponse);
        return;
      }

      sendJson(res, error.statusCode, {
        detail: error.detail,
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
