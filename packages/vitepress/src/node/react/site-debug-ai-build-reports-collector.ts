import type {
  PageMetafile,
  SiteDebugAiBuildReportReference,
} from '#dep-types/page';
import {
  getSiteDebugAiModuleReportKey,
  type SiteDebugAiAnalysisTarget,
} from '../../shared/site-debug-ai';

type BuildMetric = NonNullable<
  NonNullable<PageMetafile['buildMetrics']>['components'][number]
>;
type BuildMetricFile = BuildMetric['files'][number];
type BuildMetricModule = BuildMetric['modules'][number] & {
  isGeneratedVirtualModule?: boolean;
};

type BuildReportGroupBy = 'artifact' | 'page';

interface BuildReportExecutionLike {
  provider: string;
  reportId: string;
  reportLabel: string;
}

interface CollectBuildReportReferencesOptions<
  TExecution extends BuildReportExecutionLike,
> {
  assetsDir: string;
  createChunkAnalysisTarget: (options: {
    assetsDir: string;
    buildMetric: BuildMetric;
    bytes: number;
    chunkFile: string;
    chunkType: BuildMetricFile['type'];
    content: string;
    outDir: string;
  }) => SiteDebugAiAnalysisTarget;
  createModuleAnalysisTarget: (options: {
    assetsDir: string;
    buildMetric: BuildMetric;
    content: string;
    moduleMetric: BuildMetricModule;
    outDir: string;
  }) => SiteDebugAiAnalysisTarget;
  createPageAnalysisTarget: (options: {
    assetsDir: string;
    outDir: string;
    pageId: string;
    pageMetafile: PageMetafile;
  }) => SiteDebugAiAnalysisTarget;
  executions: readonly TExecution[];
  getOrCreateReportReference: (options: {
    artifactKey: string;
    execution: TExecution;
    target: SiteDebugAiAnalysisTarget;
  }) => Promise<SiteDebugAiBuildReportReference | null>;
  groupBy: BuildReportGroupBy;
  includeChunks: boolean;
  includeModules: boolean;
  logger: {
    warn: (message: string) => void;
  };
  outDir: string;
  pageMetafiles: Record<string, PageMetafile>;
  resolveChunkContent: (
    assetsDir: string,
    outDir: string,
    chunkFile: string,
  ) => string | null;
  resolveModuleContent: (options: {
    assetsDir: string;
    moduleMetric: BuildMetricModule;
    outDir: string;
  }) => string | null;
}

const appendReportReference = (
  reportMap: Record<string, SiteDebugAiBuildReportReference[]>,
  key: string,
  reportReference: SiteDebugAiBuildReportReference,
) => {
  reportMap[key] = [...(reportMap[key] ?? []), reportReference];
};

const buildArtifactKey = (
  execution: BuildReportExecutionLike,
  ...parts: string[]
) => [execution.reportId, execution.provider, ...parts].join('::');

const filterResolvedExecutionReportEntries = <
  TExecution extends BuildReportExecutionLike,
>(
  entries: (readonly [TExecution, SiteDebugAiBuildReportReference] | null)[],
): (readonly [TExecution, SiteDebugAiBuildReportReference])[] =>
  entries.filter(
    (entry): entry is readonly [TExecution, SiteDebugAiBuildReportReference] =>
      Boolean(entry?.[1]),
  );

const formatBuildReportErrorMessage = (error: unknown) => {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const detail =
    error &&
    typeof error === 'object' &&
    'detail' in error &&
    typeof error.detail === 'string'
      ? error.detail
      : '';

  return detail ? `${baseMessage} (${detail})` : baseMessage;
};

const collectPageGroupedReportReferences = async <
  TExecution extends BuildReportExecutionLike,
>({
  assetsDir,
  createPageAnalysisTarget,
  executions,
  getOrCreateReportReference,
  groupBy,
  logger,
  outDir,
  pageId,
  pageMetafile,
}: {
  assetsDir: string;
  createPageAnalysisTarget: (options: {
    assetsDir: string;
    outDir: string;
    pageId: string;
    pageMetafile: PageMetafile;
  }) => SiteDebugAiAnalysisTarget;
  executions: readonly TExecution[];
  getOrCreateReportReference: (options: {
    artifactKey: string;
    execution: TExecution;
    target: SiteDebugAiAnalysisTarget;
  }) => Promise<SiteDebugAiBuildReportReference | null>;
  groupBy: BuildReportGroupBy;
  logger: {
    warn: (message: string) => void;
  };
  outDir: string;
  pageId: string;
  pageMetafile: PageMetafile;
}) => {
  if (groupBy !== 'page' || !hasPageBuildAnalysisSignals(pageMetafile)) {
    return [];
  }

  const entries = await Promise.all(
    executions.map(async (execution) => {
      try {
        const reportReference = await getOrCreateReportReference({
          artifactKey: buildArtifactKey(execution, 'page-build', pageId),
          execution,
          target: createPageAnalysisTarget({
            assetsDir,
            outDir,
            pageId,
            pageMetafile,
          }),
        });

        return reportReference ? ([execution, reportReference] as const) : null;
      } catch (error) {
        logger.warn(
          `Failed to generate page AI report for ${pageId} (${execution.reportLabel}): ${formatBuildReportErrorMessage(error)}`,
        );
        return null;
      }
    }),
  );

  return filterResolvedExecutionReportEntries(entries);
};

const syncPageGroupedReports = (
  pageMetafile: PageMetafile,
  pageGroupedReportReferences: (readonly [
    BuildReportExecutionLike,
    SiteDebugAiBuildReportReference,
  ])[],
) => {
  if (!pageMetafile.buildMetrics) {
    return;
  }

  if (pageGroupedReportReferences.length > 0) {
    pageMetafile.buildMetrics.aiReports = pageGroupedReportReferences
      .map(([, reportReference]) => reportReference)
      .toSorted((left, right) =>
        left.reportFile.localeCompare(right.reportFile),
      );
    return;
  }

  if (pageMetafile.buildMetrics.aiReports) {
    delete pageMetafile.buildMetrics.aiReports;
  }
};

const appendPageGroupedArtifactReports = <
  TExecution extends BuildReportExecutionLike,
>({
  executions,
  pageGroupedReportReferenceMap,
  reportMap,
  reportMapKey,
}: {
  executions: readonly TExecution[];
  pageGroupedReportReferenceMap: Map<
    TExecution,
    SiteDebugAiBuildReportReference
  >;
  reportMap: Record<string, SiteDebugAiBuildReportReference[]>;
  reportMapKey: string;
}) => {
  for (const execution of executions) {
    const reportReference = pageGroupedReportReferenceMap.get(execution);

    if (!reportReference) {
      continue;
    }

    appendReportReference(reportMap, reportMapKey, reportReference);
  }
};

const collectChunkReportsForBuildMetric = async <
  TExecution extends BuildReportExecutionLike,
>({
  assetsDir,
  buildMetric,
  createChunkAnalysisTarget,
  executions,
  getOrCreateReportReference,
  groupBy,
  logger,
  outDir,
  pageGroupedReportReferenceMap,
  resolveChunkContent,
}: {
  assetsDir: string;
  buildMetric: BuildMetric;
  createChunkAnalysisTarget: (options: {
    assetsDir: string;
    buildMetric: BuildMetric;
    bytes: number;
    chunkFile: string;
    chunkType: BuildMetricFile['type'];
    content: string;
    outDir: string;
  }) => SiteDebugAiAnalysisTarget;
  executions: readonly TExecution[];
  getOrCreateReportReference: (options: {
    artifactKey: string;
    execution: TExecution;
    target: SiteDebugAiAnalysisTarget;
  }) => Promise<SiteDebugAiBuildReportReference | null>;
  groupBy: BuildReportGroupBy;
  logger: {
    warn: (message: string) => void;
  };
  outDir: string;
  pageGroupedReportReferenceMap: Map<
    TExecution,
    SiteDebugAiBuildReportReference
  >;
  resolveChunkContent: (
    assetsDir: string,
    outDir: string,
    chunkFile: string,
  ) => string | null;
}) => {
  const chunkReports: Record<string, SiteDebugAiBuildReportReference[]> = {};

  for (const fileMetric of buildMetric.files) {
    if (groupBy === 'page') {
      appendPageGroupedArtifactReports({
        executions,
        pageGroupedReportReferenceMap,
        reportMap: chunkReports,
        reportMapKey: fileMetric.file,
      });
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
          artifactKey: buildArtifactKey(
            execution,
            'bundle-chunk',
            buildMetric.componentName,
            fileMetric.file,
          ),
          execution,
          target: chunkTarget,
        });

        if (!reportReference) {
          continue;
        }

        appendReportReference(chunkReports, fileMetric.file, reportReference);
      } catch (error) {
        logger.warn(
          `Failed to generate build chunk AI report for ${fileMetric.file} (${execution.reportLabel}): ${formatBuildReportErrorMessage(error)}`,
        );
      }
    }
  }

  return chunkReports;
};

const collectModuleReportsForBuildMetric = async <
  TExecution extends BuildReportExecutionLike,
>({
  assetsDir,
  buildMetric,
  createModuleAnalysisTarget,
  executions,
  getOrCreateReportReference,
  groupBy,
  logger,
  outDir,
  pageGroupedReportReferenceMap,
  resolveModuleContent,
}: {
  assetsDir: string;
  buildMetric: BuildMetric;
  createModuleAnalysisTarget: (options: {
    assetsDir: string;
    buildMetric: BuildMetric;
    content: string;
    moduleMetric: BuildMetricModule;
    outDir: string;
  }) => SiteDebugAiAnalysisTarget;
  executions: readonly TExecution[];
  getOrCreateReportReference: (options: {
    artifactKey: string;
    execution: TExecution;
    target: SiteDebugAiAnalysisTarget;
  }) => Promise<SiteDebugAiBuildReportReference | null>;
  groupBy: BuildReportGroupBy;
  logger: {
    warn: (message: string) => void;
  };
  outDir: string;
  pageGroupedReportReferenceMap: Map<
    TExecution,
    SiteDebugAiBuildReportReference
  >;
  resolveModuleContent: (options: {
    assetsDir: string;
    moduleMetric: BuildMetricModule;
    outDir: string;
  }) => string | null;
}) => {
  const moduleReports: Record<string, SiteDebugAiBuildReportReference[]> = {};

  for (const moduleMetric of buildMetric.modules) {
    const moduleKey = getSiteDebugAiModuleReportKey(
      moduleMetric.file,
      moduleMetric.id,
    );

    if (groupBy === 'page') {
      appendPageGroupedArtifactReports({
        executions,
        pageGroupedReportReferenceMap,
        reportMap: moduleReports,
        reportMapKey: moduleKey,
      });
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
          artifactKey: buildArtifactKey(
            execution,
            'bundle-module',
            buildMetric.componentName,
            moduleKey,
          ),
          execution,
          target: moduleTarget,
        });

        if (!reportReference) {
          continue;
        }

        appendReportReference(moduleReports, moduleKey, reportReference);
      } catch (error) {
        logger.warn(
          `Failed to generate build module AI report for ${moduleMetric.id} (${execution.reportLabel}): ${formatBuildReportErrorMessage(error)}`,
        );
      }
    }
  }

  return moduleReports;
};

const syncBuildMetricReports = ({
  buildMetric,
  chunkReports,
  moduleReports,
}: {
  buildMetric: BuildMetric;
  chunkReports: Record<string, SiteDebugAiBuildReportReference[]>;
  moduleReports: Record<string, SiteDebugAiBuildReportReference[]>;
}) => {
  if (
    Object.keys(chunkReports).length === 0 &&
    Object.keys(moduleReports).length === 0
  ) {
    return;
  }

  buildMetric.aiReports = {
    ...(Object.keys(chunkReports).length > 0 ? { chunkReports } : {}),
    ...(Object.keys(moduleReports).length > 0 ? { moduleReports } : {}),
  };
};

export const aggregatePageFiles = (
  components: BuildMetric[],
): BuildMetricFile[] => {
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

export const aggregatePageModules = (
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

export const getPageSupportedComponentCount = (
  pageMetafile: PageMetafile,
): number =>
  Math.max(
    pageMetafile.buildMetrics?.components.length ?? 0,
    pageMetafile.buildMetrics?.spaSyncEffects?.enabledComponentCount ?? 0,
  );

export const hasPageBuildAnalysisSignals = (
  pageMetafile: PageMetafile,
): boolean => getPageSupportedComponentCount(pageMetafile) > 0;

export const collectBuildReportReferencesForPageMetafiles = async <
  TExecution extends BuildReportExecutionLike,
>({
  assetsDir,
  createChunkAnalysisTarget,
  createModuleAnalysisTarget,
  createPageAnalysisTarget,
  executions,
  getOrCreateReportReference,
  groupBy,
  includeChunks,
  includeModules,
  logger,
  outDir,
  pageMetafiles,
  resolveChunkContent,
  resolveModuleContent,
}: CollectBuildReportReferencesOptions<TExecution>): Promise<void> => {
  for (const [pageId, pageMetafile] of Object.entries(pageMetafiles)) {
    const pageGroupedReportReferences =
      await collectPageGroupedReportReferences({
        assetsDir,
        createPageAnalysisTarget,
        executions,
        getOrCreateReportReference,
        groupBy,
        logger,
        outDir,
        pageId,
        pageMetafile,
      });
    const pageGroupedReportReferenceMap = new Map(pageGroupedReportReferences);

    syncPageGroupedReports(pageMetafile, pageGroupedReportReferences);

    for (const buildMetric of pageMetafile.buildMetrics?.components ?? []) {
      const chunkReports = includeChunks
        ? await collectChunkReportsForBuildMetric({
            assetsDir,
            buildMetric,
            createChunkAnalysisTarget,
            executions,
            getOrCreateReportReference,
            groupBy,
            logger,
            outDir,
            pageGroupedReportReferenceMap,
            resolveChunkContent,
          })
        : {};
      const moduleReports = includeModules
        ? await collectModuleReportsForBuildMetric({
            assetsDir,
            buildMetric,
            createModuleAnalysisTarget,
            executions,
            getOrCreateReportReference,
            groupBy,
            logger,
            outDir,
            pageGroupedReportReferenceMap,
            resolveModuleContent,
          })
        : {};

      syncBuildMetricReports({
        buildMetric,
        chunkReports,
        moduleReports,
      });
    }
  }
};
