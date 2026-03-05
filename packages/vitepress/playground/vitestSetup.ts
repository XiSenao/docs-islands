import { loadEnv } from '@docs-islands/utils/env';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium } from 'playwright-chromium';
import { glob } from 'tinyglobby';

let browser: Browser;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

beforeAll(async () => {
  const env = loadEnv({
    force: true,
  });
  browser = await chromium.connect(env.test.ws_endpoint!);
  globalThis.page = await browser.newPage();
  globalThis.goto = async (path: string) => {
    await globalThis.page.goto(`http://localhost:${env.test.port}${path}`);
    await globalThis.page.waitForSelector('#app .Layout', { timeout: 10_000 });
  };
});

afterAll(async () => {
  await browser.close();
  const originalMarkdownContent =
    '<!-- This file is used to test the HMR of markdown content changes. -->\n';
  const projectRoot = path.resolve(__dirname, '.');
  const markdownFilePaths = await glob(['**/*.md'], {
    cwd: projectRoot,
    absolute: true,
    onlyFiles: true,
  });
  for (const markdownFilePath of markdownFilePaths) {
    const filePath = path.resolve(projectRoot, markdownFilePath);
    if (filePath.endsWith('hmr-test.md')) {
      fs.writeFileSync(filePath, originalMarkdownContent);
    }
  }
});
