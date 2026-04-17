import { applyRenderingIntegrationPlugin } from '../../core/integration-plugin';
import type { DocsIslandsAdapter } from '../../core/orchestrator';
import { REACT_FRAMEWORK } from './framework';
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
