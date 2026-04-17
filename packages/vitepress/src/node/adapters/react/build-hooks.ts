import { registerUIFrameworkBuildHooks } from '../../framework-build/build-hooks';
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
      siteDevtoolsEnabled: context.siteDevtools.enabled,
    },
  );
}
