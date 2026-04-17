import { codeToTokens } from 'shiki';
import { inferSourceLanguage } from './site-devtools-shared';
import { createPlainTextPreviewLineIndex } from './site-devtools-source-text-index';

type CodeTokenizationResult = Awaited<ReturnType<typeof codeToTokens>>;
type CodeTokenizationGrammarState = CodeTokenizationResult['grammarState'];

export type CodePreviewTheme = 'dark' | 'light';

export interface WindowedCodePreviewToken {
  content: string;
  htmlStyle: Record<string, string>;
}

export interface WindowedCodePreviewLine {
  lineNumber: number;
  tokens: WindowedCodePreviewToken[];
}

export interface WindowedCodePreviewRangeInput {
  rangeEnd: number;
  rangeStart: number;
  sourceContent: string;
  sourceKey: string;
  sourcePath?: string;
  theme: CodePreviewTheme;
}

export interface WindowedCodePreviewRangeResult {
  checkpointLine: number;
  resolvedEndLine: number;
  resolvedStartLine: number;
  rootStyle: string;
  tokenLines: WindowedCodePreviewLine[];
}

interface CachedSourceContext {
  lineTexts: string[];
  sourceContent: string;
  sourcePath?: string;
  themeCaches: Map<string, ThemeRenderCache>;
}

interface ThemeRenderCache {
  batchTokens: Map<number, WindowedCodePreviewLine[]>;
  checkpointStates: Map<number, CodeTokenizationGrammarState>;
  rootStyle: string;
}

const MAX_CACHED_SOURCE_CONTEXTS = 6;
export const WINDOWED_HIGHLIGHT_BATCH_LINES = 256;
const WINDOWED_CODE_PREVIEW_SUPERSEDED_ERROR =
  'SiteDevToolsWindowedCodePreviewSuperseded';

const createSupersededError = () => {
  const error = new Error('Windowed code preview request was superseded.');

  error.name = WINDOWED_CODE_PREVIEW_SUPERSEDED_ERROR;
  return error;
};

export const isWindowedCodePreviewSupersededError = (error: unknown) =>
  error instanceof Error &&
  error.name === WINDOWED_CODE_PREVIEW_SUPERSEDED_ERROR;

const clampLineNumber = (value: number, lineCount: number) =>
  Math.min(Math.max(Math.trunc(value), 0), lineCount);

const normalizeLineText = (value: string) => {
  if (value.endsWith('\r\n')) {
    return value.slice(0, -2);
  }

  if (value.endsWith('\n') || value.endsWith('\r')) {
    return value.slice(0, -1);
  }

  return value;
};

const toRootStyle = (fg?: string, bg?: string) =>
  [bg ? `background-color:${bg}` : '', fg ? `color:${fg}` : '']
    .filter(Boolean)
    .join(';');

const getThemeCacheKey = (theme: CodePreviewTheme, sourcePath?: string) =>
  `${theme}::${inferSourceLanguage(sourcePath)}`;

const getBatchStartLine = (lineNumber: number) =>
  Math.floor(lineNumber / WINDOWED_HIGHLIGHT_BATCH_LINES) *
  WINDOWED_HIGHLIGHT_BATCH_LINES;

const getLineTexts = (sourceContent: string) => {
  const lineIndex = createPlainTextPreviewLineIndex(sourceContent);
  const lineTexts: string[] = [];

  for (let lineNumber = 0; lineNumber < lineIndex.lineCount; lineNumber += 1) {
    const startOffset = lineIndex.lineStartOffsets[lineNumber] ?? 0;
    const endOffset =
      lineIndex.lineStartOffsets[lineNumber + 1] ?? sourceContent.length;

    lineTexts.push(
      normalizeLineText(sourceContent.slice(startOffset, endOffset)),
    );
  }

  return lineTexts;
};

const createCachedSourceContext = (
  input: Pick<WindowedCodePreviewRangeInput, 'sourceContent' | 'sourcePath'>,
): CachedSourceContext => ({
  lineTexts: getLineTexts(input.sourceContent),
  sourceContent: input.sourceContent,
  sourcePath: input.sourcePath,
  themeCaches: new Map(),
});

const getOrCreateThemeCache = (
  sourceContext: CachedSourceContext,
  themeCacheKey: string,
) => {
  const existingThemeCache = sourceContext.themeCaches.get(themeCacheKey);

  if (existingThemeCache) {
    sourceContext.themeCaches.delete(themeCacheKey);
    sourceContext.themeCaches.set(themeCacheKey, existingThemeCache);
    return existingThemeCache;
  }

  const nextThemeCache: ThemeRenderCache = {
    batchTokens: new Map(),
    checkpointStates: new Map([[0, undefined]]),
    rootStyle: '',
  };

  sourceContext.themeCaches.set(themeCacheKey, nextThemeCache);
  return nextThemeCache;
};

const getCheckpointLine = (
  checkpointStates: Map<number, CodeTokenizationGrammarState>,
  targetLine: number,
) => {
  let checkpointLine = 0;

  for (const candidateLine of checkpointStates.keys()) {
    if (candidateLine <= targetLine && candidateLine >= checkpointLine) {
      checkpointLine = candidateLine;
    }
  }

  return checkpointLine;
};

const normalizeTokenLine = (
  lineNumber: number,
  tokens: {
    content: string;
    htmlStyle?: Record<string, string> | string;
  }[],
) => ({
  lineNumber,
  tokens: tokens.map((token) => ({
    content: token.content,
    htmlStyle:
      typeof token.htmlStyle === 'string'
        ? Object.fromEntries(
            token.htmlStyle
              .split(';')
              .map((entry) => entry.trim())
              .filter(Boolean)
              .map((entry) => {
                const separatorIndex = entry.indexOf(':');

                if (separatorIndex === -1) {
                  return [entry, ''];
                }

                return [
                  entry.slice(0, separatorIndex).trim(),
                  entry.slice(separatorIndex + 1).trim(),
                ];
              }),
          )
        : { ...token.htmlStyle },
  })),
});

export const createWindowedCodePreviewRangeRenderer = () => {
  const cachedSourceContexts = new Map<string, CachedSourceContext>();

  const getSourceContext = (input: WindowedCodePreviewRangeInput) => {
    const existingContext = cachedSourceContexts.get(input.sourceKey);

    if (
      existingContext &&
      existingContext.sourceContent === input.sourceContent &&
      existingContext.sourcePath === input.sourcePath
    ) {
      cachedSourceContexts.delete(input.sourceKey);
      cachedSourceContexts.set(input.sourceKey, existingContext);
      return existingContext;
    }

    const nextContext = createCachedSourceContext(input);

    cachedSourceContexts.delete(input.sourceKey);
    cachedSourceContexts.set(input.sourceKey, nextContext);

    while (cachedSourceContexts.size > MAX_CACHED_SOURCE_CONTEXTS) {
      const oldestCacheKey = cachedSourceContexts.keys().next().value;

      if (typeof oldestCacheKey !== 'string') {
        break;
      }

      cachedSourceContexts.delete(oldestCacheKey);
    }

    return nextContext;
  };

  const ensureBatchTokens = async (
    sourceContext: CachedSourceContext,
    themeCache: ThemeRenderCache,
    batchStartLine: number,
    shouldContinue?: () => boolean,
  ) => {
    if (themeCache.batchTokens.has(batchStartLine)) {
      return;
    }

    const checkpointLine = getCheckpointLine(
      themeCache.checkpointStates,
      batchStartLine,
    );
    let currentBatchStartLine = checkpointLine;
    let currentGrammarState: CodeTokenizationGrammarState =
      themeCache.checkpointStates.get(checkpointLine);

    while (
      currentBatchStartLine <= batchStartLine &&
      currentBatchStartLine < sourceContext.lineTexts.length
    ) {
      if (shouldContinue && !shouldContinue()) {
        throw createSupersededError();
      }

      if (themeCache.batchTokens.has(currentBatchStartLine)) {
        currentGrammarState = themeCache.checkpointStates.get(
          Math.min(
            currentBatchStartLine + WINDOWED_HIGHLIGHT_BATCH_LINES,
            sourceContext.lineTexts.length,
          ),
        );
      } else {
        const normalizedBatchStartLine = currentBatchStartLine;
        const batchEndLine = Math.min(
          normalizedBatchStartLine + WINDOWED_HIGHLIGHT_BATCH_LINES,
          sourceContext.lineTexts.length,
        );
        const batchContent = sourceContext.lineTexts
          .slice(normalizedBatchStartLine, batchEndLine)
          .join('\n');
        const tokenResult = await codeToTokens(batchContent, {
          grammarState: currentGrammarState,
          lang: inferSourceLanguage(sourceContext.sourcePath),
          themes: {
            dark: 'vitesse-dark',
            light: 'vitesse-light',
          },
        });

        themeCache.batchTokens.set(
          normalizedBatchStartLine,
          tokenResult.tokens.map((tokenLine, index) =>
            normalizeTokenLine(normalizedBatchStartLine + index, tokenLine),
          ),
        );
        themeCache.checkpointStates.set(batchEndLine, tokenResult.grammarState);

        if (!themeCache.rootStyle) {
          themeCache.rootStyle = toRootStyle(tokenResult.fg, tokenResult.bg);
        }

        currentGrammarState = tokenResult.grammarState;
      }

      currentBatchStartLine += WINDOWED_HIGHLIGHT_BATCH_LINES;
    }
  };

  return {
    clear(sourceKey?: string) {
      if (sourceKey) {
        cachedSourceContexts.delete(sourceKey);
        return;
      }

      cachedSourceContexts.clear();
    },
    async render(
      input: WindowedCodePreviewRangeInput,
      shouldContinue?: () => boolean,
    ): Promise<WindowedCodePreviewRangeResult> {
      const sourceContext = getSourceContext(input);
      const lineCount = sourceContext.lineTexts.length;
      const rangeStart = clampLineNumber(input.rangeStart, lineCount);
      const rangeEnd = clampLineNumber(
        Math.max(input.rangeEnd, rangeStart),
        lineCount,
      );
      const resolvedStartLine = getBatchStartLine(rangeStart);
      const resolvedEndLine = Math.min(
        Math.ceil(rangeEnd / WINDOWED_HIGHLIGHT_BATCH_LINES) *
          WINDOWED_HIGHLIGHT_BATCH_LINES,
        lineCount,
      );
      const themeCache = getOrCreateThemeCache(
        sourceContext,
        getThemeCacheKey(input.theme, input.sourcePath),
      );

      for (
        let batchStartLine = resolvedStartLine;
        batchStartLine < resolvedEndLine;
        batchStartLine += WINDOWED_HIGHLIGHT_BATCH_LINES
      ) {
        await ensureBatchTokens(
          sourceContext,
          themeCache,
          batchStartLine,
          shouldContinue,
        );
      }

      if (shouldContinue && !shouldContinue()) {
        throw createSupersededError();
      }

      const tokenLines: WindowedCodePreviewLine[] = [];

      for (
        let batchStartLine = resolvedStartLine;
        batchStartLine < resolvedEndLine;
        batchStartLine += WINDOWED_HIGHLIGHT_BATCH_LINES
      ) {
        const batchLines = themeCache.batchTokens.get(batchStartLine);

        if (batchLines) {
          tokenLines.push(...batchLines);
        }
      }

      return {
        checkpointLine: getCheckpointLine(
          themeCache.checkpointStates,
          resolvedStartLine,
        ),
        resolvedEndLine,
        resolvedStartLine,
        rootStyle: themeCache.rootStyle,
        tokenLines,
      };
    },
  };
};
