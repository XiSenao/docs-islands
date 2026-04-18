import type { Page } from 'playwright-chromium';

declare global {
  var allowBrowserRuntimeFailures: () => void;
  var page: Page;
  var goto: (path: string) => Promise<void>;
}
