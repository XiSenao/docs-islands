import type { SiteDebugWebVitalRating } from '#shared/site-debug-web-vitals-analysis';
import type {
  SiteDebugHmrMetric,
  SiteDebugRenderMetric,
} from '@docs-islands/vitepress/internal/debug';
import type {
  ComponentBuildMetric,
  SpaSyncComponentEffect,
} from './debug-inspector';
import type {
  BundleChunkResourceItem,
  OverlayMetricDetailKind,
  RenderMetricView,
} from './site-debug-shared';
import {
  formatBytes,
  formatDuration,
  formatSecondaryMetricValue,
  getHmrApplyStageLabel,
  getHmrRuntimeStageLabel,
  getMetricRuntimeKind,
  getSecondaryMetricLabel,
  hasDisplayValue,
  shouldShowRenderBundleMetric,
  shouldShowVisibleWaitMetric,
} from './site-debug-shared';
import type { SiteDebugRenderMetricWebVitalsAnalysis } from './site-debug-web-vitals';

const sortViewModelItems = <T>(
  items: Iterable<T>,
  compare: (left: T, right: T) => number,
): T[] => {
  const sortedItems = [...items];

  // Keep a copied-array sort so emitted theme code stays ES2020-compatible.
  // eslint-disable-next-line unicorn/no-array-sort
  return sortedItems.sort(compare);
};

export const formatWebVitalScore = (score?: number) =>
  typeof score === 'number' && Number.isFinite(score) ? `${score} / 100` : '—';

export const getWebVitalRatingLabel = (rating?: SiteDebugWebVitalRating) => {
  switch (rating) {
    case 'good': {
      return 'Good';
    }
    case 'needs-improvement': {
      return 'Needs Improvement';
    }
    case 'poor': {
      return 'Poor';
    }
    default: {
      return 'Unavailable';
    }
  }
};

export const getWebVitalRatingTone = (rating?: SiteDebugWebVitalRating) => {
  switch (rating) {
    case 'good': {
      return 'is-success';
    }
    case 'poor': {
      return 'is-danger';
    }
    case 'needs-improvement': {
      return 'is-active';
    }
    default: {
      return 'is-muted';
    }
  }
};

export const getWebVitalsContextLabel = (
  analysis: SiteDebugRenderMetricWebVitalsAnalysis,
) =>
  analysis.context === 'initial-load' ? 'Initial Load' : 'Route Transition';

const getPaintMilestoneDescription = (
  label: 'FCP' | 'LCP',
  analysis: SiteDebugRenderMetricWebVitalsAnalysis,
) => {
  if (analysis.context !== 'initial-load') {
    return label === 'LCP'
      ? 'Initial-load paint milestones are not used for this route transition render.'
      : 'FCP is only used as an initial-navigation baseline.';
  }

  const completedBefore =
    label === 'LCP' ? analysis.completedBeforeLcp : analysis.completedBeforeFcp;

  return `Render completed ${
    completedBefore === false ? 'after' : 'before'
  } the current ${label} timing.`;
};

const getPaintMilestoneMeta = (
  label: 'FCP' | 'LCP',
  analysis: SiteDebugRenderMetricWebVitalsAnalysis,
) => {
  if (analysis.context !== 'initial-load') {
    return label === 'LCP'
      ? 'Route transition context'
      : 'Initial navigation only';
  }

  const completedBefore =
    label === 'LCP' ? analysis.completedBeforeLcp : analysis.completedBeforeFcp;

  if (completedBefore === true) {
    return `Completed before ${label}`;
  }

  if (completedBefore === false) {
    return `Completed after ${label}`;
  }

  return getWebVitalRatingLabel(
    label === 'LCP' ? analysis.lcpRating : analysis.fcpRating,
  );
};

const getPaintMilestoneTone = (
  label: 'FCP' | 'LCP',
  analysis: SiteDebugRenderMetricWebVitalsAnalysis,
) => {
  if (analysis.context !== 'initial-load') {
    return 'is-muted';
  }

  const completedBefore =
    label === 'LCP' ? analysis.completedBeforeLcp : analysis.completedBeforeFcp;

  if (completedBefore === true) {
    return 'is-success';
  }

  if (completedBefore === false) {
    return label === 'LCP' ? 'is-danger' : 'is-active';
  }

  return getWebVitalRatingTone(
    label === 'LCP' ? analysis.lcpRating : analysis.fcpRating,
  );
};

export const getRenderMetricGridItems = (
  view: RenderMetricView,
): {
  detailKind?: OverlayMetricDetailKind;
  key: string;
  label: string;
  value: string;
}[] => {
  const items: {
    detailKind?: OverlayMetricDetailKind;
    key: string;
    label: string;
    value: string;
  }[] = [
    {
      ...(typeof view.metric.totalDurationMs === 'number'
        ? { detailKind: 'total' as const }
        : {}),
      key: 'total',
      label: 'Total',
      value: formatDuration(view.metric.totalDurationMs),
    },
    {
      key: 'invoke',
      label: 'Invoke',
      value: formatDuration(view.metric.invokeDurationMs),
    },
  ];

  if (getMetricRuntimeKind(view.metric) === 'prod') {
    items.splice(1, 0, {
      key: 'secondary',
      label: getSecondaryMetricLabel(view.metric),
      value: formatSecondaryMetricValue(view.metric),
    });
  }

  if (shouldShowVisibleWaitMetric(view.metric)) {
    items.push({
      key: 'visible-wait',
      label: 'Visible Wait',
      value: formatDuration(view.metric.waitForVisibilityMs),
    });
  }

  if (shouldShowRenderBundleMetric(view.metric)) {
    items.push({
      ...(view.buildMetric ? { detailKind: 'bundle' as const } : {}),
      key: 'bundle',
      label: 'Bundle',
      value: formatBytes(view.buildMetric?.estimatedTotalBytes),
    });
  }

  if (view.webVitalsAnalysis) {
    items.push({
      detailKind: 'vitals',
      key: 'vitals',
      label: 'Vitals',
      value: formatWebVitalScore(view.webVitalsAnalysis.performanceScore),
    });
  }

  return items.filter((item) => hasDisplayValue(item.value));
};

export const getHmrStageItems = (metric: SiteDebugHmrMetric) =>
  [
    {
      isEmpty: typeof metric.totalDurationMs !== 'number',
      label: 'Total',
      value: formatDuration(metric.totalDurationMs),
    },
    {
      isEmpty: typeof metric.runtimeReadyDurationMs !== 'number',
      label: getHmrRuntimeStageLabel(metric),
      value: formatDuration(metric.runtimeReadyDurationMs),
    },
    {
      isEmpty: typeof metric.ssrApplyDurationMs !== 'number',
      label: 'SSR Apply',
      value: formatDuration(metric.ssrApplyDurationMs),
    },
    {
      isEmpty: typeof metric.clientApplyDurationMs !== 'number',
      label: getHmrApplyStageLabel(metric),
      value: formatDuration(metric.clientApplyDurationMs),
    },
  ].filter((item) => hasDisplayValue(item.value));

export const getHmrEventItems = (metric: SiteDebugHmrMetric) =>
  [
    {
      label: 'Trigger',
      value: metric.triggerEvent || '—',
    },
    {
      label: 'Apply',
      value: metric.applyEvent || '—',
    },
  ].filter((item) => hasDisplayValue(item.value));

export const shouldShowLatestHmrMetric = (view: RenderMetricView) =>
  getMetricRuntimeKind(view.metric) === 'dev' && Boolean(view.latestHmrMetric);

export const getSpaSyncHtmlPatch = (
  effect: SpaSyncComponentEffect | null,
  renderId?: string | null,
) => {
  if (!effect?.embeddedHtmlPatches?.length) {
    return null;
  }

  return (
    effect.embeddedHtmlPatches.find(
      (patch: { renderId: string }) => patch.renderId === renderId,
    ) ??
    effect.embeddedHtmlPatches[0] ??
    null
  );
};

export const getSpaSyncSummaryItems = (
  effect: SpaSyncComponentEffect | null,
  renderId?: string | null,
) => {
  if (!effect) {
    return [];
  }

  const htmlPatch = getSpaSyncHtmlPatch(effect, renderId);

  return [
    {
      detailKind:
        htmlPatch || effect.embeddedHtmlBytes > 0
          ? ('html' as const)
          : undefined,
      key: 'html',
      label: 'HTML',
      value: formatBytes(htmlPatch?.bytes ?? effect.embeddedHtmlBytes),
    },
    {
      detailKind: effect.blockingCssCount > 0 ? ('css' as const) : undefined,
      key: 'css',
      label: 'CSS',
      value: formatBytes(effect.blockingCssBytes),
    },
  ].filter((item) => hasDisplayValue(item.value));
};

export const getBundleBreakdownItems = (
  buildMetric?: ComponentBuildMetric | null,
) =>
  [
    {
      bytes: buildMetric?.estimatedJsBytes,
      key: 'js',
      label: 'JS',
    },
    {
      bytes: buildMetric?.estimatedCssBytes,
      key: 'css',
      label: 'CSS',
    },
    {
      bytes: buildMetric?.estimatedAssetBytes,
      key: 'asset',
      label: 'Asset',
    },
  ]
    .filter(
      (item): item is { bytes: number; key: string; label: string } =>
        typeof item.bytes === 'number' && item.bytes > 0,
    )
    .map((item) => ({
      ...item,
      value: formatBytes(item.bytes),
    }));

export const getBundleSummaryItems = (
  buildMetric?: ComponentBuildMetric | null,
) => {
  const items = [];

  if (
    typeof buildMetric?.estimatedTotalBytes === 'number' &&
    buildMetric.estimatedTotalBytes > 0
  ) {
    items.push({
      key: 'total',
      label: 'Total',
      value: formatBytes(buildMetric.estimatedTotalBytes),
    });
  }

  return [...items, ...getBundleBreakdownItems(buildMetric)];
};

export const getEqualGridStyle = (itemCount: number) => ({
  '--site-debug-grid-columns': String(Math.max(itemCount, 1)),
});

export const formatPercent = (value: number, total: number) => {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return '—';
  }

  return `${((value / total) * 100).toFixed(1)}%`;
};

export const getBundleChunkResourceItems = (
  view: RenderMetricView,
): BundleChunkResourceItem[] => {
  const totalBytes = view.buildMetric?.estimatedTotalBytes ?? 0;
  const files = view.buildMetric?.files ?? [];
  const modules = view.buildMetric?.modules ?? [];
  const moduleCountByFile = modules.reduce<Record<string, number>>(
    (counts: Record<string, number>, moduleMetric) => {
      counts[moduleMetric.file] = (counts[moduleMetric.file] ?? 0) + 1;
      return counts;
    },
    {},
  );

  return sortViewModelItems(
    [...files].map((file) => ({
      ...file,
      moduleCount: moduleCountByFile[file.file] ?? 0,
      percent: formatPercent(file.bytes, totalBytes),
      shortFile: file.file.split('/').pop() || file.file,
    })),
    (left, right) => {
      if (right.moduleCount !== left.moduleCount) {
        return right.moduleCount - left.moduleCount;
      }

      return right.bytes - left.bytes;
    },
  );
};

export const getTotalDurationBreakdown = (metric: SiteDebugRenderMetric) => {
  const parts: {
    description: string;
    key: string;
    label: string;
    value: number;
  }[] = [];

  if (
    typeof metric.waitForVisibilityMs === 'number' &&
    metric.waitForVisibilityMs > 0
  ) {
    parts.push({
      description:
        'Time spent waiting for the container to enter the viewport.',
      key: 'visible-wait',
      label: 'Visible Wait',
      value: metric.waitForVisibilityMs,
    });
  }

  if (
    getMetricRuntimeKind(metric) === 'prod' &&
    typeof metric.subscribeDurationMs === 'number' &&
    metric.subscribeDurationMs > 0
  ) {
    parts.push({
      description:
        'Time spent waiting for runtime subscription and module readiness.',
      key: 'subscribe',
      label: 'Subscribe',
      value: metric.subscribeDurationMs,
    });
  }

  if (
    typeof metric.invokeDurationMs === 'number' &&
    metric.invokeDurationMs > 0
  ) {
    parts.push({
      description: 'Time spent inside the render or hydrate call itself.',
      key: 'invoke',
      label: 'Invoke',
      value: metric.invokeDurationMs,
    });
  }

  const total = metric.totalDurationMs;

  if (typeof total === 'number' && total > 0) {
    const knownDuration = parts.reduce((sum, part) => sum + part.value, 0);
    const residual = Number((total - knownDuration).toFixed(2));

    if (residual > 0.05) {
      parts.push({
        description:
          'Remaining framework scheduling, hydration bookkeeping, and observer overhead.',
        key: 'residual',
        label: 'Residual',
        value: residual,
      });
    }
  }

  return parts.map((part) => ({
    ...part,
    displayValue: formatDuration(part.value),
    percent:
      typeof total === 'number' && total > 0
        ? formatPercent(part.value, total)
        : '—',
  }));
};

export const getWebVitalsDetailItems = (
  analysis: SiteDebugRenderMetricWebVitalsAnalysis | null,
) => {
  if (!analysis) {
    return [];
  }

  return [
    {
      description:
        analysis.context === 'initial-load'
          ? 'Estimated component-local score based on paint timing, blocking, and layout stability during the initial page load.'
          : 'Estimated component-local score based on blocking and layout stability during route transition rendering.',
      key: 'score',
      label: 'Estimated Score',
      meta: getWebVitalRatingLabel(analysis.performanceScoreRating),
      tone: getWebVitalRatingTone(analysis.performanceScoreRating),
      value: formatWebVitalScore(analysis.performanceScore),
    },
    {
      description: getPaintMilestoneDescription('LCP', analysis),
      key: 'lcp',
      label: 'LCP',
      meta: getPaintMilestoneMeta('LCP', analysis),
      tone: getPaintMilestoneTone('LCP', analysis),
      value: formatDuration(analysis.lcpMs),
    },
    {
      description: getPaintMilestoneDescription('FCP', analysis),
      key: 'fcp',
      label: 'FCP',
      meta: getPaintMilestoneMeta('FCP', analysis),
      tone: getPaintMilestoneTone('FCP', analysis),
      value: formatDuration(analysis.fcpMs),
    },
    {
      description:
        'Layout-shift score observed from render start until 500 ms after completion.',
      key: 'cls',
      label: 'CLS Delta',
      meta: getWebVitalRatingLabel(analysis.clsDeltaRating),
      tone: getWebVitalRatingTone(analysis.clsDeltaRating),
      value:
        typeof analysis.clsDelta === 'number'
          ? analysis.clsDelta.toFixed(4)
          : '—',
    },
    {
      description:
        'Total long-task overlap captured inside the render window, indicating main-thread blocking pressure.',
      key: 'longtask',
      label: 'Long Tasks',
      meta:
        analysis.longTaskCount > 0
          ? `${analysis.longTaskCount} task${
              analysis.longTaskCount > 1 ? 's' : ''
            } · max ${formatDuration(analysis.maxLongTaskMs)}`
          : getWebVitalRatingLabel(analysis.longTaskRating),
      tone: getWebVitalRatingTone(analysis.longTaskRating),
      value: formatDuration(analysis.longTaskTotalMs),
    },
    {
      description:
        'Current page-wide INP snapshot. This is not directly attributed to a single component render, but helps explain interaction responsiveness.',
      key: 'inp',
      label: 'INP Snapshot',
      meta: getWebVitalRatingLabel(analysis.inpRating),
      tone: getWebVitalRatingTone(analysis.inpRating),
      value: formatDuration(analysis.inpMs),
    },
    {
      description:
        'Current page-wide TTFB snapshot captured from the navigation timing entry.',
      key: 'ttfb',
      label: 'TTFB Snapshot',
      meta: getWebVitalRatingLabel(analysis.ttfbRating),
      tone: getWebVitalRatingTone(analysis.ttfbRating),
      value: formatDuration(analysis.ttfbMs),
    },
  ].filter((item) => hasDisplayValue(item.value));
};
