import type {
  PageMetafile,
  SiteDebugAiBuildReportReference,
} from '#dep-types/page';
import type {
  SiteDebugAnalysisBuildReportCacheStrategy,
  SiteDebugAnalysisBuildReportModelConfig,
  SiteDebugAnalysisBuildReportsConfig,
  SiteDebugAnalysisBuildReportsPageContext,
} from '#dep-types/utils';
import getLoggerInstance from '#shared/logger';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'pathe';
import {
  buildSiteDebugAiAnalysisPrompt,
  createSiteDebugAiBundleSummaryItems,
  createSiteDebugAiChunkResourceItems,
  formatSiteDebugAiBytes,
  getSiteDebugAiProviderLabel,
  sanitizeSiteDebugAiAnalysisTarget,
  sanitizeSiteDebugAiBuildReport,
  sanitizeSiteDebugAiText,
  type SiteDebugAiAnalysisTarget,
  type SiteDebugAiBuildReport,
  type SiteDebugAiProvider,
  type SiteDebugAiSanitizeOptions,
} from '../../shared/site-debug-ai';
import { PAGE_METAFILE_ASSET_DIR } from './page-metafile-manifest';
import {
  aggregatePageFiles,
  aggregatePageModules,
  collectBuildReportReferencesForPageMetafiles,
  hasPageBuildAnalysisSignals,
} from './site-debug-ai-build-reports-collector';
import {
  collectPageRuntimeFiles,
  createPageComponentItems,
  createPageModuleItems,
  createPageRenderOrderItems,
  createPageSpaSyncComponentItems,
  createPageSpaSyncSummaryItems,
  getPageCompositionDetailLabel,
  resolvePageClientChunkPublicPath,
} from './site-debug-ai-page-build-context';
import {
  analyzeSiteDebugAiTarget,
  resolveSiteDebugAiCapabilities,
  type SiteDebugAiConfig,
  type SiteDebugAiExecutionResult,
} from './site-debug-ai-server';

const loggerInstance = getLoggerInstance();
const Logger = loggerInstance.getLoggerByGroup('site-debug-ai-build-reports');

const SITE_DEBUG_AI_BUILD_REPORTS_DIR = join(PAGE_METAFILE_ASSET_DIR, 'ai');
const SITE_DEBUG_AI_BUILD_REPORT_HASHED_FILE_SEGMENT_RE =
  /(?<=\b[\w%+@-]+\.)[\w-]{6,}(?=\.(?:lean\.)?(?:js|css|svg|json|mjs|cjs|woff2?|webp|png|jpe?g|gif|ico|txt|map)\b)/g;
const SITE_DEBUG_AI_BUILD_REPORT_PROMPT_DIFF_LIMIT = 3;

interface BuildReportDependencies {
  analyzeTarget?: (options: {
    config: SiteDebugAiConfig;
    provider: SiteDebugAiProvider;
    target: SiteDebugAiAnalysisTarget;
  }) => Promise<SiteDebugAiExecutionResult>;
  resolveCapabilities?: typeof resolveSiteDebugAiCapabilities;
}

interface BuildReportExecution {
  config: SiteDebugAiConfig;
  providerId?: string;
  providerLabel?: string;
  provider: SiteDebugAiProvider;
  reportId: string;
  reportLabel: string;
}

interface BuildReportCacheConfig {
  dir: string;
  strategy: SiteDebugAnalysisBuildReportCacheStrategy;
}

interface BuildReportPagePlan {
  cacheConfig: BuildReportCacheConfig | null;
  executions: BuildReportExecution[];
  includeChunks: boolean;
  includeModules: boolean;
}

interface BuildReportExecutionPlan {
  defaultExecutionId?: string;
  executionById: Map<string, BuildReportExecution>;
  executions: BuildReportExecution[];
  skippedReason?: string;
  warningMessages: string[];
}

type BuildReportProviderConfigSnapshot = Record<
  string,
  boolean | number | string | null
> | null;

interface BuildReportCacheIdentity {
  promptHash: string;
  provider: SiteDebugAiProvider;
  providerConfig: BuildReportProviderConfigSnapshot;
}

interface StoredBuildReportCacheEntry {
  cacheIdentity?: BuildReportCacheIdentity | null;
  cacheKey: string | null;
  report: SiteDebugAiBuildReport;
}

export interface GenerateSiteDebugAiBuildReportsResult {
  executionCount: number;
  generatedReportCount: number;
  providers: SiteDebugAiProvider[];
  reusedReportCount: number;
  skippedReason?: string;
}
type BuildReportCacheInput = SiteDebugAnalysisBuildReportsConfig['cache'];

const sanitizeFileStem = (value: string) =>
  value.replaceAll(/[^\w.-]/g, '_') || 'artifact';
const SITE_DEBUG_AI_BUILD_REPORTS_DEFAULT_CACHE_DIR =
  '.vitepress/cache/site-debug-reports';

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

const resolveBuildReportCacheConfig = ({
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

const mergeBuildReportCacheInput = ({
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

const createBuildReportCacheIdentity = ({
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

const getBuildReportCacheInvalidationReason = ({
  cacheIdentity,
  cachedEntry,
  prompt,
}: {
  cacheIdentity: BuildReportCacheIdentity;
  cachedEntry: StoredBuildReportCacheEntry;
  prompt: string;
}) => {
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

const getBuildReportModelConfigs = (
  aiConfig: SiteDebugAiConfig,
): SiteDebugAnalysisBuildReportModelConfig[] =>
  Array.isArray(aiConfig?.buildReports?.models)
    ? (aiConfig.buildReports.models.filter(
        Boolean,
      ) as SiteDebugAnalysisBuildReportModelConfig[])
    : [];

type SiteDebugAnalysisDoubaoRuntimeProviderConfig = NonNullable<
  NonNullable<NonNullable<SiteDebugAiConfig>['providers']>['doubao']
>[number];

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

const getDefaultBuildReportModelConfig = (
  modelConfigs: SiteDebugAnalysisBuildReportModelConfig[],
) =>
  modelConfigs.find((modelConfig) => modelConfig.default === true) ??
  modelConfigs[0];

const getBuildReportExecutionLabel = (
  modelConfig: SiteDebugAnalysisBuildReportModelConfig,
  providerConfig?: SiteDebugAnalysisDoubaoRuntimeProviderConfig,
) =>
  modelConfig.label?.trim() ||
  [
    getSiteDebugAiProviderLabel(modelConfig.providerRef.provider),
    providerConfig?.label?.trim() || providerConfig?.id?.trim() || null,
    modelConfig.model,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');

const getBuildReportExecutionId = (
  modelConfig: SiteDebugAnalysisBuildReportModelConfig,
) => modelConfig.id;

const createBuildReportExecutionConfig = (
  aiConfig: SiteDebugAiConfig,
  modelConfig: SiteDebugAnalysisBuildReportModelConfig,
  providerConfig: SiteDebugAnalysisDoubaoRuntimeProviderConfig,
): SiteDebugAiConfig => {
  return {
    buildReports: aiConfig?.buildReports,
    providers: {
      ...aiConfig?.providers,
      doubao: [
        {
          ...providerConfig,
          default: true,
          maxTokens: modelConfig.maxTokens,
          model: modelConfig.model,
          temperature: modelConfig.temperature,
          thinking: modelConfig.thinking ?? false,
        },
      ],
    },
  };
};

const resolveBuildReportExecutionProvider = ({
  aiConfig,
  modelConfig,
}: {
  aiConfig: SiteDebugAiConfig;
  modelConfig: SiteDebugAnalysisBuildReportModelConfig;
}):
  | {
      provider: SiteDebugAiProvider;
      providerConfig: SiteDebugAnalysisDoubaoRuntimeProviderConfig;
      warningMessages: string[];
    }
  | {
      provider?: undefined;
      providerConfig?: undefined;
      warningMessages: string[];
    } => {
  const warningMessages: string[] = [];

  switch (modelConfig.providerRef.provider) {
    case 'doubao': {
      const providerConfigs = getDoubaoProviderConfigs(aiConfig);

      if (providerConfigs.length === 0) {
        warningMessages.push(
          `Skipped build-time AI report model ${modelConfig.id}: siteDebug.analysis.providers.doubao must contain at least one provider entry.`,
        );
        return { warningMessages };
      }

      const flaggedDefaults = providerConfigs.filter(
        (providerConfig) => providerConfig.default === true,
      );

      if (flaggedDefaults.length > 1) {
        warningMessages.push(
          `Multiple default Doubao provider entries are configured. Using the first default entry for build-time AI report model ${modelConfig.id}.`,
        );
      }

      if (modelConfig.providerRef.id) {
        const matchingProviders = providerConfigs.filter(
          (providerConfig) => providerConfig.id === modelConfig.providerRef.id,
        );

        if (matchingProviders.length === 0) {
          warningMessages.push(
            `Skipped build-time AI report model ${modelConfig.id}: providerRef.id "${modelConfig.providerRef.id}" was not found in siteDebug.analysis.providers.doubao.`,
          );
          return { warningMessages };
        }

        if (matchingProviders.length > 1) {
          warningMessages.push(
            `Multiple Doubao provider entries use id "${modelConfig.providerRef.id}". Using the first matching entry for build-time AI report model ${modelConfig.id}.`,
          );
        }

        return {
          provider: 'doubao',
          providerConfig: matchingProviders[0],
          warningMessages,
        };
      }

      return {
        provider: 'doubao',
        providerConfig: getDefaultDoubaoProviderConfig(providerConfigs),
        warningMessages,
      };
    }
    default: {
      warningMessages.push(
        `Skipped build-time AI report model ${modelConfig.id}: provider "${modelConfig.providerRef.provider}" is not supported.`,
      );
      return { warningMessages };
    }
  }
};

const createBuildReportExecutions = (
  aiConfig: SiteDebugAiConfig,
): BuildReportExecutionPlan => {
  const modelConfigs = getBuildReportModelConfigs(aiConfig);

  if (modelConfigs.length === 0) {
    return {
      defaultExecutionId: undefined,
      executionById: new Map(),
      executions: [],
      skippedReason:
        'Skipped build-time AI report analysis: no siteDebug.analysis.buildReports.models entries are configured.',
      warningMessages: [],
    };
  }

  const warningMessages = new Set<string>();
  const executions: BuildReportExecution[] = [];
  const executionById = new Map<string, BuildReportExecution>();
  const defaultModelConfig = getDefaultBuildReportModelConfig(modelConfigs);
  const defaultModelConfigs = modelConfigs.filter(
    (modelConfig) => modelConfig.default === true,
  );

  if (defaultModelConfigs.length > 1) {
    warningMessages.add(
      `Multiple build-time AI report models are marked as default. Using the first default model (${defaultModelConfig?.id}).`,
    );
  }

  const seenModelIds = new Set<string>();

  for (const modelConfig of modelConfigs) {
    if (!modelConfig.id?.trim()) {
      warningMessages.add(
        'Skipped a build-time AI report model because it is missing a non-empty id.',
      );
      continue;
    }

    if (seenModelIds.has(modelConfig.id)) {
      warningMessages.add(
        `Skipped build-time AI report model ${modelConfig.id}: duplicate model id.`,
      );
      continue;
    }

    seenModelIds.add(modelConfig.id);
    const resolvedProvider = resolveBuildReportExecutionProvider({
      aiConfig,
      modelConfig,
    });

    for (const warningMessage of resolvedProvider.warningMessages) {
      warningMessages.add(warningMessage);
    }

    if (!resolvedProvider.provider || !resolvedProvider.providerConfig) {
      continue;
    }

    const executionConfig = createBuildReportExecutionConfig(
      aiConfig,
      modelConfig,
      resolvedProvider.providerConfig,
    );
    const execution = {
      config: executionConfig,
      provider: resolvedProvider.provider,
      providerId: resolvedProvider.providerConfig.id,
      providerLabel: resolvedProvider.providerConfig.label,
      reportId: getBuildReportExecutionId(modelConfig),
      reportLabel: getBuildReportExecutionLabel(
        modelConfig,
        resolvedProvider.providerConfig,
      ),
    } satisfies BuildReportExecution;

    executions.push(execution);
    executionById.set(execution.reportId, execution);
  }

  return {
    defaultExecutionId: defaultModelConfig?.id,
    executionById,
    executions,
    ...(executions.length === 0
      ? {
          skippedReason:
            'Skipped build-time AI report analysis: no valid siteDebug.analysis.buildReports.models entries could be resolved.',
        }
      : {}),
    warningMessages: [...warningMessages],
  };
};

const resolveAvailableBuildReportExecutions = async ({
  executions,
  resolveCapabilitiesImpl,
}: {
  executions: BuildReportExecution[];
  resolveCapabilitiesImpl: typeof resolveSiteDebugAiCapabilities;
}) => {
  const availableExecutionIds = new Set<string>();
  const skippedDetails: string[] = [];

  for (const execution of executions) {
    const capabilities = await resolveCapabilitiesImpl(execution.config);
    const capability = capabilities.providers[execution.provider];

    if (capability?.available) {
      availableExecutionIds.add(execution.reportId);
      continue;
    }

    skippedDetails.push(
      capability?.detail ||
        `Build report execution ${execution.reportLabel} is unavailable.`,
    );
  }

  return {
    availableExecutionIds,
    ...(skippedDetails.length > 0
      ? {
          skippedReason: skippedDetails.join(' '),
        }
      : {}),
  };
};

const getBuildReportProviderConfigSnapshot = (
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

const getBuildReportCacheKey = ({
  prompt,
  provider,
  providerConfig,
}: {
  prompt: string;
  provider: SiteDebugAiProvider;
  providerConfig: ReturnType<typeof getBuildReportProviderConfigSnapshot>;
}) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        prompt: normalizeBuildReportPromptForCache(prompt),
        provider,
        providerConfig,
      }),
    )
    .digest('hex');

const getBuildReportCacheFilePath = ({
  artifactKey,
  cacheDir,
  target,
}: {
  artifactKey: string;
  cacheDir: string;
  target: SiteDebugAiAnalysisTarget;
}) =>
  join(
    cacheDir,
    getBuildReportArtifactDir(target.artifactKind),
    `${sanitizeFileStem(basename(target.displayPath || target.artifactLabel))}.${createHash('sha256').update(artifactKey).digest('hex').slice(0, 8)}.json`,
  );

const getBuildReportArtifactDir = (
  artifactKind: SiteDebugAiAnalysisTarget['artifactKind'],
) =>
  artifactKind === 'bundle-chunk'
    ? 'chunks'
    : artifactKind === 'bundle-module'
      ? 'modules'
      : 'pages';

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

const readBuildReportCacheEntry = (
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

const writeBuildReportCacheEntry = ({
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
}) => {
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

const sanitizeBuildReportCacheDirectory = (
  cacheDir: string,
  sanitizeOptions: SiteDebugAiSanitizeOptions = {},
) => {
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

const writeBuildReportAsset = ({
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
}) => {
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

const applyBuildReportExecutionMetadata = ({
  execution,
  report,
}: {
  execution: BuildReportExecution;
  report: SiteDebugAiBuildReport;
}): SiteDebugAiBuildReport =>
  report.reportId === execution.reportId &&
  report.reportLabel === execution.reportLabel &&
  report.providerId === execution.providerId &&
  report.providerLabel === execution.providerLabel
    ? report
    : {
        ...report,
        providerId: execution.providerId,
        providerLabel: execution.providerLabel,
        reportId: execution.reportId,
        reportLabel: execution.reportLabel,
      };

const createDefaultBuildReportPagePlan = ({
  buildReportsConfig,
  cacheDir,
  defaultExecution,
  root,
}: {
  buildReportsConfig: SiteDebugAnalysisBuildReportsConfig;
  cacheDir: string;
  defaultExecution?: BuildReportExecution;
  root?: string;
}): BuildReportPagePlan => ({
  cacheConfig: resolveBuildReportCacheConfig({
    cache: buildReportsConfig.cache,
    cacheDir,
    root,
  }),
  executions: defaultExecution ? [defaultExecution] : [],
  includeChunks: buildReportsConfig.includeChunks === true,
  includeModules: buildReportsConfig.includeModules === true,
});

const resolveBuildReportPagePlan = ({
  buildReportsConfig,
  cacheDir,
  executionPlan,
  pageContext,
  pageId,
  pageMetafile,
  root,
}: {
  buildReportsConfig: SiteDebugAnalysisBuildReportsConfig;
  cacheDir: string;
  executionPlan: BuildReportExecutionPlan;
  pageContext?: SiteDebugAnalysisBuildReportsPageContext;
  pageId: string;
  pageMetafile: PageMetafile;
  root?: string;
}): BuildReportPagePlan | null => {
  if (!hasPageBuildAnalysisSignals(pageMetafile)) {
    return null;
  }

  const defaultPlan = createDefaultBuildReportPagePlan({
    buildReportsConfig,
    cacheDir,
    defaultExecution: executionPlan.defaultExecutionId
      ? executionPlan.executionById.get(executionPlan.defaultExecutionId)
      : undefined,
    root,
  });

  if (!buildReportsConfig.resolvePage) {
    return defaultPlan.executions.length > 0 ? defaultPlan : null;
  }

  if (!pageContext) {
    Logger.warn(
      `Skipped build-time AI report for ${pageId}: siteDebug.analysis.buildReports.resolvePage requires page context, but no page filePath was provided.`,
    );
    return null;
  }

  let resolvedPageOverride: ReturnType<
    NonNullable<SiteDebugAnalysisBuildReportsConfig['resolvePage']>
  >;

  try {
    resolvedPageOverride = buildReportsConfig.resolvePage({
      models: buildReportsConfig.models ?? [],
      page: pageContext,
    });
  } catch (error) {
    Logger.warn(
      `Skipped build-time AI report for ${pageId}: siteDebug.analysis.buildReports.resolvePage threw an error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }

  if (
    resolvedPageOverride === false ||
    resolvedPageOverride === null ||
    resolvedPageOverride === undefined
  ) {
    return null;
  }

  const selectedExecutionId =
    resolvedPageOverride.modelId ?? executionPlan.defaultExecutionId;

  if (!selectedExecutionId) {
    Logger.warn(
      `Skipped build-time AI report for ${pageId}: no default build report model is available, and resolvePage did not return modelId.`,
    );
    return null;
  }

  const selectedExecution =
    executionPlan.executionById.get(selectedExecutionId);

  if (!selectedExecution) {
    Logger.warn(
      resolvedPageOverride.modelId
        ? `Skipped build-time AI report for ${pageId}: resolvePage selected modelId "${resolvedPageOverride.modelId}", but no matching buildReports.models entry could be resolved.`
        : `Skipped build-time AI report for ${pageId}: the default build report model "${selectedExecutionId}" could not be resolved.`,
    );
    return null;
  }

  return {
    cacheConfig: resolveBuildReportCacheConfig({
      cache: mergeBuildReportCacheInput({
        baseCache: buildReportsConfig.cache,
        overrideCache: resolvedPageOverride.cache,
      }),
      cacheDir,
      root,
    }),
    executions: [selectedExecution],
    includeChunks:
      resolvedPageOverride.includeChunks ?? defaultPlan.includeChunks,
    includeModules:
      resolvedPageOverride.includeModules ?? defaultPlan.includeModules,
  };
};

const createBuildReportPagePlans = ({
  buildReportsConfig,
  cacheDir,
  executionPlan,
  pageContexts,
  pageMetafiles,
  root,
}: {
  buildReportsConfig: SiteDebugAnalysisBuildReportsConfig;
  cacheDir: string;
  executionPlan: BuildReportExecutionPlan;
  pageContexts?: Record<string, SiteDebugAnalysisBuildReportsPageContext>;
  pageMetafiles: Record<string, PageMetafile>;
  root?: string;
}) => {
  const pagePlans: Record<string, BuildReportPagePlan> = {};

  for (const [pageId, pageMetafile] of Object.entries(pageMetafiles)) {
    const pagePlan = resolveBuildReportPagePlan({
      buildReportsConfig,
      cacheDir,
      executionPlan,
      pageContext: pageContexts?.[pageId],
      pageId,
      pageMetafile,
      root,
    });

    if (pagePlan) {
      pagePlans[pageId] = pagePlan;
    }
  }

  return pagePlans;
};

const createPageAnalysisTarget = ({
  assetsDir,
  includeChunks,
  includeModules,
  outDir,
  pageId,
  pageMetafile,
}: {
  assetsDir: string;
  includeChunks: boolean;
  includeModules: boolean;
  outDir: string;
  pageId: string;
  pageMetafile: PageMetafile;
}): SiteDebugAiAnalysisTarget => {
  const components = pageMetafile.buildMetrics?.components ?? [];
  const aggregatedModules = aggregatePageModules(components);
  const renderInstances = pageMetafile.buildMetrics?.renderInstances ?? [];
  const pageComponentItems = createPageComponentItems({
    assetsDir,
    components,
    includeChunks,
    includeModules,
    outDir,
    pageMetafile,
  });
  const resolvedPageClientChunkFile = resolvePageClientChunkPublicPath({
    assetsDir,
    outDir,
    pageId,
    pageMetafile,
  });
  const pageRenderOrderItems = createPageRenderOrderItems({
    pageClientChunkFile: resolvedPageClientChunkFile,
    pageMetafile,
  });
  const pageSpaSyncComponentItems = createPageSpaSyncComponentItems({
    pageClientChunkFile: resolvedPageClientChunkFile,
    pageMetafile,
  });
  const pageSpaSyncSummaryItems = createPageSpaSyncSummaryItems({
    pageClientChunkFile: resolvedPageClientChunkFile,
    pageMetafile,
  });
  const usedRenderDirectives = [
    ...new Set([
      ...pageRenderOrderItems.map((item) => item.renderDirective),
      ...pageComponentItems.flatMap((item) => item.renderDirectives),
    ]),
  ];
  const aggregatedFiles = collectPageRuntimeFiles({
    assetsDir,
    outDir,
    pageMetafile,
    seedFiles: aggregatePageFiles(components),
  });
  const estimatedAssetBytes = aggregatedFiles
    .filter((fileMetric) => fileMetric.type === 'asset')
    .reduce((sum, fileMetric) => sum + fileMetric.bytes, 0);
  const estimatedCssBytes = aggregatedFiles
    .filter((fileMetric) => fileMetric.type === 'css')
    .reduce((sum, fileMetric) => sum + fileMetric.bytes, 0);
  const estimatedJsBytes = aggregatedFiles
    .filter((fileMetric) => fileMetric.type === 'js')
    .reduce((sum, fileMetric) => sum + fileMetric.bytes, 0);
  const estimatedTotalBytes =
    estimatedAssetBytes + estimatedCssBytes + estimatedJsBytes;

  return {
    artifactKind: 'page-build',
    artifactLabel: pageId,
    bytes: estimatedTotalBytes,
    content: `Build overview for ${pageId}`,
    context: {
      artifactHeaderItems: [
        {
          label: 'Path',
          value: pageId,
        },
        {
          label: 'Components',
          value: String(pageComponentItems.length),
        },
        {
          label: 'Render Instances',
          value: String(renderInstances.length),
        },
        ...(usedRenderDirectives.length > 0
          ? [
              {
                label: 'Used Directives',
                value: usedRenderDirectives.join(', '),
              },
            ]
          : []),
        {
          label: 'Chunk Resources',
          value: String(aggregatedFiles.length),
        },
        {
          label: 'Module Sources',
          value: String(aggregatedModules.length),
        },
        {
          label: 'Composition Detail',
          value: getPageCompositionDetailLabel({
            includeChunks,
            includeModules,
          }),
        },
        ...(components.length === 0
          ? [
              {
                label: 'Module Preloads',
                value: String(pageMetafile.modulePreloads.length),
              },
              {
                label: 'CSS Bundles',
                value: String(pageMetafile.cssBundlePaths.length),
              },
              {
                label: 'Embedded HTML',
                value:
                  formatSiteDebugAiBytes(
                    pageMetafile.buildMetrics?.spaSyncEffects
                      ?.totalEmbeddedHtmlBytes,
                  ) || '0 B',
              },
            ]
          : []),
      ],
      bundleSummaryItems: createSiteDebugAiBundleSummaryItems({
        estimatedAssetBytes,
        estimatedCssBytes,
        estimatedJsBytes,
        estimatedTotalBytes,
      }),
      chunkResourceItems: createSiteDebugAiChunkResourceItems({
        files: aggregatedFiles,
        modules: aggregatedModules,
        totalEstimatedBytes: estimatedTotalBytes,
      }),
      ...(pageComponentItems.length === 1
        ? {
            componentName: pageComponentItems[0].componentName,
          }
        : {}),
      moduleItems: createPageModuleItems({
        assetsDir,
        modules: aggregatedModules,
        outDir,
      }),
      pageComponentItems,
      pageRenderOrderItems,
      pageSpaSyncComponentItems,
      pageSpaSyncSummaryItems,
      pageId,
      renderId: null,
    },
    displayPath: pageId,
    language: 'text',
  };
};

export const generateSiteDebugAiBuildReports = async ({
  aiConfig,
  assetsDir,
  cacheDir,
  outDir,
  pageContexts,
  pageMetafiles,
  root,
  wrapBaseUrl,
  dependencies,
}: {
  aiConfig: SiteDebugAiConfig;
  assetsDir: string;
  cacheDir: string;
  dependencies?: BuildReportDependencies;
  outDir: string;
  pageContexts?: Record<string, SiteDebugAnalysisBuildReportsPageContext>;
  pageMetafiles: Record<string, PageMetafile>;
  root?: string;
  wrapBaseUrl: (value: string) => string;
}): Promise<GenerateSiteDebugAiBuildReportsResult> => {
  const buildReportsConfig = aiConfig?.buildReports;

  if (!buildReportsConfig) {
    return {
      executionCount: 0,
      generatedReportCount: 0,
      providers: [],
      reusedReportCount: 0,
      skippedReason: 'Build-time AI reports are disabled.',
    };
  }

  const resolveCapabilitiesImpl =
    dependencies?.resolveCapabilities || resolveSiteDebugAiCapabilities;
  const analyzeTargetImpl =
    dependencies?.analyzeTarget || analyzeSiteDebugAiTarget;
  const {
    executions,
    skippedReason: executionPlanSkippedReason,
    warningMessages: executionPlanWarningMessages,
    ...executionPlan
  } = createBuildReportExecutions(aiConfig);

  if (executions.length === 0) {
    for (const warningMessage of executionPlanWarningMessages) {
      Logger.warn(warningMessage);
    }

    if (executionPlanSkippedReason) {
      Logger.info(executionPlanSkippedReason);
    }

    return {
      executionCount: 0,
      generatedReportCount: 0,
      providers: [],
      reusedReportCount: 0,
      skippedReason: executionPlanSkippedReason,
    };
  }

  for (const warningMessage of executionPlanWarningMessages) {
    Logger.warn(warningMessage);
  }

  const pagePlans = createBuildReportPagePlans({
    buildReportsConfig,
    cacheDir,
    executionPlan: {
      ...executionPlan,
      executions,
      warningMessages: executionPlanWarningMessages,
    },
    pageContexts,
    pageMetafiles,
    root,
  });
  const uniqueCacheDirs = [
    ...new Set(
      Object.values(pagePlans)
        .map((pagePlan) => pagePlan.cacheConfig?.dir)
        .filter((cachePath): cachePath is string => Boolean(cachePath)),
    ),
  ];
  const sanitizeOptions: SiteDebugAiSanitizeOptions = {
    anchorPaths: [
      ...uniqueCacheDirs,
      root ? join(root, '.vitepress', 'config.ts') : undefined,
    ],
  };
  let executionAvailability: Awaited<
    ReturnType<typeof resolveAvailableBuildReportExecutions>
  > | null = null;
  let executionAvailabilityPromise: Promise<
    Awaited<ReturnType<typeof resolveAvailableBuildReportExecutions>>
  > | null = null;
  const skippedReasons = new Set<string>();
  const generatedReportReferences = new Map<
    string,
    SiteDebugAiBuildReportReference
  >();
  const pendingReportReferences = new Map<
    string,
    Promise<SiteDebugAiBuildReportReference | null>
  >();
  let generatedReportCount = 0;
  let reusedReportCount = 0;

  for (const pageCacheDir of uniqueCacheDirs) {
    sanitizeBuildReportCacheDirectory(pageCacheDir, sanitizeOptions);
  }

  if (executionPlanSkippedReason) {
    skippedReasons.add(executionPlanSkippedReason);
  }

  if (Object.keys(pagePlans).length === 0) {
    skippedReasons.add('No eligible pages resolved for build-time AI reports.');
  }

  const ensureExecutionAvailability = async () => {
    if (executionAvailability) {
      return executionAvailability;
    }

    if (!executionAvailabilityPromise) {
      executionAvailabilityPromise = resolveAvailableBuildReportExecutions({
        executions,
        resolveCapabilitiesImpl,
      })
        .then((resolvedExecutionAvailability) => {
          executionAvailability = resolvedExecutionAvailability;

          if (resolvedExecutionAvailability.skippedReason) {
            skippedReasons.add(resolvedExecutionAvailability.skippedReason);
          }

          return resolvedExecutionAvailability;
        })
        .catch((error) => {
          executionAvailabilityPromise = null;
          throw error;
        });
    }

    return executionAvailabilityPromise;
  };

  const getOrCreateReportReference = async ({
    artifactKey,
    cacheConfig,
    execution,
    target,
  }: {
    artifactKey: string;
    cacheConfig: BuildReportCacheConfig | null;
    execution: BuildReportExecution;
    target: SiteDebugAiAnalysisTarget;
  }) => {
    const cachedReference = generatedReportReferences.get(artifactKey);

    if (cachedReference) {
      return cachedReference;
    }

    const pendingReportReference = pendingReportReferences.get(artifactKey);

    if (pendingReportReference) {
      return pendingReportReference;
    }

    const pendingReportTask = (async () => {
      const sanitizedTarget = sanitizeSiteDebugAiAnalysisTarget(
        target,
        sanitizeOptions,
      );
      const prompt = buildSiteDebugAiAnalysisPrompt(
        sanitizedTarget,
        sanitizeOptions,
      );
      const providerConfigSnapshot = getBuildReportProviderConfigSnapshot(
        execution.config,
        execution.provider,
      );
      const cacheIdentity = createBuildReportCacheIdentity({
        prompt,
        provider: execution.provider,
        providerConfig: providerConfigSnapshot,
      });
      const cacheKey = getBuildReportCacheKey({
        prompt,
        provider: execution.provider,
        providerConfig: providerConfigSnapshot,
      });
      const cacheFilePath = cacheConfig
        ? getBuildReportCacheFilePath({
            artifactKey,
            cacheDir: cacheConfig.dir,
            target: sanitizedTarget,
          })
        : null;
      const cachedEntry = cacheFilePath
        ? readBuildReportCacheEntry(cacheFilePath, sanitizeOptions)
        : null;
      const cacheKeyMatches = cachedEntry?.cacheKey === cacheKey;
      const cacheInvalidationReason =
        cachedEntry && !cacheKeyMatches
          ? getBuildReportCacheInvalidationReason({
              cacheIdentity,
              cachedEntry,
              prompt,
            })
          : null;
      const cachedReport =
        cachedEntry && (cacheConfig?.strategy === 'fallback' || cacheKeyMatches)
          ? cachedEntry.report
          : null;

      if (cacheInvalidationReason) {
        Logger.info(
          cacheConfig?.strategy === 'fallback'
            ? `Fallback build-time AI report cache reuse for ${sanitizedTarget.displayPath} (${execution.reportLabel}): ${cacheInvalidationReason}. Reusing the stale cached report because strategy=fallback.`
            : `Exact build-time AI report cache miss for ${sanitizedTarget.displayPath} (${execution.reportLabel}): ${cacheInvalidationReason}. Regenerating the report.`,
        );
      }

      if (cachedReport) {
        const resolvedCachedReport = applyBuildReportExecutionMetadata({
          execution,
          report: cachedReport,
        });

        if (cacheFilePath) {
          writeBuildReportCacheEntry({
            cacheIdentity,
            cacheKey: cachedEntry?.cacheKey ?? null,
            filePath: cacheFilePath,
            report: resolvedCachedReport,
            sanitizeOptions,
          });
        }

        const reportFile = writeBuildReportAsset({
          assetsDir,
          outDir,
          provider: execution.provider,
          report: resolvedCachedReport,
          sanitizeOptions,
          wrapBaseUrl,
        });
        const reportReference = {
          detail: resolvedCachedReport.detail,
          generatedAt: resolvedCachedReport.generatedAt,
          model: resolvedCachedReport.model,
          provider: execution.provider,
          providerId: execution.providerId,
          providerLabel: execution.providerLabel,
          reportFile,
          reportId: resolvedCachedReport.reportId,
          reportLabel: resolvedCachedReport.reportLabel,
        };

        generatedReportReferences.set(artifactKey, reportReference);
        reusedReportCount += 1;
        return reportReference;
      }

      const { availableExecutionIds } = await ensureExecutionAvailability();

      if (!availableExecutionIds.has(execution.reportId)) {
        return null;
      }

      const generatedAt = new Date().toISOString();
      const result = await analyzeTargetImpl({
        config: execution.config,
        provider: execution.provider,
        target: sanitizedTarget,
      });
      const report: SiteDebugAiBuildReport = {
        detail: result.detail,
        generatedAt,
        model: result.model,
        prompt,
        provider: execution.provider,
        providerId: execution.providerId,
        providerLabel: execution.providerLabel,
        reportId: execution.reportId,
        reportLabel: execution.reportLabel,
        result: result.result,
        target: sanitizedTarget,
      };
      if (cacheFilePath) {
        writeBuildReportCacheEntry({
          cacheIdentity,
          cacheKey,
          filePath: cacheFilePath,
          report,
          sanitizeOptions,
        });
      }
      const reportFile = writeBuildReportAsset({
        assetsDir,
        outDir,
        provider: execution.provider,
        report,
        sanitizeOptions,
        wrapBaseUrl,
      });
      const reportReference = {
        detail: result.detail,
        generatedAt,
        model: result.model,
        provider: execution.provider,
        providerId: execution.providerId,
        providerLabel: execution.providerLabel,
        reportFile,
        reportId: execution.reportId,
        reportLabel: execution.reportLabel,
      };

      generatedReportReferences.set(artifactKey, reportReference);
      generatedReportCount += 1;
      return reportReference;
    })();

    pendingReportReferences.set(artifactKey, pendingReportTask);

    try {
      return await pendingReportTask;
    } finally {
      pendingReportReferences.delete(artifactKey);
    }
  };

  if (Object.keys(pagePlans).length > 1) {
    Logger.info(
      `Dispatching build-time AI report generation in parallel for ${Object.keys(pagePlans).length} eligible pages across ${executions.length} execution${executions.length === 1 ? '' : 's'}.`,
    );
  }

  await collectBuildReportReferencesForPageMetafiles({
    assetsDir,
    createPageAnalysisTarget,
    getOrCreateReportReference,
    logger: Logger,
    outDir,
    pageMetafiles,
    pagePlans,
  });

  if (generatedReportCount > 0 || reusedReportCount > 0) {
    Logger.info(
      `Build-time AI reports across ${executions.length} execution${executions.length === 1 ? '' : 's'}: generated ${generatedReportCount}, reused ${reusedReportCount}.`,
    );
  }

  return {
    executionCount: executions.length,
    generatedReportCount,
    providers: [...new Set(executions.map((execution) => execution.provider))],
    reusedReportCount,
    ...(skippedReasons.size > 0
      ? {
          skippedReason: [...skippedReasons].join(' '),
        }
      : {}),
  };
};
