import { registerUIFrameworkBuildHooks } from '../ui-bundler/build-hooks';
import { reactAdapter } from './adapter';
import type { ReactIntegrationPluginContext } from './context';

export function registerReactBuildHooks(
  context: ReactIntegrationPluginContext,
): void {
  registerUIFrameworkBuildHooks(
    context.vitepressConfig,
    context.siteConfig,
    context.resolution,
    context.renderController,
    {
      adapter: reactAdapter,
      preloadFrameworkRuntimeOnEveryPage: true,
      siteDebugEnabled: context.siteDebug.enabled,
    },
  );
}
