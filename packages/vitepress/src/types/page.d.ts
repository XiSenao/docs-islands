import type {
  BuildReportReferenceBase,
  ComponentBuildMetricAiReportsBase,
  ComponentBuildMetricBase,
  PageMetafile as CorePageMetafile,
  PageBuildMetricsBase,
} from '@docs-islands/core/types/page';
import type React from 'react';
import type { RenderDirective } from './render';
import type { SiteDevToolsAiProvider } from './utils';

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

export interface SiteDevToolsAiBuildReportReference
  extends BuildReportReferenceBase {
  provider: SiteDevToolsAiProvider;
}

export type ComponentBuildMetricAiReports =
  ComponentBuildMetricAiReportsBase<SiteDevToolsAiBuildReportReference>;

export type ComponentBuildMetric =
  ComponentBuildMetricBase<ComponentBuildMetricAiReports>;

export type PageBuildMetrics = PageBuildMetricsBase<
  ComponentBuildMetric,
  SiteDevToolsAiBuildReportReference[]
>;

export type PageMetafile = CorePageMetafile<PageBuildMetrics>;
