export const CORE_RUNTIME_LOG_GROUPS = {
  renderValidation: 'runtime.render.validation',
} as const;

export const getFrameworkComponentManagerLogGroup = (framework: string) =>
  `runtime.${framework}.component-manager`;

export const getFrameworkRenderStrategyLogGroup = (framework: string) =>
  `runtime.${framework}.render-strategy`;
