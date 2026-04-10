import type { RenderDirective } from './render';

export interface ComponentBundleInfo {
  componentPath: string;
  componentName: string;
  importReference: { importedName: string; identifier: string };
  pendingRenderIds: Set<string>;
  renderDirectives: Set<RenderDirective>;
}

export interface UsedSnippetContainerType {
  renderId: string;
  renderDirective: RenderDirective;
  renderComponent: string;
  sourcePath?: string;
  useSpaSyncRender: boolean;
  props: Map<string, string>;
  ssrHtml?: string;
  ssrCssBundlePaths?: Set<string>;
}
