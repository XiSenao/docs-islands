import { createLogger } from '@docs-islands/logger';
import { createElapsedLogOptions } from '@docs-islands/logger/helper';
import { load } from 'cheerio';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packDistTarball } from '../scripts/package-artifacts';

const loggerInstance = createLogger({
  main: '@docs-islands/vitepress',
});
const Logger = loggerInstance.getLoggerByGroup('task.mpa-integration-smoke');
const elapsedSince = (startTimeMs: number) =>
  createElapsedLogOptions(startTimeMs, Date.now());
const scriptStartedAt = Date.now();
const require = createRequire(import.meta.url);

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
const CLIENT_ENTRY_SPECIFIER = '@docs-islands/vitepress/adapters/react/client';
const DIST_CLIENT_ENTRY_PATH = 'client/adapters/react.mjs';
const MANAGED_LOGGER_RUNTIME_ERROR =
  '@docs-islands/core/logger must be resolved by an integration before runtime use.';

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

function assertDistArtifacts(distDir: string): DistPackageJson {
  const manifestPath = path.join(distDir, 'package.json');
  const clientEntryPath = path.join(distDir, DIST_CLIENT_ENTRY_PATH);

  /**
   * This smoke intentionally runs after `pnpm build`; failing early here keeps a
   * stale or missing dist directory from being mistaken for a runtime failure.
   */
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Expected dist package manifest at ${manifestPath}. Run pnpm --dir packages/vitepress build first.`,
    );
  }

  if (!existsSync(clientEntryPath)) {
    throw new Error(
      `Expected dist React client entry at ${clientEntryPath}. Run pnpm --dir packages/vitepress build first.`,
    );
  }

  const clientEntrySource = readFileSync(clientEntryPath, 'utf8');
  /**
   * The published client entry should already reflect the package-build logger
   * rewrite. Checking this in the MPA integration smoke is slower than a unit
   * alias, but it preserves the production builder's responsibility boundary.
   */
  if (!clientEntrySource.includes('@docs-islands/vitepress/logger')) {
    throw new Error(
      `${clientEntryPath} does not import @docs-islands/vitepress/logger.`,
    );
  }
  if (clientEntrySource.includes('@docs-islands/core/logger')) {
    throw new Error(
      `${clientEntryPath} still references @docs-islands/core/logger.`,
    );
  }

  return JSON.parse(readFileSync(manifestPath, 'utf8')) as DistPackageJson;
}

async function writeConsumerFixtureFiles(fixtureDir: string): Promise<void> {
  const pnpmVersion = execFileSync(getPnpmCommand(), ['--version'], {
    encoding: 'utf8',
  }).trim();

  await mkdir(path.join(fixtureDir, '.vitepress', 'theme'), {
    recursive: true,
  });
  await mkdir(path.join(fixtureDir, 'components', 'react'), {
    recursive: true,
  });

  await writeFile(
    path.join(fixtureDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'docs-islands-mpa-integration-smoke',
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
import { defineConfig } from 'vitepress';

const config = defineConfig({
  mpa: true,
  title: 'MPA Dist Smoke',
});

createDocsIslands({
  adapters: [react()],
}).apply(config);

export default config;
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, '.vitepress', 'theme', 'index.ts'),
    `import { reactClient } from '${CLIENT_ENTRY_SPECIFIER}';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp() {
    void reactClient();
  },
};

export default theme;
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, 'components', 'react', 'Counter.tsx'),
    `export default function Counter(): JSX.Element {
  return <button data-testid="mpa-integration-counter" type="button">MPA integration smoke</button>;
}
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, 'index.md'),
    `# MPA Dist Smoke

<script lang="react">
  import Counter from './components/react/Counter.tsx';
</script>

<Counter client:load />
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
    'Installing MPA integration smoke dependencies...',
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
    path.join(tmpdir(), 'docs-islands-mpa-integration-smoke-'),
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

async function resolveClientEntryFromFixture(
  fixtureDir: string,
): Promise<string> {
  const resolverPath = path.join(fixtureDir, 'resolve-client-entry.mjs');

  /**
   * Resolve from inside the temporary consumer so the assertion covers the
   * published package exports map, not the monorepo workspace source mapping.
   */
  await writeFile(
    resolverPath,
    `console.log(import.meta.resolve(${JSON.stringify(CLIENT_ENTRY_SPECIFIER)}));\n`,
    'utf8',
  );

  const resolved = execFileSync(process.execPath, [resolverPath], {
    cwd: fixtureDir,
    encoding: 'utf8',
  }).trim();

  if (!resolved.endsWith(`/${DIST_CLIENT_ENTRY_PATH}`)) {
    throw new Error(
      `${CLIENT_ENTRY_SPECIFIER} resolved to ${resolved}, expected a dist entry ending in /${DIST_CLIENT_ENTRY_PATH}.`,
    );
  }

  return resolved;
}

function runVitePressBuild(fixtureDir: string): void {
  const buildStartedAt = Date.now();

  Logger.info('Building MPA consumer fixture...', elapsedSince(buildStartedAt));
  execFileSync(getPnpmCommand(), ['exec', 'vitepress', 'build', '.'], {
    cwd: fixtureDir,
    stdio: 'inherit',
  });
}

function collectFiles(directory: string, predicate: (file: string) => boolean) {
  const files: string[] = [];

  if (!existsSync(directory)) {
    return files;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath, predicate));
      continue;
    }

    if (entry.isFile() && predicate(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

function collectMpaIntegrationScripts(outDir: string): string[] {
  const htmlFiles = collectFiles(outDir, (file) => file.endsWith('.html'));
  const scripts = new Set<string>();

  for (const htmlFile of htmlFiles) {
    const html = readFileSync(htmlFile, 'utf8');
    const $ = load(html);

    $('script[src*="react-integration"]').each((_, element) => {
      const src = $(element).attr('src');
      if (src && /\.js(?:\?|$)/.test(src)) {
        scripts.add(src);
      }
    });
  }

  if (scripts.size === 0) {
    throw new Error(
      `Expected an MPA react-integration script in built HTML files under ${outDir}.`,
    );
  }

  return [...scripts];
}

function resolveBuiltAssetPath(outDir: string, scriptSrc: string): string {
  const withoutQuery = scriptSrc.split('?')[0] ?? scriptSrc;
  const relativePath = withoutQuery.replace(/^\/+/, '');
  const assetPath = path.resolve(outDir, decodeURIComponent(relativePath));

  if (!assetPath.startsWith(path.resolve(outDir) + path.sep)) {
    throw new Error(`Resolved script outside output directory: ${scriptSrc}`);
  }

  return assetPath;
}

async function importMpaIntegrationScripts(
  outDir: string,
  scriptSources: string[],
): Promise<void> {
  /**
   * Importing the emitted integration chunks is a compact smoke: it does not
   * replace a browser E2E test, but it catches the logger-placeholder failure at
   * the exact runtime boundary that regressed here.
   */
  for (const scriptSource of scriptSources) {
    const scriptPath = resolveBuiltAssetPath(outDir, scriptSource);

    if (!existsSync(scriptPath) || !statSync(scriptPath).isFile()) {
      throw new Error(
        `Expected MPA integration script ${scriptSource} at ${scriptPath}.`,
      );
    }

    await import(pathToFileURL(scriptPath).href);
  }
}

function assertNoCoreLoggerRuntimeError(outDir: string): void {
  const outputFiles = collectFiles(
    outDir,
    (file) =>
      file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.html'),
  );

  for (const outputFile of outputFiles) {
    const source = readFileSync(outputFile, 'utf8');

    if (source.includes(MANAGED_LOGGER_RUNTIME_ERROR)) {
      throw new Error(
        `Built output still contains the core logger runtime placeholder in ${outputFile}.`,
      );
    }
  }
}

async function main(): Promise<void> {
  const smokeStartedAt = Date.now();
  const packageRootDir = fileURLToPath(new URL('..', import.meta.url));
  const distDir = path.join(packageRootDir, 'dist');
  let cleanupPackedDist: (() => Promise<void>) | undefined;
  let cleanupFixture: (() => Promise<void>) | undefined;

  try {
    const manifest = assertDistArtifacts(distDir);

    Logger.info(
      'Packing dist tarball for MPA integration smoke...',
      elapsedSince(smokeStartedAt),
    );
    /**
     * Pack and install the dist output instead of linking the workspace package.
     * That costs a little setup time, but it verifies the same package shape a
     * consumer receives from npm.
     */
    const packedDist = await packDistTarball(distDir);
    cleanupPackedDist = packedDist.cleanup;

    const fixture = await createConsumerFixture({
      manifest,
      tarballPath: packedDist.tarballPath,
    });
    cleanupFixture = fixture.cleanup;

    const resolvedClientEntry = await resolveClientEntryFromFixture(
      fixture.fixtureDir,
    );
    Logger.info(
      `${CLIENT_ENTRY_SPECIFIER} resolved to ${resolvedClientEntry}`,
      elapsedSince(smokeStartedAt),
    );

    runVitePressBuild(fixture.fixtureDir);

    const outDir = path.join(fixture.fixtureDir, '.vitepress', 'dist');
    const integrationScripts = collectMpaIntegrationScripts(outDir);

    await importMpaIntegrationScripts(outDir, integrationScripts);
    assertNoCoreLoggerRuntimeError(outDir);

    Logger.success(
      'MPA integration smoke passed',
      elapsedSince(smokeStartedAt),
    );
  } catch (error) {
    Logger.error(
      `MPA integration smoke failed: ${error instanceof Error ? error.message : String(error)}`,
      elapsedSince(smokeStartedAt),
    );
    process.exitCode = 1;
  } finally {
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
    `MPA integration smoke failed with an unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    elapsedSince(scriptStartedAt),
  );
  process.exitCode = 1;
});
