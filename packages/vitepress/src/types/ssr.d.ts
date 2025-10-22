/**
 * SSR update types
 */

type UpdateType = 'markdown-update' | 'ssr-only-component-update' | 'mounted';

export interface SSRUpdateData {
  pathname: string;
  data: {
    renderId: string;
    componentName: string;
    props: Record<string, string>;
  }[];
  updateType: UpdateType;
}

export interface SSRUpdateRenderData {
  pathname: string;
  data: {
    renderId: string;
    /**
     * ssr:only components need to maintain the loading status and order of css resources to
     * avoid css resource loading order confusion.
     */
    ssrOnlyCss: string[];
    ssrHtml: string;
  }[];
}
