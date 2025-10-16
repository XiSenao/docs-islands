/// <reference types="vite/client" />

import type { RENDER_STRATEGY_CONSTANTS } from '@docs-islands/vitepress-shared/constants';
import type { PageMetafile } from '@docs-islands/vitepress-types';
import type { DefaultTheme, SiteConfig } from 'vitepress';
import type {
  ReactComponentManager,
  ReactInjectComponent,
} from '../src/client/react';

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
  interface Window {
    __VP_SITE_DATA__?: {
      base?: string;
      cleanUrls?: boolean;
    };
    React?: import('react');
    ReactDOM?: import('react-dom/client');

    [RENDER_STRATEGY_CONSTANTS.pageMetafile]: Record<string, PageMetafile>;
    [RENDER_STRATEGY_CONSTANTS.componentManager]?: ReactComponentManager;
    [RENDER_STRATEGY_CONSTANTS.injectComponent]: ReactInjectComponent;
  }
}

export {};
