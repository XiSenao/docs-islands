import { createLogger } from '@docs-islands/logger';
import { createElapsedLogOptions } from '@docs-islands/logger/helper';
import { loadEnv } from '@docs-islands/utils/env';
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-chromium';
import { packDistTarball } from '../scripts/package-artifacts';

const loggerInstance = createLogger({
  main: '@docs-islands/vitepress',
});
const Logger = loggerInstance.getLoggerByGroup('task.consumer-smoke');
const elapsedSince = (startTimeMs: number) =>
  createElapsedLogOptions(startTimeMs, Date.now());
const scriptStartedAt = Date.now();
const require = createRequire(import.meta.url);
const { ci, runtime } = loadEnv();

interface DistPackageJson {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface ConsumerFixture {
  cleanup: () => Promise<void>;
  fixtureDir: string;
}

const REQUIRED_CONSUMER_DEPENDENCIES = [
  '@vitejs/plugin-react-swc',
  'react',
  'react-dom',
  'vitepress',
  'vue',
] as const;
const CONSUMER_SMOKE_ROUTE = '/script-content-changes/basic';

function getPnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function readCurrentPnpmConfig<T>(key: string): T | undefined {
  try {
    const rawValue = execFileSync(
      getPnpmCommand(),
      ['config', 'get', key, '--json'],
      {
        encoding: 'utf8',
      },
    ).trim();

    if (
      rawValue.length === 0 ||
      rawValue === 'undefined' ||
      rawValue === 'null'
    ) {
      return undefined;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return undefined;
  }
}

function resolveChromiumExecutablePath(): string | undefined {
  const bundledExecutablePath = chromium.executablePath();

  if (bundledExecutablePath && existsSync(bundledExecutablePath)) {
    return bundledExecutablePath;
  }

  const override = runtime.chromiumExecutablePath?.trim();

  if (override) {
    return override;
  }

  const candidatePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    path.join(
      runtime.programFiles || 'C:/Program Files',
      'Google/Chrome/Application/chrome.exe',
    ),
    path.join(
      runtime.programFilesX86 || 'C:/Program Files (x86)',
      'Google/Chrome/Application/chrome.exe',
    ),
  ];

  return candidatePaths.find((candidatePath) => existsSync(candidatePath));
}

async function reserveTcpPort(): Promise<number> {
  const { createServer } = await import('node:net');

  return await new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close(() => {
          reject(new Error('Failed to reserve an ephemeral TCP port.'));
        });
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

function resolveInstalledPackageVersion(
  packageName: string,
  fallbackVersion?: string,
): string {
  try {
    let currentDir = path.dirname(require.resolve(packageName));
    let packageJsonPath: string | undefined;

    while (true) {
      const candidatePath = path.join(currentDir, 'package.json');
      if (existsSync(candidatePath)) {
        packageJsonPath = candidatePath;
        break;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }

    if (!packageJsonPath) {
      throw new Error(`Unable to locate package.json for "${packageName}".`);
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      version?: string;
    };

    if (packageJson.version) {
      return packageJson.version;
    }
  } catch {
    // Fall back to the published peer dependency range when local resolution fails.
  }

  if (!fallbackVersion) {
    throw new Error(
      `Unable to resolve an installed version for "${packageName}".`,
    );
  }

  return fallbackVersion;
}

async function writeConsumerPackageManagerConfig(
  fixtureDir: string,
): Promise<void> {
  const trustPolicy = readCurrentPnpmConfig<string>('trust-policy');
  const trustPolicyExcludes =
    readCurrentPnpmConfig<string[]>('trust-policy-exclude') ?? [];
  const lines: string[] = [];

  if (trustPolicy) {
    lines.push(`trust-policy=${trustPolicy}`);
  }

  for (const exclude of trustPolicyExcludes) {
    lines.push(`trust-policy-exclude[]=${exclude}`);
  }

  if (lines.length === 0) {
    return;
  }

  await writeFile(
    path.join(fixtureDir, '.npmrc'),
    `${lines.join('\n')}\n`,
    'utf8',
  );
}

async function writeConsumerFixtureFiles(fixtureDir: string): Promise<void> {
  const pnpmVersion = execFileSync(getPnpmCommand(), ['--version'], {
    encoding: 'utf8',
  }).trim();

  await mkdir(path.join(fixtureDir, '.vitepress'), { recursive: true });
  await mkdir(path.join(fixtureDir, '.vitepress', 'theme'), {
    recursive: true,
  });
  await mkdir(path.join(fixtureDir, 'components', 'react'), {
    recursive: true,
  });
  await mkdir(path.join(fixtureDir, 'script-content-changes'), {
    recursive: true,
  });

  await writeFile(
    path.join(fixtureDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'docs-islands-consumer-smoke',
        packageManager: `pnpm@${pnpmVersion}`,
        private: true,
        type: 'module',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  await writeConsumerPackageManagerConfig(fixtureDir);

  await writeFile(
    path.join(fixtureDir, '.vitepress', 'config.ts'),
    `import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { createLogger } from '@docs-islands/logger';
import { defineConfig } from 'vitepress';

const Logger = createLogger({
  main: '@docs-islands/vitepress',
}).getLoggerByGroup('consumer.smoke');
const config = defineConfig({
  title: 'Consumer Smoke',
});

void Logger;

createDocsIslands({
  adapters: [react()],
}).apply(config);

export default config;
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, '.vitepress', 'theme', 'index.ts'),
    `import { reactClient } from '@docs-islands/vitepress/adapters/react/client';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null),
  async enhanceApp() {
    await reactClient();
  },
};

export default theme;
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, 'components', 'react', 'HelloWorld.tsx'),
    `import { useState } from 'react';

export default function HelloWorld(): JSX.Element {
  const [count, setCount] = useState(0);

  return (
    <div data-testid="hello-world">
      <button
        data-testid="counter-button"
        type="button"
        onClick={() => setCount((value) => value + 1)}
      >
        Count: {count}
      </button>
    </div>
  );
}
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, 'script-content-changes', 'basic.md'),
    `# Consumer Smoke

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld client:only />
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, 'index.md'),
    `# Consumer Smoke Index

[Open consumer smoke page](./script-content-changes/basic.md)
`,
    'utf8',
  );
}

function installConsumerDependencies(options: {
  fixtureDir: string;
  manifest: DistPackageJson;
  tarballPath: string;
}): void {
  const installStartedAt = Date.now();
  const { fixtureDir, manifest, tarballPath } = options;
  const peerDependencyArguments = REQUIRED_CONSUMER_DEPENDENCIES.map(
    (packageName) =>
      `${packageName}@${resolveInstalledPackageVersion(
        packageName,
        manifest.peerDependencies?.[packageName],
      )}`,
  );
  const dependencyArguments = Object.keys(manifest?.dependencies ?? {}).map(
    (packageName) =>
      `${packageName}@${resolveInstalledPackageVersion(
        packageName,
        manifest.dependencies?.[packageName],
      )}`,
  );

  Logger.info(
    'Installing consumer fixture dependencies...',
    elapsedSince(installStartedAt),
  );
  execFileSync(
    getPnpmCommand(),
    [
      'add',
      '--save',
      '--prefer-offline',
      '--ignore-scripts',
      ...dependencyArguments,
    ],
    {
      cwd: fixtureDir,
      stdio: 'inherit',
    },
  );
  execFileSync(
    getPnpmCommand(),
    [
      'add',
      '--save-dev',
      '--prefer-offline',
      '--ignore-scripts',
      tarballPath,
      ...peerDependencyArguments,
    ],
    {
      cwd: fixtureDir,
      stdio: 'inherit',
    },
  );
}

async function createConsumerFixture(options: {
  manifest: DistPackageJson;
  tarballPath: string;
}): Promise<ConsumerFixture> {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'docs-islands-consumer-smoke-'),
  );
  const fixtureDir = path.join(fixtureRoot, 'fixture');

  await mkdir(fixtureDir, {
    recursive: true,
  });
  await writeConsumerFixtureFiles(fixtureDir);
  installConsumerDependencies({
    fixtureDir,
    manifest: options.manifest,
    tarballPath: options.tarballPath,
  });

  return {
    cleanup: async () => {
      await rm(fixtureRoot, {
        recursive: true,
        force: true,
      }).catch(() => null);
    },
    fixtureDir,
  };
}

function startConsumerDevServer(options: {
  fixtureDir: string;
  port: number;
}): {
  logs: string[];
  process: ChildProcess;
} {
  const { fixtureDir, port } = options;
  const logs: string[] = [];
  const child = spawn(
    getPnpmCommand(),
    [
      'exec',
      'vitepress',
      'dev',
      '.',
      '--host',
      '127.0.0.1',
      '--port',
      `${port}`,
    ],
    {
      cwd: fixtureDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    },
  );

  child.stdout?.on('data', (chunk: Buffer | string) => {
    logs.push(String(chunk));
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    logs.push(String(chunk));
  });

  return {
    logs,
    process: child,
  };
}

async function stopChildProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  const exitPromise = once(child, 'exit').catch(() => null);
  await Promise.race([
    exitPromise,
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);

  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit').catch(() => null);
  }
}

async function waitForServerReady(options: {
  logs: string[];
  port: number;
  process: ChildProcess;
  timeoutMs?: number;
}): Promise<void> {
  const { logs, port, process, timeoutMs = 30_000 } = options;
  const startedAt = Date.now();
  const serverUrl = `http://127.0.0.1:${port}/`;

  while (Date.now() - startedAt < timeoutMs) {
    if (process.exitCode !== null) {
      throw new Error(
        `Consumer fixture dev server exited early.\n${logs.join('')}`,
      );
    }

    try {
      const response = await fetch(serverUrl, {
        redirect: 'manual',
      });

      if (response.status < 500) {
        return;
      }
    } catch {
      // Keep polling until the dev server is ready or times out.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Timed out waiting for the consumer fixture dev server.\n${logs.join('')}`,
  );
}

function isCriticalRequestFailure(url: string, resourceType: string): boolean {
  return (
    resourceType === 'document' ||
    resourceType === 'script' ||
    resourceType === 'fetch' ||
    resourceType === 'xhr' ||
    /\.m?js(?:$|\?)/.test(url) ||
    /\.css(?:$|\?)/.test(url)
  );
}

function isIgnorableRequestFailure(errorText?: string): boolean {
  return errorText === 'net::ERR_ABORTED' || errorText === 'NS_BINDING_ABORTED';
}

async function verifyConsumerRuntime(port: number): Promise<void> {
  const verifyStartedAt = Date.now();
  Logger.info(
    'Launching browser for consumer smoke verification...',
    elapsedSince(verifyStartedAt),
  );
  const browser = await chromium.launch({
    args: ci ? ['--no-sandbox', '--disable-setuid-sandbox'] : undefined,
    executablePath: resolveChromiumExecutablePath(),
    headless: true,
  });
  const page = await browser.newPage();
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const responseFailures: string[] = [];

  page.on('console', (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText;
    if (!isCriticalRequestFailure(request.url(), request.resourceType())) {
      return;
    }
    if (isIgnorableRequestFailure(errorText)) {
      return;
    }

    requestFailures.push(
      `${request.resourceType()} ${request.url()} :: ${errorText ?? 'unknown request failure'}`,
    );
  });
  page.on('response', (response) => {
    const request = response.request();
    if (
      response.status() < 400 ||
      !isCriticalRequestFailure(request.url(), request.resourceType())
    ) {
      return;
    }

    responseFailures.push(
      `${response.status()} ${request.resourceType()} ${response.url()}`,
    );
  });

  try {
    await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: 'domcontentloaded',
    });
    const smokeLink = page.getByRole('link', {
      name: 'Open consumer smoke page',
    });
    await smokeLink.waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await Promise.all([
      page.waitForURL((url) => {
        return (
          url.pathname === CONSUMER_SMOKE_ROUTE ||
          url.pathname === `${CONSUMER_SMOKE_ROUTE}.html`
        );
      }),
      smokeLink.click(),
    ]);
    await page.waitForSelector('[data-testid="counter-button"]', {
      timeout: 15_000,
    });

    const button = page.locator('[data-testid="counter-button"]');
    const component = page.locator('[data-testid="hello-world"]');

    await component.waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await button.click();

    const buttonText = await button.textContent();
    if (!buttonText?.includes('Count: 1')) {
      throw new Error(
        `Consumer fixture rendered, but the counter button did not become interactive. Received text: ${buttonText ?? '(empty)'}`,
      );
    }

    if (
      pageErrors.length > 0 ||
      requestFailures.length > 0 ||
      responseFailures.length > 0
    ) {
      throw new Error(
        [
          pageErrors.length > 0 ? `pageerror:\n${pageErrors.join('\n')}` : '',
          requestFailures.length > 0
            ? `requestfailed:\n${requestFailures.join('\n')}`
            : '',
          responseFailures.length > 0
            ? `badresponse:\n${responseFailures.join('\n')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      );
    }
  } catch (error) {
    const renderContainerCount = await page
      .locator('[__render_directive__]')
      .count();
    const customElementCount = await page.locator('hello-world').count();
    const firstRenderContainerHtml = await page
      .locator('[__render_directive__]')
      .first()
      .innerHTML()
      .catch(() => null);
    const runtimeGlobals = await page.evaluate(() => {
      const runtimeWindow = globalThis as unknown as Record<string, unknown>;
      const injectComponent = runtimeWindow.__INJECT_COMPONENT__ as
        | Record<string, Record<string, unknown>>
        | undefined;

      return {
        componentManager: Boolean(runtimeWindow.__COMPONENT_MANAGER__),
        injectComponentPages: injectComponent
          ? Object.keys(injectComponent)
          : [],
        reactDevRuntime: typeof runtimeWindow.__RENDER_CLIENT_IN_DEV__,
      };
    });
    const appTextContent = await page
      .locator('#app')
      .textContent()
      .catch(() => null);
    const htmlSnippet = await page
      .content()
      .then((html) => html.replaceAll(/\s+/g, ' ').slice(0, 1500))
      .catch(() => '');
    const debugDetails = [
      `url: ${page.url()}`,
      `render containers: ${renderContainerCount}`,
      `hello-world tags: ${customElementCount}`,
      `runtime globals: ${JSON.stringify(runtimeGlobals)}`,
      firstRenderContainerHtml
        ? `first render container html:\n${firstRenderContainerHtml}`
        : '',
      appTextContent ? `#app text:\n${appTextContent}` : '',
      htmlSnippet ? `html snippet:\n${htmlSnippet}` : '',
      pageErrors.length > 0 ? `pageerror:\n${pageErrors.join('\n')}` : '',
      requestFailures.length > 0
        ? `requestfailed:\n${requestFailures.join('\n')}`
        : '',
      responseFailures.length > 0
        ? `badresponse:\n${responseFailures.join('\n')}`
        : '',
      consoleMessages.length > 0
        ? `console:\n${consoleMessages.join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n\n${debugDetails}`.trim(),
    );
  } finally {
    await page.close().catch(() => null);
    await browser.close().catch(() => null);
  }
}

async function main(): Promise<void> {
  const smokeStartedAt = Date.now();
  const packageRootDir = fileURLToPath(new URL('..', import.meta.url));
  const distDir = path.join(packageRootDir, 'dist');
  const manifestPath = path.join(distDir, 'package.json');
  let cleanupPackedDist: (() => Promise<void>) | undefined;
  let cleanupFixture: (() => Promise<void>) | undefined;
  let childProcess: ChildProcess | undefined;
  let serverLogs: string[] = [];

  try {
    const manifest = JSON.parse(
      readFileSync(manifestPath, 'utf8'),
    ) as DistPackageJson;

    Logger.info(
      'Packing dist tarball for consumer smoke...',
      elapsedSince(smokeStartedAt),
    );
    const packedDist = await packDistTarball(distDir);
    cleanupPackedDist = packedDist.cleanup;

    const fixture = await createConsumerFixture({
      manifest,
      tarballPath: packedDist.tarballPath,
    });
    cleanupFixture = fixture.cleanup;

    const port = await reserveTcpPort();
    const server = startConsumerDevServer({
      fixtureDir: fixture.fixtureDir,
      port,
    });
    childProcess = server.process;
    serverLogs = server.logs;
    await waitForServerReady({
      logs: server.logs,
      port,
      process: server.process,
    });
    await verifyConsumerRuntime(port);
    Logger.success('Consumer smoke passed', elapsedSince(smokeStartedAt));
  } catch (error) {
    const renderedLogs =
      serverLogs.length > 0
        ? `\n\nDev server logs:\n${serverLogs.join('')}`
        : '';
    Logger.error(
      `Consumer smoke failed: ${error instanceof Error ? error.message : String(error)}${renderedLogs}`,
      elapsedSince(smokeStartedAt),
    );
    process.exitCode = 1;
  } finally {
    if (childProcess) {
      await stopChildProcess(childProcess);
    }
    if (cleanupFixture) {
      await cleanupFixture();
    }
    if (cleanupPackedDist) {
      await cleanupPackedDist();
    }
  }
}

main().catch((error: unknown) => {
  Logger.error(
    `Consumer smoke failed with an unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    elapsedSince(scriptStartedAt),
  );
  process.exitCode = 1;
});
