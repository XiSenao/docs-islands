import getLoggerInstance from '#shared/logger';
import type { DefaultTheme, UserConfig } from 'vitepress';
import { createReactRenderingIntegrationPlugin } from '../react/plugin';
import { applyRenderingIntegrationPlugin } from './integration-plugin';

export interface CreateRenderingStrategiesOptions {
  frameworks?: ('react' | string)[];
}

const loggerInstance = getLoggerInstance();
const renderingIntegrationFactories = new Map([
  ['react', createReactRenderingIntegrationPlugin],
]);

export default function createRenderingStrategies(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  options?: CreateRenderingStrategiesOptions,
): void {
  const frameworks = [...new Set(options?.frameworks ?? ['react'])];

  for (const framework of frameworks) {
    const createIntegrationPlugin =
      renderingIntegrationFactories.get(framework);

    if (!createIntegrationPlugin) {
      loggerInstance
        .getLoggerByGroup('create-rendering-strategies')
        .warn(
          `Unknown rendering integration "${framework}" was ignored. Supported integrations: react.`,
        );
      continue;
    }

    applyRenderingIntegrationPlugin(vitepressConfig, createIntegrationPlugin());
  }
}
