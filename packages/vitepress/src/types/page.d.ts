import type React from 'react';
import type { RenderDirective } from './render';

/**
 * Component information for runtime
 */
export interface ComponentInfo {
  name: string;
  Component: React.ComponentType<Record<string, string>>;
  renderDirectives: Set<RenderDirective>;
  loadTime: number;
}

/**
 * Page metafile containing bundle information
 */
export interface PageMetafile {
  loaderScript: string;
  modulePreloads: string[];
  cssBundlePaths: string[];
  ssrInjectScript: string;
}
