import { loadEnv } from '@docs-islands/utils/env';
import { createLogger } from '@docs-islands/utils/logger';
import { execSync, spawn } from 'node:child_process';

type BuildPhase = string | string[];

const AUTO_DISCOVER_PLACEHOLDER = '...';
const SKIP_ARG_KEYS = new Set(['--skip', '--exclude']);
const { build } = loadEnv();

const BUILD_PIPELINE: BuildPhase[] = [
  '@docs-islands/plugin-license',
  '@docs-islands/core',
  '@docs-islands/vitepress',
  AUTO_DISCOVER_PLACEHOLDER,
];

const BuildLogger = createLogger({
  main: 'docs-islands-monorepo',
}).getLoggerByGroup('task.build.pipeline');

function parsePackageList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSkippedPackages(argv = process.argv.slice(2)): Set<string> {
  const skippedPackages = new Set<string>();

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === undefined) {
      continue;
    }

    const [key, inlineValue] = argument.split('=', 2);
    if (inlineValue !== undefined && SKIP_ARG_KEYS.has(key)) {
      for (const pkg of parsePackageList(inlineValue)) {
        skippedPackages.add(pkg);
      }
      continue;
    }

    if (!SKIP_ARG_KEYS.has(argument)) {
      continue;
    }

    const nextArg = argv[index + 1];
    if (nextArg === undefined || nextArg.startsWith('--')) {
      BuildLogger.warn(
        `Missing package list for "${argument}", this option is ignored`,
      );
      continue;
    }

    for (const pkg of parsePackageList(nextArg)) {
      skippedPackages.add(pkg);
    }
    index++;
  }

  const envValue = build.skipPackages;
  if (envValue) {
    for (const pkg of parsePackageList(envValue)) {
      skippedPackages.add(pkg);
    }
  }

  return skippedPackages;
}

function getAllMonorepoPackages(): string[] {
  try {
    const result = execSync('pnpm ls -r --depth -1 --json', {
      encoding: 'utf8',
      stdio: 'pipe',
    });

    const data = JSON.parse(result);
    const packages: string[] = [];
    const ignoredPackages = new Set(['docs-islands-monorepo']);

    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.name && !ignoredPackages.has(item.name)) {
          packages.push(item.name);
        }
      }
    }

    return packages;
  } catch {
    BuildLogger.warn('Failed to get monorepo packages, using fallback method');
    return [
      '@docs-islands/plugin-license',
      '@docs-islands/utils',
      '@docs-islands/core',
      '@docs-islands/vitepress',
      '@docs-islands/eslint-config',
    ];
  }
}

function getConfiguredPackages(pipeline: BuildPhase[]): string[] {
  const configured: string[] = [];

  for (const phase of pipeline) {
    if (Array.isArray(phase)) {
      configured.push(...phase);
    } else if (phase !== AUTO_DISCOVER_PLACEHOLDER) {
      configured.push(phase);
    }
  }

  return configured;
}

function resolveSkippedPackages(
  skippedPackages: Set<string>,
  allPackages: string[],
): { valid: Set<string>; invalid: string[] } {
  const allPackagesSet = new Set(allPackages);
  const valid = new Set<string>();
  const invalid: string[] = [];

  for (const pkg of skippedPackages) {
    if (allPackagesSet.has(pkg)) {
      valid.add(pkg);
    } else {
      invalid.push(pkg);
    }
  }

  return { valid, invalid };
}

function applySkipFilterToPipeline(
  pipeline: BuildPhase[],
  skippedPackages: Set<string>,
): BuildPhase[] {
  const filteredPipeline: BuildPhase[] = [];

  for (const phase of pipeline) {
    if (phase === AUTO_DISCOVER_PLACEHOLDER) {
      filteredPipeline.push(phase);
      continue;
    }

    if (Array.isArray(phase)) {
      const filteredPackages = phase.filter((pkg) => !skippedPackages.has(pkg));
      if (filteredPackages.length > 0) {
        filteredPipeline.push(filteredPackages);
      }
      continue;
    }

    if (!skippedPackages.has(phase)) {
      filteredPipeline.push(phase);
    }
  }

  return filteredPipeline;
}

function getRemainingPackages(
  allPackages: string[],
  configuredPackages: string[],
  skippedPackages: Set<string>,
): string[] {
  const configuredPackagesSet = new Set(configuredPackages);

  const remainingPackages = allPackages.filter(
    (pkg) => !configuredPackagesSet.has(pkg) && !skippedPackages.has(pkg),
  );

  return remainingPackages;
}

function resolveBuildPipeline(
  pipeline: BuildPhase[],
  remainingPackages: string[],
): BuildPhase[] {
  const fullPipeline = [...pipeline];
  const autoPhaseIndex = fullPipeline.indexOf(AUTO_DISCOVER_PLACEHOLDER);

  if (remainingPackages.length === 0) {
    if (autoPhaseIndex !== -1) {
      fullPipeline.splice(autoPhaseIndex, 1);
    }
    return fullPipeline;
  }

  if (autoPhaseIndex === -1) {
    fullPipeline.push(remainingPackages);
  } else {
    fullPipeline[autoPhaseIndex] = remainingPackages;
  }

  return fullPipeline;
}

async function buildPackagesParallel(packages: string[]): Promise<boolean> {
  if (packages.length === 0) {
    BuildLogger.info('Skipping empty parallel phase');
    return true;
  }

  try {
    BuildLogger.info(`Building in parallel: [${packages.join(', ')}]`);

    const commands = packages.map((pkg, index) => {
      const color = ['blue', 'green', 'yellow', 'magenta', 'cyan'][index % 5];
      return `--color ${color} --label "[${pkg}]" "pnpm --filter ${pkg} --if-present build"`;
    });

    const concurrentlyOptions = [
      ...commands,
      '--kill-others-on-fail',
      '--restart-tries 0',
      '--max-restarts 0',
      '--raw',
    ];

    const child = spawn(
      'pnpm',
      ['exec', 'concurrently', ...concurrentlyOptions],
      {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true,
      },
    );

    child.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    return new Promise((resolve) => {
      child.on('close', (code) => {
        if (code === 0) {
          BuildLogger.success(`Parallel build completed successfully`);
          resolve(true);
        } else {
          BuildLogger.error(`Parallel build failed with code ${code}`);
          resolve(false);
        }
      });
    });
  } catch (error) {
    BuildLogger.error(`Parallel build failed: ${error}`);
    return false;
  }
}

async function buildPackagesSerial(packageName: string): Promise<boolean> {
  try {
    BuildLogger.info(`Building: ${packageName}`);

    const child = spawn('pnpm', ['--filter', packageName, 'build'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });

    child.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    return new Promise((resolve) => {
      child.on('close', (code) => {
        if (code === 0) {
          BuildLogger.success(`Build completed successfully`);
          resolve(true);
        } else {
          BuildLogger.error(`Build failed with code ${code}`);
          resolve(false);
        }
      });
    });
  } catch (error) {
    BuildLogger.error(`Build failed: ${error}`);
    return false;
  }
}

async function buildPackages(packages: string | string[]): Promise<boolean> {
  if (Array.isArray(packages)) {
    return await buildPackagesParallel(packages);
  }
  return await buildPackagesSerial(packages);
}

async function main() {
  BuildLogger.info('Starting optimized build process...\n');

  const allPackages = getAllMonorepoPackages();
  const skippedPackages = parseSkippedPackages();
  const { valid: validSkippedPackages, invalid: invalidSkippedPackages } =
    resolveSkippedPackages(skippedPackages, allPackages);

  if (validSkippedPackages.size > 0) {
    BuildLogger.info(
      `Skip build packages: [${[...validSkippedPackages].join(', ')}]`,
    );
  }
  if (invalidSkippedPackages.length > 0) {
    BuildLogger.warn(
      `Ignored unknown skip packages: [${invalidSkippedPackages.join(', ')}]`,
    );
  }

  const filteredBasePipeline = applySkipFilterToPipeline(
    BUILD_PIPELINE,
    validSkippedPackages,
  );
  const configuredPackages = getConfiguredPackages(filteredBasePipeline);
  const remainingPackages = getRemainingPackages(
    allPackages,
    configuredPackages,
    validSkippedPackages,
  );

  if (remainingPackages.length > 0) {
    BuildLogger.info(
      `Found ${remainingPackages.length} remaining packages:

${remainingPackages.map((pkg) => `- ${pkg}`).join('\n')}
`,
    );
  } else {
    BuildLogger.info('No remaining packages found');
  }

  const fullPipeline = resolveBuildPipeline(
    filteredBasePipeline,
    remainingPackages,
  );
  if (fullPipeline.length === 0) {
    BuildLogger.warn('No packages to build after applying skip filters');
    process.exit(0);
  }

  BuildLogger.info('Build Pipeline:');
  for (const [index, phase] of fullPipeline.entries()) {
    if (Array.isArray(phase)) {
      BuildLogger.info(
        `  Phase ${index + 1}: [${phase.join(', ')}] (parallel)`,
      );
    } else {
      BuildLogger.info(`  Phase ${index + 1}: ${phase}`);
    }
  }
  BuildLogger.info('');

  let successCount = 0;
  const totalPhases = fullPipeline.length;

  for (const [i, phase] of fullPipeline.entries()) {
    if (await buildPackages(phase)) {
      successCount++;
    } else {
      BuildLogger.error(`Phase ${i + 1} failed`);
      process.exit(1);
    }

    BuildLogger.info('');
  }

  if (successCount === totalPhases) {
    BuildLogger.success('All packages built successfully!');
    process.exit(0);
  } else {
    BuildLogger.warn('Some phases failed');
    process.exit(1);
  }
}

main().catch((error) => {
  BuildLogger.error(`Build process failed: ${error}`);
  process.exit(1);
});
