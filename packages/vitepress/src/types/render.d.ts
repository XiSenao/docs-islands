/**
 * Render directives for component rendering strategies
 */
export type RenderDirective =
  | 'client:only'
  | 'client:load'
  | 'client:visible'
  | 'ssr:only';
