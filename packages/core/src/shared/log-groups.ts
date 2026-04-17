export const CORE_LOG_GROUPS = {
  renderValidation: 'runtime.render.validation',
  ssrContainerIntegration: 'transform.ssr.container-integration',
  ssrCssInjection: 'transform.ssr.css-injection',
  transformComponentTags: 'transform.markdown.component-tags',
} as const;

export const getFrameworkComponentManagerLogGroup = (framework: string) =>
  `runtime.${framework}.component-manager`;

export const getFrameworkRenderStrategyLogGroup = (framework: string) =>
  `runtime.${framework}.render-strategy`;
