import type { RenderDirective } from './render';

/**
 * Component bundle information during build
 */
export interface ComponentBundleInfo {
  componentPath: string;
  componentName: string;
  importReference: { importedName: string; identifier: string };
  pendingRenderIds: Set<string>;
  renderDirectives: Set<RenderDirective>;
}

/**
 * Used snippet container type for component rendering
 */
export interface UsedSnippetContainerType {
  renderId: string;
  renderDirective: RenderDirective;
  renderComponent: string;
  useSpaSyncRender: boolean;
  props: Map<string, string>;
  ssrHtml?: string;
  ssrCssBundlePaths?: Set<string>;
}
