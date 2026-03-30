import type { SiteDebugRenderMetric } from './debug';

export type SiteDebugWebVitalRating = 'good' | 'needs-improvement' | 'poor';

export interface SiteDebugWebVitalsSnapshot {
  cls?: number;
  fcpMs?: number;
  inpMs?: number;
  lcpMs?: number;
  ttfbMs?: number;
}

export interface SiteDebugWebVitalsLongTask {
  duration: number;
  startTime: number;
}

export interface SiteDebugWebVitalsLayoutShift {
  startTime: number;
  value: number;
}

export interface SiteDebugRenderMetricWebVitalsAnalysis {
  clsDelta: number;
  clsDeltaRating: SiteDebugWebVitalRating;
  completedBeforeFcp?: boolean;
  completedBeforeLcp?: boolean;
  context: 'initial-load' | 'route-transition';
  fcpMs?: number;
  fcpRating?: SiteDebugWebVitalRating;
  inpMs?: number;
  inpRating?: SiteDebugWebVitalRating;
  lcpMs?: number;
  lcpRating?: SiteDebugWebVitalRating;
  longTaskCount: number;
  longTaskRating: SiteDebugWebVitalRating;
  longTaskTotalMs: number;
  maxLongTaskMs: number;
  performanceScore: number;
  performanceScoreRating: SiteDebugWebVitalRating;
  renderWindowEndMs: number;
  renderWindowStartMs: number;
  summary: string;
  ttfbMs?: number;
  ttfbRating?: SiteDebugWebVitalRating;
}

interface AnalyzeRenderMetricWebVitalsInput {
  layoutShifts?: SiteDebugWebVitalsLayoutShift[];
  longTasks?: SiteDebugWebVitalsLongTask[];
  snapshot?: SiteDebugWebVitalsSnapshot | null;
}

const roundTo = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const hasFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const scoreFromThreshold = (value: number, good: number, poor: number) => {
  if (!Number.isFinite(value)) {
    return 100;
  }

  if (value <= good) {
    return 100;
  }

  if (value >= poor) {
    return 0;
  }

  return Math.round(100 - ((value - good) / (poor - good)) * 100);
};

export const getSiteDebugWebVitalRating = (
  value: number | undefined,
  thresholds: {
    good: number;
    poor: number;
  },
): SiteDebugWebVitalRating | undefined => {
  if (!hasFiniteNumber(value)) {
    return undefined;
  }

  if (value <= thresholds.good) {
    return 'good';
  }

  if (value <= thresholds.poor) {
    return 'needs-improvement';
  }

  return 'poor';
};

export const getSiteDebugPerformanceScoreRating = (
  score: number,
): SiteDebugWebVitalRating => {
  if (score >= 90) {
    return 'good';
  }

  if (score >= 50) {
    return 'needs-improvement';
  }

  return 'poor';
};

const getOverlapDuration = (
  startTime: number,
  duration: number,
  rangeStart: number,
  rangeEnd: number,
) =>
  Math.max(
    0,
    Math.min(startTime + duration, rangeEnd) - Math.max(startTime, rangeStart),
  );

const getRenderWindowStart = (metric: SiteDebugRenderMetric, endTime: number) =>
  metric.detectedAt ??
  Math.max(
    0,
    endTime -
      (metric.totalDurationMs ??
        metric.subscribeDurationMs ??
        metric.invokeDurationMs ??
        metric.waitForVisibilityMs ??
        0),
  );

const getInitialLoadBoundary = (snapshot?: SiteDebugWebVitalsSnapshot | null) =>
  Math.max(snapshot?.ttfbMs ?? 0, snapshot?.fcpMs ?? 0, snapshot?.lcpMs ?? 0);

const getMilestoneScore = (
  metric: SiteDebugRenderMetric,
  endTime: number,
  snapshot: SiteDebugWebVitalsSnapshot | null | undefined,
  context: 'initial-load' | 'route-transition',
) => {
  if (context !== 'initial-load') {
    return 100;
  }

  const isClientRenderWithoutSSR =
    metric.renderMode === 'render' && metric.hasSsrContent !== true;
  let score = 100;

  if (isClientRenderWithoutSSR) {
    if (hasFiniteNumber(snapshot?.fcpMs) && endTime > snapshot!.fcpMs!) {
      score -= 25;
    }

    if (hasFiniteNumber(snapshot?.lcpMs) && endTime > snapshot!.lcpMs!) {
      score -= 35;
    }
  } else if (hasFiniteNumber(snapshot?.lcpMs) && endTime > snapshot!.lcpMs!) {
    score -= 10;
  }

  return clamp(score, 0, 100);
};

const buildSummary = (
  metric: SiteDebugRenderMetric,
  analysis: Omit<
    SiteDebugRenderMetricWebVitalsAnalysis,
    'performanceScore' | 'performanceScoreRating' | 'summary'
  >,
) => {
  const statements: string[] = [];
  const isClientRenderWithoutSSR =
    metric.renderMode === 'render' && metric.hasSsrContent !== true;

  if (
    analysis.context === 'initial-load' &&
    isClientRenderWithoutSSR &&
    analysis.completedBeforeLcp === false
  ) {
    statements.push(
      'Client rendering completed after LCP, so this component likely missed the largest-paint window.',
    );
  } else if (
    analysis.context === 'initial-load' &&
    analysis.completedBeforeLcp === true
  ) {
    statements.push(
      'Rendering completed before LCP, keeping this component inside the initial visual loading window.',
    );
  }

  if (analysis.clsDelta > 0.05) {
    statements.push(
      'Meaningful layout shift was recorded around this render window.',
    );
  } else if (analysis.clsDelta > 0.01) {
    statements.push('A small layout shift was recorded near this render.');
  }

  if (analysis.longTaskTotalMs > 50) {
    statements.push(
      `${analysis.longTaskCount} long task${
        analysis.longTaskCount > 1 ? 's' : ''
      } overlapped with this render, increasing main-thread blocking pressure.`,
    );
  }

  if (statements.length > 0) {
    return statements.join(' ');
  }

  return analysis.context === 'initial-load'
    ? 'This render stayed ahead of major paint milestones with low blocking and no meaningful layout shift.'
    : 'This route transition render kept blocking and layout shift pressure low.';
};

export const analyzeRenderMetricWebVitals = (
  metric: SiteDebugRenderMetric,
  input: AnalyzeRenderMetricWebVitalsInput,
): SiteDebugRenderMetricWebVitalsAnalysis | null => {
  const endTime = metric.updatedAt;
  const hasCompletedWindow =
    metric.status === 'completed' ||
    metric.status === 'failed' ||
    metric.status === 'skipped' ||
    hasFiniteNumber(metric.totalDurationMs);

  if (!hasFiniteNumber(endTime) || endTime <= 0 || !hasCompletedWindow) {
    return null;
  }

  const renderWindowStartMs = getRenderWindowStart(metric, endTime);
  const renderWindowEndMs = endTime;
  const snapshot = input.snapshot ?? null;
  const layoutShifts = input.layoutShifts ?? [];
  const longTasks = input.longTasks ?? [];
  const initialLoadBoundary = getInitialLoadBoundary(snapshot);
  const context =
    initialLoadBoundary > 0 && renderWindowStartMs <= initialLoadBoundary + 1000
      ? 'initial-load'
      : 'route-transition';
  const clsWindowEndMs = renderWindowEndMs + 500;
  const clsDelta = roundTo(
    layoutShifts.reduce((total, entry) => {
      if (
        !hasFiniteNumber(entry.startTime) ||
        !hasFiniteNumber(entry.value) ||
        entry.startTime < renderWindowStartMs ||
        entry.startTime > clsWindowEndMs
      ) {
        return total;
      }

      return total + entry.value;
    }, 0),
    4,
  );

  const overlappingLongTaskDurations = longTasks
    .map((entry) =>
      getOverlapDuration(
        entry.startTime,
        entry.duration,
        renderWindowStartMs,
        renderWindowEndMs,
      ),
    )
    .filter((value) => value > 0);
  const longTaskTotalMs = roundTo(
    overlappingLongTaskDurations.reduce((sum, value) => sum + value, 0),
    2,
  );
  const maxLongTaskMs = roundTo(
    Math.max(0, ...overlappingLongTaskDurations),
    2,
  );
  const completedBeforeFcp =
    context === 'initial-load' && hasFiniteNumber(snapshot?.fcpMs)
      ? renderWindowEndMs <= snapshot!.fcpMs!
      : undefined;
  const completedBeforeLcp =
    context === 'initial-load' && hasFiniteNumber(snapshot?.lcpMs)
      ? renderWindowEndMs <= snapshot!.lcpMs!
      : undefined;

  const durationScore = scoreFromThreshold(
    metric.totalDurationMs ??
      metric.subscribeDurationMs ??
      metric.invokeDurationMs ??
      0,
    40,
    260,
  );
  const longTaskScore = scoreFromThreshold(
    longTaskTotalMs + maxLongTaskMs * 0.5,
    50,
    320,
  );
  const clsScore = scoreFromThreshold(clsDelta, 0.01, 0.1);
  const milestoneScore = getMilestoneScore(
    metric,
    renderWindowEndMs,
    snapshot,
    context,
  );
  const performanceScore = Math.round(
    context === 'initial-load'
      ? durationScore * 0.3 +
          longTaskScore * 0.3 +
          clsScore * 0.2 +
          milestoneScore * 0.2
      : durationScore * 0.45 + longTaskScore * 0.35 + clsScore * 0.2,
  );

  const analysisBase = {
    clsDelta,
    clsDeltaRating:
      getSiteDebugWebVitalRating(clsDelta, {
        good: 0.01,
        poor: 0.05,
      }) ?? 'good',
    completedBeforeFcp,
    completedBeforeLcp,
    context,
    fcpMs: snapshot?.fcpMs,
    fcpRating: getSiteDebugWebVitalRating(snapshot?.fcpMs, {
      good: 1800,
      poor: 3000,
    }),
    inpMs: snapshot?.inpMs,
    inpRating: getSiteDebugWebVitalRating(snapshot?.inpMs, {
      good: 200,
      poor: 500,
    }),
    lcpMs: snapshot?.lcpMs,
    lcpRating: getSiteDebugWebVitalRating(snapshot?.lcpMs, {
      good: 2500,
      poor: 4000,
    }),
    longTaskCount: overlappingLongTaskDurations.length,
    longTaskRating:
      getSiteDebugWebVitalRating(longTaskTotalMs, {
        good: 50,
        poor: 200,
      }) ?? 'good',
    longTaskTotalMs,
    maxLongTaskMs,
    renderWindowEndMs,
    renderWindowStartMs,
    ttfbMs: snapshot?.ttfbMs,
    ttfbRating: getSiteDebugWebVitalRating(snapshot?.ttfbMs, {
      good: 800,
      poor: 1800,
    }),
  } satisfies Omit<
    SiteDebugRenderMetricWebVitalsAnalysis,
    'performanceScore' | 'performanceScoreRating' | 'summary'
  >;

  return {
    ...analysisBase,
    performanceScore,
    performanceScoreRating:
      getSiteDebugPerformanceScoreRating(performanceScore),
    summary: buildSummary(metric, analysisBase),
  };
};
