import type {
  DocsClientIntegrationContext,
  DocsDevBridge,
  DocsLifecycleAdapter,
  DocsRuntimeContext,
  DocsRuntimeExecutorLike,
  DocsRuntimeManagerLike,
} from '../types/client';

export interface CreateDocsClientIntegrationOptions<
  TManager extends DocsRuntimeManagerLike = DocsRuntimeManagerLike,
  TExecutor extends DocsRuntimeExecutorLike = DocsRuntimeExecutorLike,
> {
  devBridge?: DocsDevBridge<TManager, TExecutor>;
  lifecycle: DocsLifecycleAdapter;
  manager: TManager;
  mode: 'dev' | 'prod';
  mpa?: boolean;
  renderStrategy: TExecutor;
}

export interface DocsClientIntegration {
  initialize: () => Promise<void>;
}

export function createDocsClientIntegration<
  TManager extends DocsRuntimeManagerLike = DocsRuntimeManagerLike,
  TExecutor extends DocsRuntimeExecutorLike = DocsRuntimeExecutorLike,
>(
  options: CreateDocsClientIntegrationOptions<TManager, TExecutor>,
): DocsClientIntegration {
  let currentLocationPathname = '';
  let isInitialLoad = true;

  const context: DocsClientIntegrationContext<TManager, TExecutor> = {
    lifecycle: options.lifecycle,
    manager: options.manager,
    renderStrategy: options.renderStrategy,
  };

  const executeRuntime = async (
    runtimeContext: DocsRuntimeContext,
  ): Promise<void> => {
    await options.renderStrategy.executeRuntime(runtimeContext);
  };

  return {
    async initialize(): Promise<void> {
      if (!options.lifecycle.inBrowser || globalThis.window === undefined) {
        return;
      }

      if (options.mode === 'dev') {
        await options.manager.initialize({
          mode: 'dev',
        });
        await options.devBridge?.initialize(context);
        return;
      }

      await options.manager.initialize({
        currentPageId: options.lifecycle.getPageId(),
        mode: 'prod',
        mpa: options.mpa,
        preferInjectedCurrentMeta: true,
        preloadCurrentPage: !options.mpa,
      });

      if (options.mpa) {
        await options.manager.ensureFrameworkRuntime();
      }

      if (isInitialLoad) {
        const pageId = options.lifecycle.getPageId();
        await executeRuntime({
          isInitialLoad: true,
          pageId,
        });
        isInitialLoad = false;
        currentLocationPathname = pageId;
      }

      options.lifecycle.onContentUpdated(() => {
        const pageId = options.lifecycle.getPageId();
        if (currentLocationPathname === pageId) {
          return;
        }

        currentLocationPathname = pageId;
        executeRuntime({
          isInitialLoad: false,
          pageId,
        });
      });
    },
  };
}
