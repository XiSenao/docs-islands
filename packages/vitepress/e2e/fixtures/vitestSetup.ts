import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium } from 'playwright-chromium';
import { glob } from 'tinyglobby';

let browser: Browser;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
