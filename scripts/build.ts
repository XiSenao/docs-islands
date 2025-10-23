import { execSync, spawn } from 'node:child_process';
import Logger, { lightGeneralLogger } from '../utils/logger';

const BUILD_PIPELINE: (string | string[])[] = [
  ['@docs-islands/plugin-license', '@docs-islands/utils'],
  '@docs-islands/vitepress',
  '...',
];

const logger = Logger.getLoggerByGroup('build');

function shouldShowOutput(output: string): boolean {
  const filteredPatterns = [
    'npm warn',
    'Unknown env config',
    'Unknown project config',
    'None of the selected packages has a "build" script',
    'npm info using',
    'npm info ok',
    'npm http fetch',
    'npm cache',
  ];

  return !filteredPatterns.some((pattern) => output.includes(pattern));
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
    logger.warn('Failed to get monorepo packages, using fallback method');
    return [
      '@docs-islands/plugin-license',
      '@docs-islands/utils',
      '@docs-islands/vitepress',
      '@docs-islands/eslint-config',
    ];
  }
}

function getConfiguredPackages(): string[] {
  const configured: string[] = [];

  for (const phase of BUILD_PIPELINE) {
    if (Array.isArray(phase)) {
      configured.push(...phase);
    } else if (phase !== '...') {
      configured.push(phase);
    }
  }

  return configured;
}

function getRemainingPackages(): string[] {
  const allPackages = getAllMonorepoPackages();
  const configuredPackages = getConfiguredPackages();

  const remainingPackages = allPackages.filter(
    (pkg) => !configuredPackages.includes(pkg),
  );

  return remainingPackages;
}

async function buildPackagesParallel(packages: string[]): Promise<boolean> {
  try {
    logger.info(`Building in parallel: [${packages.join(', ')}]`);

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

    const child = spawn('npx', ['concurrently', ...concurrentlyOptions], {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });

    child.stdout.on('data', (data) => {
      const output = data.toString();
      if (shouldShowOutput(output)) {
        process.stdout.write(output);
      }
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      if (shouldShowOutput(output)) {
        process.stderr.write(output);
      }
    });

    return new Promise((resolve) => {
      child.on('close', (code) => {
        if (code === 0) {
          logger.success(`Parallel build completed successfully`);
          resolve(true);
        } else {
          logger.error(`Parallel build failed with code ${code}`);
          resolve(false);
        }
      });
    });
  } catch (error) {
    logger.error(`Parallel build failed: ${error}`);
    return false;
  }
}

async function buildPackagesSerial(packageName: string): Promise<boolean> {
  try {
    logger.info(`Building: ${packageName}`);

    const child = spawn('pnpm', ['--filter', packageName, 'build'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });

    child.stdout.on('data', (data) => {
      const output = data.toString();
      if (shouldShowOutput(output)) {
        process.stdout.write(output);
      }
    });

    child.stderr.on('data', (data) => {
      const output = data.toString();
      if (shouldShowOutput(output)) {
        process.stderr.write(output);
      }
    });

    return new Promise((resolve) => {
      child.on('close', (code) => {
        if (code === 0) {
          logger.success(`Build completed successfully`);
          resolve(true);
        } else {
          logger.error(`Build failed with code ${code}`);
          resolve(false);
        }
      });
    });
  } catch (error) {
    logger.error(`Build failed: ${error}`);
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
  logger.info('Starting optimized build process...\n');

  const remainingPackages = getRemainingPackages();
  if (remainingPackages.length > 0) {
    logger.info(
      `Found ${remainingPackages.length} remaining packages:

${remainingPackages.map((pkg) => `- ${pkg}`).join('\n')}
`,
    );
  } else {
    logger.info(
      lightGeneralLogger('info', 'No remaining packages found') as string,
    );
  }

  const fullPipeline = [...BUILD_PIPELINE];

  if (remainingPackages.length > 0) {
    const index = fullPipeline.indexOf('...');
    if (index === -1) {
      fullPipeline.push(remainingPackages);
    } else {
      fullPipeline[index] = remainingPackages;
    }
  } else {
    const index = fullPipeline.indexOf('...');
    if (index !== -1) {
      fullPipeline.splice(index, 1);
    }
  }

  logger.info('Build Pipeline:');
  for (const [index, phase] of fullPipeline.entries()) {
    if (Array.isArray(phase)) {
      logger.info(`  Phase ${index + 1}: [${phase.join(', ')}] (parallel)`);
    } else if (phase === '...') {
      logger.info(
        `  Phase ${index + 1}: [${remainingPackages.join(', ')}] (parallel - auto-discovered)`,
      );
    } else {
      logger.info(`  Phase ${index + 1}: ${phase}`);
    }
  }
  logger.info('');

  let successCount = 0;
  const totalPhases = fullPipeline.length;

  for (const [i, phase] of fullPipeline.entries()) {
    if (phase === '...') {
      continue;
    }

    if (await buildPackages(phase)) {
      successCount++;
    } else {
      logger.error(`Phase ${i + 1} failed`);
      process.exit(1);
    }

    logger.info('');
  }

  if (successCount === totalPhases) {
    logger.success('All packages built successfully!');
    process.exit(0);
  } else {
    logger.warn('Some phases failed');
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error(
    lightGeneralLogger('error', `Build process failed: ${error}`) as string,
  );
  process.exit(1);
});
