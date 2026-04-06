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

interface BuildReportExecutionLike {
  provider: string;
  reportId: string;
  reportLabel: string;
}

interface BuildReportPagePlanLike<TCacheConfig = unknown> {
  cacheConfig: TCacheConfig | null;
  executions: readonly BuildReportExecutionLike[];
  includeChunks: boolean;
  includeModules: boolean;
}

interface CollectBuildReportReferencesOptions<
  TExecution extends BuildReportExecutionLike,
  TCacheConfig,
> {
  assetsDir: string;
  createPageAnalysisTarget: (options: {
    assetsDir: string;
    includeChunks: boolean;
    includeModules: boolean;
    outDir: string;
    pageId: string;
    pageMetafile: PageMetafile;
  }) => SiteDebugAiAnalysisTarget;
  getOrCreateReportReference: (options: {
    artifactKey: string;
    cacheConfig: TCacheConfig | null;
    execution: TExecution;
    target: SiteDebugAiAnalysisTarget;
  }) => Promise<SiteDebugAiBuildReportReference | null>;
  logger: {
    warn: (message: string) => void;
  };
  outDir: string;
  pageMetafiles: Record<string, PageMetafile>;
  pagePlans: Record<string, BuildReportPagePlanLike<TCacheConfig>>;
}

interface CollectPageReportReferencesResult<
  TExecution extends BuildReportExecutionLike,
> {
  reportEntries: (readonly [TExecution, SiteDebugAiBuildReportReference])[];
  warningMessages: string[];
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

const collectPageReportReferences = async <
  TExecution extends BuildReportExecutionLike,
  TCacheConfig,
>({
  assetsDir,
  createPageAnalysisTarget,
  executions,
  getOrCreateReportReference,
  outDir,
  pageId,
  pageMetafile,
  pagePlan,
}: {
  assetsDir: string;
  createPageAnalysisTarget: (options: {
    assetsDir: string;
    includeChunks: boolean;
    includeModules: boolean;
    outDir: string;
    pageId: string;
    pageMetafile: PageMetafile;
  }) => SiteDebugAiAnalysisTarget;
  executions: readonly TExecution[];
  getOrCreateReportReference: (options: {
    artifactKey: string;
    cacheConfig: TCacheConfig | null;
    execution: TExecution;
    target: SiteDebugAiAnalysisTarget;
  }) => Promise<SiteDebugAiBuildReportReference | null>;
  outDir: string;
  pageId: string;
  pageMetafile: PageMetafile;
  pagePlan: BuildReportPagePlanLike<TCacheConfig>;
}) => {
  const entries = await Promise.all(
    executions.map(async (execution) => {
      try {
        const reportReference = await getOrCreateReportReference({
          artifactKey: buildArtifactKey(execution, 'page-build', pageId),
          cacheConfig: pagePlan.cacheConfig,
          execution,
          target: createPageAnalysisTarget({
            assetsDir,
            includeChunks: pagePlan.includeChunks,
            includeModules: pagePlan.includeModules,
            outDir,
            pageId,
            pageMetafile,
          }),
        });

        return reportReference ? ([execution, reportReference] as const) : null;
      } catch (error) {
        return {
          errorMessage: `Failed to generate page AI report for ${pageId} (${execution.reportLabel}): ${formatBuildReportErrorMessage(error)}`,
        } as const;
      }
    }),
  );

  const warningMessages = entries.flatMap((entry) =>
    entry && 'errorMessage' in entry ? [entry.errorMessage] : [],
  );
  const reportEntries = filterResolvedExecutionReportEntries(
    entries.flatMap((entry) =>
      entry && 'errorMessage' in entry ? [] : [entry],
    ),
  );

  return {
    reportEntries,
    warningMessages,
  } satisfies CollectPageReportReferencesResult<TExecution>;
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

  delete pageMetafile.buildMetrics.aiReports;
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

const collectChunkReportsForBuildMetric = <
  TExecution extends BuildReportExecutionLike,
>({
  buildMetric,
  executions,
  pageGroupedReportReferenceMap,
}: {
  buildMetric: BuildMetric;
  executions: readonly TExecution[];
  pageGroupedReportReferenceMap: Map<
    TExecution,
    SiteDebugAiBuildReportReference
  >;
}) => {
  const chunkReports: Record<string, SiteDebugAiBuildReportReference[]> = {};

  for (const fileMetric of buildMetric.files) {
    appendPageGroupedArtifactReports({
      executions,
      pageGroupedReportReferenceMap,
      reportMap: chunkReports,
      reportMapKey: fileMetric.file,
    });
  }

  return chunkReports;
};

const collectModuleReportsForBuildMetric = <
  TExecution extends BuildReportExecutionLike,
>({
  buildMetric,
  executions,
  pageGroupedReportReferenceMap,
}: {
  buildMetric: BuildMetric;
  executions: readonly TExecution[];
  pageGroupedReportReferenceMap: Map<
    TExecution,
    SiteDebugAiBuildReportReference
  >;
}) => {
  const moduleReports: Record<string, SiteDebugAiBuildReportReference[]> = {};

  for (const moduleMetric of buildMetric.modules) {
    const moduleKey = getSiteDebugAiModuleReportKey(
      moduleMetric.file,
      moduleMetric.id,
    );

    appendPageGroupedArtifactReports({
      executions,
      pageGroupedReportReferenceMap,
      reportMap: moduleReports,
      reportMapKey: moduleKey,
    });
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
    delete buildMetric.aiReports;
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
  new Set([
    ...(pageMetafile.buildMetrics?.components ?? []).map(
      (component) => component.componentName,
    ),
    ...(pageMetafile.buildMetrics?.renderInstances ?? []).map(
      (renderInstance) => renderInstance.componentName,
    ),
    ...(pageMetafile.buildMetrics?.spaSyncEffects?.components ?? []).map(
      (component) => component.componentName,
    ),
  ]).size;

export const hasPageBuildAnalysisSignals = (
  pageMetafile: PageMetafile,
): boolean => getPageSupportedComponentCount(pageMetafile) > 0;

export const collectBuildReportReferencesForPageMetafiles = async <
  TExecution extends BuildReportExecutionLike,
  TCacheConfig,
>({
  assetsDir,
  createPageAnalysisTarget,
  getOrCreateReportReference,
  logger,
  outDir,
  pageMetafiles,
  pagePlans,
}: CollectBuildReportReferencesOptions<
  TExecution,
  TCacheConfig
>): Promise<void> => {
  const pageResults = await Promise.all(
    Object.entries(pageMetafiles).map(async ([pageId, pageMetafile]) => {
      const pagePlan = pagePlans[pageId];
      const pageGroupedResult = pagePlan
        ? await collectPageReportReferences({
            assetsDir,
            createPageAnalysisTarget,
            executions: pagePlan.executions as readonly TExecution[],
            getOrCreateReportReference,
            outDir,
            pageId,
            pageMetafile,
            pagePlan,
          })
        : {
            reportEntries: [],
            warningMessages: [],
          };

      return {
        pageGroupedReportReferences: pageGroupedResult.reportEntries,
        pageMetafile,
        pagePlan,
        warningMessages: pageGroupedResult.warningMessages,
      };
    }),
  );

  for (const pageResult of pageResults) {
    for (const warningMessage of pageResult.warningMessages) {
      logger.warn(warningMessage);
    }

    const pageGroupedReportReferenceMap = new Map(
      pageResult.pageGroupedReportReferences,
    );

    syncPageGroupedReports(
      pageResult.pageMetafile,
      pageResult.pageGroupedReportReferences,
    );

    for (const buildMetric of pageResult.pageMetafile.buildMetrics
      ?.components ?? []) {
      const chunkReports = pageResult.pagePlan?.includeChunks
        ? collectChunkReportsForBuildMetric({
            buildMetric,
            executions: pageResult.pagePlan.executions as readonly TExecution[],
            pageGroupedReportReferenceMap,
          })
        : {};
      const moduleReports = pageResult.pagePlan?.includeModules
        ? collectModuleReportsForBuildMetric({
            buildMetric,
            executions: pageResult.pagePlan.executions as readonly TExecution[],
            pageGroupedReportReferenceMap,
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
