export const REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID =
  'virtual:react/inject-runtime.tsx';
export const REACT_HMR_EVENT_NAMES = {
  fastRefreshPrepare: 'docs-islands:react-hmr:prepare:fast-refresh',
  markdownPrepare: 'docs-islands:react-hmr:prepare:markdown',
  markdownRender: 'docs-islands:react-hmr:render:markdown',
  mountRender: 'docs-islands:react-hmr:render:mount',
  ssrOnlyPrepare: 'docs-islands:react-hmr:prepare:ssr-only',
  ssrOnlyRender: 'docs-islands:react-hmr:render:ssr-only',
  ssrRenderRequest: 'docs-islands:react-hmr:request:ssr-render',
} as const;
export * from '@docs-islands/core/shared/constants';
