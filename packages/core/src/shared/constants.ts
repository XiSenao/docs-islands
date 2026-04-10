import type { RenderDirective } from '../types/render';

export const DIRNAME_VAR_NAME = '__INJECTED_ORIGINAL_DIRNAME__';

export const RENDER_STRATEGY_CONSTANTS = {
  renderId: '__RENDER_ID__',
  renderDirective: '__RENDER_DIRECTIVE__',
  renderComponent: '__RENDER_COMPONENT__',
  renderWithSpaSync: '__SPA_SYNC_RENDER__',
  renderClientInDev: '__RENDER_CLIENT_IN_DEV__',
  reactInlineComponentReference: '__RENDER_INLINE_COMPONENT_REFERENCE__',
  inlinePathResolver: '__INLINE_PATH_RESOLVER__',
  injectComponent: '__INJECT_COMPONENT__',
  componentManager: '__COMPONENT_MANAGER__',
  pageMetafile: '__PAGE_METAFILE__',
} as const;

export const PAGE_METAFILE_META_NAMES = {
  current: 'docs-islands-page-metafile-current',
  index: 'docs-islands-page-metafile-index',
} as const;

export const SPA_RENDER_SYNC_ON = ['spa:sr', 'spa:sync-render'] as const;
export const SPA_RENDER_SYNC_OFF = [
  'spa:sr:disable',
  'spa:sync-render:disable',
] as const;

export const RENDER_STRATEGY_ATTRS: readonly string[] = [
  RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
  RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
  RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
  RENDER_STRATEGY_CONSTANTS.renderWithSpaSync.toLowerCase(),
] as const;

export const ALLOWED_RENDER_DIRECTIVES: readonly RenderDirective[] = [
  'client:only',
  'client:load',
  'client:visible',
  'ssr:only',
] as const;

export const NEED_PRE_RENDER_DIRECTIVES: readonly RenderDirective[] = [
  'client:load',
  'client:visible',
  'ssr:only',
] as const;

export const HMR_FLAG = {
  Reuse: 0b0000,
  Deletion: 0b0001,
  Update: 0b0010,
  Addition: 0b0100,
} as const;
