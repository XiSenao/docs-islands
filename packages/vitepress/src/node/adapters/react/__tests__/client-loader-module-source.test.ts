import { describe, expect, it } from 'vitest';
import { createReactClientLoaderModuleSource } from '../client-loader-module-source';

describe('createReactClientLoaderModuleSource', () => {
  it('uses the internal logger entry for emitted runtime helpers', () => {
    const code = createReactClientLoaderModuleSource({
      base: '/',
      cleanUrls: false,
      componentEntries: [
        {
          componentName: 'HelloWorld',
          loaderImportedName: 'default',
          modulePath: '/assets/HelloWorld.js',
        },
      ],
    });

    expect(code).toContain('@docs-islands/vitepress/internal/logger');
    expect(code).not.toContain('@docs-islands/utils/logger');
  });
});
