import type {
  PageMetafile,
  PageMetafileManifest,
  SiteDevToolsAiBuildReportReference,
} from '#dep-types/page';
import fs from 'node:fs';
import { basename, join } from 'pathe';
import type {
  SiteDevToolsAiAnalysisTarget,
  SiteDevToolsAiArtifactContext,
  SiteDevToolsAiArtifactKind,
  SiteDevToolsAiBuildReport,
} from '../../shared/site-devtools-ai';
import {
  createSiteDevToolsAiArtifactHeaderItems,
  createSiteDevToolsAiBundleSummaryItems,
  createSiteDevToolsAiChunkResourceItems,
  createSiteDevToolsAiModuleItems,
  createSiteDevToolsAiResolvedSourceState,
  getSiteDevToolsAiModuleReportKey,
  inferSiteDevToolsAiLanguage,
} from '../../shared/site-devtools-ai';
import { PAGE_METAFILE_ASSET_DIR } from '../page-metafile-shared';
import {
  readSiteDevToolsTextArtifact,
  resolveSiteDevToolsOutputAssetPath,
} from './shared';

type BuildMetric = NonNullable<
  PageMetafile['buildMetrics']
>['components'][number];
type BuildMetricModule = BuildMetric['modules'][number];
type BuildMetricFile = BuildMetric['files'][number];

const DEFAULT_ASSETS_DIR = 'assets';

export interface SiteDevToolsBuildDataOptions {
  assetsDir?: string;
  outDir: string;
}

export interface SiteDevToolsBuildOverview {
  assetsDir: string;
  buildId: string;
  componentCount: number;
  hasAiReports: boolean;
  manifestFilePath: string;
  pageCount: number;
  schemaVersion: number;
  totalBundleBytes: number;
}

export interface SiteDevToolsBuildPageSummary {
  componentCount: number;
  cssBundleCount: number;
  hasAiReports: boolean;
  loaderScript: string;
  metafileFile: string;
  modulePreloadCount: number;
  pageId: string;
  ssrInjectScript: string;
  totalBundleBytes: number;
}

export interface SiteDevToolsBuildComponentSummary {
  component: BuildMetric;
  componentName: string;
  pageId: string;
}

export interface SiteDevToolsBuildArtifactSnapshot {
  artifactKey: string;
  artifactKind: SiteDevToolsAiArtifactKind;
  artifactLabel: string;
  bytes?: number;
  componentName: string;
  context: SiteDevToolsAiArtifactContext;
  displayPath: string;
  language: string;
  pageId: string;
}

export interface SiteDevToolsBuildReportPayload {
  artifactKey: string;
  artifactKind: SiteDevToolsAiAnalysisTarget['artifactKind'];
  componentName: string;
  pageId: string;
  reference: SiteDevToolsAiBuildReportReference;
  report: SiteDevToolsAiBuildReport;
}

const isPageMetafileManifest = (
  value: unknown,
): value is PageMetafileManifest =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'buildId' in value &&
      typeof value.buildId === 'string' &&
      'schemaVersion' in value &&
      typeof value.schemaVersion === 'number' &&
      'pages' in value &&
      value.pages &&
      typeof value.pages === 'object',
  );

const isPageMetafile = (value: unknown): value is PageMetafile =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'loaderScript' in value &&
      typeof value.loaderScript === 'string' &&
      'modulePreloads' in value &&
      Array.isArray(value.modulePreloads) &&
      'cssBundlePaths' in value &&
      Array.isArray(value.cssBundlePaths) &&
      'ssrInjectScript' in value &&
      typeof value.ssrInjectScript === 'string',
  );

const isSiteDevToolsAiBuildReport = (
  value: unknown,
): value is SiteDevToolsAiBuildReport =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'generatedAt' in value &&
      typeof value.generatedAt === 'string' &&
      'prompt' in value &&
      typeof value.prompt === 'string' &&
      'provider' in value &&
      typeof value.provider === 'string' &&
      'reportId' in value &&
      typeof value.reportId === 'string' &&
      'reportLabel' in value &&
      typeof value.reportLabel === 'string' &&
      'result' in value &&
      typeof value.result === 'string' &&
      'target' in value &&
      value.target &&
      typeof value.target === 'object',
  );

interface SiteDevToolsBuildManifestInfo {
  filePath: string;
  payload: PageMetafileManifest;
}

interface SiteDevToolsBuildPageRecord {
  filePath: string;
  metafile: PageMetafile;
  pageId: string;
  publicPath: string;
}

interface SiteDevToolsBuildArtifactMatch {
  artifactKey: string;
  buildMetric: BuildMetric;
  bytes?: number;
  chunkFile: string;
  fileMetric?: BuildMetricFile;
  kind: SiteDevToolsAiArtifactKind;
  moduleMetric?: BuildMetricModule;
  pageId: string;
}

const countBuildReportReferences = (
  references?: Record<string, SiteDevToolsAiBuildReportReference[]>,
) =>
  Object.values(references ?? {}).reduce(
    (count, reportReferences) => count + reportReferences.length,
    0,
  );

const hasComponentAiReports = (component: BuildMetric) =>
  countBuildReportReferences(component.aiReports?.chunkReports) > 0 ||
  countBuildReportReferences(component.aiReports?.moduleReports) > 0;

const hasPageAiReports = (pageMetafile: PageMetafile) =>
  (pageMetafile.buildMetrics?.aiReports?.length ?? 0) > 0 ||
  (pageMetafile.buildMetrics?.components ?? []).some((component) =>
    hasComponentAiReports(component),
  );

const createMissingBuildDataError = (message: string): Error => {
  const error = new Error(message);
  error.name = 'SiteDevToolsBuildDataError';
  return error;
};

export const resolveSiteDevToolsBuildOutputAssetPath: typeof resolveSiteDevToolsOutputAssetPath =
  resolveSiteDevToolsOutputAssetPath;

export const getSiteDevToolsBuildModuleDisplayPath = (moduleMetric: {
  file: string;
  id: string;
  sourceAssetFile?: string;
  sourcePath?: string;
}): string =>
  !moduleMetric.sourceAssetFile &&
  !moduleMetric.sourcePath &&
  moduleMetric.id.startsWith('\0')
    ? moduleMetric.id.replace(/^\0+/, '').replace(/\?.*$/, '') ||
      moduleMetric.file
    : moduleMetric.sourcePath ||
      moduleMetric.sourceAssetFile ||
      moduleMetric.file ||
      moduleMetric.id;

const resolveModuleSourceBytes = ({
  assetsDir,
  cache,
  moduleMetric,
  outDir,
}: {
  assetsDir: string;
  cache: Map<string, number | null>;
  moduleMetric: BuildMetricModule & {
    isGeneratedVirtualModule?: boolean;
  };
  outDir: string;
}): number | null => {
  const cacheKey =
    moduleMetric.sourcePath || moduleMetric.sourceAssetFile || moduleMetric.id;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  let sourceBytes: number | null = null;

  if (moduleMetric.sourcePath) {
    const content = readSiteDevToolsTextArtifact(moduleMetric.sourcePath);

    if (content) {
      sourceBytes = Buffer.byteLength(content);
    }
  }

  if (sourceBytes === null && moduleMetric.sourceAssetFile) {
    const sourceAssetPath = resolveSiteDevToolsBuildOutputAssetPath({
      assetsDir,
      outDir,
      publicPath: moduleMetric.sourceAssetFile,
    });
    const content = readSiteDevToolsTextArtifact(sourceAssetPath);

    if (content) {
      sourceBytes = Buffer.byteLength(content);
    }
  }

  cache.set(cacheKey, sourceBytes);
  return sourceBytes;
};

export const createSiteDevToolsBuildArtifactContext = ({
  artifactHeaderItems,
  assetsDir,
  buildMetric,
  currentChunkFile,
  currentModuleKey,
  outDir,
  pageId,
  resourceType,
}: {
  artifactHeaderItems: NonNullable<
    SiteDevToolsAiAnalysisTarget['context']
  >['artifactHeaderItems'];
  assetsDir: string;
  buildMetric: BuildMetric;
  currentChunkFile: string;
  currentModuleKey?: string;
  outDir: string;
  pageId: string;
  resourceType: 'asset' | 'css' | 'js';
}): SiteDevToolsAiArtifactContext => {
  const sourceSizeCache = new Map<string, number | null>();

  return {
    artifactHeaderItems,
    bundleSummaryItems: createSiteDevToolsAiBundleSummaryItems({
      estimatedAssetBytes: buildMetric.estimatedAssetBytes,
      estimatedCssBytes: buildMetric.estimatedCssBytes,
      estimatedJsBytes: buildMetric.estimatedJsBytes,
      estimatedTotalBytes: buildMetric.estimatedTotalBytes,
    }),
    chunkResourceItems: createSiteDevToolsAiChunkResourceItems({
      currentFile: currentChunkFile,
      files: buildMetric.files,
      modules: buildMetric.modules,
      totalEstimatedBytes: buildMetric.estimatedTotalBytes,
    }),
    componentName: buildMetric.componentName,
    moduleItems: createSiteDevToolsAiModuleItems({
      currentChunkFile,
      currentModuleKey,
      modules: buildMetric.modules,
      resolveSourceState: (moduleMetric) =>
        createSiteDevToolsAiResolvedSourceState({
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
    pageId,
    renderId: null,
  };
};

const createChunkArtifactSnapshot = ({
  assetsDir,
  buildMetric,
  chunkFile,
  chunkType,
  outDir,
  pageId,
  bytes,
}: {
  assetsDir: string;
  buildMetric: BuildMetric;
  bytes: number;
  chunkFile: string;
  chunkType: 'asset' | 'css' | 'js';
  outDir: string;
  pageId: string;
}): SiteDevToolsBuildArtifactSnapshot => ({
  artifactKey: chunkFile,
  artifactKind: 'bundle-chunk',
  artifactLabel: basename(chunkFile) || chunkFile,
  bytes,
  componentName: buildMetric.componentName,
  context: createSiteDevToolsBuildArtifactContext({
    artifactHeaderItems: createSiteDevToolsAiArtifactHeaderItems({
      artifactKind: 'bundle-chunk',
      bytes,
      displayPath: chunkFile,
      resourceType: chunkType,
    }),
    assetsDir,
    buildMetric,
    currentChunkFile: chunkFile,
    outDir,
    pageId,
    resourceType: chunkType,
  }),
  displayPath: chunkFile,
  language: inferSiteDevToolsAiLanguage(chunkFile),
  pageId,
});

const createModuleArtifactSnapshot = ({
  assetsDir,
  buildMetric,
  moduleMetric,
  outDir,
  pageId,
}: {
  assetsDir: string;
  buildMetric: BuildMetric;
  moduleMetric: BuildMetricModule;
  outDir: string;
  pageId: string;
}): SiteDevToolsBuildArtifactSnapshot => {
  const moduleKey = getSiteDevToolsAiModuleReportKey(
    moduleMetric.file,
    moduleMetric.id,
  );
  const displayPath = getSiteDevToolsBuildModuleDisplayPath(moduleMetric);
  const resourceType =
    buildMetric.files.find(
      (fileMetric) => fileMetric.file === moduleMetric.file,
    )?.type ?? 'js';

  return {
    artifactKey: moduleKey,
    artifactKind: 'bundle-module',
    artifactLabel: basename(displayPath) || moduleMetric.id,
    bytes: moduleMetric.bytes,
    componentName: buildMetric.componentName,
    context: createSiteDevToolsBuildArtifactContext({
      artifactHeaderItems: createSiteDevToolsAiArtifactHeaderItems({
        artifactKind: 'bundle-module',
        displayPath,
        language: inferSiteDevToolsAiLanguage(displayPath),
      }),
      assetsDir,
      buildMetric,
      currentChunkFile: moduleMetric.file,
      currentModuleKey: moduleKey,
      outDir,
      pageId,
      resourceType,
    }),
    displayPath,
    language: inferSiteDevToolsAiLanguage(displayPath),
    pageId,
  };
};

export class SiteDevToolsBuildDataStore {
  private readonly assetsDir: string;
  private manifestInfo: SiteDevToolsBuildManifestInfo | null = null;
  private readonly outDir: string;
  private readonly pageCache = new Map<string, SiteDevToolsBuildPageRecord>();
  private reportCache: SiteDevToolsBuildReportPayload[] | null = null;

  public constructor(options: SiteDevToolsBuildDataOptions) {
    this.assetsDir = options.assetsDir || DEFAULT_ASSETS_DIR;
    this.outDir = options.outDir;
  }

  private getManifestDirectoryPath(): string {
    return join(this.outDir, this.assetsDir, PAGE_METAFILE_ASSET_DIR);
  }

  private ensureManifestInfo(): SiteDevToolsBuildManifestInfo {
    if (this.manifestInfo) {
      return this.manifestInfo;
    }

    const manifestDirectoryPath = this.getManifestDirectoryPath();

    if (!fs.existsSync(manifestDirectoryPath)) {
      throw createMissingBuildDataError(
        `No page metafile directory found at ${manifestDirectoryPath}. Build the docs site first.`,
      );
    }

    const manifestFileName = fs
      .readdirSync(manifestDirectoryPath)
      .filter((fileName) => /^manifest\.[\da-f]+\.json$/i.test(fileName))
      .toSorted()
      .at(-1);

    if (!manifestFileName) {
      throw createMissingBuildDataError(
        `No page metafile manifest found in ${manifestDirectoryPath}.`,
      );
    }

    const filePath = join(manifestDirectoryPath, manifestFileName);
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;

    if (!isPageMetafileManifest(payload)) {
      throw createMissingBuildDataError(
        `Invalid page metafile manifest at ${filePath}.`,
      );
    }

    const manifestInfo: SiteDevToolsBuildManifestInfo = {
      filePath,
      payload,
    };
    this.manifestInfo = manifestInfo;

    return manifestInfo;
  }

  private loadPageRecord(pageId: string): SiteDevToolsBuildPageRecord {
    const cachedPageRecord = this.pageCache.get(pageId);

    if (cachedPageRecord) {
      return cachedPageRecord;
    }

    const manifestInfo = this.ensureManifestInfo();
    const manifestEntry = manifestInfo.payload.pages[pageId];

    if (!manifestEntry) {
      throw createMissingBuildDataError(`Page "${pageId}" was not found.`);
    }

    const filePath = resolveSiteDevToolsBuildOutputAssetPath({
      assetsDir: this.assetsDir,
      outDir: this.outDir,
      publicPath: manifestEntry.file,
    });

    if (!fs.existsSync(filePath)) {
      throw createMissingBuildDataError(
        `Page metafile for "${pageId}" was not found at ${filePath}.`,
      );
    }

    const metafile = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;

    if (!isPageMetafile(metafile)) {
      throw createMissingBuildDataError(
        `Invalid page metafile payload for "${pageId}".`,
      );
    }

    const pageRecord: SiteDevToolsBuildPageRecord = {
      filePath,
      metafile,
      pageId,
      publicPath: manifestEntry.file,
    };

    this.pageCache.set(pageId, pageRecord);
    return pageRecord;
  }

  private getAllPageRecords(): SiteDevToolsBuildPageRecord[] {
    const manifestInfo = this.ensureManifestInfo();

    return Object.keys(manifestInfo.payload.pages).map((pageId) =>
      this.loadPageRecord(pageId),
    );
  }

  private createPageSummary(
    pageRecord: SiteDevToolsBuildPageRecord,
  ): SiteDevToolsBuildPageSummary {
    const components = pageRecord.metafile.buildMetrics?.components ?? [];

    return {
      componentCount: components.length,
      cssBundleCount: pageRecord.metafile.cssBundlePaths.length,
      hasAiReports: hasPageAiReports(pageRecord.metafile),
      loaderScript: pageRecord.metafile.loaderScript,
      metafileFile: pageRecord.publicPath,
      modulePreloadCount: pageRecord.metafile.modulePreloads.length,
      pageId: pageRecord.pageId,
      ssrInjectScript: pageRecord.metafile.ssrInjectScript,
      totalBundleBytes:
        pageRecord.metafile.buildMetrics?.totalEstimatedComponentBytes ?? 0,
    };
  }

  private findComponent(pageId: string, componentName: string): BuildMetric {
    const pageRecord = this.loadPageRecord(pageId);
    const component = pageRecord.metafile.buildMetrics?.components.find(
      (buildMetric) => buildMetric.componentName === componentName,
    );

    if (!component) {
      throw createMissingBuildDataError(
        `Component "${componentName}" was not found on page "${pageId}".`,
      );
    }

    return component;
  }

  private findArtifactMatch({
    artifactKind,
    displayPath,
    file,
    moduleId,
  }: {
    artifactKind: SiteDevToolsAiArtifactKind;
    displayPath?: string;
    file?: string;
    moduleId?: string;
  }): SiteDevToolsBuildArtifactMatch {
    const matches: SiteDevToolsBuildArtifactMatch[] = [];

    for (const pageRecord of this.getAllPageRecords()) {
      for (const buildMetric of pageRecord.metafile.buildMetrics?.components ??
        []) {
        if (artifactKind === 'bundle-chunk') {
          for (const fileMetric of buildMetric.files) {
            if (!displayPath || fileMetric.file !== displayPath) {
              continue;
            }

            matches.push({
              artifactKey: fileMetric.file,
              buildMetric,
              bytes: fileMetric.bytes,
              chunkFile: fileMetric.file,
              fileMetric,
              kind: artifactKind,
              pageId: pageRecord.pageId,
            });
          }

          continue;
        }

        for (const moduleMetric of buildMetric.modules) {
          const resolvedDisplayPath =
            getSiteDevToolsBuildModuleDisplayPath(moduleMetric);
          const moduleMatches =
            (file && moduleId
              ? moduleMetric.file === file && moduleMetric.id === moduleId
              : false) ||
            (displayPath ? resolvedDisplayPath === displayPath : false);

          if (!moduleMatches) {
            continue;
          }

          matches.push({
            artifactKey: getSiteDevToolsAiModuleReportKey(
              moduleMetric.file,
              moduleMetric.id,
            ),
            buildMetric,
            bytes: moduleMetric.bytes,
            chunkFile: moduleMetric.file,
            kind: artifactKind,
            moduleMetric,
            pageId: pageRecord.pageId,
          });
        }
      }
    }

    if (matches.length === 0) {
      throw createMissingBuildDataError(
        artifactKind === 'bundle-chunk'
          ? `Chunk artifact "${displayPath || ''}" was not found.`
          : `Module artifact was not found for ${displayPath || `${file || ''}::${moduleId || ''}`}.`,
      );
    }

    if (matches.length > 1) {
      throw createMissingBuildDataError(
        `Artifact lookup is ambiguous. Matched: ${matches
          .map(
            (match) =>
              `${match.pageId}::${match.buildMetric.componentName}::${match.artifactKey}`,
          )
          .join(', ')}`,
      );
    }

    return matches[0];
  }

  private ensureReportCache(): SiteDevToolsBuildReportPayload[] {
    if (this.reportCache) {
      return this.reportCache;
    }

    const reports: SiteDevToolsBuildReportPayload[] = [];

    for (const pageRecord of this.getAllPageRecords()) {
      for (const reference of pageRecord.metafile.buildMetrics?.aiReports ??
        []) {
        reports.push({
          artifactKey: pageRecord.pageId,
          artifactKind: 'page-build',
          componentName: pageRecord.pageId,
          pageId: pageRecord.pageId,
          reference,
          report: this.readBuildReport(reference),
        });
      }

      for (const buildMetric of pageRecord.metafile.buildMetrics?.components ??
        []) {
        for (const [artifactKey, references] of Object.entries(
          buildMetric.aiReports?.chunkReports ?? {},
        )) {
          for (const reference of references) {
            reports.push({
              artifactKey,
              artifactKind: 'bundle-chunk',
              componentName: buildMetric.componentName,
              pageId: pageRecord.pageId,
              reference,
              report: this.readBuildReport(reference),
            });
          }
        }

        for (const [artifactKey, references] of Object.entries(
          buildMetric.aiReports?.moduleReports ?? {},
        )) {
          for (const reference of references) {
            reports.push({
              artifactKey,
              artifactKind: 'bundle-module',
              componentName: buildMetric.componentName,
              pageId: pageRecord.pageId,
              reference,
              report: this.readBuildReport(reference),
            });
          }
        }
      }
    }

    this.reportCache = reports;
    return reports;
  }

  private readBuildReport(
    reference: SiteDevToolsAiBuildReportReference,
  ): SiteDevToolsAiBuildReport {
    const filePath = resolveSiteDevToolsBuildOutputAssetPath({
      assetsDir: this.assetsDir,
      outDir: this.outDir,
      publicPath: reference.reportFile,
    });

    if (!fs.existsSync(filePath)) {
      throw createMissingBuildDataError(
        `Build report "${reference.reportId}" was not found at ${filePath}.`,
      );
    }

    const report = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;

    if (!isSiteDevToolsAiBuildReport(report)) {
      throw createMissingBuildDataError(
        `Invalid build report payload at ${filePath}.`,
      );
    }

    return report;
  }

  public getBuildOverview(): SiteDevToolsBuildOverview {
    const manifestInfo = this.ensureManifestInfo();
    const pageRecords = this.getAllPageRecords();
    const componentCount = pageRecords.reduce(
      (count, pageRecord) =>
        count + (pageRecord.metafile.buildMetrics?.components.length ?? 0),
      0,
    );
    const totalBundleBytes = pageRecords.reduce(
      (totalBytes, pageRecord) =>
        totalBytes +
        (pageRecord.metafile.buildMetrics?.totalEstimatedComponentBytes ?? 0),
      0,
    );

    return {
      assetsDir: this.assetsDir,
      buildId: manifestInfo.payload.buildId,
      componentCount,
      hasAiReports: pageRecords.some((pageRecord) =>
        hasPageAiReports(pageRecord.metafile),
      ),
      manifestFilePath: manifestInfo.filePath,
      pageCount: pageRecords.length,
      schemaVersion: manifestInfo.payload.schemaVersion,
      totalBundleBytes,
    };
  }

  public listPages(): SiteDevToolsBuildPageSummary[] {
    return this.getAllPageRecords().map((pageRecord) =>
      this.createPageSummary(pageRecord),
    );
  }

  public getPage(pageId: string): {
    page: PageMetafile;
    summary: SiteDevToolsBuildPageSummary;
  } {
    const pageRecord = this.loadPageRecord(pageId);

    return {
      page: pageRecord.metafile,
      summary: this.createPageSummary(pageRecord),
    };
  }

  public getComponent(
    pageId: string,
    componentName: string,
  ): SiteDevToolsBuildComponentSummary {
    return {
      component: this.findComponent(pageId, componentName),
      componentName,
      pageId,
    };
  }

  public getArtifact({
    artifactKind,
    displayPath,
    file,
    moduleId,
  }: {
    artifactKind: SiteDevToolsAiArtifactKind;
    displayPath?: string;
    file?: string;
    moduleId?: string;
  }): SiteDevToolsBuildArtifactSnapshot {
    const match = this.findArtifactMatch({
      artifactKind,
      displayPath,
      file,
      moduleId,
    });

    if (match.kind === 'bundle-chunk' && match.fileMetric) {
      return createChunkArtifactSnapshot({
        assetsDir: this.assetsDir,
        buildMetric: match.buildMetric,
        bytes: match.fileMetric.bytes,
        chunkFile: match.fileMetric.file,
        chunkType: match.fileMetric.type,
        outDir: this.outDir,
        pageId: match.pageId,
      });
    }

    if (match.kind === 'bundle-module' && match.moduleMetric) {
      return createModuleArtifactSnapshot({
        assetsDir: this.assetsDir,
        buildMetric: match.buildMetric,
        moduleMetric: match.moduleMetric,
        outDir: this.outDir,
        pageId: match.pageId,
      });
    }

    throw createMissingBuildDataError('Artifact lookup could not be resolved.');
  }

  public getBuildReport({
    artifactKey,
    reportId,
  }: {
    artifactKey?: string;
    reportId?: string;
  }): SiteDevToolsBuildReportPayload {
    const matches = this.ensureReportCache().filter((item) => {
      if (reportId && item.reference.reportId !== reportId) {
        return false;
      }

      if (artifactKey && item.artifactKey !== artifactKey) {
        return false;
      }

      return true;
    });

    if (matches.length === 0) {
      throw createMissingBuildDataError(
        `No build report matched ${reportId || artifactKey || 'the provided lookup'}.`,
      );
    }

    if (matches.length > 1) {
      throw createMissingBuildDataError(
        `Build report lookup is ambiguous. Matched: ${matches
          .map(
            (item) =>
              `${item.pageId}::${item.componentName}::${item.artifactKey}::${item.reference.provider}`,
          )
          .join(', ')}`,
      );
    }

    return matches[0];
  }
}
