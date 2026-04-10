import type {
  SiteDebugAnalysisBuildReportCacheStrategy,
  SiteDebugAnalysisBuildReportsConfig,
} from '#dep-types/utils';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'pathe';
import {
  sanitizeSiteDebugAiBuildReport,
  sanitizeSiteDebugAiText,
  type SiteDebugAiAnalysisTarget,
  type SiteDebugAiBuildReport,
  type SiteDebugAiProvider,
  type SiteDebugAiSanitizeOptions,
} from '../../shared/site-debug-ai';
import { PAGE_METAFILE_ASSET_DIR } from '../page-metafile-shared';
import type { SiteDebugAiConfig } from './ai-server';

const SITE_DEBUG_AI_BUILD_REPORTS_DIR = join(PAGE_METAFILE_ASSET_DIR, 'ai');
const SITE_DEBUG_AI_BUILD_REPORT_HASHED_FILE_SEGMENT_RE =
  /(?<=\b[\w%+@-]+\.)[\w-]{6,}(?=\.(?:lean\.)?(?:js|css|svg|json|mjs|cjs|woff2?|webp|png|jpe?g|gif|ico|txt|map)\b)/g;
const SITE_DEBUG_AI_BUILD_REPORT_PROMPT_DIFF_LIMIT = 3;
const SITE_DEBUG_AI_BUILD_REPORTS_DEFAULT_CACHE_DIR =
  '.vitepress/cache/site-debug-reports';

export interface BuildReportCacheConfig {
  dir: string;
  strategy: SiteDebugAnalysisBuildReportCacheStrategy;
}

export type BuildReportProviderConfigSnapshot = Record<
  string,
  boolean | number | string | null
> | null;

export interface BuildReportCacheIdentity {
  promptHash: string;
  provider: SiteDebugAiProvider;
  providerConfig: BuildReportProviderConfigSnapshot;
}

export interface StoredBuildReportCacheEntry {
  cacheIdentity?: BuildReportCacheIdentity | null;
  cacheKey: string | null;
  report: SiteDebugAiBuildReport;
}

export type BuildReportCacheInput =
  SiteDebugAnalysisBuildReportsConfig['cache'];

type SiteDebugAnalysisDoubaoRuntimeProviderConfig = NonNullable<
  NonNullable<NonNullable<SiteDebugAiConfig>['providers']>['doubao']
>[number];

const sanitizeFileStem = (value: string) =>
  value.replaceAll(/[^\w.-]/g, '_') || 'artifact';

const resolveDefaultBuildReportCacheDir = ({
  cacheDir,
  root,
}: {
  cacheDir: string;
  root?: string;
}) =>
  root
    ? resolve(root, SITE_DEBUG_AI_BUILD_REPORTS_DEFAULT_CACHE_DIR)
    : join(cacheDir, 'site-debug-reports');

export const resolveBuildReportCacheConfig = ({
  cache,
  cacheDir,
  root,
}: {
  cache: BuildReportCacheInput | undefined;
  cacheDir: string;
  root?: string;
}): BuildReportCacheConfig | null => {
  if (cache === false) {
    return null;
  }

  const defaultCacheDir = resolveDefaultBuildReportCacheDir({ cacheDir, root });
  const cacheOptions =
    typeof cache === 'object' && cache !== null ? cache : undefined;

  const configuredDir = cacheOptions?.dir?.trim();

  return {
    dir: configuredDir
      ? isAbsolute(configuredDir)
        ? configuredDir
        : resolve(root ?? process.cwd(), configuredDir)
      : defaultCacheDir,
    strategy: cacheOptions?.strategy === 'fallback' ? 'fallback' : 'exact',
  };
};

export const mergeBuildReportCacheInput = ({
  baseCache,
  overrideCache,
}: {
  baseCache: BuildReportCacheInput | undefined;
  overrideCache: BuildReportCacheInput | undefined;
}): BuildReportCacheInput | undefined => {
  if (overrideCache === undefined) {
    return baseCache;
  }

  if (
    overrideCache === false ||
    overrideCache === true ||
    typeof overrideCache !== 'object' ||
    overrideCache === null
  ) {
    return overrideCache;
  }

  const baseCacheOptions =
    typeof baseCache === 'object' && baseCache !== null ? baseCache : undefined;

  return {
    ...baseCacheOptions,
    ...overrideCache,
  };
};

const getBuildReportPromptHash = (prompt: string) =>
  createHash('sha256').update(prompt).digest('hex');

const normalizeBuildReportPromptForCache = (prompt: string) =>
  prompt.replaceAll(
    SITE_DEBUG_AI_BUILD_REPORT_HASHED_FILE_SEGMENT_RE,
    '[hash]',
  );

const truncateBuildReportPromptDiffValue = (value: string) =>
  value.length > 120 ? `${value.slice(0, 117)}...` : value;

const parseBuildReportPromptDiffLabel = (line: string) => {
  let content = line.trimStart();

  if (content.startsWith('- ')) {
    content = content.slice(2);
  } else {
    const numberedSeparatorIndex = content.indexOf('. ');

    if (numberedSeparatorIndex > 0) {
      const numberedPrefix = content.slice(0, numberedSeparatorIndex);

      if (/^\d+$/.test(numberedPrefix)) {
        content = content.slice(numberedSeparatorIndex + 2);
      }
    }
  }

  const labelSeparatorIndex = content.indexOf(': ');

  if (labelSeparatorIndex <= 0) {
    return null;
  }

  return {
    label: content.slice(0, labelSeparatorIndex).trim(),
    value: content.slice(labelSeparatorIndex + 2),
  };
};

const getBuildReportPromptDiffSummaries = ({
  cachedPrompt,
  prompt,
}: {
  cachedPrompt: string;
  prompt: string;
}) => {
  const cachedLines = cachedPrompt.split('\n');
  const currentLines = prompt.split('\n');
  const summaries: string[] = [];
  const seenLabels = new Set<string>();

  for (
    let index = 0;
    index < Math.max(cachedLines.length, currentLines.length);
    index += 1
  ) {
    const previousLine = cachedLines[index] ?? '';
    const nextLine = currentLines[index] ?? '';

    if (previousLine === nextLine) {
      continue;
    }

    const previousMatch = parseBuildReportPromptDiffLabel(previousLine);
    const nextMatch = parseBuildReportPromptDiffLabel(nextLine);

    if (previousMatch && nextMatch && previousMatch.label === nextMatch.label) {
      const { label, value: nextValue } = nextMatch;
      const { value: previousValue } = previousMatch;

      if (!seenLabels.has(label)) {
        summaries.push(
          `${label}: ${truncateBuildReportPromptDiffValue(previousValue)} -> ${truncateBuildReportPromptDiffValue(nextValue)}`,
        );
        seenLabels.add(label);
      }
    } else if (previousLine.trim() && nextLine.trim()) {
      summaries.push(
        `line ${index + 1}: ${truncateBuildReportPromptDiffValue(previousLine.trim())} -> ${truncateBuildReportPromptDiffValue(nextLine.trim())}`,
      );
    }

    if (summaries.length >= SITE_DEBUG_AI_BUILD_REPORT_PROMPT_DIFF_LIMIT) {
      break;
    }
  }

  return summaries;
};

const normalizeBuildReportProviderConfigSnapshot = (
  value: unknown,
  sanitizeOptions: SiteDebugAiSanitizeOptions = {},
): BuildReportProviderConfigSnapshot => {
  if (value === null || value === undefined) {
    return null;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const normalizedEntries: [string, boolean | number | string | null][] = [];

  for (const [key, entryValue] of Object.entries(value)) {
    if (
      entryValue !== null &&
      typeof entryValue !== 'boolean' &&
      typeof entryValue !== 'number' &&
      typeof entryValue !== 'string'
    ) {
      return null;
    }

    normalizedEntries.push([
      key,
      typeof entryValue === 'string'
        ? sanitizeSiteDebugAiText(entryValue, sanitizeOptions)
        : entryValue,
    ]);
  }

  return Object.fromEntries(normalizedEntries);
};

const normalizeBuildReportCacheIdentity = (
  value: unknown,
  sanitizeOptions: SiteDebugAiSanitizeOptions = {},
): BuildReportCacheIdentity | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const promptHash = (value as { promptHash?: unknown }).promptHash;
  const provider = (value as { provider?: unknown }).provider;
  const providerConfig = normalizeBuildReportProviderConfigSnapshot(
    (value as { providerConfig?: unknown }).providerConfig,
    sanitizeOptions,
  );

  if (typeof promptHash !== 'string' || provider !== 'doubao') {
    return null;
  }

  return {
    promptHash,
    provider,
    providerConfig,
  };
};

export const createBuildReportCacheIdentity = ({
  prompt,
  provider,
  providerConfig,
}: {
  prompt: string;
  provider: SiteDebugAiProvider;
  providerConfig: BuildReportProviderConfigSnapshot;
}): BuildReportCacheIdentity => ({
  promptHash: getBuildReportPromptHash(
    normalizeBuildReportPromptForCache(prompt),
  ),
  provider,
  providerConfig,
});

const sanitizeBuildReportCacheIdentity = (
  cacheIdentity: BuildReportCacheIdentity | null,
  sanitizeOptions: SiteDebugAiSanitizeOptions = {},
): BuildReportCacheIdentity | null =>
  cacheIdentity
    ? {
        ...cacheIdentity,
        providerConfig: normalizeBuildReportProviderConfigSnapshot(
          cacheIdentity.providerConfig,
          sanitizeOptions,
        ),
      }
    : null;

const areBuildReportProviderConfigSnapshotsEqual = (
  previousValue: BuildReportProviderConfigSnapshot,
  nextValue: BuildReportProviderConfigSnapshot,
) => {
  if (previousValue === nextValue) {
    return true;
  }

  if (!previousValue || !nextValue) {
    return previousValue === nextValue;
  }

  const keys = [
    ...new Set([...Object.keys(previousValue), ...Object.keys(nextValue)]),
  ];

  return keys.every((key) => previousValue[key] === nextValue[key]);
};

const formatBuildReportCacheDiffValue = (
  value: boolean | number | string | null | undefined,
) => {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  return typeof value === 'string' ? JSON.stringify(value) : String(value);
};

export const getBuildReportCacheInvalidationReason = ({
  cacheIdentity,
  cachedEntry,
  prompt,
}: {
  cacheIdentity: BuildReportCacheIdentity;
  cachedEntry: StoredBuildReportCacheEntry;
  prompt: string;
}): string => {
  const reasons: string[] = [];
  const cachedIdentity = cachedEntry.cacheIdentity;

  if (!cachedIdentity) {
    return cachedEntry.cacheKey
      ? 'the existing cache entry predates structured invalidation diagnostics, and the exact cache key no longer matches'
      : 'the existing cache entry is missing exact cache-key metadata';
  }

  if (cachedIdentity.provider !== cacheIdentity.provider) {
    reasons.push(
      `provider changed (${cachedIdentity.provider} -> ${cacheIdentity.provider})`,
    );
  }

  if (cachedIdentity.promptHash !== cacheIdentity.promptHash) {
    const promptDiffSummaries = getBuildReportPromptDiffSummaries({
      cachedPrompt: cachedEntry.report.prompt,
      prompt,
    });

    reasons.push(
      promptDiffSummaries.length > 0
        ? `analysis prompt changed (${promptDiffSummaries.join('; ')})`
        : 'analysis prompt changed',
    );
  }

  if (
    !areBuildReportProviderConfigSnapshotsEqual(
      cachedIdentity.providerConfig,
      cacheIdentity.providerConfig,
    )
  ) {
    if (!cachedIdentity.providerConfig || !cacheIdentity.providerConfig) {
      reasons.push('provider snapshot changed');
    } else {
      const changedFields = [
        ...new Set([
          ...Object.keys(cachedIdentity.providerConfig),
          ...Object.keys(cacheIdentity.providerConfig),
        ]),
      ]
        .toSorted()
        .flatMap((field) => {
          const previousValue = cachedIdentity.providerConfig?.[field];
          const nextValue = cacheIdentity.providerConfig?.[field];

          return previousValue === nextValue
            ? []
            : [
                `${field}: ${formatBuildReportCacheDiffValue(previousValue)} -> ${formatBuildReportCacheDiffValue(nextValue)}`,
              ];
        });

      reasons.push(
        changedFields.length > 0
          ? `provider snapshot changed (${changedFields.join(', ')})`
          : 'provider snapshot changed',
      );
    }
  }

  return reasons.length > 0
    ? reasons.join('; ')
    : 'the exact cache key changed for an unknown reason';
};

const getDoubaoProviderConfigs = (
  aiConfig: SiteDebugAiConfig,
): SiteDebugAnalysisDoubaoRuntimeProviderConfig[] =>
  Array.isArray(aiConfig?.providers?.doubao)
    ? aiConfig.providers.doubao.filter(
        (
          providerConfig,
        ): providerConfig is SiteDebugAnalysisDoubaoRuntimeProviderConfig =>
          Boolean(providerConfig),
      )
    : [];

const getDefaultDoubaoProviderConfig = (
  providerConfigs: SiteDebugAnalysisDoubaoRuntimeProviderConfig[],
) =>
  providerConfigs.find((providerConfig) => providerConfig.default === true) ??
  providerConfigs[0];

export const getBuildReportProviderConfigSnapshot = (
  aiConfig: SiteDebugAiConfig,
  provider: SiteDebugAiProvider,
): BuildReportProviderConfigSnapshot => {
  switch (provider) {
    case 'doubao': {
      const providerConfig = getDefaultDoubaoProviderConfig(
        getDoubaoProviderConfigs(aiConfig),
      );

      return {
        baseUrl: providerConfig?.baseUrl?.trim() || null,
        maxTokens: providerConfig?.maxTokens ?? null,
        model: providerConfig?.model?.trim() || null,
        providerId: providerConfig?.id?.trim() || null,
        thinking: providerConfig?.thinking ?? null,
        temperature: providerConfig?.temperature ?? null,
      };
    }
    default: {
      return null;
    }
  }
};

export const getBuildReportCacheKey = ({
  prompt,
  provider,
  providerConfig,
}: {
  prompt: string;
  provider: SiteDebugAiProvider;
  providerConfig: BuildReportProviderConfigSnapshot;
}): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        prompt: normalizeBuildReportPromptForCache(prompt),
        provider,
        providerConfig,
      }),
    )
    .digest('hex');

const getBuildReportArtifactDir = (
  artifactKind: SiteDebugAiAnalysisTarget['artifactKind'],
) =>
  artifactKind === 'bundle-chunk'
    ? 'chunks'
    : artifactKind === 'bundle-module'
      ? 'modules'
      : 'pages';

export const getBuildReportCacheFilePath = ({
  artifactKey,
  cacheDir,
  target,
}: {
  artifactKey: string;
  cacheDir: string;
  target: SiteDebugAiAnalysisTarget;
}): string =>
  join(
    cacheDir,
    getBuildReportArtifactDir(target.artifactKind),
    `${sanitizeFileStem(basename(target.displayPath || target.artifactLabel))}.${createHash('sha256').update(artifactKey).digest('hex').slice(0, 8)}.json`,
  );

const normalizeBuildReportCachePayload = (
  payload: unknown,
  sanitizeOptions: SiteDebugAiSanitizeOptions = {},
): SiteDebugAiBuildReport | null => {
  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as Partial<SiteDebugAiBuildReport>).result !== 'string' ||
    typeof (payload as Partial<SiteDebugAiBuildReport>).reportId !== 'string' ||
    typeof (payload as Partial<SiteDebugAiBuildReport>).reportLabel !==
      'string' ||
    typeof (payload as Partial<SiteDebugAiBuildReport>).prompt !== 'string' ||
    (payload as Partial<SiteDebugAiBuildReport>).provider !== 'doubao' ||
    !(payload as Partial<SiteDebugAiBuildReport>).target
  ) {
    return null;
  }

  return sanitizeSiteDebugAiBuildReport(
    payload as SiteDebugAiBuildReport,
    sanitizeOptions,
  );
};

export const readBuildReportCacheEntry = (
  filePath: string,
  sanitizeOptions: SiteDebugAiSanitizeOptions = {},
): StoredBuildReportCacheEntry | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as
      | {
          cacheIdentity?: unknown;
          cacheKey?: string | null;
          report?: unknown;
        }
      | unknown;

    if (
      payload &&
      typeof payload === 'object' &&
      'report' in payload &&
      payload.report
    ) {
      const storedPayload = payload as {
        cacheIdentity?: unknown;
        cacheKey?: string | null;
        report: unknown;
      };
      const report = normalizeBuildReportCachePayload(
        storedPayload.report,
        sanitizeOptions,
      );

      if (!report) {
        return null;
      }

      return {
        cacheIdentity: normalizeBuildReportCacheIdentity(
          storedPayload.cacheIdentity,
          sanitizeOptions,
        ),
        cacheKey:
          typeof storedPayload.cacheKey === 'string'
            ? storedPayload.cacheKey
            : null,
        report,
      };
    }

    const report = normalizeBuildReportCachePayload(payload, sanitizeOptions);

    return report
      ? {
          cacheIdentity: null,
          cacheKey: null,
          report,
        }
      : null;
  } catch {
    return null;
  }
};

export const writeBuildReportCacheEntry = ({
  cacheIdentity,
  filePath,
  cacheKey,
  report,
  sanitizeOptions = {},
}: {
  cacheIdentity: BuildReportCacheIdentity | null;
  filePath: string;
  cacheKey: string | null;
  report: SiteDebugAiBuildReport;
  sanitizeOptions?: SiteDebugAiSanitizeOptions;
}): void => {
  if (!fs.existsSync(dirname(filePath))) {
    fs.mkdirSync(dirname(filePath), { recursive: true });
  }

  fs.writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        cacheIdentity: sanitizeBuildReportCacheIdentity(
          cacheIdentity,
          sanitizeOptions,
        ),
        cacheKey,
        report: sanitizeSiteDebugAiBuildReport(report, sanitizeOptions),
      } satisfies StoredBuildReportCacheEntry,
      null,
      2,
    )}\n`,
  );
};

export const sanitizeBuildReportCacheDirectory = (
  cacheDir: string,
  sanitizeOptions: SiteDebugAiSanitizeOptions = {},
): void => {
  if (!fs.existsSync(cacheDir)) {
    return;
  }

  const visit = (currentPath: string) => {
    const stat = fs.statSync(currentPath);

    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(currentPath)) {
        visit(join(currentPath, entry));
      }
      return;
    }

    if (!currentPath.endsWith('.json')) {
      return;
    }

    const rawContent = fs.readFileSync(currentPath, 'utf8');
    const cacheEntry = readBuildReportCacheEntry(currentPath, sanitizeOptions);

    if (!cacheEntry) {
      return;
    }

    const sanitizedContent = `${JSON.stringify(
      {
        cacheIdentity: cacheEntry.cacheIdentity ?? null,
        cacheKey: cacheEntry.cacheKey,
        report: cacheEntry.report,
      } satisfies StoredBuildReportCacheEntry,
      null,
      2,
    )}\n`;

    if (rawContent !== sanitizedContent) {
      fs.writeFileSync(currentPath, sanitizedContent);
    }
  };

  visit(cacheDir);
};

export const writeBuildReportAsset = ({
  assetsDir,
  outDir,
  provider,
  report,
  sanitizeOptions = {},
  wrapBaseUrl,
}: {
  assetsDir: string;
  outDir: string;
  provider: SiteDebugAiProvider;
  report: SiteDebugAiBuildReport;
  sanitizeOptions?: SiteDebugAiSanitizeOptions;
  wrapBaseUrl: (value: string) => string;
}): string => {
  const safeBaseName = sanitizeFileStem(
    basename(report.target.displayPath || report.target.artifactLabel),
  );
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        prompt: report.prompt,
        provider,
        reportId: report.reportId,
        target: report.target,
      }),
    )
    .digest('hex')
    .slice(0, 8);
  const artifactDir = getBuildReportArtifactDir(report.target.artifactKind);
  const relativeReportPath = join(
    SITE_DEBUG_AI_BUILD_REPORTS_DIR,
    artifactDir,
    `${safeBaseName}.${hash}.json`,
  );
  const absoluteReportPath = join(outDir, assetsDir, relativeReportPath);

  if (!fs.existsSync(dirname(absoluteReportPath))) {
    fs.mkdirSync(dirname(absoluteReportPath), { recursive: true });
  }

  fs.writeFileSync(
    absoluteReportPath,
    JSON.stringify(
      sanitizeSiteDebugAiBuildReport(report, sanitizeOptions),
      null,
      2,
    ),
  );

  return wrapBaseUrl(join('/', assetsDir, relativeReportPath));
};
