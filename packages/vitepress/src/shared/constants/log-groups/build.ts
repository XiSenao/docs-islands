export const VITEPRESS_BUILD_LOG_GROUPS = {
  frameworkBrowserBundle: 'build.framework.bundle.browser',
  frameworkMpaIntegration: 'build.framework.mpa-integration',
  frameworkSsrBundle: 'build.framework.bundle.ssr',
  frameworkBuildFinalize: 'build.framework-build.finalize',
  frameworkBuildSsrIntegration: 'build.framework-build.ssr-integration',
  frameworkBuildTransformHtml: 'build.framework-build.transform-html',
  sharedClientRuntimeMetafile: 'build.shared-client-runtime.metafile',
} as const;
