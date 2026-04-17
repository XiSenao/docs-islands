import type { PageMetafile } from '#dep-types/page';
import fs from 'node:fs';
import { join } from 'pathe';
import { getPagePathByPathname } from '../../shared/path';
import type { SiteDevToolsAiAnalysisTarget } from '../../shared/site-devtools-ai';
import {
  createSiteDevToolsAiChunkResourceItems,
  createSiteDevToolsAiModuleItems,
  createSiteDevToolsAiPageComponentModuleItems,
  createSiteDevToolsAiResolvedSourceState,
  formatSiteDevToolsAiBytes,
} from '../../shared/site-devtools-ai';
import {
  readSiteDevToolsTextArtifact,
  resolveSiteDevToolsOutputAssetPath,
} from './shared';

type BuildMetric = NonNullable<
  NonNullable<PageMetafile['buildMetrics']>['components'][number]
>;
type BuildMetricFile = BuildMetric['files'][number];
type BuildMetricModule = BuildMetric['modules'][number] & {
  isGeneratedVirtualModule?: boolean;
};

const PAGE_GROUPED_MODULE_LIMIT = 18;

const resolveModuleSourceBytes = ({
  assetsDir,
  cache,
  moduleMetric,
  outDir,
}: {
  assetsDir: string;
  cache: Map<string, number | null>;
  moduleMetric: BuildMetricModule;
  outDir: string;
}) => {
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
    const sourceAssetPath = resolveSiteDevToolsOutputAssetPath({
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

const resolveOutputAssetBytes = ({
  assetsDir,
  outDir,
  publicPath,
}: {
  assetsDir: string;
  outDir: string;
  publicPath: string;
}) => {
  const assetPath = resolveSiteDevToolsOutputAssetPath({
    assetsDir,
    outDir,
    publicPath,
  });

  if (!fs.existsSync(assetPath)) {
    return null;
  }

  return fs.statSync(assetPath).size;
};

const createBuildMetricSourceStateResolver =
  ({
    assetsDir,
    outDir,
    sourceSizeCache,
  }: {
    assetsDir: string;
    outDir: string;
    sourceSizeCache: Map<string, number | null>;
  }) =>
  (moduleMetric: BuildMetricModule) =>
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
    });

const sortUniqueDirectiveList = (values: Iterable<string>) =>
  [...new Set(values)].toSorted((left, right) => left.localeCompare(right));

const formatAssetMetricList = (items: BuildMetricFile[] = []): string =>
  items.length > 0
    ? items
        .map(
          (item) =>
            `${item.file} (${formatSiteDevToolsAiBytes(item.bytes) || '0 B'})`,
        )
        .join(', ')
    : 'None';

const formatSpaSyncSideEffectSummary = ({
  blockingCssFiles,
  embeddedHtmlBytes,
  pageClientChunkFile,
}: {
  blockingCssFiles: BuildMetricFile[];
  embeddedHtmlBytes: number;
  pageClientChunkFile?: string | null;
}): string => {
  const embeddedHtmlLabel =
    formatSiteDevToolsAiBytes(embeddedHtmlBytes) || '0 B';
  const htmlTargetText = pageClientChunkFile
    ? `injects ${embeddedHtmlLabel} of pre-rendered HTML into ${pageClientChunkFile}`
    : `injects ${embeddedHtmlLabel} of pre-rendered HTML into the page client chunk`;

  if (blockingCssFiles.length === 0) {
    return `${htmlTargetText} and does not require additional blocking CSS before the page content can render during SPA route transitions.`;
  }

  return `${htmlTargetText} and waits for ${blockingCssFiles.length} blocking CSS file(s) before the page content can render during SPA route transitions: ${formatAssetMetricList(blockingCssFiles)}.`;
};

export const resolvePageClientChunkPublicPath = ({
  assetsDir,
  outDir,
  pageId,
  pageMetafile,
}: {
  assetsDir: string;
  outDir: string;
  pageId: string;
  pageMetafile: PageMetafile;
}): string | undefined => {
  const explicitPageClientChunkFile =
    pageMetafile.buildMetrics?.spaSyncEffects?.pageClientChunkFile;

  if (explicitPageClientChunkFile) {
    return explicitPageClientChunkFile;
  }

  const assetsOutputDir = join(outDir, assetsDir);

  if (
    !fs.existsSync(assetsOutputDir) ||
    !fs.statSync(assetsOutputDir).isDirectory()
  ) {
    return undefined;
  }

  const pathnameCandidates = [pageMetafile.pathname, pageId].filter(
    (value): value is string => Boolean(value),
  );
  const stemCandidates = [
    ...new Set(
      pathnameCandidates.map((pathname) =>
        getPagePathByPathname(pathname, true)
          .replace(/^\/+/, '')
          .replaceAll('/', '_'),
      ),
    ),
  ];

  if (stemCandidates.length === 0) {
    return undefined;
  }

  const matchingChunkFiles = fs
    .readdirSync(assetsOutputDir)
    .filter(
      (fileName) =>
        fileName.endsWith('.js') &&
        !fileName.endsWith('.lean.js') &&
        stemCandidates.some((stem) => fileName.startsWith(`${stem}.`)),
    )
    .map((fileName) => ({
      fileName,
      mtimeMs: fs.statSync(join(assetsOutputDir, fileName)).mtimeMs,
    }))
    .toSorted(
      (left, right) =>
        right.mtimeMs - left.mtimeMs ||
        left.fileName.localeCompare(right.fileName),
    );

  const matchingChunkFile = matchingChunkFiles[0]?.fileName;

  return matchingChunkFile
    ? join('/', assetsDir, matchingChunkFile)
    : undefined;
};

export const getPageCompositionDetailLabel = ({
  includeChunks,
  includeModules,
}: {
  includeChunks: boolean;
  includeModules: boolean;
}): string =>
  includeChunks && includeModules
    ? 'component -> chunks -> modules'
    : includeChunks
      ? 'component -> chunks'
      : includeModules
        ? 'component -> modules'
        : 'component summary only';

export const collectPageRuntimeFiles = ({
  assetsDir,
  outDir,
  pageMetafile,
  seedFiles = [],
}: {
  assetsDir: string;
  outDir: string;
  pageMetafile: PageMetafile;
  seedFiles?: BuildMetricFile[];
}): BuildMetricFile[] => {
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
      existingMetric.bytes = Math.max(existingMetric.bytes, resolvedBytes);
      return;
    }

    fileMetricByPath.set(publicPath, {
      bytes: resolvedBytes,
      file: publicPath,
      type,
    });
  };

  for (const seedFile of seedFiles) {
    pushFileMetric(seedFile.file, seedFile.type, seedFile.bytes);
  }

  for (const loaderFile of pageMetafile.buildMetrics?.loader?.files ?? []) {
    pushFileMetric(loaderFile.file, loaderFile.type, loaderFile.bytes);
  }

  for (const ssrInjectFile of pageMetafile.buildMetrics?.ssrInject?.files ??
    []) {
    pushFileMetric(ssrInjectFile.file, ssrInjectFile.type, ssrInjectFile.bytes);
  }

  pushFileMetric(
    pageMetafile.loaderScript,
    'js',
    pageMetafile.buildMetrics?.loader?.totalBytes,
  );
  pushFileMetric(
    pageMetafile.ssrInjectScript,
    'js',
    pageMetafile.buildMetrics?.ssrInject?.totalBytes,
  );
  pushFileMetric(
    pageMetafile.buildMetrics?.spaSyncEffects?.pageClientChunkFile,
    'js',
  );

  for (const modulePreload of pageMetafile.modulePreloads) {
    pushFileMetric(modulePreload, 'js');
  }

  for (const cssBundlePath of pageMetafile.cssBundlePaths) {
    pushFileMetric(cssBundlePath, 'css');
  }

  return [...fileMetricByPath.values()];
};

export const createPageModuleItems = ({
  assetsDir,
  modules,
  outDir,
}: {
  assetsDir: string;
  modules: BuildMetricModule[];
  outDir: string;
}): NonNullable<
  NonNullable<SiteDevToolsAiAnalysisTarget['context']>['moduleItems']
> => {
  const sourceSizeCache = new Map<string, number | null>();
  return createSiteDevToolsAiPageComponentModuleItems({
    modules: modules
      .toSorted((left, right) => right.bytes - left.bytes)
      .slice(0, PAGE_GROUPED_MODULE_LIMIT),
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
  });
};

export const createPageComponentItems = ({
  assetsDir,
  components,
  includeChunks,
  includeModules,
  outDir,
  pageMetafile,
}: {
  assetsDir: string;
  components: BuildMetric[];
  includeChunks: boolean;
  includeModules: boolean;
  outDir: string;
  pageMetafile: PageMetafile;
}): NonNullable<
  NonNullable<SiteDevToolsAiAnalysisTarget['context']>['pageComponentItems']
> => {
  const sourceSizeCache = new Map<string, number | null>();
  const resolveSourceState = createBuildMetricSourceStateResolver({
    assetsDir,
    outDir,
    sourceSizeCache,
  });
  const buildMetricByComponentName = new Map(
    components.map((component) => [component.componentName, component]),
  );
  const renderInstances = pageMetafile.buildMetrics?.renderInstances ?? [];
  const renderInstancesByComponent = new Map<string, typeof renderInstances>();

  for (const renderInstance of renderInstances) {
    const entries =
      renderInstancesByComponent.get(renderInstance.componentName) ?? [];
    entries.push(renderInstance);
    renderInstancesByComponent.set(renderInstance.componentName, entries);
  }

  const spaSyncEffectsByComponentName = new Map(
    (pageMetafile.buildMetrics?.spaSyncEffects?.components ?? []).map(
      (component) => [component.componentName, component],
    ),
  );
  const orderedComponentNames = [
    ...new Set([
      ...components.map((component) => component.componentName),
      ...renderInstances.map((renderInstance) => renderInstance.componentName),
      ...(pageMetafile.buildMetrics?.spaSyncEffects?.components ?? []).map(
        (component) => component.componentName,
      ),
    ]),
  ].toSorted((left, right) => {
    const leftSequence =
      renderInstancesByComponent.get(left)?.[0]?.sequence ??
      Number.POSITIVE_INFINITY;
    const rightSequence =
      renderInstancesByComponent.get(right)?.[0]?.sequence ??
      Number.POSITIVE_INFINITY;

    if (leftSequence !== rightSequence) {
      return leftSequence - rightSequence;
    }

    return left.localeCompare(right);
  });

  return orderedComponentNames.map((componentName) => {
    const buildMetric = buildMetricByComponentName.get(componentName);
    const componentRenderInstances =
      renderInstancesByComponent.get(componentName) ?? [];
    const spaSyncEffect = spaSyncEffectsByComponentName.get(componentName);
    const sourcePath =
      buildMetric?.sourcePath ||
      componentRenderInstances[0]?.sourcePath ||
      null;
    const renderDirectives = sortUniqueDirectiveList([
      ...(buildMetric?.renderDirectives ?? []),
      ...componentRenderInstances.map(
        (renderInstance) => renderInstance.renderDirective,
      ),
      ...(spaSyncEffect?.renderDirectives ?? []),
    ]);

    return {
      ...(sourcePath ? { sourcePath } : {}),
      ...(includeChunks && buildMetric
        ? {
            chunkItems: createSiteDevToolsAiChunkResourceItems({
              files: buildMetric.files,
              modules: buildMetric.modules,
              totalEstimatedBytes: buildMetric.estimatedTotalBytes,
            }).map((chunkItem) => {
              const resourceType =
                buildMetric.files.find(
                  (fileMetric) => fileMetric.file === chunkItem.file,
                )?.type ?? 'js';

              return {
                ...chunkItem,
                ...(includeModules
                  ? {
                      modules: createSiteDevToolsAiModuleItems({
                        currentChunkFile: chunkItem.file,
                        modules: buildMetric.modules,
                        resolveSourceState,
                        resourceType,
                      }),
                    }
                  : {}),
              };
            }),
          }
        : {}),
      ...(includeModules && !includeChunks && buildMetric
        ? {
            moduleItems: createSiteDevToolsAiPageComponentModuleItems({
              modules: buildMetric.modules,
              resolveSourceState,
            }),
          }
        : {}),
      componentName,
      renderDirectives,
      summaryItems: [
        {
          label: 'Total',
          value:
            formatSiteDevToolsAiBytes(buildMetric?.estimatedTotalBytes) ||
            '0 B',
        },
        {
          label: 'JS',
          value:
            formatSiteDevToolsAiBytes(buildMetric?.estimatedJsBytes) || '0 B',
        },
        {
          label: 'CSS',
          value:
            formatSiteDevToolsAiBytes(buildMetric?.estimatedCssBytes) || '0 B',
        },
        {
          label: 'Asset',
          value:
            formatSiteDevToolsAiBytes(buildMetric?.estimatedAssetBytes) ||
            '0 B',
        },
        ...(buildMetric
          ? []
          : [
              {
                label: 'Bundle Mode',
                value: 'No dedicated client component bundle emitted',
              },
            ]),
        {
          label: 'Render Instances',
          value: String(componentRenderInstances.length),
        },
        {
          label: 'spa:sync-render Renders',
          value: String(
            componentRenderInstances.filter(
              (renderInstance) => renderInstance.useSpaSyncRender,
            ).length,
          ),
        },
      ],
    };
  });
};

export const createPageSpaSyncSummaryItems = ({
  pageClientChunkFile,
  pageMetafile,
}: {
  pageClientChunkFile?: string;
  pageMetafile: PageMetafile;
}): NonNullable<
  NonNullable<
    SiteDevToolsAiAnalysisTarget['context']
  >['pageSpaSyncSummaryItems']
> => {
  const spaSyncEffects = pageMetafile.buildMetrics?.spaSyncEffects;

  if (!spaSyncEffects) {
    return [];
  }

  return [
    {
      label: 'Enabled Components',
      value: String(spaSyncEffects.enabledComponentCount),
    },
    {
      label: 'Enabled Renders',
      value: String(spaSyncEffects.enabledRenderCount),
    },
    ...(pageClientChunkFile
      ? [
          {
            label: 'HTML Patch Target',
            value: pageClientChunkFile,
          },
        ]
      : []),
    {
      label: 'Embedded HTML',
      value:
        formatSiteDevToolsAiBytes(spaSyncEffects.totalEmbeddedHtmlBytes) ||
        '0 B',
    },
    {
      label: 'Blocking CSS',
      value: `${spaSyncEffects.totalBlockingCssCount} file(s) · ${
        formatSiteDevToolsAiBytes(spaSyncEffects.totalBlockingCssBytes) || '0 B'
      }`,
    },
    {
      label: 'Blocking CSS Files',
      value: formatAssetMetricList(
        spaSyncEffects.components.flatMap(
          (component) => component.blockingCssFiles,
        ),
      ),
    },
    {
      label: 'CSS Loading Runtime',
      value: spaSyncEffects.usesCssLoadingRuntime ? 'Required' : 'Not required',
    },
    ...(pageMetafile.loaderScript
      ? [
          {
            label: 'Loader Script',
            value: pageMetafile.loaderScript,
          },
        ]
      : []),
  ];
};

export const createPageSpaSyncComponentItems = ({
  pageClientChunkFile,
  pageMetafile,
}: {
  pageClientChunkFile?: string;
  pageMetafile: PageMetafile;
}): NonNullable<
  NonNullable<
    SiteDevToolsAiAnalysisTarget['context']
  >['pageSpaSyncComponentItems']
> =>
  (pageMetafile.buildMetrics?.spaSyncEffects?.components ?? []).map(
    (component) => {
      return {
        componentName: component.componentName,
        renderDirectives: component.renderDirectives,
        renderIds: component.renderIds,
        summaryItems: [
          ...(pageClientChunkFile
            ? [
                {
                  label: 'HTML Patch Target',
                  value: pageClientChunkFile,
                },
              ]
            : []),
          {
            label: 'Embedded HTML Patch',
            value:
              formatSiteDevToolsAiBytes(component.embeddedHtmlBytes) || '0 B',
          },
          {
            label: 'Blocking CSS',
            value: `${component.blockingCssCount} file(s) · ${
              formatSiteDevToolsAiBytes(component.blockingCssBytes) || '0 B'
            }`,
          },
          {
            label: 'Blocking CSS Files',
            value: formatAssetMetricList(component.blockingCssFiles),
          },
          {
            label: 'CSS Loading Runtime',
            value: component.requiresCssLoadingRuntime
              ? 'Required'
              : 'Not required',
          },
          {
            label: 'spa:sync-render Side Effect',
            value: formatSpaSyncSideEffectSummary({
              blockingCssFiles: component.blockingCssFiles,
              embeddedHtmlBytes: component.embeddedHtmlBytes,
              pageClientChunkFile,
            }),
          },
        ],
      };
    },
  );

export const createPageRenderOrderItems = ({
  pageClientChunkFile,
  pageMetafile,
}: {
  pageClientChunkFile?: string;
  pageMetafile: PageMetafile;
}): NonNullable<
  NonNullable<SiteDevToolsAiAnalysisTarget['context']>['pageRenderOrderItems']
> =>
  (pageMetafile.buildMetrics?.renderInstances ?? [])
    .toSorted((left, right) => left.sequence - right.sequence)
    .map((renderInstance) => {
      return {
        componentName: renderInstance.componentName,
        renderDirective: renderInstance.renderDirective,
        renderId: renderInstance.renderId,
        sequence: renderInstance.sequence,
        ...(renderInstance.sourcePath
          ? {
              sourcePath: renderInstance.sourcePath,
            }
          : {}),
        summaryItems: renderInstance.useSpaSyncRender
          ? [
              ...(pageClientChunkFile
                ? [
                    {
                      label: 'HTML Patch Target',
                      value: pageClientChunkFile,
                    },
                  ]
                : []),
              {
                label: 'Embedded HTML Patch',
                value:
                  formatSiteDevToolsAiBytes(renderInstance.embeddedHtmlBytes) ||
                  '0 B',
              },
              {
                label: 'Blocking CSS',
                value: `${renderInstance.blockingCssCount} file(s) · ${
                  formatSiteDevToolsAiBytes(renderInstance.blockingCssBytes) ||
                  '0 B'
                }`,
              },
              {
                label: 'Blocking CSS Files',
                value: formatAssetMetricList(renderInstance.blockingCssFiles),
              },
              {
                label: 'CSS Loading Runtime',
                value: renderInstance.usesCssLoadingRuntime
                  ? 'Required'
                  : 'Not required',
              },
              {
                label: 'spa:sync-render Side Effect',
                value: formatSpaSyncSideEffectSummary({
                  blockingCssFiles: renderInstance.blockingCssFiles,
                  embeddedHtmlBytes: renderInstance.embeddedHtmlBytes,
                  pageClientChunkFile,
                }),
              },
            ]
          : renderInstance.renderDirective === 'client:only'
            ? [
                {
                  label: 'Note',
                  value:
                    'Client-only render; no SSR HTML and `spa:sync-render` is unsupported.',
                },
              ]
            : renderInstance.renderDirective === 'ssr:only'
              ? [
                  {
                    label: 'Note',
                    value:
                      'SSR-only render; no client hydration is scheduled for this instance.',
                  },
                ]
              : [],
        useSpaSyncRender: renderInstance.useSpaSyncRender,
      };
    });
