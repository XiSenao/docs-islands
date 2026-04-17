export type SiteDevToolsAiArtifactResourceType = 'asset' | 'css' | 'js';

export interface SiteDevToolsAiPromptValueItem {
  current?: boolean;
  label: string;
  value: string;
}

export type SiteDevToolsAiArtifactHeaderItem = SiteDevToolsAiPromptValueItem;

export type SiteDevToolsAiBundleSummaryItem = SiteDevToolsAiPromptValueItem;

export type SiteDevToolsAiLiveContextItem = SiteDevToolsAiPromptValueItem;

export interface SiteDevToolsAiChunkResourceItem {
  current?: boolean;
  file: string;
  label: string;
  moduleCount: number;
  share: string | null;
  size: string;
  type: SiteDevToolsAiArtifactResourceType;
}

export interface SiteDevToolsAiModuleSourceState {
  sizeDelta?: string | null;
  sourceInfo: string;
  statusLabel?: string | null;
}

export interface SiteDevToolsAiModuleItem {
  current?: boolean;
  file: string;
  id: string;
  isVirtual?: boolean;
  label: string;
  renderedSize: string;
  share: string | null;
  sizeDelta?: string | null;
  sourceInfo: string;
  statusLabel?: string | null;
}

export type SiteDevToolsAiPageGlossaryItem = SiteDevToolsAiPromptValueItem;

export interface SiteDevToolsAiPageComponentChunkItem
  extends SiteDevToolsAiChunkResourceItem {
  modules?: SiteDevToolsAiModuleItem[];
}

export interface SiteDevToolsAiPageComponentItem {
  chunkItems?: SiteDevToolsAiPageComponentChunkItem[];
  componentName: string;
  moduleItems?: SiteDevToolsAiModuleItem[];
  renderDirectives: string[];
  sourcePath?: string | null;
  summaryItems: SiteDevToolsAiPromptValueItem[];
}

export interface SiteDevToolsAiPageRenderStrategyItem {
  description: string;
  directive: string;
  impactItems: string[];
}

export interface SiteDevToolsAiPageRenderOrderItem {
  componentName: string;
  renderDirective: string;
  renderId: string;
  sequence: number;
  sourcePath?: string | null;
  summaryItems?: SiteDevToolsAiPromptValueItem[];
  useSpaSyncRender: boolean;
}

export interface SiteDevToolsAiPageSpaSyncComponentItem {
  componentName: string;
  renderDirectives: string[];
  renderIds: string[];
  summaryItems: SiteDevToolsAiPromptValueItem[];
}

export interface SiteDevToolsAiPromptBuildMetricFile {
  bytes: number;
  file: string;
  type: SiteDevToolsAiArtifactResourceType;
}

export interface SiteDevToolsAiPromptBuildMetricModule {
  bytes: number;
  file: string;
  id: string;
  sourceAssetFile?: string;
  sourcePath?: string;
}

const SITE_DEVTOOLS_AI_MODULE_LIMIT = 18;
const SITE_DEVTOOLS_AI_CHUNK_RESOURCE_LIMIT = 12;
const STYLE_SOURCE_SUFFIXES = [
  '.css',
  '.less',
  '.pcss',
  '.postcss',
  '.sass',
  '.scss',
  '.styl',
  '.stylus',
];

export const formatSiteDevToolsAiBytes = (
  value?: number | null,
): string | null => {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return null;
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
};

export const formatSiteDevToolsAiPercent = (
  value?: number | null,
  total?: number | null,
): string | null => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    typeof total !== 'number' ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return null;
  }

  return `${((value / total) * 100).toFixed(1)}%`;
};

export const isSiteDevToolsAiGeneratedVirtualModuleId = (
  moduleId: string,
): boolean => moduleId.startsWith('\0') || moduleId.includes('?commonjs-');

export const shouldDisplaySiteDevToolsAiModuleForResource = (
  resourceType: SiteDevToolsAiArtifactResourceType,
  sourcePath?: string,
  moduleId?: string,
): boolean => {
  if (resourceType !== 'css') {
    return true;
  }

  const normalizedPath = (sourcePath || moduleId || '').toLowerCase();
  return STYLE_SOURCE_SUFFIXES.some((suffix) =>
    normalizedPath.endsWith(suffix),
  );
};

export const createSiteDevToolsAiArtifactHeaderItems = ({
  artifactKind,
  bytes,
  displayPath,
  language,
  resourceType,
}: {
  artifactKind: 'bundle-chunk' | 'bundle-module';
  bytes?: number;
  displayPath: string;
  language?: string;
  resourceType?: SiteDevToolsAiArtifactResourceType;
}): SiteDevToolsAiArtifactHeaderItem[] => {
  const items: SiteDevToolsAiArtifactHeaderItem[] = [
    {
      label: 'Path',
      value: displayPath,
    },
  ];

  if (artifactKind === 'bundle-chunk') {
    if (resourceType) {
      items.unshift({
        label: 'Type',
        value: resourceType.toUpperCase(),
      });
    }

    const sizeLabel = formatSiteDevToolsAiBytes(bytes);
    if (sizeLabel) {
      items.push({
        label: 'Size',
        value: sizeLabel,
      });
    }

    return items;
  }

  if (language) {
    items.unshift({
      label: 'Language',
      value: language.toUpperCase(),
    });
  }

  return items;
};

export const createSiteDevToolsAiBundleSummaryItems = ({
  estimatedAssetBytes,
  estimatedCssBytes,
  estimatedJsBytes,
  estimatedTotalBytes,
}: {
  estimatedAssetBytes?: number;
  estimatedCssBytes?: number;
  estimatedJsBytes?: number;
  estimatedTotalBytes?: number;
}): SiteDevToolsAiBundleSummaryItem[] => {
  const entries: [string, number | undefined][] = [
    ['Total', estimatedTotalBytes],
    ['JS', estimatedJsBytes],
    ['CSS', estimatedCssBytes],
    ['Asset', estimatedAssetBytes],
  ];

  return entries
    .map(([label, value]) => {
      const displayValue = formatSiteDevToolsAiBytes(value);

      return displayValue
        ? {
            label,
            value: displayValue,
          }
        : null;
    })
    .filter((item): item is SiteDevToolsAiBundleSummaryItem => Boolean(item));
};

export const createSiteDevToolsAiChunkResourceItems = ({
  currentFile,
  files,
  modules,
  totalEstimatedBytes,
}: {
  currentFile?: string | null;
  files: SiteDevToolsAiPromptBuildMetricFile[];
  modules: SiteDevToolsAiPromptBuildMetricModule[];
  totalEstimatedBytes?: number;
}): SiteDevToolsAiChunkResourceItem[] => {
  const moduleCountByFile = modules.reduce<Record<string, number>>(
    (counts, moduleMetric) => {
      const resourceType =
        files.find((fileMetric) => fileMetric.file === moduleMetric.file)
          ?.type ?? null;

      if (
        !resourceType ||
        !shouldDisplaySiteDevToolsAiModuleForResource(
          resourceType,
          moduleMetric.sourcePath,
          moduleMetric.id,
        )
      ) {
        return counts;
      }

      counts[moduleMetric.file] = (counts[moduleMetric.file] ?? 0) + 1;
      return counts;
    },
    {},
  );

  const sortedFiles = [...files];

  // Keep a copied-array sort so emitted shared code stays ES2020-compatible.

  sortedFiles.sort((left, right) => {
    const leftModuleCount = moduleCountByFile[left.file] ?? 0;
    const rightModuleCount = moduleCountByFile[right.file] ?? 0;

    if (rightModuleCount !== leftModuleCount) {
      return rightModuleCount - leftModuleCount;
    }

    return right.bytes - left.bytes;
  });

  return sortedFiles
    .slice(0, SITE_DEVTOOLS_AI_CHUNK_RESOURCE_LIMIT)
    .map((fileMetric) => ({
      ...(currentFile === fileMetric.file ? { current: true } : {}),
      file: fileMetric.file,
      label: fileMetric.file.split('/').pop() || fileMetric.file,
      moduleCount: moduleCountByFile[fileMetric.file] ?? 0,
      share: formatSiteDevToolsAiPercent(fileMetric.bytes, totalEstimatedBytes),
      size: formatSiteDevToolsAiBytes(fileMetric.bytes) || '—',
      type: fileMetric.type,
    }));
};

export const formatSiteDevToolsAiSourceToRenderedDelta = (
  sourceBytes: number,
  renderedBytes: number,
): string | null => {
  if (
    !Number.isFinite(sourceBytes) ||
    !Number.isFinite(renderedBytes) ||
    sourceBytes <= 0
  ) {
    return null;
  }

  const deltaPercent = ((renderedBytes - sourceBytes) / sourceBytes) * 100;
  const prefix = deltaPercent > 0 ? '+' : '';
  return `Delta ${prefix}${deltaPercent.toFixed(1)}%`;
};

export const createSiteDevToolsAiResolvedSourceState = ({
  isGeneratedVirtualModule,
  renderedBytes,
  sourceBytes,
  sourceAvailable,
}: {
  isGeneratedVirtualModule?: boolean;
  renderedBytes: number;
  sourceAvailable: boolean;
  sourceBytes?: number | null;
}): SiteDevToolsAiModuleSourceState => {
  if (isGeneratedVirtualModule) {
    return {
      sourceInfo: 'Source n/a',
      statusLabel: 'generated virtual module',
    };
  }

  if (sourceAvailable) {
    const sizeLabel = formatSiteDevToolsAiBytes(sourceBytes);

    return {
      ...(typeof sourceBytes === 'number'
        ? {
            sizeDelta: formatSiteDevToolsAiSourceToRenderedDelta(
              sourceBytes,
              renderedBytes,
            ),
          }
        : {}),
      sourceInfo: sizeLabel ? `Source ${sizeLabel}` : 'Source available',
    };
  }

  return {
    sourceInfo: 'Source unavailable',
    statusLabel: 'source unavailable',
  };
};

export const createSiteDevToolsAiModuleItems = ({
  currentChunkFile,
  currentModuleKey,
  modules,
  resolveSourceState,
  resourceType,
}: {
  currentChunkFile?: string | null;
  currentModuleKey?: string | null;
  modules: SiteDevToolsAiPromptBuildMetricModule[];
  resolveSourceState?: (
    moduleMetric: SiteDevToolsAiPromptBuildMetricModule & {
      isGeneratedVirtualModule: boolean;
    },
  ) => SiteDevToolsAiModuleSourceState;
  resourceType: SiteDevToolsAiArtifactResourceType;
}): SiteDevToolsAiModuleItem[] => {
  if (!currentChunkFile) {
    return [];
  }

  const chunkModules = modules
    .filter(
      (moduleMetric) =>
        moduleMetric.file === currentChunkFile &&
        shouldDisplaySiteDevToolsAiModuleForResource(
          resourceType,
          moduleMetric.sourcePath,
          moduleMetric.id,
        ),
    )
    .map((moduleMetric) => {
      const isGeneratedVirtualModule =
        !moduleMetric.sourceAssetFile &&
        !moduleMetric.sourcePath &&
        isSiteDevToolsAiGeneratedVirtualModuleId(moduleMetric.id);

      return {
        ...moduleMetric,
        isGeneratedVirtualModule,
        moduleKey: `${moduleMetric.file}::${moduleMetric.id}`,
      };
    });

  const totalRenderedBytes = chunkModules.reduce(
    (sum, moduleMetric) => sum + moduleMetric.bytes,
    0,
  );

  const sortedChunkModules = [...chunkModules];

  // Keep a copied-array sort so emitted shared code stays ES2020-compatible.

  sortedChunkModules.sort((left, right) => {
    if (currentModuleKey) {
      if (
        left.moduleKey === currentModuleKey &&
        right.moduleKey !== currentModuleKey
      ) {
        return -1;
      }

      if (
        right.moduleKey === currentModuleKey &&
        left.moduleKey !== currentModuleKey
      ) {
        return 1;
      }
    }

    return right.bytes - left.bytes;
  });

  return sortedChunkModules
    .slice(0, SITE_DEVTOOLS_AI_MODULE_LIMIT)
    .map((moduleMetric) => {
      const sourceState =
        resolveSourceState?.(moduleMetric) ||
        createSiteDevToolsAiResolvedSourceState({
          isGeneratedVirtualModule: moduleMetric.isGeneratedVirtualModule,
          renderedBytes: moduleMetric.bytes,
          sourceAvailable: Boolean(
            moduleMetric.sourceAssetFile || moduleMetric.sourcePath,
          ),
        });

      return {
        ...(moduleMetric.moduleKey === currentModuleKey
          ? { current: true }
          : {}),
        file: moduleMetric.file,
        id: moduleMetric.id,
        ...(moduleMetric.isGeneratedVirtualModule ? { isVirtual: true } : {}),
        label: moduleMetric.id.split('/').pop() || moduleMetric.id,
        renderedSize: formatSiteDevToolsAiBytes(moduleMetric.bytes) || '—',
        share: formatSiteDevToolsAiPercent(
          moduleMetric.bytes,
          totalRenderedBytes,
        ),
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

export const createSiteDevToolsAiPageComponentModuleItems = ({
  currentModuleKey,
  modules,
  resolveSourceState,
}: {
  currentModuleKey?: string | null;
  modules: SiteDevToolsAiPromptBuildMetricModule[];
  resolveSourceState?: (
    moduleMetric: SiteDevToolsAiPromptBuildMetricModule & {
      isGeneratedVirtualModule: boolean;
    },
  ) => SiteDevToolsAiModuleSourceState;
}): SiteDevToolsAiModuleItem[] => {
  if (modules.length === 0) {
    return [];
  }

  const normalizedModules = modules.map((moduleMetric) => {
    const isGeneratedVirtualModule =
      !moduleMetric.sourceAssetFile &&
      !moduleMetric.sourcePath &&
      isSiteDevToolsAiGeneratedVirtualModuleId(moduleMetric.id);

    return {
      ...moduleMetric,
      isGeneratedVirtualModule,
      moduleKey: `${moduleMetric.file}::${moduleMetric.id}`,
    };
  });
  const totalRenderedBytes = normalizedModules.reduce(
    (sum, moduleMetric) => sum + moduleMetric.bytes,
    0,
  );
  const sortedModules = [...normalizedModules];

  sortedModules.sort((left, right) => {
    if (currentModuleKey) {
      if (
        left.moduleKey === currentModuleKey &&
        right.moduleKey !== currentModuleKey
      ) {
        return -1;
      }

      if (
        right.moduleKey === currentModuleKey &&
        left.moduleKey !== currentModuleKey
      ) {
        return 1;
      }
    }

    return right.bytes - left.bytes;
  });

  return sortedModules
    .slice(0, SITE_DEVTOOLS_AI_MODULE_LIMIT)
    .map((moduleMetric) => {
      const sourceState =
        resolveSourceState?.(moduleMetric) ||
        createSiteDevToolsAiResolvedSourceState({
          isGeneratedVirtualModule: moduleMetric.isGeneratedVirtualModule,
          renderedBytes: moduleMetric.bytes,
          sourceAvailable: Boolean(
            moduleMetric.sourceAssetFile || moduleMetric.sourcePath,
          ),
        });

      return {
        ...(moduleMetric.moduleKey === currentModuleKey
          ? { current: true }
          : {}),
        file: moduleMetric.file,
        id: moduleMetric.id,
        ...(moduleMetric.isGeneratedVirtualModule ? { isVirtual: true } : {}),
        label: moduleMetric.id.split('/').pop() || moduleMetric.id,
        renderedSize: formatSiteDevToolsAiBytes(moduleMetric.bytes) || '—',
        share: formatSiteDevToolsAiPercent(
          moduleMetric.bytes,
          totalRenderedBytes,
        ),
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
