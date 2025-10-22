import type { RenderDirective } from '#dep-types/render';
import type { ConfigType } from '#dep-types/utils';
import type React from 'react';
import type { Plugin } from 'vitepress';
import type { RenderController } from './render-controller';

export interface FrameworkAdapterConstants {
  attr: {
    renderId: string;
    renderDirective: string;
    renderComponent: string;
    renderWithSpaSync: string;
  };
  windowKeys: {
    injectComponent: string;
    componentManager: string;
    pageMetafile: string;
  };
  allowedDirectives: readonly RenderDirective[];
  needPreRenderDirectives: readonly RenderDirective[];
}

export interface FrameworkAdapter {
  readonly name: string;

  // constants & keys namespace for this framework
  readonly constants: FrameworkAdapterConstants;

  // vite plugins used by browser/ssr bundling for this framework
  browserBundlerPlugins: () => Plugin[];
  ssrBundlerPlugins: () => Plugin[];

  // client integration
  clientEntryModule: () => string;

  // generate dev runtime code (HMR/SPA) for current pathname
  generateDevRuntime: (
    pathname: string,
    cfg: ConfigType,
    rc: RenderController,
  ) => Promise<string>;

  // SSR render implementation for this framework
  renderToString: (
    component: React.ComponentType<Record<string, string>>,
    props: Record<string, string>,
  ) => string;

  // externalize runtime (map framework runtime to window in browser build)
  externalizeRuntimePlugin: () => Plugin;
}

export { type RenderController } from './render-controller';
