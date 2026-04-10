/**
 * @vitest-environment jsdom
 */
import type {
  DocsClientIntegrationContext,
  RenderContainerInfo,
} from '@docs-islands/core/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VitePressDevBridge } from '../vitepress-dev-bridge';

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

vi.mock('@docs-islands/utils/logger', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@docs-islands/utils/logger')>();

  return {
    ...actual,
    formatErrorMessage: (error: unknown) =>
      error instanceof Error ? error.message : String(error),
  };
});

describe('VitePressDevBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(import.meta, 'hot', {
      configurable: true,
      value: {
        on: vi.fn(),
        send: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loads the dev runtime after content updates when the page only has client-render containers', async () => {
    let onContentUpdatedHandler: (() => void) | null = null;
    const lifecycle = {
      getPageId: () => '/guide/runtime',
      inBrowser: true,
      onContentUpdated: vi.fn((callback: () => void) => {
        onContentUpdatedHandler = callback;
      }),
    };
    const renderStrategy = {
      collectRenderContainers: vi.fn((): RenderContainerInfo[] => [
        {
          element: document.createElement('div'),
          props: {
            title: 'Runtime only',
          },
          renderComponent: 'ClientOnlyCard',
          renderDirective: 'client:only',
          renderId: 'client-only-card',
          renderWithSpaSync: false,
        },
      ]),
      executeRuntime: vi.fn(),
    };
    const bridge = new VitePressDevBridge({
      createDevRuntimeUrl: (pathname, timestamp) =>
        `/@id/__docs_islands__${pathname}?t=${timestamp}`,
    });
    const loadDevRenderRuntime = vi
      .spyOn(bridge, 'loadDevRenderRuntime')
      .mockResolvedValue();

    await bridge.initialize({
      lifecycle,
      manager: {} as any,
      renderStrategy,
    } as DocsClientIntegrationContext);

    expect(lifecycle.onContentUpdated).toHaveBeenCalledTimes(1);

    onContentUpdatedHandler?.();
    await vi.advanceTimersByTimeAsync(32);
    await Promise.resolve();

    expect(loadDevRenderRuntime).toHaveBeenCalledWith('/guide/runtime');
  });
});
