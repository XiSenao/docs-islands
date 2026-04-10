import type { RenderingIntegrationPluginContext } from '../core/integration-plugin';
import {
  createSiteDebugCapability,
  type SiteDebugCapability,
} from '../site-debug/capability';
import {
  applyReactViteBaseConfig,
  type ReactResolvedUserConfig,
} from './config';
import { ReactRenderController } from './react-render-controller';

export interface ReactIntegrationPluginContext
  extends RenderingIntegrationPluginContext {
  renderController: ReactRenderController;
  siteDebug: SiteDebugCapability;
}

export function createReactIntegrationContext(
  baseContext: RenderingIntegrationPluginContext,
  resolvedUserConfig: ReactResolvedUserConfig,
): ReactIntegrationPluginContext {
  const { siteConfig, vitepressConfig } = baseContext;

  applyReactViteBaseConfig(vitepressConfig, siteConfig, resolvedUserConfig);

  const siteDebug = createSiteDebugCapability(
    resolvedUserConfig.siteDebugEnabled,
  );

  return Object.assign(Object.create(baseContext), {
    siteDebug,
    renderController: new ReactRenderController({
      enableSiteDebugRuntime: siteDebug.enabled,
    }),
  });
}
