/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_METAFILE_META_NAMES,
  RENDER_STRATEGY_CONSTANTS,
} from '../../../shared/constants';
import { SITE_DEBUG_PAGE_METAFILE_EVENT_NAME } from '../../../shared/debug';
import { ReactComponentManager } from '../react-component-manager';

vi.mock('#shared/logger', () => ({
  default: () => ({
    getLoggerByGroup: () => ({
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
    }),
  }),
}));

vi.mock('#shared/debug', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/debug')>();

  return {
    ...actual,
    createSiteDebugLogger: () => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
    dispatchSiteDebugPageMetafileEvent: (detail: unknown) => {
      globalThis.dispatchEvent(
        new CustomEvent(actual.SITE_DEBUG_PAGE_METAFILE_EVENT_NAME, {
          detail,
        }),
      );

      return true;
    },
    getSiteDebugNow: () => 0,
    isSiteDebugEnabled: () => true,
  };
});

vi.mock('@docs-islands/utils/logger', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@docs-islands/utils/logger')>();

  return {
    ...actual,
    formatErrorMessage: (error: unknown) =>
      error instanceof Error ? error.message : String(error),
  };
});

describe('ReactComponentManager page metafile loading', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window[RENDER_STRATEGY_CONSTANTS.pageMetafile] = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window[RENDER_STRATEGY_CONSTANTS.pageMetafile] = {};
  });

  it('loads the hashed page metafile index plus the current page metafile', async () => {
    const pageMetafileEvents: {
      buildId?: string | null;
      kind: string;
      pageCount: number;
      pageId?: string;
    }[] = [];
    const handlePageMetafileEvent = (event: Event) => {
      pageMetafileEvents.push(
        (
          event as CustomEvent<{
            buildId?: string | null;
            kind: string;
            pageCount: number;
            pageId?: string;
          }>
        ).detail,
      );
    };
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/docs/assets/page-metafiles/manifest.11111111.json') {
        return {
          ok: true,
          json: async () => ({
            buildId: 'cafefeed',
            pages: {
              '/guide/how-it-works': {
                file: '/docs/assets/page-metafiles/pages/guide/how-it-works.22222222.json',
                loaderScript: '/docs/assets/unified-loader.core.js',
                ssrInjectScript: '/docs/assets/ssr.core.js',
              },
              '/zh/': {
                file: '/docs/assets/page-metafiles/pages/zh/index.33333333.json',
                loaderScript: '/docs/assets/unified-loader.zh.js',
                ssrInjectScript: '',
              },
            },
            schemaVersion: 1,
          }),
        };
      }

      if (
        input ===
        '/docs/assets/page-metafiles/pages/guide/how-it-works.22222222.json'
      ) {
        return {
          ok: true,
          json: async () => ({
            buildId: 'cafefeed',
            buildMetrics: {
              components: [],
              framework: 'react',
              loader: null,
              spaSyncEffects: null,
              ssrInject: null,
              totalEstimatedComponentBytes: 0,
            },
            cssBundlePaths: ['/docs/assets/core.css'],
            loaderScript: '/docs/assets/unified-loader.core.js',
            modulePreloads: ['/docs/assets/core.module.js'],
            pathname: '/guide/how-it-works',
            schemaVersion: 1,
            ssrInjectScript: '/docs/assets/ssr.core.js',
          }),
        };
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    vi.stubGlobal('fetch', fetchMock);
    globalThis.addEventListener(
      SITE_DEBUG_PAGE_METAFILE_EVENT_NAME,
      handlePageMetafileEvent as EventListener,
    );
    document.head.innerHTML = `
      <meta name="${PAGE_METAFILE_META_NAMES.index}" content="/docs/assets/page-metafiles/manifest.11111111.json">
      <meta name="${PAGE_METAFILE_META_NAMES.current}" content="/docs/assets/page-metafiles/pages/guide/how-it-works.22222222.json">
    `;

    const manager = new ReactComponentManager();

    await (manager as any).loadPageMetafileIndex();
    await (manager as any).ensurePageMetafile('/guide/how-it-works', {
      preferInjectedCurrentMeta: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/docs/assets/page-metafiles/manifest.11111111.json',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/docs/assets/page-metafiles/pages/guide/how-it-works.22222222.json',
    );
    expect(manager.getPageComponentInfo('/guide/how-it-works')).toMatchObject({
      buildId: 'cafefeed',
      pathname: '/guide/how-it-works',
    });
    expect(manager.getAllInitialModulePreloadScripts().toSorted()).toEqual([
      '/docs/assets/ssr.core.js',
      '/docs/assets/unified-loader.core.js',
      '/docs/assets/unified-loader.zh.js',
    ]);
    expect(window[RENDER_STRATEGY_CONSTANTS.pageMetafile]).toMatchObject({
      '/guide/how-it-works': expect.objectContaining({
        loaderScript: '/docs/assets/unified-loader.core.js',
      }),
    });
    expect(pageMetafileEvents).toContainEqual(
      expect.objectContaining({
        buildId: 'cafefeed',
        kind: 'page-loaded',
        pageCount: 1,
        pageId: '/guide/how-it-works',
      }),
    );
    globalThis.removeEventListener(
      SITE_DEBUG_PAGE_METAFILE_EVENT_NAME,
      handlePageMetafileEvent as EventListener,
    );
  });

  it('loads route metafiles lazily from the manifest index on demand', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/docs/assets/page-metafiles/manifest.aaaaaaaa.json') {
        return {
          ok: true,
          json: async () => ({
            buildId: 'deadbeef',
            pages: {
              '/zh/': {
                file: '/docs/assets/page-metafiles/pages/zh/index.bbbbbbbb.json',
                loaderScript: '/docs/assets/unified-loader.zh.js',
                ssrInjectScript: '',
              },
            },
            schemaVersion: 1,
          }),
        };
      }

      if (
        input === '/docs/assets/page-metafiles/pages/zh/index.bbbbbbbb.json'
      ) {
        return {
          ok: true,
          json: async () => ({
            buildId: 'deadbeef',
            cssBundlePaths: [],
            loaderScript: '/docs/assets/unified-loader.zh.js',
            modulePreloads: ['/docs/assets/zh.module.js'],
            pathname: '/zh/',
            schemaVersion: 1,
            ssrInjectScript: '',
          }),
        };
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    vi.stubGlobal('fetch', fetchMock);
    document.head.innerHTML = `
      <meta name="${PAGE_METAFILE_META_NAMES.index}" content="/docs/assets/page-metafiles/manifest.aaaaaaaa.json">
    `;

    const manager = new ReactComponentManager();

    await (manager as any).loadPageMetafileIndex();
    await (manager as any).ensurePageMetafile('/zh/');

    expect(fetchMock).toHaveBeenCalledWith(
      '/docs/assets/page-metafiles/pages/zh/index.bbbbbbbb.json',
    );
    expect(manager.getPageComponentInfo('/zh/')).toMatchObject({
      buildId: 'deadbeef',
      pathname: '/zh/',
    });
  });
});
