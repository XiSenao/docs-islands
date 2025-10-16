import type { DefaultTheme, UserConfig } from 'vitepress';
import reactIntegration from '../react';

export interface CreateRenderingStrategiesOptions {
  frameworks?: Array<'react' | string>;
}

export default function createRenderingStrategies(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  options?: CreateRenderingStrategiesOptions,
): void {
  const frameworks = options?.frameworks ?? ['react'];

  if (frameworks.includes('react')) {
    // In the future we can register adapter(s) here and route by <script lang>
    reactIntegration(vitepressConfig);
  }
}
