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
  type SiteDebugAiAnalysisTarget,
  type SiteDebugAiBuildReport,
  type SiteDebugAiProvider,
} from '../../shared/site-debug-ai';
import { PAGE_METAFILE_ASSET_DIR } from './page-metafile-manifest';
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

const aggregatePageFiles = (components: BuildMetric[]): BuildMetricFile[] => {
  const fileMetricByPath = new Map<string, BuildMetricFile>();

  for (const buildMetric of components) {
    for (const fileMetric of buildMetric.files) {
      const existingMetric = fileMetricByPath.get(fileMetric.file);

      if (existingMetric) {
        existingMetric.bytes = Math.max(existingMetric.bytes, fileMetric.bytes);
        continue;
      }

      fileMetricByPath.set(fileMetric.file, {
        ...fileMetric,
      });
    }
  }

  return [...fileMetricByPath.values()];
};

const aggregatePageModules = (
  components: BuildMetric[],
): BuildMetricModule[] => {
  const moduleMetricByKey = new Map<string, BuildMetricModule>();

  for (const buildMetric of components) {
    for (const moduleMetric of buildMetric.modules) {
      const moduleKey = getSiteDebugAiModuleReportKey(
        moduleMetric.file,
        moduleMetric.id,
      );
      const existingMetric = moduleMetricByKey.get(moduleKey);

      if (existingMetric) {
        existingMetric.bytes = Math.max(
          existingMetric.bytes,
          moduleMetric.bytes,
        );
        existingMetric.sourceAssetFile =
          existingMetric.sourceAssetFile || moduleMetric.sourceAssetFile;
        existingMetric.sourcePath =
          existingMetric.sourcePath || moduleMetric.sourcePath;
        existingMetric.isGeneratedVirtualModule =
          existingMetric.isGeneratedVirtualModule &&
          !moduleMetric.sourceAssetFile &&
          !moduleMetric.sourcePath &&
          moduleMetric.id.startsWith('\0');
        continue;
      }

      moduleMetricByKey.set(moduleKey, {
        ...moduleMetric,
        isGeneratedVirtualModule:
          !moduleMetric.sourceAssetFile &&
          !moduleMetric.sourcePath &&
          moduleMetric.id.startsWith('\0'),
      });
    }
  }

  return [...moduleMetricByKey.values()];
};

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

const resolveBuildReportExecutions = async ({
  aiConfig,
  resolveCapabilitiesImpl,
}: {
  aiConfig: SiteDebugAiConfig;
  resolveCapabilitiesImpl: typeof resolveSiteDebugAiCapabilities;
}): Promise<{
  executions: BuildReportExecution[];
  skippedReason?: string;
}> => {
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
  const skippedDetails: string[] = [];

  for (const runConfig of runConfigs) {
    const executionConfig = createBuildReportExecutionConfig(
      aiConfig,
      runConfig,
    );
    const capabilities = await resolveCapabilitiesImpl(executionConfig);
    const capability = capabilities.providers[runConfig.provider];

    if (capability?.available) {
      executions.push({
        config: executionConfig,
        provider: runConfig.provider,
        reportId: getBuildReportExecutionId(runConfig),
        reportLabel: getBuildReportExecutionLabel(runConfig),
      });
      continue;
    }

    skippedDetails.push(
      capability?.detail ||
        `Build report execution ${getBuildReportExecutionLabel(runConfig)} is unavailable.`,
    );
  }

  return {
    executions,
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

const readBuildReportCache = (
  filePath: string,
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

    return payload as SiteDebugAiBuildReport;
  } catch {
    return null;
  }
};

const writeBuildReportCache = ({
  cacheDir,
  cacheKey,
  report,
}: {
  cacheDir: string;
  cacheKey: string;
  report: SiteDebugAiBuildReport;
}) => {
  const cacheFilePath = getBuildReportCacheFilePath(cacheDir, cacheKey);

  if (!fs.existsSync(dirname(cacheFilePath))) {
    fs.mkdirSync(dirname(cacheFilePath), { recursive: true });
  }

  fs.writeFileSync(cacheFilePath, JSON.stringify(report, null, 2));
};

const writeBuildReportAsset = ({
  assetsDir,
  outDir,
  provider,
  report,
  wrapBaseUrl,
}: {
  assetsDir: string;
  outDir: string;
  provider: SiteDebugAiProvider;
  report: SiteDebugAiBuildReport;
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
  const artifactDir =
    report.target.artifactKind === 'bundle-chunk'
      ? 'chunks'
      : report.target.artifactKind === 'bundle-module'
        ? 'modules'
        : 'pages';
  const relativeReportPath = join(
    SITE_DEBUG_AI_BUILD_REPORTS_DIR,
    artifactDir,
    `${safeBaseName}.${hash}.json`,
  );
  const absoluteReportPath = join(outDir, assetsDir, relativeReportPath);

  if (!fs.existsSync(dirname(absoluteReportPath))) {
    fs.mkdirSync(dirname(absoluteReportPath), { recursive: true });
  }

  fs.writeFileSync(absoluteReportPath, JSON.stringify(report, null, 2));

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

  return [...modules]
    .sort((left, right) => right.bytes - left.bytes)
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
  const aggregatedFiles = aggregatePageFiles(components);
  const aggregatedModules = aggregatePageModules(components);
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
          value: String(components.length),
        },
        {
          label: 'Chunk Resources',
          value: String(aggregatedFiles.length),
        },
        {
          label: 'Module Sources',
          value: String(aggregatedModules.length),
        },
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
  wrapBaseUrl,
  dependencies,
}: {
  aiConfig: SiteDebugAiConfig;
  assetsDir: string;
  cacheDir: string;
  dependencies?: BuildReportDependencies;
  outDir: string;
  pageMetafiles: Record<string, PageMetafile>;
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
  const { executions, skippedReason } = await resolveBuildReportExecutions({
    aiConfig,
    resolveCapabilitiesImpl,
  });

  if (executions.length === 0) {
    if (skippedReason) {
      Logger.warn(skippedReason);
    }

    return {
      executionCount: 0,
      generatedReportCount: 0,
      providers: [],
      reusedReportCount: 0,
      skippedReason,
    };
  }

  // Omitted `cache` means "reuse reports", equivalent to `cache: true`.
  const useCache = buildReportsConfig.cache !== false;
  const groupBy = normalizeBuildReportGroupBy(buildReportsConfig.groupBy);
  const includeChunks = buildReportsConfig.includeChunks !== false;
  const includeModules = buildReportsConfig.includeModules !== false;
  const generatedReportReferences = new Map<
    string,
    SiteDebugAiBuildReportReference
  >();
  let generatedReportCount = 0;
  let reusedReportCount = 0;

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

    const prompt = buildSiteDebugAiAnalysisPrompt(target);
    const cacheKey = getBuildReportCacheKey({
      prompt,
      provider: execution.provider,
      providerConfig: getBuildReportProviderConfigSnapshot(
        execution.config,
        execution.provider,
      ),
    });
    const cachedReport = useCache
      ? readBuildReportCache(getBuildReportCacheFilePath(cacheDir, cacheKey))
      : null;

    if (cachedReport) {
      const reportFile = writeBuildReportAsset({
        assetsDir,
        outDir,
        provider: execution.provider,
        report: cachedReport,
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

    const generatedAt = new Date().toISOString();
    const result = await analyzeTargetImpl({
      config: execution.config,
      provider: execution.provider,
      target,
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
      target,
    };
    writeBuildReportCache({
      cacheDir,
      cacheKey,
      report,
    });
    const reportFile = writeBuildReportAsset({
      assetsDir,
      outDir,
      provider: execution.provider,
      report,
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

  for (const [pageId, pageMetafile] of Object.entries(pageMetafiles)) {
    const componentBuildMetrics = pageMetafile.buildMetrics?.components ?? [];

    const pageGroupedReportReferences =
      groupBy === 'page' && componentBuildMetrics.length > 0
        ? await Promise.all(
            executions.map(async (execution) => {
              try {
                const reportReference = await getOrCreateReportReference({
                  artifactKey: [
                    execution.reportId,
                    execution.provider,
                    'page-build',
                    pageId,
                  ].join('::'),
                  execution,
                  target: createPageAnalysisTarget({
                    assetsDir,
                    outDir,
                    pageId,
                    pageMetafile,
                  }),
                });

                return [execution, reportReference] as const;
              } catch (error) {
                Logger.warn(
                  `Failed to generate page AI report for ${pageId} (${execution.reportLabel}): ${error instanceof Error ? error.message : String(error)}`,
                );
                return null;
              }
            }),
          ).then((entries) =>
            entries.filter(
              (
                entry,
              ): entry is readonly [
                BuildReportExecution,
                SiteDebugAiBuildReportReference,
              ] => Boolean(entry),
            ),
          )
        : [];
    const pageGroupedReportReferenceMap = new Map(pageGroupedReportReferences);

    for (const buildMetric of componentBuildMetrics) {
      const chunkReports: Record<string, SiteDebugAiBuildReportReference[]> =
        {};
      const moduleReports: Record<string, SiteDebugAiBuildReportReference[]> =
        {};

      if (includeChunks) {
        for (const fileMetric of buildMetric.files) {
          if (groupBy === 'page') {
            for (const execution of executions) {
              const reportReference =
                pageGroupedReportReferenceMap.get(execution);

              if (!reportReference) {
                continue;
              }

              chunkReports[fileMetric.file] = [
                ...(chunkReports[fileMetric.file] ?? []),
                reportReference,
              ];
            }

            continue;
          }

          const chunkContent = resolveChunkContent(
            assetsDir,
            outDir,
            fileMetric.file,
          );

          if (!chunkContent) {
            continue;
          }

          const chunkTarget = createChunkAnalysisTarget({
            assetsDir,
            buildMetric,
            bytes: fileMetric.bytes,
            chunkFile: fileMetric.file,
            chunkType: fileMetric.type,
            content: chunkContent,
            outDir,
          });

          for (const execution of executions) {
            try {
              const reportReference = await getOrCreateReportReference({
                artifactKey: [
                  execution.reportId,
                  execution.provider,
                  'bundle-chunk',
                  buildMetric.componentName,
                  fileMetric.file,
                ].join('::'),
                execution,
                target: chunkTarget,
              });
              chunkReports[fileMetric.file] = [
                ...(chunkReports[fileMetric.file] ?? []),
                reportReference,
              ];
            } catch (error) {
              Logger.warn(
                `Failed to generate build chunk AI report for ${fileMetric.file} (${execution.reportLabel}): ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        }
      }

      if (includeModules) {
        for (const moduleMetric of buildMetric.modules) {
          if (groupBy === 'page') {
            const moduleKey = getSiteDebugAiModuleReportKey(
              moduleMetric.file,
              moduleMetric.id,
            );

            for (const execution of executions) {
              const reportReference =
                pageGroupedReportReferenceMap.get(execution);

              if (!reportReference) {
                continue;
              }

              moduleReports[moduleKey] = [
                ...(moduleReports[moduleKey] ?? []),
                reportReference,
              ];
            }

            continue;
          }

          const moduleContent = resolveModuleContent({
            assetsDir,
            moduleMetric,
            outDir,
          });

          if (!moduleContent) {
            continue;
          }

          const moduleKey = getSiteDebugAiModuleReportKey(
            moduleMetric.file,
            moduleMetric.id,
          );
          const moduleTarget = createModuleAnalysisTarget({
            assetsDir,
            buildMetric,
            content: moduleContent,
            moduleMetric,
            outDir,
          });

          for (const execution of executions) {
            try {
              const reportReference = await getOrCreateReportReference({
                artifactKey: [
                  execution.reportId,
                  execution.provider,
                  'bundle-module',
                  buildMetric.componentName,
                  moduleKey,
                ].join('::'),
                execution,
                target: moduleTarget,
              });
              moduleReports[moduleKey] = [
                ...(moduleReports[moduleKey] ?? []),
                reportReference,
              ];
            } catch (error) {
              Logger.warn(
                `Failed to generate build module AI report for ${moduleMetric.id} (${execution.reportLabel}): ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        }
      }

      if (
        Object.keys(chunkReports).length > 0 ||
        Object.keys(moduleReports).length > 0
      ) {
        buildMetric.aiReports = {
          ...(Object.keys(chunkReports).length > 0 ? { chunkReports } : {}),
          ...(Object.keys(moduleReports).length > 0 ? { moduleReports } : {}),
        };
      }
    }
  }

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
    ...(skippedReason ? { skippedReason } : {}),
  };
};
