/// <reference types="vite/client" />

import type { PageMetafile } from '#dep-types/page';
import type {
  ReactComponentManager,
  ReactInjectComponent,
} from '#dep-types/react';
import type { RENDER_STRATEGY_CONSTANTS } from '#shared/constants';
import type * as ReactDOMClient from 'react-dom/client';
import type { DefaultTheme, SiteConfig } from 'vitepress';

/**
 * Compatible VitePress extension types.
 * https://github.com/vuejs/vitepress/blob/6dfcdd3fe8dc73e7b4ad7783df9530dedac1f6bd/src/node/plugin.ts#L36-L40
 */
declare module 'vite' {
  interface UserConfig {
    vitepress?: SiteConfig<DefaultTheme.Config>;
  }
}

declare global {
  // Define-time global constant injected via bundler `define`.
  const __BASE__: string | undefined;

  // Global React and ReactDOM runtime (loaded dynamically)
  var React: typeof React | undefined;
  var ReactDOM: typeof ReactDOMClient | undefined;

  interface Window {
    __VP_SITE_DATA__?: {
      base?: string;
      cleanUrls?: boolean;
    };
    React?: typeof React;
    ReactDOM?: typeof ReactDOMClient;

    [RENDER_STRATEGY_CONSTANTS.pageMetafile]: Record<string, PageMetafile>;
    [RENDER_STRATEGY_CONSTANTS.componentManager]?: ReactComponentManager;
    [RENDER_STRATEGY_CONSTANTS.injectComponent]: ReactInjectComponent;
  }
}
