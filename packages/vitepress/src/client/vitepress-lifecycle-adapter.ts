import type { DocsLifecycleAdapter } from '@docs-islands/core/client';
import { inBrowser, onContentUpdated } from 'vitepress/client';
import { getCleanPathname } from '../shared/runtime';

export function createVitePressLifecycleAdapter(): DocsLifecycleAdapter {
  return {
    getPageId: () => getCleanPathname(),
    inBrowser,
    onContentUpdated,
  };
}
