import type { DocsIslandsResolvedUserConfig } from '../../core/config';
import type { RenderingIntegrationPluginContext } from '../../core/integration-plugin';
import {
  createSiteDevToolsCapability,
  type SiteDevToolsCapability,
} from '../../site-devtools/capability';
import { ReactRenderController } from './react-render-controller';

export interface ReactIntegrationPluginContext
  extends RenderingIntegrationPluginContext {
  renderController: ReactRenderController;
  siteDevtools: SiteDevToolsCapability;
}

export function createReactIntegrationContext(
  baseContext: RenderingIntegrationPluginContext,
  resolvedUserConfig: DocsIslandsResolvedUserConfig,
): ReactIntegrationPluginContext {
  const siteDevtools = createSiteDevToolsCapability(
    resolvedUserConfig.siteDevtoolsEnabled,
  );

  return Object.assign(Object.create(baseContext), {
    siteDevtools,
    renderController: new ReactRenderController({
      enableSiteDevToolsRuntime: siteDevtools.enabled,
    }),
  });
}
