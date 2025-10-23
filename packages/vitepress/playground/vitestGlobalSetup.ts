import getPort from 'get-port';
import type { Server } from 'node:net';
import { type BrowserServer, chromium } from 'playwright-chromium';
import type { ViteDevServer } from 'vite';
import { createServer } from 'vitepress';

let browserServer: BrowserServer;
let server: ViteDevServer | Server;

const root = '.';

export async function setup(): Promise<void> {
  browserServer = await chromium.launchServer({
    headless: !process.env.DEBUG,
    args: process.env.CI
      ? ['--no-sandbox', '--disable-setuid-sandbox']
      : undefined,
  });
  process.env.WS_ENDPOINT = browserServer.wsEndpoint();
  const port = await getPort();
  process.env.PORT = port.toString();

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
