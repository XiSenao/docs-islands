import { createElapsedLogOptions } from '@docs-islands/logger/helper';
import { loadEnv } from '@docs-islands/utils/env';
import { createLogger } from '@docs-islands/utils/logger';
import { execSync, spawn } from 'node:child_process';
import {
  BUILD_AUTO_DISCOVER_PLACEHOLDER,
  BUILD_FALLBACK_PACKAGES,
  BUILD_PIPELINE,
  BUILD_SKIP_ARG_KEYS,
} from './constants/build';

type BuildPhase = string | string[];

const { build } = loadEnv();

const BuildLogger = createLogger({
  main: 'docs-islands-monorepo',
}).getLoggerByGroup('task.build.pipeline');
const elapsedSince = (startTimeMs: number) =>
  createElapsedLogOptions(startTimeMs, Date.now());
const scriptStartedAt = Date.now();

function parsePackageList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSkippedPackages(argv = process.argv.slice(2)): Set<string> {
  const parseStartedAt = Date.now();
  const skippedPackages = new Set<string>();

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === undefined) {
      continue;
    }

    const [key, inlineValue] = argument.split('=', 2);
    if (inlineValue !== undefined && BUILD_SKIP_ARG_KEYS.has(key)) {
      for (const pkg of parsePackageList(inlineValue)) {
        skippedPackages.add(pkg);
      }
      continue;
    }

    if (!BUILD_SKIP_ARG_KEYS.has(argument)) {
      continue;
    }

    const nextArg = argv[index + 1];
    if (nextArg === undefined || nextArg.startsWith('--')) {
      BuildLogger.warn(
        `Missing package list for "${argument}", this option is ignored`,
        elapsedSince(parseStartedAt),
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
  const lookupStartedAt = Date.now();
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
    BuildLogger.warn(
      'Failed to get monorepo packages, using fallback method',
      elapsedSince(lookupStartedAt),
    );
    return BUILD_FALLBACK_PACKAGES;
  }
}

function getConfiguredPackages(pipeline: BuildPhase[]): string[] {
  const configured: string[] = [];

  for (const phase of pipeline) {
    if (Array.isArray(phase)) {
      configured.push(...phase);
    } else if (phase !== BUILD_AUTO_DISCOVER_PLACEHOLDER) {
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
    if (phase === BUILD_AUTO_DISCOVER_PLACEHOLDER) {
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
  const autoPhaseIndex = fullPipeline.indexOf(BUILD_AUTO_DISCOVER_PLACEHOLDER);

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
  const buildStartedAt = Date.now();
  if (packages.length === 0) {
    BuildLogger.info(
      'Skipping empty parallel phase',
      elapsedSince(buildStartedAt),
    );
    return true;
  }

  try {
    BuildLogger.info(
      `Building in parallel: [${packages.join(', ')}]`,
      elapsedSince(buildStartedAt),
    );

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
          BuildLogger.success(
            `Parallel build completed successfully`,
            elapsedSince(buildStartedAt),
          );
          resolve(true);
        } else {
          BuildLogger.error(
            `Parallel build failed with code ${code}`,
            elapsedSince(buildStartedAt),
          );
          resolve(false);
        }
      });
    });
  } catch (error) {
    BuildLogger.error(
      `Parallel build failed: ${error}`,
      elapsedSince(buildStartedAt),
    );
    return false;
  }
}

async function buildPackagesSerial(packageName: string): Promise<boolean> {
  const buildStartedAt = Date.now();

  try {
    BuildLogger.info(`Building: ${packageName}`, elapsedSince(buildStartedAt));

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
          BuildLogger.success(
            `Build completed successfully`,
            elapsedSince(buildStartedAt),
          );
          resolve(true);
        } else {
          BuildLogger.error(
            `Build failed with code ${code}`,
            elapsedSince(buildStartedAt),
          );
          resolve(false);
        }
      });
    });
  } catch (error) {
    BuildLogger.error(`Build failed: ${error}`, elapsedSince(buildStartedAt));
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
  const buildStartedAt = Date.now();

  BuildLogger.info(
    'Starting optimized build process...\n',
    elapsedSince(buildStartedAt),
  );

  const allPackages = getAllMonorepoPackages();
  const skippedPackages = parseSkippedPackages();
  const { valid: validSkippedPackages, invalid: invalidSkippedPackages } =
    resolveSkippedPackages(skippedPackages, allPackages);

  if (validSkippedPackages.size > 0) {
    BuildLogger.info(
      `Skip build packages: [${[...validSkippedPackages].join(', ')}]`,
      elapsedSince(buildStartedAt),
    );
  }
  if (invalidSkippedPackages.length > 0) {
    BuildLogger.warn(
      `Ignored unknown skip packages: [${invalidSkippedPackages.join(', ')}]`,
      elapsedSince(buildStartedAt),
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
      elapsedSince(buildStartedAt),
    );
  } else {
    BuildLogger.info(
      'No remaining packages found',
      elapsedSince(buildStartedAt),
    );
  }

  const fullPipeline = resolveBuildPipeline(
    filteredBasePipeline,
    remainingPackages,
  );
  if (fullPipeline.length === 0) {
    BuildLogger.warn(
      'No packages to build after applying skip filters',
      elapsedSince(buildStartedAt),
    );
    process.exit(0);
  }

  BuildLogger.info('Build Pipeline:', elapsedSince(buildStartedAt));
  for (const [index, phase] of fullPipeline.entries()) {
    if (Array.isArray(phase)) {
      BuildLogger.info(
        `  Phase ${index + 1}: [${phase.join(', ')}] (parallel)`,
        elapsedSince(buildStartedAt),
      );
    } else {
      BuildLogger.info(
        `  Phase ${index + 1}: ${phase}`,
        elapsedSince(buildStartedAt),
      );
    }
  }
  BuildLogger.info('', elapsedSince(buildStartedAt));

  let successCount = 0;
  const totalPhases = fullPipeline.length;

  for (const [i, phase] of fullPipeline.entries()) {
    if (await buildPackages(phase)) {
      successCount++;
    } else {
      BuildLogger.error(`Phase ${i + 1} failed`, elapsedSince(buildStartedAt));
      process.exit(1);
    }

    BuildLogger.info('', elapsedSince(buildStartedAt));
  }

  if (successCount === totalPhases) {
    BuildLogger.success(
      'All packages built successfully!',
      elapsedSince(buildStartedAt),
    );
    process.exit(0);
  } else {
    BuildLogger.warn('Some phases failed', elapsedSince(buildStartedAt));
    process.exit(1);
  }
}

main().catch((error) => {
  BuildLogger.error(
    `Build process failed: ${error}`,
    elapsedSince(scriptStartedAt),
  );
  process.exit(1);
});
