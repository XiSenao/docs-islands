import { REACT_FRAMEWORK } from '../../constants/adapters/react/framework';
import { applyRenderingIntegrationPlugin } from '../../core/integration-plugin';
import type { DocsIslandsAdapter } from '../../core/orchestrator';
import { createReactRenderingIntegrationPlugin } from './plugin';

export function react(): DocsIslandsAdapter {
  return {
    apply(vitepressConfig, resolvedUserConfig) {
      applyRenderingIntegrationPlugin(
        vitepressConfig,
        createReactRenderingIntegrationPlugin(resolvedUserConfig),
      );
    },
    framework: REACT_FRAMEWORK,
  };
}
