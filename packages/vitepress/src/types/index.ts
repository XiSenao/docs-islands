import type { Colors } from 'picocolors/types';
import type React from 'react';
import type { Rollup } from 'vite';

export const ConsoleTheme = {
  ERROR: 'red',
  SUCCESS: 'green',
  WARNING: 'yellow',
  INFO: 'blue',
  ERROR_LIGHT: 'redBright',
} as const;

export type ConsoleThemeValue =
  (typeof ConsoleTheme)[keyof typeof ConsoleTheme];

export type RenderDirective =
  | 'client:only'
  | 'client:load'
  | 'client:visible'
  | 'ssr:only';

type ColorsKeys = keyof Colors;

export const ConsoleThemeMap: Record<ConsoleThemeValue, ColorsKeys> = {
  [ConsoleTheme.ERROR]: 'red',
  [ConsoleTheme.SUCCESS]: 'greenBright',
  [ConsoleTheme.WARNING]: 'yellow',
  [ConsoleTheme.INFO]: 'blue',
  [ConsoleTheme.ERROR_LIGHT]: 'redBright',
};

export interface PrintOptions {
  theme?: ConsoleThemeValue;
  bold?: boolean;
}

export interface ComponentBundleInfo {
  componentPath: string;
  componentName: string;
  importReference: { importedName: string; identifier: string };
  pendingRenderIds: Set<string>;
  renderDirectives: Set<RenderDirective>;
}

export interface ConfigType {
  root: string;
  outDir: string;
  base: string;
  srcDir: string;
  assetsDir: string;
  mpa: boolean;
  publicDir: string;
  cacheDir: string;
  cleanUrls: boolean;
  wrapBaseUrl: (path: string) => string;
}

export interface UsedSnippetContainerType {
  renderId: string;
  renderDirective: RenderDirective;
  renderComponent: string;
  useSpaSyncRender: boolean;
  props: Map<string, string>;
  ssrHtml?: string;
  ssrCssBundlePaths?: Set<string>;
}

type UpdateType = 'markdown-update' | 'ssr-only-component-update' | 'mounted';

export interface SSRUpdateData {
  pathname: string;
  data: Array<{
    renderId: string;
    componentName: string;
    props: Record<string, string>;
  }>;
  updateType: UpdateType;
}

export interface SSRUpdateRenderData {
  pathname: string;
  data: Array<{
    renderId: string;
    /**
     * ssr:only components need to maintain the loading status and order of css resources to
     * avoid css resource loading order confusion.
     */
    ssrOnlyCss: string[];
    ssrHtml: string;
  }>;
}

export interface ComponentInfo {
  name: string;
  Component: React.ComponentType<Record<string, string>>;
  renderDirectives: Set<RenderDirective>;
  loadTime: number;
}

export interface PageMetafile {
  loaderScript: string;
  modulePreloads: string[];
  cssBundlePaths: string[];
  ssrInjectScript: string;
}

export type OutputAsset = Rollup.OutputAsset;
export type OutputChunk = Rollup.OutputChunk;
export type RollupOutput = Rollup.RollupOutput;
