import { formatBytes, inferSourceLanguage } from './site-debug-shared';

export interface RemoteTextContentProgress {
  loadedBytes: number;
  totalBytes?: number;
  url: string;
}

export interface RemoteTextContentStreamPreview {
  content: string;
  isComplete: boolean;
  isTruncated: boolean;
  loadedBytes: number;
  totalBytes?: number;
  url: string;
}

export interface LoadRemoteTextContentOptions {
  onStreamPreview?: (preview: RemoteTextContentStreamPreview) => void;
  onProgress?: (progress: RemoteTextContentProgress) => void;
  signal?: AbortSignal;
}

export interface CodePreviewBudget {
  byteLength: number;
  lineCount: number;
  shouldRenderRichPreview: boolean;
}

export interface BackgroundCodePreviewRenderInput {
  sourceContent: string;
  sourcePath?: string;
}

export interface BackgroundCodePreviewRenderResult {
  formattedContent: string;
  previewHtml: string;
}

export interface PlainTextPreviewLineIndex {
  lineCount: number;
  lineStartOffsets: Uint32Array;
}

interface RemoteTextContentCacheEntry {
  byteLength: number;
  content: string;
}

interface BackgroundCodePreviewWorkerRequest
  extends BackgroundCodePreviewRenderInput {
  requestId: number;
}

interface BackgroundCodePreviewWorkerSuccessResponse
  extends BackgroundCodePreviewRenderResult {
  requestId: number;
  success: true;
}

interface BackgroundCodePreviewWorkerErrorResponse {
  error: string;
  requestId: number;
  success: false;
}

export type BackgroundCodePreviewWorkerResponse =
  | BackgroundCodePreviewWorkerErrorResponse
  | BackgroundCodePreviewWorkerSuccessResponse;

interface BackgroundPlainTextLineIndexSuccessResponse {
  lineCount: number;
  lineStartOffsetsBuffer: ArrayBufferLike;
  requestId: number;
  success: true;
}

interface BackgroundPlainTextLineIndexErrorResponse {
  error: string;
  requestId: number;
  success: false;
}

type BackgroundPlainTextLineIndexResponse =
  | BackgroundPlainTextLineIndexErrorResponse
  | BackgroundPlainTextLineIndexSuccessResponse;

const HTML_ESCAPE_PATTERN = /["&'<>]/g;
const HTML_ESCAPE_REPLACEMENTS: Record<string, string> = {
  '"': '&quot;',
  '&': '&amp;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
};
const BACKGROUND_PREVIEW_ABORT_ERROR = 'SiteDebugBackgroundPreviewAborted';
const MAX_RICH_PREVIEW_BYTES = 128 * 1024;
const MAX_RICH_PREVIEW_LINES = 3200;
const CONTENT_SIGNATURE_SAMPLE_LENGTH = 160;
export const STREAMING_PREVIEW_MAX_CHARACTERS = 24_000;
const STREAMING_PREVIEW_MIN_UPDATE_CHARACTERS = 2048;
const MAX_CACHED_REMOTE_TEXT_ENTRIES = 12;
const MAX_CACHED_REMOTE_TEXT_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_CACHED_REMOTE_TEXT_ENTRY_BYTES = 384 * 1024;

const cachedRemoteTextContents = new Map<string, RemoteTextContentCacheEntry>();
let cachedRemoteTextContentBytes = 0;

const createAbortError = () =>
  new DOMException('Preview request was aborted.', 'AbortError');

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw createAbortError();
  }
};

const getRemoteTextByteLength = (value: string) =>
  new TextEncoder().encode(value).byteLength;

const deleteCachedRemoteTextContent = (sourceUrl: string) => {
  const cachedEntry = cachedRemoteTextContents.get(sourceUrl);

  if (!cachedEntry) {
    return;
  }

  cachedRemoteTextContents.delete(sourceUrl);
  cachedRemoteTextContentBytes = Math.max(
    cachedRemoteTextContentBytes - cachedEntry.byteLength,
    0,
  );
};

const getCachedRemoteTextContent = (sourceUrl: string) => {
  const cachedEntry = cachedRemoteTextContents.get(sourceUrl);

  if (!cachedEntry) {
    return null;
  }

  cachedRemoteTextContents.delete(sourceUrl);
  cachedRemoteTextContents.set(sourceUrl, cachedEntry);
  return cachedEntry;
};

const setCachedRemoteTextContent = (
  sourceUrl: string,
  nextEntry: RemoteTextContentCacheEntry,
) => {
  if (nextEntry.byteLength > MAX_CACHED_REMOTE_TEXT_ENTRY_BYTES) {
    deleteCachedRemoteTextContent(sourceUrl);
    return;
  }

  deleteCachedRemoteTextContent(sourceUrl);
  cachedRemoteTextContents.set(sourceUrl, nextEntry);
  cachedRemoteTextContentBytes += nextEntry.byteLength;

  for (;;) {
    const shouldEvictOldestEntry =
      cachedRemoteTextContents.size > MAX_CACHED_REMOTE_TEXT_ENTRIES ||
      cachedRemoteTextContentBytes > MAX_CACHED_REMOTE_TEXT_TOTAL_BYTES;

    if (!shouldEvictOldestEntry) {
      break;
    }

    const oldestCacheKey = cachedRemoteTextContents.keys().next().value;

    if (typeof oldestCacheKey !== 'string') {
      break;
    }

    deleteCachedRemoteTextContent(oldestCacheKey);
  }
};

export const inferPrettierParser = (sourcePath?: string) => {
  const normalizedPath = sourcePath?.toLowerCase() || '';

  if (normalizedPath.endsWith('.tsx') || normalizedPath.endsWith('.ts')) {
    return 'babel-ts';
  }

  if (normalizedPath.endsWith('.jsx')) {
    return 'babel';
  }

  if (
    normalizedPath.endsWith('.js') ||
    normalizedPath.endsWith('.mjs') ||
    normalizedPath.endsWith('.cjs')
  ) {
    return 'babel';
  }

  if (normalizedPath.endsWith('.json')) {
    return 'json';
  }

  if (normalizedPath.endsWith('.css')) {
    return 'css';
  }

  if (normalizedPath.endsWith('.scss')) {
    return 'scss';
  }

  if (normalizedPath.endsWith('.vue')) {
    return 'vue';
  }

  if (normalizedPath.endsWith('.svg') || normalizedPath.endsWith('.html')) {
    return 'html';
  }

  if (normalizedPath.endsWith('.md')) {
    return 'markdown';
  }

  if (normalizedPath.endsWith('.yaml') || normalizedPath.endsWith('.yml')) {
    return 'yaml';
  }

  return null;
};

export const escapeHtml = (value: string) =>
  value.replaceAll(
    HTML_ESCAPE_PATTERN,
    (character) => HTML_ESCAPE_REPLACEMENTS[character] || character,
  );

export const getCodePreviewBudget = (
  sourceContent: string,
): CodePreviewBudget => {
  const byteLength = new TextEncoder().encode(sourceContent).byteLength;
  const lineBreakCount = sourceContent.match(/\r\n|\r|\n/g)?.length ?? 0;
  const lineCount = sourceContent.length > 0 ? lineBreakCount + 1 : 0;

  return {
    byteLength,
    lineCount,
    shouldRenderRichPreview:
      byteLength <= MAX_RICH_PREVIEW_BYTES &&
      lineCount <= MAX_RICH_PREVIEW_LINES,
  };
};

export const formatCodePreviewBudgetSummary = ({
  byteLength,
  lineCount,
}: Pick<CodePreviewBudget, 'byteLength' | 'lineCount'>) =>
  `${formatBytes(byteLength)}${lineCount > 0 ? `, ${lineCount.toLocaleString()} lines` : ''}`;

export const createCodePreviewCacheKey = (
  sourcePath: string | undefined,
  sourceContent: string,
) => {
  const prefix = sourceContent.slice(0, CONTENT_SIGNATURE_SAMPLE_LENGTH);
  const suffix =
    sourceContent.length > CONTENT_SIGNATURE_SAMPLE_LENGTH
      ? sourceContent.slice(-CONTENT_SIGNATURE_SAMPLE_LENGTH)
      : '';

  return [sourcePath || 'unknown', sourceContent.length, prefix, suffix].join(
    '::',
  );
};

export const clearRemoteTextContentCache = () => {
  cachedRemoteTextContents.clear();
  cachedRemoteTextContentBytes = 0;
};

const emitRemoteTextContentProgress = (
  sourceUrl: string,
  byteLength: number,
  options: LoadRemoteTextContentOptions,
) => {
  options.onProgress?.({
    loadedBytes: byteLength,
    totalBytes: byteLength,
    url: sourceUrl,
  });
};

const emitRemoteTextContentStreamPreview = (
  sourceUrl: string,
  preview: {
    content: string;
    isComplete: boolean;
    isTruncated: boolean;
    loadedBytes: number;
    totalBytes?: number;
  },
  options: LoadRemoteTextContentOptions,
) => {
  if (!preview.content) {
    return;
  }

  options.onStreamPreview?.({
    ...preview,
    url: sourceUrl,
  });
};

const loadRemoteTextContentFromResponse = async (
  response: Response,
  sourceUrl: string,
  options: LoadRemoteTextContentOptions,
) => {
  const totalBytesHeader = response.headers.get('content-length');
  const totalBytes = totalBytesHeader
    ? Number.parseInt(totalBytesHeader, 10)
    : Number.NaN;
  const resolvedTotalBytes =
    Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined;

  if (!response.body) {
    const content = await response.text();
    const byteLength = getRemoteTextByteLength(content);
    const previewContent = content.slice(0, STREAMING_PREVIEW_MAX_CHARACTERS);

    options.onProgress?.({
      loadedBytes: byteLength,
      totalBytes: resolvedTotalBytes,
      url: sourceUrl,
    });
    emitRemoteTextContentStreamPreview(
      sourceUrl,
      {
        content: previewContent,
        isComplete: true,
        isTruncated: content.length > previewContent.length,
        loadedBytes: byteLength,
        totalBytes: resolvedTotalBytes ?? byteLength,
      },
      options,
    );

    return {
      byteLength,
      content,
    } satisfies RemoteTextContentCacheEntry;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let loadedBytes = 0;
  let streamPreviewContent = '';
  let lastEmittedStreamPreviewLength = 0;
  let lastEmittedStreamPreviewIsTruncated = false;
  let streamPreviewIsTruncated = false;

  const maybeEmitStreamPreview = (isComplete = false) => {
    const previewLength = streamPreviewContent.length;
    const previewStateChanged =
      previewLength !== lastEmittedStreamPreviewLength ||
      streamPreviewIsTruncated !== lastEmittedStreamPreviewIsTruncated;
    const shouldEmitPreview =
      previewLength > 0 &&
      (isComplete ||
        (previewStateChanged &&
          (lastEmittedStreamPreviewLength === 0 ||
            streamPreviewIsTruncated ||
            previewLength === STREAMING_PREVIEW_MAX_CHARACTERS ||
            previewLength - lastEmittedStreamPreviewLength >=
              STREAMING_PREVIEW_MIN_UPDATE_CHARACTERS)));

    if (!shouldEmitPreview) {
      return;
    }

    lastEmittedStreamPreviewLength = previewLength;
    lastEmittedStreamPreviewIsTruncated = streamPreviewIsTruncated;
    emitRemoteTextContentStreamPreview(
      sourceUrl,
      {
        content: streamPreviewContent,
        isComplete,
        isTruncated: streamPreviewIsTruncated,
        loadedBytes,
        totalBytes: resolvedTotalBytes,
      },
      options,
    );
  };

  while (true) {
    throwIfAborted(options.signal);
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (value) {
      loadedBytes += value.byteLength;
      const decodedChunk = decoder.decode(value, { stream: true });

      chunks.push(decodedChunk);
      if (decodedChunk) {
        const previewRemainingCharacters =
          STREAMING_PREVIEW_MAX_CHARACTERS - streamPreviewContent.length;

        if (previewRemainingCharacters > 0) {
          if (decodedChunk.length > previewRemainingCharacters) {
            streamPreviewContent += decodedChunk.slice(
              0,
              previewRemainingCharacters,
            );
            streamPreviewIsTruncated = true;
          } else {
            streamPreviewContent += decodedChunk;
          }
        } else {
          streamPreviewIsTruncated = true;
        }

        maybeEmitStreamPreview();
      }

      options.onProgress?.({
        loadedBytes,
        totalBytes: resolvedTotalBytes,
        url: sourceUrl,
      });
    }
  }

  const tail = decoder.decode();

  if (tail) {
    chunks.push(tail);
    const previewRemainingCharacters =
      STREAMING_PREVIEW_MAX_CHARACTERS - streamPreviewContent.length;

    if (previewRemainingCharacters > 0) {
      if (tail.length > previewRemainingCharacters) {
        streamPreviewContent += tail.slice(0, previewRemainingCharacters);
        streamPreviewIsTruncated = true;
      } else {
        streamPreviewContent += tail;
      }
    } else {
      streamPreviewIsTruncated = true;
    }
  }

  options.onProgress?.({
    loadedBytes,
    totalBytes: resolvedTotalBytes ?? loadedBytes,
    url: sourceUrl,
  });
  maybeEmitStreamPreview(true);

  return {
    byteLength: loadedBytes,
    content: chunks.join(''),
  } satisfies RemoteTextContentCacheEntry;
};

const loadRemoteTextContentFromUrl = async (
  sourceUrl: string,
  options: LoadRemoteTextContentOptions,
) => {
  throwIfAborted(options.signal);
  const cachedEntry = getCachedRemoteTextContent(sourceUrl);

  if (cachedEntry) {
    emitRemoteTextContentProgress(sourceUrl, cachedEntry.byteLength, options);
    return cachedEntry;
  }

  const response = await fetch(sourceUrl, {
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const nextEntry = await loadRemoteTextContentFromResponse(
    response,
    sourceUrl,
    options,
  );

  setCachedRemoteTextContent(sourceUrl, nextEntry);
  return nextEntry;
};

export const formatPreviewContent = async (
  sourceContent: string,
  sourcePath?: string,
) => {
  const parser = inferPrettierParser(sourcePath);

  if (!parser) {
    return sourceContent;
  }

  try {
    const prettier = await import('prettier/standalone');

    if (parser === 'babel' || parser === 'babel-ts' || parser === 'json') {
      const [{ default: babelPlugin }, { default: estreePlugin }] =
        await Promise.all([
          import('prettier/plugins/babel'),
          import('prettier/plugins/estree'),
        ]);

      return await prettier.format(sourceContent, {
        parser,
        plugins: [babelPlugin, estreePlugin],
      });
    }

    if (parser === 'css' || parser === 'scss') {
      const { default: postcssPlugin } = await import(
        'prettier/plugins/postcss'
      );

      return await prettier.format(sourceContent, {
        parser,
        plugins: [postcssPlugin],
      });
    }

    if (parser === 'markdown') {
      const { default: markdownPlugin } = await import(
        'prettier/plugins/markdown'
      );

      return await prettier.format(sourceContent, {
        parser,
        plugins: [markdownPlugin],
      });
    }

    if (parser === 'yaml') {
      const { default: yamlPlugin } = await import('prettier/plugins/yaml');

      return await prettier.format(sourceContent, {
        parser,
        plugins: [yamlPlugin],
      });
    }

    const { default: htmlPlugin } = await import('prettier/plugins/html');

    return await prettier.format(sourceContent, {
      parser,
      plugins: [htmlPlugin],
    });
  } catch {
    return sourceContent;
  }
};

export const loadRemoteTextContent = async (
  sourceCandidates: (string | null | undefined)[],
  options: LoadRemoteTextContentOptions = {},
) => {
  const normalizedCandidates = sourceCandidates.filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  let lastError: Error | null = null;

  for (const sourceUrl of normalizedCandidates) {
    try {
      const remoteTextEntry = await loadRemoteTextContentFromUrl(
        sourceUrl,
        options,
      );

      return remoteTextEntry.content;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw (
    lastError || new Error('Source asset is not available for this module.')
  );
};

export const loadRemoteTextContentByteSize = async (
  sourceCandidates: (string | null | undefined)[],
  options: LoadRemoteTextContentOptions = {},
) => {
  const normalizedCandidates = sourceCandidates.filter(
    (candidate): candidate is string => Boolean(candidate),
  );

  for (const sourceUrl of normalizedCandidates) {
    const cachedEntry = getCachedRemoteTextContent(sourceUrl);

    if (cachedEntry) {
      options.onProgress?.({
        loadedBytes: cachedEntry.byteLength,
        totalBytes: cachedEntry.byteLength,
        url: sourceUrl,
      });

      return cachedEntry.byteLength;
    }

    try {
      throwIfAborted(options.signal);
      const response = await fetch(sourceUrl, {
        method: 'HEAD',
        signal: options.signal,
      });

      if (!response.ok) {
        continue;
      }

      const totalBytesHeader = response.headers.get('content-length');
      const totalBytes = totalBytesHeader
        ? Number.parseInt(totalBytesHeader, 10)
        : Number.NaN;

      if (Number.isFinite(totalBytes) && totalBytes >= 0) {
        options.onProgress?.({
          loadedBytes: totalBytes,
          totalBytes,
          url: sourceUrl,
        });

        return totalBytes;
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      // Fall back to streaming the full content when HEAD is unavailable.
    }
  }

  const content = await loadRemoteTextContent(sourceCandidates, options);
  return getRemoteTextByteLength(content);
};

export const highlightCodeContent = async (
  sourceContent: string,
  sourcePath?: string,
) => {
  try {
    const { codeToHtml } = await import('shiki');

    return await codeToHtml(sourceContent, {
      lang: inferSourceLanguage(sourcePath),
      themes: {
        dark: 'vitesse-dark',
        light: 'vitesse-light',
      },
    });
  } catch {
    return `<pre class="shiki site-debug-source-viewer__fallback"><code>${escapeHtml(sourceContent)}</code></pre>`;
  }
};

const createBackgroundPreviewAbortError = () => {
  const error = new Error('Background preview request was superseded.');

  error.name = BACKGROUND_PREVIEW_ABORT_ERROR;
  return error;
};

export const isBackgroundCodePreviewAbortError = (error: unknown) =>
  error instanceof Error && error.name === BACKGROUND_PREVIEW_ABORT_ERROR;

export const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === 'AbortError';

export const waitForNextCodePreviewPaint = () =>
  new Promise<void>((resolve) => {
    if (globalThis.window === undefined) {
      resolve();
      return;
    }

    globalThis.window.requestAnimationFrame(() => resolve());
  });

export const waitForCodePreviewIdle = (timeoutMs = 180) =>
  new Promise<void>((resolve) => {
    if (globalThis.window === undefined) {
      resolve();
      return;
    }

    const idleWindow = globalThis.window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleWindow.requestIdleCallback(() => resolve(), {
        timeout: timeoutMs,
      });
      return;
    }

    globalThis.window.setTimeout(() => resolve(), 48);
  });

const resolveSiteDebugWorkerUrl = (workerFileName: string): URL =>
  new URL(workerFileName, import.meta.url);

export const createBackgroundCodePreviewRenderer = () => {
  let activeRequest: {
    resolve: (value: BackgroundCodePreviewRenderResult) => void;
    reject: (reason?: unknown) => void;
    requestId: number;
  } | null = null;
  let requestId = 0;
  let worker: Worker | null = null;

  const rejectActiveRequest = (error: Error) => {
    if (!activeRequest) {
      return;
    }

    const { reject } = activeRequest;

    activeRequest = null;
    reject(error);
  };

  const terminateWorker = (error = createBackgroundPreviewAbortError()) => {
    if (worker) {
      worker.terminate();
      worker = null;
    }

    rejectActiveRequest(error);
  };

  const ensureWorker = () => {
    if (worker) {
      return worker;
    }

    worker = new Worker(
      resolveSiteDebugWorkerUrl('site-debug-source-preview.worker.ts'),
      {
        type: 'module',
      },
    );

    worker.addEventListener(
      'message',
      (event: MessageEvent<BackgroundCodePreviewWorkerResponse>) => {
        if (
          !activeRequest ||
          event.data.requestId !== activeRequest.requestId
        ) {
          return;
        }

        const { reject, resolve } = activeRequest;

        if (!event.data.success) {
          activeRequest = null;
          reject(new Error(event.data.error));
          return;
        }

        activeRequest = null;
        resolve({
          formattedContent: event.data.formattedContent,
          previewHtml: event.data.previewHtml,
        });
      },
    );

    worker.addEventListener('error', () => {
      terminateWorker(new Error('Background preview rendering failed.'));
    });

    return worker;
  };

  return {
    cancel() {
      terminateWorker();
    },
    dispose() {
      terminateWorker();
    },
    render(input: BackgroundCodePreviewRenderInput) {
      if (typeof Worker === 'undefined') {
        return Promise.resolve<BackgroundCodePreviewRenderResult>({
          formattedContent: input.sourceContent,
          previewHtml: '',
        });
      }

      if (activeRequest) {
        terminateWorker();
      }

      const currentRequestId = ++requestId;
      const activeWorker = ensureWorker();

      return new Promise<BackgroundCodePreviewRenderResult>(
        (resolve, reject) => {
          activeRequest = {
            resolve,
            reject,
            requestId: currentRequestId,
          };
          activeWorker.postMessage({
            requestId: currentRequestId,
            ...input,
          } satisfies BackgroundCodePreviewWorkerRequest);
        },
      );
    },
  };
};

export const createBackgroundPlainTextPreviewIndexer = () => {
  let activeRequest: {
    reject: (reason?: unknown) => void;
    requestId: number;
    resolve: (value: PlainTextPreviewLineIndex) => void;
  } | null = null;
  let requestId = 0;
  let worker: Worker | null = null;

  const rejectActiveRequest = (error: Error) => {
    if (!activeRequest) {
      return;
    }

    const { reject } = activeRequest;

    activeRequest = null;
    reject(error);
  };

  const terminateWorker = (error = createBackgroundPreviewAbortError()) => {
    if (worker) {
      worker.terminate();
      worker = null;
    }

    rejectActiveRequest(error);
  };

  const ensureWorker = () => {
    if (worker) {
      return worker;
    }

    worker = new Worker(
      resolveSiteDebugWorkerUrl('site-debug-source-text.worker.ts'),
      {
        type: 'module',
      },
    );

    worker.addEventListener(
      'message',
      (event: MessageEvent<BackgroundPlainTextLineIndexResponse>) => {
        if (
          !activeRequest ||
          event.data.requestId !== activeRequest.requestId
        ) {
          return;
        }

        const { reject, resolve } = activeRequest;

        if (!event.data.success) {
          activeRequest = null;
          reject(new Error(event.data.error));
          return;
        }

        activeRequest = null;
        resolve({
          lineCount: event.data.lineCount,
          lineStartOffsets: new Uint32Array(event.data.lineStartOffsetsBuffer),
        });
      },
    );

    worker.addEventListener('error', () => {
      terminateWorker(new Error('Background text indexing failed.'));
    });

    return worker;
  };

  return {
    cancel() {
      terminateWorker();
    },
    dispose() {
      terminateWorker();
    },
    index(sourceContent: string) {
      if (typeof Worker === 'undefined') {
        return Promise.resolve<PlainTextPreviewLineIndex>({
          lineCount: sourceContent.length > 0 ? 1 : 0,
          lineStartOffsets: new Uint32Array(
            sourceContent.length > 0 ? [0] : [],
          ),
        });
      }

      if (activeRequest) {
        terminateWorker();
      }

      const currentRequestId = ++requestId;
      const activeWorker = ensureWorker();

      return new Promise<PlainTextPreviewLineIndex>((resolve, reject) => {
        activeRequest = {
          reject,
          requestId: currentRequestId,
          resolve,
        };
        activeWorker.postMessage({
          requestId: currentRequestId,
          sourceContent,
        });
      });
    },
  };
};
