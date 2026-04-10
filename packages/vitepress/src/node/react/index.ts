import type { DefaultTheme, UserConfig } from 'vitepress';
import { applyRenderingIntegrationPlugin } from '../core/integration-plugin';
import type { VitepressReactRenderingStrategiesOptions } from './config';
import { createReactRenderingIntegrationPlugin } from './plugin';
export type { VitepressReactRenderingStrategiesOptions } from './config';

export default function vitepressReactRenderingStrategies(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  options?: VitepressReactRenderingStrategiesOptions,
): void {
  applyRenderingIntegrationPlugin(
    vitepressConfig,
    createReactRenderingIntegrationPlugin(options),
  );
}
