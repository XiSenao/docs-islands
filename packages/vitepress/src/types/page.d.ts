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

export interface BundleAssetMetric {
  bytes: number;
  file: string;
  type: 'asset' | 'css' | 'js';
}

export interface BundleModuleMetric {
  bytes: number;
  file: string;
  id: string;
  sourceAssetFile?: string;
  sourcePath?: string;
}

export interface RuntimeBundleMetric {
  entryFile: string;
  files: BundleAssetMetric[];
  totalBytes: number;
}

export interface ComponentBuildMetric {
  aiReports?: ComponentBuildMetricAiReports;
  componentName: string;
  entryFile: string;
  estimatedAssetBytes: number;
  estimatedCssBytes: number;
  estimatedJsBytes: number;
  estimatedTotalBytes: number;
  files: BundleAssetMetric[];
  framework: string;
  modules: BundleModuleMetric[];
  renderDirectives: RenderDirective[];
  sourcePath: string;
}

export interface SiteDebugAiBuildReportReference {
  detail?: string;
  generatedAt: string;
  model?: string;
  provider: SiteDebugAiProvider;
  reportId: string;
  reportLabel: string;
  reportFile: string;
}

export interface ComponentBuildMetricAiReports {
  chunkReports?: Record<string, SiteDebugAiBuildReportReference[]>;
  moduleReports?: Record<string, SiteDebugAiBuildReportReference[]>;
}

export interface SpaSyncComponentSideEffectMetric {
  blockingCssBytes: number;
  blockingCssCount: number;
  blockingCssFiles: BundleAssetMetric[];
  componentName: string;
  embeddedHtmlPatches: {
    bytes: number;
    html: string;
    renderId: string;
  }[];
  embeddedHtmlBytes: number;
  renderDirectives: RenderDirective[];
  renderIds: string[];
  requiresCssLoadingRuntime: boolean;
}

export interface SpaSyncPageBuildEffects {
  components: SpaSyncComponentSideEffectMetric[];
  enabledComponentCount: number;
  enabledRenderCount: number;
  totalBlockingCssBytes: number;
  totalBlockingCssCount: number;
  totalEmbeddedHtmlBytes: number;
  usesCssLoadingRuntime: boolean;
}

export interface PageBuildMetrics {
  aiReports?: SiteDebugAiBuildReportReference[];
  components: ComponentBuildMetric[];
  framework: string;
  loader: RuntimeBundleMetric | null;
  spaSyncEffects: SpaSyncPageBuildEffects | null;
  ssrInject: RuntimeBundleMetric | null;
  totalEstimatedComponentBytes: number;
}

/**
 * Page metafile containing bundle information
 */
export interface PageMetafile {
  buildId?: string;
  buildMetrics?: PageBuildMetrics;
  loaderScript: string;
  modulePreloads: string[];
  pathname?: string;
  cssBundlePaths: string[];
  schemaVersion?: number;
  ssrInjectScript: string;
}

export interface PageMetafileManifestEntry {
  file: string;
  loaderScript: string;
  ssrInjectScript: string;
}

export interface PageMetafileManifest {
  buildId: string;
  pages: Record<string, PageMetafileManifestEntry>;
  schemaVersion: number;
}
