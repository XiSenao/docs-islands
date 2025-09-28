import { type Browser, chromium } from 'playwright-chromium';
import { afterAll, beforeAll } from 'vitest';

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.connect(process.env.WS_ENDPOINT!);
  globalThis.page = await browser.newPage();
  globalThis.goto = async (path: string) => {
    await globalThis.page.goto(`http://localhost:${process.env.PORT}${path}`);
    await globalThis.page.waitForSelector('#app .Layout', { timeout: 10_000 });
  };
});

afterAll(async () => {
  await browser.close();
});
