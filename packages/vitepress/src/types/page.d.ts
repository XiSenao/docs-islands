import type {
  BuildReportReferenceBase,
  ComponentBuildMetricAiReportsBase,
  ComponentBuildMetricBase,
  PageMetafile as CorePageMetafile,
  PageBuildMetricsBase,
} from '@docs-islands/core/types/page';
import type React from 'react';
import type { RenderDirective } from './render';
import type { SiteDebugAiProvider } from './utils';

/**
 * Component information for runtime
 */
export interface ComponentInfo {
  name: string;
  Component: React.ComponentType<Record<string, string>>;
  renderDirectives: Set<RenderDirective>;
  loadTime: number;
}

export type {
  BundleAssetMetric,
  BundleModuleMetric,
  PageBuildRenderInstanceMetric,
  PageMetafileManifest,
  PageMetafileManifestEntry,
  RuntimeBundleMetric,
  SpaSyncComponentSideEffectMetric,
  SpaSyncPageBuildEffects,
} from '@docs-islands/core/types/page';

export interface SiteDebugAiBuildReportReference
  extends BuildReportReferenceBase {
  provider: SiteDebugAiProvider;
}

export type ComponentBuildMetricAiReports =
  ComponentBuildMetricAiReportsBase<SiteDebugAiBuildReportReference>;

export type ComponentBuildMetric =
  ComponentBuildMetricBase<ComponentBuildMetricAiReports>;

export type PageBuildMetrics = PageBuildMetricsBase<
  ComponentBuildMetric,
  SiteDebugAiBuildReportReference[]
>;

export type PageMetafile = CorePageMetafile<PageBuildMetrics>;
