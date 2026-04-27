export const VITEPRESS_RUNTIME_LOG_GROUPS = {
  /**
   * cssLoading is an uncontrolled log group,
   * used only for internal source code debugging
   * within the docs-islands project.
   */
  cssLoading: 'runtime.css.loading',
  reactClientLoader: 'runtime.react.client-loader',
  reactComponentManager: 'runtime.react.component-manager',
  reactDevContentUpdated: 'runtime.react.dev-content-updated',
  reactDevMountFallback: 'runtime.react.dev-mount.fallback',
  reactDevMountRender: 'runtime.react.dev-mount.render',
  reactDevRender: 'runtime.react.dev-render',
  reactDevRuntimeLoader: 'runtime.react.dev-runtime-loader',
} as const;
