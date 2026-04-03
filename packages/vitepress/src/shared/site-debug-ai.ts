import {
  basename,
  dirname,
  isAbsolute,
  normalize,
  parse,
  relative,
} from 'pathe';
import type {
  SiteDebugAiArtifactHeaderItem,
  SiteDebugAiBundleSummaryItem,
  SiteDebugAiChunkResourceItem,
  SiteDebugAiLiveContextItem,
  SiteDebugAiModuleItem,
  SiteDebugAiPromptValueItem,
} from './site-debug-ai-prompt-snapshot';

export type SiteDebugAiProvider = 'claude-code' | 'doubao';
export type SiteDebugAiArtifactKind = 'bundle-chunk' | 'bundle-module';
export type SiteDebugAiAnalysisTargetKind =
  | SiteDebugAiArtifactKind
  | 'page-build';

export interface SiteDebugAiArtifactContext {
  artifactHeaderItems?: SiteDebugAiArtifactHeaderItem[];
  bundleSummaryItems?: SiteDebugAiBundleSummaryItem[];
  chunkResourceItems?: SiteDebugAiChunkResourceItem[];
  componentName?: string;
  liveContextItems?: SiteDebugAiLiveContextItem[];
  moduleItems?: SiteDebugAiModuleItem[];
  pageId?: string | null;
  renderId?: string | null;
  renderStatus?: string;
}

export interface SiteDebugAiAnalysisTarget {
  artifactKind: SiteDebugAiAnalysisTargetKind;
  artifactLabel: string;
  bytes?: number;
  content: string;
  context?: SiteDebugAiArtifactContext;
  displayPath: string;
  language: string;
}

export interface SiteDebugAiProviderCapability {
  available: boolean;
  detail: string;
  model?: string;
  provider: SiteDebugAiProvider;
}

export interface SiteDebugAiCapabilitiesResponse {
  ok: true;
  providers: Record<SiteDebugAiProvider, SiteDebugAiProviderCapability>;
}

export interface SiteDebugAiAnalyzeRequest {
  provider: SiteDebugAiProvider;
  target: SiteDebugAiAnalysisTarget;
}

export interface SiteDebugAiAnalyzeResponse {
  detail?: string;
  error?: string;
  model?: string;
  ok: boolean;
  prompt: string;
  provider: SiteDebugAiProvider;
  result?: string;
}

export interface SiteDebugAiBuildReport {
  detail?: string;
  generatedAt: string;
  model?: string;
  prompt: string;
  provider: SiteDebugAiProvider;
  reportId: string;
  reportLabel: string;
  result: string;
  target: SiteDebugAiAnalysisTarget;
}

export interface SiteDebugAiSanitizeOptions {
  anchorPath?: string | null;
  anchorPaths?: (string | null | undefined)[];
}

export const SITE_DEBUG_AI_PATHNAME = '__docs-islands/debug-ai';
const SITE_DEBUG_AI_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  cjs: 'js',
  css: 'css',
  cts: 'ts',
  html: 'html',
  js: 'js',
  json: 'json',
  jsx: 'jsx',
  less: 'css',
  mjs: 'js',
  mts: 'ts',
  sass: 'scss',
  scss: 'scss',
  svg: 'svg',
  ts: 'ts',
  tsx: 'tsx',
  vue: 'vue',
  xml: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
};
const SITE_DEBUG_AI_LOCAL_PATH_ROOT_NAMES = new Set([
  'Users',
  'Volumes',
  'home',
  'private',
  'tmp',
  'var',
]);
const SITE_DEBUG_AI_PROMPT_PATH_ROOT_NAMES = new Set([
  '.vitepress',
  'docs',
  'node_modules',
  'packages',
  'playground',
  'public',
  'scripts',
  'src',
  'test',
  'tests',
  'utils',
]);
const SITE_DEBUG_AI_EMBEDDED_ABSOLUTE_PATH_RE =
  /\0*\/(?:Users|Volumes|home|private|tmp|var)\/[^\s"'<>`]+/g;
const SITE_DEBUG_AI_EMBEDDED_PATH_LIKE_RE =
  /\0*(?:\.{1,2}\/|\/)?(?:[\w.@-]+\/)+[\w%+.@~-]+(?:\?[^\s"'<>`]+)?/g;
const SITE_DEBUG_AI_TRAILING_PATH_PUNCTUATION_RE = /[!),.:;?\]}]+$/;

const stripControlCharacters = (value: string) =>
  [...value]
    .filter((character) => (character.codePointAt(0) ?? 0) >= 0x20)
    .join('');

const normalizeBase = (base = '/') => (base.endsWith('/') ? base : `${base}/`);

const formatValue = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return String(value);
};

const getAnchorPathAncestors = (anchorPath: string): string[] => {
  const normalizedAnchorPath = normalize(
    stripControlCharacters(anchorPath),
  ).replace(/[#?].*$/, '');

  if (!normalizedAnchorPath || !isAbsolute(normalizedAnchorPath)) {
    return [];
  }

  const ancestors: string[] = [];
  let currentDir = dirname(normalizedAnchorPath);

  while (true) {
    ancestors.push(currentDir);
    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return ancestors;
};

const getRelativePathFromAnchor = (
  pathCandidate: string,
  anchorPath: string,
): string | null => {
  const normalizedCandidate = normalize(pathCandidate);
  const anchorAncestors = getAnchorPathAncestors(anchorPath);

  if (anchorAncestors.length === 0) {
    return null;
  }

  if (isAbsolute(normalizedCandidate)) {
    for (const ancestorPath of anchorAncestors) {
      const relativeCandidate = relative(ancestorPath, normalizedCandidate);

      if (
        relativeCandidate === '' ||
        relativeCandidate.startsWith('..') ||
        isAbsolute(relativeCandidate)
      ) {
        continue;
      }

      const anchoredPath = `/${relativeCandidate}`;

      if (anchoredPath === normalizedCandidate) {
        continue;
      }

      return anchoredPath;
    }

    return null;
  }

  const candidateSegments = normalizedCandidate.split('/').filter(Boolean);

  if (candidateSegments.length === 0) {
    return null;
  }

  for (const ancestorPath of anchorAncestors) {
    const ancestorRoot = parse(ancestorPath).root || '/';
    const ancestorSegments = relative(ancestorRoot, ancestorPath)
      .split('/')
      .filter(Boolean);

    for (
      let overlapLength = Math.min(
        ancestorSegments.length,
        candidateSegments.length,
      );
      overlapLength > 0;
      overlapLength -= 1
    ) {
      const ancestorSuffix = ancestorSegments.slice(-overlapLength);
      const candidatePrefix = candidateSegments.slice(0, overlapLength);

      if (ancestorSuffix.join('/') !== candidatePrefix.join('/')) {
        continue;
      }

      const relativeSegments = candidateSegments.slice(overlapLength);

      if (relativeSegments.length === 0) {
        return '/';
      }

      return `/${relativeSegments.join('/')}`;
    }
  }

  return null;
};

const sanitizePromptPathValue = (
  value: string,
  options: SiteDebugAiSanitizeOptions = {},
): string => {
  if (!value) {
    return value;
  }

  const cleanedValue = stripControlCharacters(value);
  const suffixMatch = /([#?].*)$/.exec(cleanedValue);
  const suffix = suffixMatch?.[1] ?? '';
  const pathCandidate = suffix
    ? cleanedValue.slice(0, -suffix.length)
    : cleanedValue;
  const normalizedValue = normalize(pathCandidate);

  const anchoredPromptPath = options.anchorPath
    ? getRelativePathFromAnchor(normalizedValue, options.anchorPath)
    : null;

  if (anchoredPromptPath) {
    return `${anchoredPromptPath}${suffix}`;
  }

  for (const anchorPath of options.anchorPaths ?? []) {
    if (!anchorPath) {
      continue;
    }

    const relativePromptPath = getRelativePathFromAnchor(
      normalizedValue,
      anchorPath,
    );

    if (relativePromptPath) {
      return `${relativePromptPath}${suffix}`;
    }
  }

  if (!isAbsolute(normalizedValue)) {
    return cleanedValue;
  }

  if (normalizedValue.startsWith('//')) {
    return `${basename(normalizedValue)}${suffix}`;
  }

  const pathRoot = parse(normalizedValue).root || '/';
  const firstPathSegment = relative(pathRoot, normalizedValue)
    .split('/')
    .find(Boolean);

  if (
    !firstPathSegment ||
    !SITE_DEBUG_AI_LOCAL_PATH_ROOT_NAMES.has(firstPathSegment)
  ) {
    return cleanedValue;
  }

  let currentDir = dirname(normalizedValue);
  let relativePromptPath: string | null = null;

  while (true) {
    if (SITE_DEBUG_AI_PROMPT_PATH_ROOT_NAMES.has(basename(currentDir))) {
      relativePromptPath = relative(dirname(currentDir), normalizedValue);
    }

    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return `${relativePromptPath || basename(normalizedValue)}${suffix}`;
};

export const sanitizeSiteDebugAiText = (
  value: string,
  options: SiteDebugAiSanitizeOptions = {},
): string => {
  if (!value) {
    return value;
  }

  const replacePathMatches = (input: string, matcher: RegExp) =>
    input.replaceAll(matcher, (match) => {
      const trailingPunctuation =
        SITE_DEBUG_AI_TRAILING_PATH_PUNCTUATION_RE.exec(match)?.[0] ?? '';
      const matchWithoutTrailingPunctuation = trailingPunctuation
        ? match.slice(0, -trailingPunctuation.length)
        : match;

      return `${sanitizePromptPathValue(
        matchWithoutTrailingPunctuation,
        options,
      )}${trailingPunctuation}`;
    });

  return replacePathMatches(
    replacePathMatches(value, SITE_DEBUG_AI_EMBEDDED_ABSOLUTE_PATH_RE),
    SITE_DEBUG_AI_EMBEDDED_PATH_LIKE_RE,
  );
};

const sanitizeSiteDebugAiValue = <T>(
  value: T,
  options: SiteDebugAiSanitizeOptions = {},
): T => {
  if (typeof value === 'string') {
    return sanitizeSiteDebugAiText(value, options) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSiteDebugAiValue(item, options)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, itemValue]) => [
        key,
        sanitizeSiteDebugAiValue(itemValue, options),
      ]),
    ) as T;
  }

  return value;
};

export const sanitizeSiteDebugAiAnalysisTarget = (
  target: SiteDebugAiAnalysisTarget,
  options: SiteDebugAiSanitizeOptions = {},
): SiteDebugAiAnalysisTarget => sanitizeSiteDebugAiValue(target, options);

export const sanitizeSiteDebugAiBuildReport = (
  report: SiteDebugAiBuildReport,
  options: SiteDebugAiSanitizeOptions = {},
): SiteDebugAiBuildReport => sanitizeSiteDebugAiValue(report, options);

const getSiteDebugAiArtifactPanelLabel = (
  artifactKind: SiteDebugAiAnalysisTargetKind,
) => {
  switch (artifactKind) {
    case 'bundle-chunk': {
      return 'Chunk Resource';
    }
    case 'bundle-module': {
      return 'Module Source';
    }
    case 'page-build': {
      return 'Page Build';
    }
    default: {
      return artifactKind;
    }
  }
};

const getSiteDebugAiArtifactChecklist = (
  artifactKind: SiteDebugAiAnalysisTargetKind,
): string[] =>
  artifactKind === 'bundle-chunk'
    ? [
        '- Identify the selected chunk resource type, size, and role inside the component bundle.',
        '- Use Bundle Summary and Chunk Resources to judge whether this file is unusually large, dominant, or well-balanced.',
        '- Use Module Source rows to see whether the chunk is driven by a few heavy modules, generated helpers, framework runtime pieces, or a broad mix of modules.',
        '- Comment on whether the selected chunk looks like an entry-like file, a shared/runtime chunk, a style chunk, or an auxiliary asset, based only on visible labels and paths.',
        '- Suggest split, lazy-load, dedupe, or extraction ideas only when the visible chunk/module distribution supports them.',
      ]
    : artifactKind === 'bundle-module'
      ? [
          '- Identify what role the selected module likely plays inside its parent chunk, using the module row, artifact panel, and surrounding chunk context.',
          '- Use rendered size and share to judge whether this module is a meaningful contributor or just a small supporting dependency.',
          '- Interpret the source state carefully: distinguish source available, source unavailable, and generated virtual module.',
          '- Use the source-size delta, when available, to comment on transform overhead or whether the rendered output looks materially larger or smaller than the source.',
          '- Explain why this module is likely present in the chunk without inventing importer chains or implementation details that are not shown.',
          '- Suggest module-level follow-ups such as dedupe, tree-shaking, code-splitting, or source-asset cleanup only when the visible evidence points there.',
        ]
      : [
          '- Summarize the page-level bundle shape using the bundle summary, chunk resources, and module source sections together.',
          '- Identify which chunks or assets dominate the page and whether the overall distribution looks balanced for this page.',
          '- Highlight the modules or generated helpers that appear to have the biggest impact on the page build.',
          '- Suggest page-level follow-ups such as route splitting, shared chunk cleanup, asset compression, or component-level lazy loading only when the snapshot supports them.',
          '- Call out what cannot be concluded without drilling into a specific chunk or module report.',
        ];

const formatPromptValueItems = (
  items: SiteDebugAiPromptValueItem[] = [],
  options: SiteDebugAiSanitizeOptions = {},
) =>
  items
    .map((item) => {
      const label = formatValue(item.label);
      const value = formatValue(item.value);
      const displayValue = value
        ? sanitizePromptPathValue(value, options)
        : value;

      return label && displayValue ? `- ${label}: ${displayValue}` : null;
    })
    .filter(Boolean);

const formatChunkResourceItems = (
  items: SiteDebugAiChunkResourceItem[] = [],
  options: SiteDebugAiSanitizeOptions = {},
) =>
  items.map((item, index) => {
    const detailLines = [
      `   path: ${sanitizePromptPathValue(item.file, options)}`,
      `   type: ${item.type.toUpperCase()}`,
      `   size: ${item.size}`,
      ...(item.share ? [`   share: ${item.share}`] : []),
      `   source modules: ${item.moduleCount}`,
      ...(item.current ? ['   focus: current artifact'] : []),
    ];

    return [
      `${index + 1}. ${sanitizePromptPathValue(item.label, options)}`,
      ...detailLines,
    ].join('\n');
  });

const formatModuleItems = (
  items: SiteDebugAiModuleItem[] = [],
  options: SiteDebugAiSanitizeOptions = {},
) =>
  items.map((item, index) => {
    const statusLabels = [
      item.statusLabel,
      item.current ? 'current selection' : null,
    ].filter(Boolean);
    const detailLines = [
      `   module id: ${sanitizePromptPathValue(item.id, options)}`,
      `   rendered size: ${item.renderedSize}`,
      ...(item.share ? [`   share: ${item.share}`] : []),
      `   source: ${item.sourceInfo}`,
      ...(item.sizeDelta ? [`   delta: ${item.sizeDelta}`] : []),
      ...(statusLabels.length > 0
        ? [`   status: ${statusLabels.join(' · ')}`]
        : []),
    ];

    return [
      `${index + 1}. ${sanitizePromptPathValue(item.label, options)}`,
      ...detailLines,
    ].join('\n');
  });

export const getSiteDebugAiProviderLabel = (
  provider: SiteDebugAiProvider,
): string => {
  switch (provider) {
    case 'claude-code': {
      return 'Claude Code';
    }
    case 'doubao': {
      return 'Doubao';
    }
    default: {
      return provider;
    }
  }
};

export const getSiteDebugAiArtifactKindLabel = (
  artifactKind: SiteDebugAiAnalysisTargetKind,
): string => {
  switch (artifactKind) {
    case 'bundle-chunk': {
      return 'Bundle Chunk';
    }
    case 'bundle-module': {
      return 'Bundle Module';
    }
    case 'page-build': {
      return 'Page Build';
    }
    default: {
      return artifactKind;
    }
  }
};

export const getSiteDebugAiEndpoint = (base = '/'): string =>
  `${normalizeBase(base)}${SITE_DEBUG_AI_PATHNAME}`;

export const getSiteDebugAiModuleReportKey = (
  file: string,
  id: string,
): string => `${file}::${id}`;

export const inferSiteDebugAiLanguage = (sourcePath?: string): string => {
  if (!sourcePath) {
    return 'text';
  }

  const normalizedPath = sourcePath.replace(/[#?].*$/, '');
  const extension = normalizedPath.split('.').pop()?.toLowerCase();

  if (!extension) {
    return 'text';
  }

  return SITE_DEBUG_AI_LANGUAGE_BY_EXTENSION[extension] || extension;
};

export const buildSiteDebugAiAnalysisPrompt = (
  target: SiteDebugAiAnalysisTarget,
  sanitizeOptions: SiteDebugAiSanitizeOptions = {},
): string => {
  const context = target.context ?? {};
  const currentDebugContextLines = [
    ['Page', context.pageId],
    ['Component', context.componentName],
    ['Render ID', context.renderId],
    ['Render status', context.renderStatus],
  ]
    .map(([label, value]) => {
      const formattedValue = formatValue(value);

      return formattedValue
        ? `- ${label}: ${sanitizePromptPathValue(formattedValue, sanitizeOptions)}`
        : null;
    })
    .filter(Boolean);
  const artifactPanelLines = formatPromptValueItems(
    [
      {
        label: 'Panel',
        value: getSiteDebugAiArtifactPanelLabel(target.artifactKind),
      },
      {
        label: 'Title',
        value: target.artifactLabel,
      },
      ...(context.artifactHeaderItems ?? []),
    ],
    sanitizeOptions,
  );
  const liveContextLines = formatPromptValueItems(
    context.liveContextItems,
    sanitizeOptions,
  );
  const bundleSummaryLines = formatPromptValueItems(
    context.bundleSummaryItems,
    sanitizeOptions,
  );
  const chunkResourceLines = formatChunkResourceItems(
    context.chunkResourceItems,
    sanitizeOptions,
  );
  const moduleLines = formatModuleItems(context.moduleItems, sanitizeOptions);

  return [
    '## Role',
    'You are an expert docs-islands / VitePress debug-console analyst for build artifacts and render-visible performance signals.',
    '',
    '## Skills',
    '- Read debug-console snapshots and explain what the selected artifact most likely represents.',
    '- Correlate the current artifact with bundle summary cards, chunk resource rows, module source rows, and visible render metrics.',
    '- Spot likely size concentration, duplication, runtime cost, or bundling tradeoffs from the available evidence.',
    '- Suggest concrete optimization follow-ups that are grounded in the snapshot rather than guessed from missing code.',
    '',
    '## Action',
    '1. Read the debug-console snapshot below.',
    '2. Explain what this artifact is and why it is likely emitted.',
    '3. Identify the strongest evidence from the visible debug-console data.',
    '4. Call out suspicious patterns, but also say explicitly when the snapshot looks normal.',
    '5. Suggest optimization ideas with expected impact and implementation direction.',
    '6. Separate confident conclusions from speculation.',
    '',
    '## Artifact-Specific Checklist',
    ...getSiteDebugAiArtifactChecklist(target.artifactKind),
    '',
    '## Constraints',
    '- Base the analysis only on the debug-console information shown below.',
    '- Source content and raw code are intentionally excluded from this prompt.',
    '- Do not invent implementation details, loader behavior, or framework internals that are not supported by the snapshot.',
    '- Prefer citing specific cards, rows, and values from the snapshot instead of giving generic optimization advice.',
    '- If the evidence is insufficient, explain what remains unknown and which additional debug-console view would help.',
    '',
    '## Output',
    'Respond in Markdown using these sections:',
    '- Summary',
    '- What This Artifact Contains',
    '- Potential Problems Or Tradeoffs',
    '- Optimization Ideas',
    '- Unknowns',
    '',
    'Section guidance:',
    '- Summary: Say whether the artifact looks normal, borderline, or worth attention.',
    '- What This Artifact Contains: Describe the artifact using only the snapshot data.',
    '- Potential Problems Or Tradeoffs: Focus on evidence-backed concerns, not hypothetical ones.',
    '- Optimization Ideas: Only include actions tied to evidence from the snapshot, and mention expected impact when possible.',
    '- Unknowns: Call out missing information instead of filling gaps with assumptions.',
    ...(currentDebugContextLines.length > 0 || liveContextLines.length > 0
      ? [
          '',
          '## Debug Console Snapshot',
          '',
          'Current Debug Context:',
          ...(currentDebugContextLines.length > 0
            ? currentDebugContextLines
            : ['- No current debug context available.']),
          ...(liveContextLines.length > 0
            ? ['', 'Visible Render Metrics:', ...liveContextLines]
            : []),
        ]
      : []),
    '',
    ...(currentDebugContextLines.length === 0 && liveContextLines.length === 0
      ? ['## Debug Console Snapshot', '']
      : []),
    'Artifact Panel:',
    ...artifactPanelLines,
    ...(bundleSummaryLines.length > 0
      ? ['', 'Bundle Summary:', ...bundleSummaryLines]
      : []),
    ...(chunkResourceLines.length > 0
      ? [
          '',
          `Chunk Resources (${chunkResourceLines.length} shown):`,
          ...chunkResourceLines,
        ]
      : []),
    ...(moduleLines.length > 0
      ? ['', `Module Source (${moduleLines.length} shown):`, ...moduleLines]
      : []),
  ].join('\n');
};

export type {
  SiteDebugAiArtifactHeaderItem,
  SiteDebugAiArtifactResourceType,
  SiteDebugAiBundleSummaryItem,
  SiteDebugAiChunkResourceItem,
  SiteDebugAiLiveContextItem,
  SiteDebugAiModuleItem,
  SiteDebugAiModuleSourceState,
  SiteDebugAiPromptBuildMetricFile,
  SiteDebugAiPromptBuildMetricModule,
  SiteDebugAiPromptValueItem,
} from './site-debug-ai-prompt-snapshot';

export {
  createSiteDebugAiArtifactHeaderItems,
  createSiteDebugAiBundleSummaryItems,
  createSiteDebugAiChunkResourceItems,
  createSiteDebugAiModuleItems,
  createSiteDebugAiResolvedSourceState,
  formatSiteDebugAiBytes,
  formatSiteDebugAiPercent,
  formatSiteDebugAiSourceToRenderedDelta,
} from './site-debug-ai-prompt-snapshot';
