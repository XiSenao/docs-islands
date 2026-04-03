import type {
  PageMetafile,
  SiteDebugAiBuildReportReference,
} from '#dep-types/page';
import type { SiteDebugAnalysisBuildReportRunConfig } from '#dep-types/utils';
import getLoggerInstance from '#shared/logger';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { basename, dirname, join } from 'pathe';
import {
  buildSiteDebugAiAnalysisPrompt,
  createSiteDebugAiArtifactHeaderItems,
  createSiteDebugAiBundleSummaryItems,
  createSiteDebugAiChunkResourceItems,
  createSiteDebugAiModuleItems,
  createSiteDebugAiResolvedSourceState,
  formatSiteDebugAiBytes,
  formatSiteDebugAiPercent,
  getSiteDebugAiModuleReportKey,
  getSiteDebugAiProviderLabel,
  inferSiteDebugAiLanguage,
  sanitizeSiteDebugAiAnalysisTarget,
  sanitizeSiteDebugAiBuildReport,
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
  getPageSupportedComponentCount,
} from './site-debug-ai-build-reports-collector';
import {
  analyzeSiteDebugAiTarget,
  resolveSiteDebugAiCapabilities,
  type SiteDebugAiConfig,
  type SiteDebugAiExecutionResult,
} from './site-debug-ai-server';

const loggerInstance = getLoggerInstance();
const Logger = loggerInstance.getLoggerByGroup('site-debug-ai-build-reports');

const SITE_DEBUG_AI_BUILD_REPORTS_DIR = join(PAGE_METAFILE_ASSET_DIR, 'ai');
const TEXT_FILE_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.cts',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.less',
  '.md',
  '.mjs',
  '.mts',
  '.pcss',
  '.sass',
  '.scss',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
]);

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
  provider: SiteDebugAiProvider;
  reportId: string;
  reportLabel: string;
}

interface BuildReportSourceConfig {
  mode: 'read-only' | 'read-write';
  sourceDir: string;
}

export interface GenerateSiteDebugAiBuildReportsResult {
  executionCount: number;
  generatedReportCount: number;
  providers: SiteDebugAiProvider[];
  reusedReportCount: number;
  skippedReason?: string;
}

type BuildMetric = NonNullable<
  NonNullable<PageMetafile['buildMetrics']>['components'][number]
>;
type BuildMetricFile = BuildMetric['files'][number];
type BuildMetricModule = BuildMetric['modules'][number] & {
  isGeneratedVirtualModule?: boolean;
};
type BuildReportGroupBy = 'artifact' | 'page';

const sanitizeFileStem = (value: string) =>
  value.replaceAll(/[^\w.-]/g, '_') || 'artifact';
const SITE_DEBUG_AI_BUILD_REPORTS_CACHE_DIR = join(
  'site-debug-ai',
  'build-reports',
);
const PAGE_GROUPED_MODULE_LIMIT = 18;

const isTextLikeArtifact = (filePath?: string) => {
  if (!filePath) {
    return false;
  }

  const normalizedPath = filePath.replace(/[#?].*$/, '');
  const extension = /\.[^./\\]+$/.exec(normalizedPath)?.[0]?.toLowerCase();

  if (!extension) {
    return true;
  }

  return TEXT_FILE_EXTENSIONS.has(extension);
};

const readTextArtifact = (filePath: string) => {
  if (!isTextLikeArtifact(filePath) || !fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, 'utf8');
};

const resolveOutputAssetPath = ({
  assetsDir,
  outDir,
  publicPath,
}: {
  assetsDir: string;
  outDir: string;
  publicPath: string;
}) => {
  const normalizedPath = publicPath
    .replace(/[#?].*$/, '')
    .replaceAll('\\', '/');
  const assetRoot = `/${assetsDir}/`;
  const assetRootIndex = normalizedPath.indexOf(assetRoot);
  const relativeAssetPath =
    assetRootIndex === -1
      ? normalizedPath.replace(/^\/+/, '')
      : normalizedPath.slice(assetRootIndex + 1);

  return join(outDir, relativeAssetPath);
};

const normalizeBuildReportGroupBy = (
  value: BuildReportGroupBy | undefined,
): BuildReportGroupBy => (value === 'page' ? 'page' : 'artifact');

const getBuildReportRunConfigs = (
  aiConfig: SiteDebugAiConfig,
): SiteDebugAnalysisBuildReportRunConfig[] => {
  const explicitRuns = Array.isArray(aiConfig?.buildReports?.runs)
    ? aiConfig.buildReports.runs
    : Array.isArray(aiConfig?.buildReports?.models)
      ? aiConfig.buildReports.models
      : undefined;

  if (explicitRuns) {
    return explicitRuns.filter(
      Boolean,
    ) as SiteDebugAnalysisBuildReportRunConfig[];
  }

  const fallbackRuns: SiteDebugAnalysisBuildReportRunConfig[] = [];

  if (aiConfig?.providers?.claudeCode) {
    fallbackRuns.push({
      provider: 'claude-code',
    });
  }

  if (aiConfig?.providers?.doubao?.model?.trim()) {
    fallbackRuns.push({
      model: aiConfig.providers.doubao.model.trim(),
      provider: 'doubao',
      ...(aiConfig.providers.doubao.thinking
        ? {
            thinking: aiConfig.providers.doubao.thinking,
          }
        : {}),
    });
  }

  return fallbackRuns;
};

const getBuildReportExecutionLabel = (
  runConfig: SiteDebugAnalysisBuildReportRunConfig,
) =>
  runConfig.label?.trim() ||
  (runConfig.provider === 'doubao'
    ? `${getSiteDebugAiProviderLabel('doubao')} · ${runConfig.model}`
    : getSiteDebugAiProviderLabel(runConfig.provider));

const getBuildReportExecutionId = (
  runConfig: SiteDebugAnalysisBuildReportRunConfig,
) =>
  createHash('sha256')
    .update(JSON.stringify(runConfig))
    .digest('hex')
    .slice(0, 12);

const createBuildReportExecutionConfig = (
  aiConfig: SiteDebugAiConfig,
  runConfig: SiteDebugAnalysisBuildReportRunConfig,
): SiteDebugAiConfig => {
  const providers = {
    ...aiConfig?.providers,
  };

  if (runConfig.provider === 'doubao') {
    const doubaoProviderConfig = providers.doubao || {};

    providers.doubao = {
      ...doubaoProviderConfig,
      model: runConfig.model,
      ...(runConfig.thinking
        ? {
            thinking: runConfig.thinking,
          }
        : {}),
    };
  }

  return {
    buildReports: aiConfig?.buildReports,
    providers,
  };
};

const createBuildReportExecutions = (
  aiConfig: SiteDebugAiConfig,
): {
  executions: BuildReportExecution[];
  skippedReason?: string;
} => {
  const hasExplicitRuns =
    Array.isArray(aiConfig?.buildReports?.runs) ||
    Array.isArray(aiConfig?.buildReports?.models);
  const runConfigs = getBuildReportRunConfigs(aiConfig);

  if (runConfigs.length === 0) {
    return {
      executions: [],
      skippedReason: hasExplicitRuns
        ? 'No build-time analysis runs are configured. Add siteDebug.analysis.buildReports.runs entries to execute build reports.'
        : 'No build-time analysis providers are ready to run reports. Set siteDebug.analysis.buildReports.runs or provide a default model in siteDebug.analysis.providers.',
    };
  }

  const executions: BuildReportExecution[] = [];

  for (const runConfig of runConfigs) {
    const executionConfig = createBuildReportExecutionConfig(
      aiConfig,
      runConfig,
    );
    executions.push({
      config: executionConfig,
      provider: runConfig.provider,
      reportId: getBuildReportExecutionId(runConfig),
      reportLabel: getBuildReportExecutionLabel(runConfig),
    });
  }

  return { executions };
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
) => {
  switch (provider) {
    case 'claude-code': {
      const providerConfig = aiConfig?.providers?.claudeCode;

      return {
        command: providerConfig?.command?.trim() || 'claude',
        timeoutMs: providerConfig?.timeoutMs ?? null,
      };
    }
    case 'doubao': {
      const providerConfig = aiConfig?.providers?.doubao;

      return {
        baseUrl: providerConfig?.baseUrl?.trim() || null,
        maxTokens: providerConfig?.maxTokens ?? null,
        model: providerConfig?.model?.trim() || null,
        thinking: providerConfig?.thinking ?? null,
        temperature: providerConfig?.temperature ?? null,
        timeoutMs: providerConfig?.timeoutMs ?? null,
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
        prompt,
        provider,
        providerConfig,
      }),
    )
    .digest('hex');

const getBuildReportCacheFilePath = (cacheDir: string, cacheKey: string) =>
  join(
    cacheDir,
    SITE_DEBUG_AI_BUILD_REPORTS_CACHE_DIR,
    `${sanitizeFileStem(cacheKey)}.json`,
  );

const getBuildReportArtifactDir = (
  artifactKind: SiteDebugAiAnalysisTarget['artifactKind'],
) =>
  artifactKind === 'bundle-chunk'
    ? 'chunks'
    : artifactKind === 'bundle-module'
      ? 'modules'
      : 'pages';

const getBuildReportSourceFilePath = ({
  prompt,
  provider,
  reportId,
  sourceDir,
  target,
}: {
  prompt: string;
  provider: SiteDebugAiProvider;
  reportId: string;
  sourceDir: string;
  target: SiteDebugAiAnalysisTarget;
}) => {
  const safeBaseName = sanitizeFileStem(
    basename(target.displayPath || target.artifactLabel),
  );
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        prompt,
        provider,
        reportId,
        target,
      }),
    )
    .digest('hex')
    .slice(0, 8);

  return join(
    sourceDir,
    getBuildReportArtifactDir(target.artifactKind),
    `${safeBaseName}.${hash}.json`,
  );
};

const readBuildReportCache = (
  filePath: string,
  sanitizeOptions: SiteDebugAiSanitizeOptions = {},
): SiteDebugAiBuildReport | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      fs.readFileSync(filePath, 'utf8'),
    ) as Partial<SiteDebugAiBuildReport>;

    if (
      typeof payload.result !== 'string' ||
      typeof payload.reportId !== 'string' ||
      typeof payload.reportLabel !== 'string' ||
      typeof payload.prompt !== 'string' ||
      (payload.provider !== 'claude-code' && payload.provider !== 'doubao') ||
      !payload.target
    ) {
      return null;
    }

    return sanitizeSiteDebugAiBuildReport(
      payload as SiteDebugAiBuildReport,
      sanitizeOptions,
    );
  } catch {
    return null;
  }
};

const writeBuildReportCache = ({
  cacheDir,
  cacheKey,
  report,
  sanitizeOptions = {},
}: {
  cacheDir: string;
  cacheKey: string;
  report: SiteDebugAiBuildReport;
  sanitizeOptions?: SiteDebugAiSanitizeOptions;
}) => {
  const cacheFilePath = getBuildReportCacheFilePath(cacheDir, cacheKey);

  if (!fs.existsSync(dirname(cacheFilePath))) {
    fs.mkdirSync(dirname(cacheFilePath), { recursive: true });
  }

  fs.writeFileSync(
    cacheFilePath,
    JSON.stringify(
      sanitizeSiteDebugAiBuildReport(report, sanitizeOptions),
      null,
      2,
    ),
  );
};

const writeBuildReportSource = ({
  filePath,
  report,
  sanitizeOptions = {},
}: {
  filePath: string;
  report: SiteDebugAiBuildReport;
  sanitizeOptions?: SiteDebugAiSanitizeOptions;
}) => {
  if (!fs.existsSync(dirname(filePath))) {
    fs.mkdirSync(dirname(filePath), { recursive: true });
  }

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      sanitizeSiteDebugAiBuildReport(report, sanitizeOptions),
      null,
      2,
    ),
  );
};

const sanitizeBuildReportSourceDirectory = (
  sourceDir: string,
  sanitizeOptions: SiteDebugAiSanitizeOptions = {},
) => {
  if (!fs.existsSync(sourceDir)) {
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
    const report = readBuildReportCache(currentPath, sanitizeOptions);

    if (!report) {
      return;
    }

    const sanitizedContent = `${JSON.stringify(report, null, 2)}\n`;

    if (rawContent !== sanitizedContent) {
      fs.writeFileSync(currentPath, sanitizedContent);
    }
  };

  visit(sourceDir);
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

const resolveModuleSourceBytes = ({
  assetsDir,
  cache,
  moduleMetric,
  outDir,
}: {
  assetsDir: string;
  cache: Map<string, number | null>;
  moduleMetric: NonNullable<
    NonNullable<PageMetafile['buildMetrics']>['components'][number]
  >['modules'][number];
  outDir: string;
}) => {
  const cacheKey =
    moduleMetric.sourcePath || moduleMetric.sourceAssetFile || moduleMetric.id;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  let sourceBytes: number | null = null;

  if (moduleMetric.sourcePath) {
    const content = readTextArtifact(moduleMetric.sourcePath);

    if (content) {
      sourceBytes = Buffer.byteLength(content);
    }
  }

  if (sourceBytes === null && moduleMetric.sourceAssetFile) {
    const sourceAssetPath = resolveOutputAssetPath({
      assetsDir,
      outDir,
      publicPath: moduleMetric.sourceAssetFile,
    });
    const content = readTextArtifact(sourceAssetPath);

    if (content) {
      sourceBytes = Buffer.byteLength(content);
    }
  }

  cache.set(cacheKey, sourceBytes);
  return sourceBytes;
};

const resolveOutputAssetBytes = ({
  assetsDir,
  outDir,
  publicPath,
}: {
  assetsDir: string;
  outDir: string;
  publicPath: string;
}) => {
  const assetPath = resolveOutputAssetPath({
    assetsDir,
    outDir,
    publicPath,
  });

  if (!fs.existsSync(assetPath)) {
    return null;
  }

  return fs.statSync(assetPath).size;
};

const createBuildMetricAiContext = ({
  artifactHeaderItems,
  assetsDir,
  buildMetric,
  currentChunkFile,
  currentModuleKey,
  outDir,
  resourceType,
}: {
  artifactHeaderItems: NonNullable<
    SiteDebugAiAnalysisTarget['context']
  >['artifactHeaderItems'];
  assetsDir: string;
  buildMetric: NonNullable<PageMetafile['buildMetrics']>['components'][number];
  currentChunkFile: string;
  currentModuleKey?: string;
  outDir: string;
  resourceType: 'asset' | 'css' | 'js';
}): NonNullable<SiteDebugAiAnalysisTarget['context']> => {
  const sourceSizeCache = new Map<string, number | null>();

  return {
    artifactHeaderItems,
    bundleSummaryItems: createSiteDebugAiBundleSummaryItems({
      estimatedAssetBytes: buildMetric.estimatedAssetBytes,
      estimatedCssBytes: buildMetric.estimatedCssBytes,
      estimatedJsBytes: buildMetric.estimatedJsBytes,
      estimatedTotalBytes: buildMetric.estimatedTotalBytes,
    }),
    chunkResourceItems: createSiteDebugAiChunkResourceItems({
      currentFile: currentChunkFile,
      files: buildMetric.files,
      modules: buildMetric.modules,
      totalEstimatedBytes: buildMetric.estimatedTotalBytes,
    }),
    componentName: buildMetric.componentName,
    moduleItems: createSiteDebugAiModuleItems({
      currentChunkFile,
      currentModuleKey,
      modules: buildMetric.modules,
      resolveSourceState: (moduleMetric) =>
        createSiteDebugAiResolvedSourceState({
          isGeneratedVirtualModule: moduleMetric.isGeneratedVirtualModule,
          renderedBytes: moduleMetric.bytes,
          sourceAvailable: Boolean(
            moduleMetric.sourceAssetFile || moduleMetric.sourcePath,
          ),
          sourceBytes: resolveModuleSourceBytes({
            assetsDir,
            cache: sourceSizeCache,
            moduleMetric,
            outDir,
          }),
        }),
      resourceType,
    }),
    pageId: null,
    renderId: null,
  };
};

const resolveChunkContent = (
  assetsDir: string,
  outDir: string,
  chunkFile: string,
): string | null => {
  const chunkPath = resolveOutputAssetPath({
    assetsDir,
    outDir,
    publicPath: chunkFile,
  });
  return readTextArtifact(chunkPath);
};

const resolveModuleContent = ({
  assetsDir,
  moduleMetric,
  outDir,
}: {
  assetsDir: string;
  moduleMetric: NonNullable<
    NonNullable<PageMetafile['buildMetrics']>['components'][number]
  >['modules'][number];
  outDir: string;
}): string | null => {
  if (moduleMetric.sourcePath) {
    const content = readTextArtifact(moduleMetric.sourcePath);

    if (content) {
      return content;
    }
  }

  if (moduleMetric.sourceAssetFile) {
    const sourceAssetPath = resolveOutputAssetPath({
      assetsDir,
      outDir,
      publicPath: moduleMetric.sourceAssetFile,
    });
    return readTextArtifact(sourceAssetPath);
  }

  return null;
};

const createChunkAnalysisTarget = ({
  assetsDir,
  buildMetric,
  chunkFile,
  chunkType,
  content,
  bytes,
  outDir,
}: {
  assetsDir: string;
  buildMetric: NonNullable<PageMetafile['buildMetrics']>['components'][number];
  bytes: number;
  chunkFile: string;
  chunkType: 'asset' | 'css' | 'js';
  content: string;
  outDir: string;
}): SiteDebugAiAnalysisTarget => ({
  artifactKind: 'bundle-chunk',
  artifactLabel: basename(chunkFile) || chunkFile,
  bytes,
  content,
  context: createBuildMetricAiContext({
    artifactHeaderItems: createSiteDebugAiArtifactHeaderItems({
      artifactKind: 'bundle-chunk',
      bytes,
      displayPath: chunkFile,
      resourceType: chunkType,
    }),
    assetsDir,
    buildMetric,
    currentChunkFile: chunkFile,
    outDir,
    resourceType: chunkType,
  }),
  displayPath: chunkFile,
  language: inferSiteDebugAiLanguage(chunkFile),
});

const getModuleDisplayPath = (moduleMetric: {
  file: string;
  id: string;
  isGeneratedVirtualModule?: boolean;
  sourceAssetFile?: string;
  sourcePath?: string;
}) =>
  moduleMetric.isGeneratedVirtualModule
    ? moduleMetric.id.replace(/^\0+/, '').replace(/\?.*$/, '') ||
      moduleMetric.file
    : moduleMetric.sourcePath ||
      moduleMetric.sourceAssetFile ||
      moduleMetric.file ||
      moduleMetric.id;

const createModuleAnalysisTarget = ({
  assetsDir,
  buildMetric,
  content,
  moduleMetric,
  outDir,
}: {
  assetsDir: string;
  buildMetric: NonNullable<PageMetafile['buildMetrics']>['components'][number];
  content: string;
  moduleMetric: NonNullable<
    NonNullable<PageMetafile['buildMetrics']>['components'][number]
  >['modules'][number];
  outDir: string;
}): SiteDebugAiAnalysisTarget => {
  const moduleKey = getSiteDebugAiModuleReportKey(
    moduleMetric.file,
    moduleMetric.id,
  );
  const displayPath = getModuleDisplayPath({
    file: moduleMetric.file,
    id: moduleMetric.id,
    isGeneratedVirtualModule:
      !moduleMetric.sourceAssetFile &&
      !moduleMetric.sourcePath &&
      moduleMetric.id.startsWith('\0'),
    sourceAssetFile: moduleMetric.sourceAssetFile,
    sourcePath: moduleMetric.sourcePath,
  });
  const resourceType =
    buildMetric.files.find(
      (fileMetric) => fileMetric.file === moduleMetric.file,
    )?.type ?? 'js';

  return {
    artifactKind: 'bundle-module',
    artifactLabel: basename(displayPath) || moduleMetric.id,
    bytes: Buffer.byteLength(content),
    content,
    context: createBuildMetricAiContext({
      artifactHeaderItems: createSiteDebugAiArtifactHeaderItems({
        artifactKind: 'bundle-module',
        displayPath,
        language: inferSiteDebugAiLanguage(displayPath),
      }),
      assetsDir,
      buildMetric,
      currentChunkFile: moduleMetric.file,
      currentModuleKey: moduleKey,
      outDir,
      resourceType,
    }),
    displayPath,
    language: inferSiteDebugAiLanguage(displayPath),
  };
};

const createPageModuleItems = ({
  assetsDir,
  modules,
  outDir,
}: {
  assetsDir: string;
  modules: BuildMetricModule[];
  outDir: string;
}): NonNullable<
  NonNullable<SiteDebugAiAnalysisTarget['context']>['moduleItems']
> => {
  const sourceSizeCache = new Map<string, number | null>();
  const totalRenderedBytes = modules.reduce(
    (sum, moduleMetric) => sum + moduleMetric.bytes,
    0,
  );

  return modules
    .toSorted((left, right) => right.bytes - left.bytes)
    .slice(0, PAGE_GROUPED_MODULE_LIMIT)
    .map((moduleMetric) => {
      const displayPath = getModuleDisplayPath(moduleMetric);
      const sourceState = createSiteDebugAiResolvedSourceState({
        isGeneratedVirtualModule: moduleMetric.isGeneratedVirtualModule,
        renderedBytes: moduleMetric.bytes,
        sourceAvailable: Boolean(
          moduleMetric.sourceAssetFile || moduleMetric.sourcePath,
        ),
        sourceBytes: resolveModuleSourceBytes({
          assetsDir,
          cache: sourceSizeCache,
          moduleMetric,
          outDir,
        }),
      });

      return {
        file: moduleMetric.file,
        id: moduleMetric.id,
        label: basename(displayPath) || moduleMetric.id,
        renderedSize: formatSiteDebugAiBytes(moduleMetric.bytes) || '—',
        share: formatSiteDebugAiPercent(moduleMetric.bytes, totalRenderedBytes),
        ...(sourceState.sizeDelta ? { sizeDelta: sourceState.sizeDelta } : {}),
        sourceInfo: sourceState.sourceInfo,
        ...(sourceState.statusLabel
          ? {
              statusLabel: sourceState.statusLabel,
            }
          : {}),
      };
    });
};

const createPageAnalysisTarget = ({
  assetsDir,
  outDir,
  pageId,
  pageMetafile,
}: {
  assetsDir: string;
  outDir: string;
  pageId: string;
  pageMetafile: PageMetafile;
}): SiteDebugAiAnalysisTarget => {
  const components = pageMetafile.buildMetrics?.components ?? [];
  const supportedComponentCount = getPageSupportedComponentCount(pageMetafile);
  const aggregatedModules = aggregatePageModules(components);
  const aggregatedFiles =
    components.length > 0
      ? aggregatePageFiles(components)
      : (() => {
          const fileMetricByPath = new Map<string, BuildMetricFile>();
          const pushFileMetric = (
            publicPath: string | null | undefined,
            type: BuildMetricFile['type'],
            explicitBytes?: number | null,
          ) => {
            if (!publicPath) {
              return;
            }

            const resolvedBytes =
              explicitBytes ??
              resolveOutputAssetBytes({
                assetsDir,
                outDir,
                publicPath,
              });

            if (
              typeof resolvedBytes !== 'number' ||
              !Number.isFinite(resolvedBytes) ||
              resolvedBytes <= 0
            ) {
              return;
            }

            const existingMetric = fileMetricByPath.get(publicPath);

            if (existingMetric) {
              existingMetric.bytes = Math.max(
                existingMetric.bytes,
                resolvedBytes,
              );
              return;
            }

            fileMetricByPath.set(publicPath, {
              bytes: resolvedBytes,
              file: publicPath,
              type,
            });
          };

          for (const loaderFile of pageMetafile.buildMetrics?.loader?.files ??
            []) {
            pushFileMetric(loaderFile.file, loaderFile.type, loaderFile.bytes);
          }

          pushFileMetric(
            pageMetafile.loaderScript,
            'js',
            pageMetafile.buildMetrics?.loader?.totalBytes,
          );
          pushFileMetric(pageMetafile.ssrInjectScript, 'js');

          for (const modulePreload of pageMetafile.modulePreloads) {
            pushFileMetric(modulePreload, 'js');
          }

          for (const cssBundlePath of pageMetafile.cssBundlePaths) {
            pushFileMetric(cssBundlePath, 'css');
          }

          return [...fileMetricByPath.values()];
        })();
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
          value: String(supportedComponentCount),
        },
        {
          label: 'Chunk Resources',
          value: String(aggregatedFiles.length),
        },
        {
          label: 'Module Sources',
          value: String(aggregatedModules.length),
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
      ...(components.length === 1
        ? {
            componentName: components[0].componentName,
          }
        : {}),
      ...(components.length === 0
        ? {
            liveContextItems: [
              {
                label: 'Enabled Renders',
                value: String(
                  pageMetafile.buildMetrics?.spaSyncEffects
                    ?.enabledRenderCount ?? 0,
                ),
              },
              {
                label: 'Blocking CSS',
                value: `${
                  pageMetafile.buildMetrics?.spaSyncEffects
                    ?.totalBlockingCssCount ?? 0
                } file(s) · ${
                  formatSiteDebugAiBytes(
                    pageMetafile.buildMetrics?.spaSyncEffects
                      ?.totalBlockingCssBytes,
                  ) || '0 B'
                }`,
              },
              {
                label: 'CSS Loading Runtime',
                value: pageMetafile.buildMetrics?.spaSyncEffects
                  ?.usesCssLoadingRuntime
                  ? 'Required'
                  : 'Not required',
              },
            ],
          }
        : {}),
      moduleItems: createPageModuleItems({
        assetsDir,
        modules: aggregatedModules,
        outDir,
      }),
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
  pageMetafiles: Record<string, PageMetafile>;
  root?: string;
  wrapBaseUrl: (value: string) => string;
}): Promise<GenerateSiteDebugAiBuildReportsResult> => {
  const buildReportsConfig = aiConfig?.buildReports;

  if (!buildReportsConfig || buildReportsConfig.enabled === false) {
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
  const { executions, skippedReason: executionPlanSkippedReason } =
    createBuildReportExecutions(aiConfig);
  const sourceConfig: BuildReportSourceConfig | null =
    buildReportsConfig.sourceDir
      ? {
          mode: buildReportsConfig.sourceMode ?? 'read-only',
          sourceDir: buildReportsConfig.sourceDir,
        }
      : null;
  const sanitizeOptions: SiteDebugAiSanitizeOptions = {
    anchorPaths: [
      sourceConfig?.sourceDir,
      root ? join(root, '.vitepress', 'config.ts') : undefined,
    ],
  };

  if (executions.length === 0) {
    if (executionPlanSkippedReason) {
      Logger.warn(executionPlanSkippedReason);
    }

    return {
      executionCount: 0,
      generatedReportCount: 0,
      providers: [],
      reusedReportCount: 0,
      skippedReason: executionPlanSkippedReason,
    };
  }

  // Omitted `cache` means "reuse reports", equivalent to `cache: true`.
  const useCache = buildReportsConfig.cache !== false;
  const canGenerateReports =
    !sourceConfig || sourceConfig.mode === 'read-write';
  const canUseLocalCache = useCache && (!sourceConfig || canGenerateReports);
  const groupBy = normalizeBuildReportGroupBy(buildReportsConfig.groupBy);
  const includeChunks = buildReportsConfig.includeChunks !== false;
  const includeModules = buildReportsConfig.includeModules !== false;
  let executionAvailability: Awaited<
    ReturnType<typeof resolveAvailableBuildReportExecutions>
  > | null = null;
  const skippedReasons = new Set<string>();
  const missingSourceDetails = new Set<string>();
  const generatedReportReferences = new Map<
    string,
    SiteDebugAiBuildReportReference
  >();
  let generatedReportCount = 0;
  let reusedReportCount = 0;

  if (sourceConfig?.mode === 'read-write') {
    sanitizeBuildReportSourceDirectory(sourceConfig.sourceDir, sanitizeOptions);
  }

  if (executionPlanSkippedReason) {
    skippedReasons.add(executionPlanSkippedReason);
  }

  const ensureExecutionAvailability = async () => {
    if (executionAvailability) {
      return executionAvailability;
    }

    executionAvailability = await resolveAvailableBuildReportExecutions({
      executions,
      resolveCapabilitiesImpl,
    });

    if (executionAvailability.skippedReason) {
      skippedReasons.add(executionAvailability.skippedReason);
    }

    return executionAvailability;
  };

  const getOrCreateReportReference = async ({
    artifactKey,
    execution,
    target,
  }: {
    artifactKey: string;
    execution: BuildReportExecution;
    target: SiteDebugAiAnalysisTarget;
  }) => {
    const cachedReference = generatedReportReferences.get(artifactKey);

    if (cachedReference) {
      return cachedReference;
    }

    const sanitizedTarget = sanitizeSiteDebugAiAnalysisTarget(
      target,
      sanitizeOptions,
    );
    const prompt = buildSiteDebugAiAnalysisPrompt(
      sanitizedTarget,
      sanitizeOptions,
    );
    const cacheKey = getBuildReportCacheKey({
      prompt,
      provider: execution.provider,
      providerConfig: getBuildReportProviderConfigSnapshot(
        execution.config,
        execution.provider,
      ),
    });
    const sourceFilePath = sourceConfig
      ? getBuildReportSourceFilePath({
          prompt,
          provider: execution.provider,
          reportId: execution.reportId,
          sourceDir: sourceConfig.sourceDir,
          target: sanitizedTarget,
        })
      : null;
    const sourceReport = sourceFilePath
      ? readBuildReportCache(sourceFilePath, sanitizeOptions)
      : null;

    if (sourceReport) {
      if (useCache) {
        writeBuildReportCache({
          cacheDir,
          cacheKey,
          report: sourceReport,
          sanitizeOptions,
        });
      }

      if (sourceFilePath && sourceConfig?.mode === 'read-write') {
        writeBuildReportSource({
          filePath: sourceFilePath,
          report: sourceReport,
          sanitizeOptions,
        });
      }

      const reportFile = writeBuildReportAsset({
        assetsDir,
        outDir,
        provider: execution.provider,
        report: sourceReport,
        sanitizeOptions,
        wrapBaseUrl,
      });
      const reportReference = {
        detail: sourceReport.detail,
        generatedAt: sourceReport.generatedAt,
        model: sourceReport.model,
        provider: execution.provider,
        reportFile,
        reportId: sourceReport.reportId,
        reportLabel: sourceReport.reportLabel,
      };

      generatedReportReferences.set(artifactKey, reportReference);
      reusedReportCount += 1;
      return reportReference;
    }

    const cachedReport = canUseLocalCache
      ? readBuildReportCache(
          getBuildReportCacheFilePath(cacheDir, cacheKey),
          sanitizeOptions,
        )
      : null;

    if (cachedReport) {
      if (sourceFilePath && sourceConfig?.mode === 'read-write') {
        writeBuildReportSource({
          filePath: sourceFilePath,
          report: cachedReport,
          sanitizeOptions,
        });
      }

      const reportFile = writeBuildReportAsset({
        assetsDir,
        outDir,
        provider: execution.provider,
        report: cachedReport,
        sanitizeOptions,
        wrapBaseUrl,
      });
      const reportReference = {
        detail: cachedReport.detail,
        generatedAt: cachedReport.generatedAt,
        model: cachedReport.model,
        provider: execution.provider,
        reportFile,
        reportId: cachedReport.reportId,
        reportLabel: cachedReport.reportLabel,
      };

      generatedReportReferences.set(artifactKey, reportReference);
      reusedReportCount += 1;
      return reportReference;
    }

    if (!canGenerateReports) {
      if (sourceFilePath) {
        missingSourceDetails.add(
          `Missing committed build report for ${sanitizedTarget.displayPath} (${execution.reportLabel}) at ${sourceFilePath}.`,
        );
      }
      return null;
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
      reportId: execution.reportId,
      reportLabel: execution.reportLabel,
      result: result.result,
      target: sanitizedTarget,
    };
    writeBuildReportCache({
      cacheDir,
      cacheKey,
      report,
      sanitizeOptions,
    });
    if (sourceFilePath) {
      writeBuildReportSource({
        filePath: sourceFilePath,
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
      reportFile,
      reportId: execution.reportId,
      reportLabel: execution.reportLabel,
    };

    generatedReportReferences.set(artifactKey, reportReference);
    generatedReportCount += 1;
    return reportReference;
  };

  await collectBuildReportReferencesForPageMetafiles({
    assetsDir,
    createChunkAnalysisTarget,
    createModuleAnalysisTarget,
    createPageAnalysisTarget,
    executions,
    getOrCreateReportReference,
    groupBy,
    includeChunks,
    includeModules,
    logger: Logger,
    outDir,
    pageMetafiles,
    resolveChunkContent,
    resolveModuleContent,
  });

  if (generatedReportCount > 0 || reusedReportCount > 0) {
    Logger.info(
      `Build-time AI reports across ${executions.length} execution${executions.length === 1 ? '' : 's'}: generated ${generatedReportCount}, reused ${reusedReportCount}.`,
    );
  }

  for (const missingDetail of missingSourceDetails) {
    Logger.warn(missingDetail);
    skippedReasons.add(missingDetail);
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
