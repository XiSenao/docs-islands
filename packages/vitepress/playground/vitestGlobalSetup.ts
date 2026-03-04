import { injectEnvs, loadEnv } from '@docs-islands/utils/env';
import getPort from 'get-port';
import type { Server } from 'node:net';
import { type BrowserServer, chromium } from 'playwright-chromium';
import type { ViteDevServer } from 'vite';
import { createServer } from 'vitepress';

let browserServer: BrowserServer;
let server: ViteDevServer | Server;

const root = '.';

const { ci, debug } = loadEnv();

export async function setup(): Promise<void> {
  browserServer = await chromium.launchServer({
    headless: !debug,
    args: ci ? ['--no-sandbox', '--disable-setuid-sandbox'] : undefined,
  });
  const port = await getPort();
  injectEnvs({
    WS_ENDPOINT: browserServer.wsEndpoint(),
    PORT: port.toString(),
  });
  server = await createServer(root, { port });
  await server.listen();
}

export async function teardown(): Promise<void> {
  if (browserServer) {
    await browserServer.close();
  }
  if (server) {
    await ('ws' in server
      ? server.close()
      : new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }));
  }
}
