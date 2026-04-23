import {
  createElapsedLogOptions,
  createLogger,
} from '@docs-islands/logger/internal';
import { scanFiles } from '@docs-islands/utils/fs-utils';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'tinyglobby';

const { dirname, join, resolve } = path;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const MergeDocsLogger = createLogger({
  main: 'docs-islands-monorepo',
}).getLoggerByGroup('task.docs.merge');
const elapsedSince = (startTimeMs: number) =>
  createElapsedLogOptions(startTimeMs, Date.now());

interface PackageInfo {
  name: string;
  path: string;
  distPath: string;
  targetName: string;
}

async function findDocsPackages(): Promise<PackageInfo[]> {
  const findStartedAt = Date.now();
  const packages: PackageInfo[] = [];

  const packageJsonPaths = await glob(
    ['docs/package.json', 'packages/*/docs/package.json'],
    {
      cwd: projectRoot,
      absolute: true,
      onlyFiles: true,
      ignore: [
        '**/node_modules/**',
        '**/.*/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
      ],
    },
  );

  MergeDocsLogger.info(
    `Found ${packageJsonPaths.length} package.json files to check`,
    elapsedSince(findStartedAt),
  );

  for (const packageJsonPath of packageJsonPaths) {
    await processPackageJson(packageJsonPath, packages);
  }

  return packages;
}

async function processPackageJson(
  packageJsonPath: string,
  packages: PackageInfo[],
): Promise<void> {
  const processStartedAt = Date.now();

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const packageName = packageJson.name;

    // Check if it matches the @docs-islands/xxx-docs pattern.
    const match = packageName?.match(/^@docs-islands\/(.+)-docs$/);
    if (match) {
      const targetName = match[1];
      const packageDir = dirname(packageJsonPath);
      const distPath = join(packageDir, '.vitepress/dist');

      MergeDocsLogger.info(
        `Checking docs package: ${packageName}`,
        elapsedSince(processStartedAt),
      );
      MergeDocsLogger.info(
        `  Package path: ${packageDir}`,
        elapsedSince(processStartedAt),
      );
      MergeDocsLogger.info(
        `  Expected dist path: ${distPath}`,
        elapsedSince(processStartedAt),
      );

      if (existsSync(distPath)) {
        packages.push({
          name: packageName,
          path: packageDir,
          distPath,
          targetName,
        });
        MergeDocsLogger.success(
          `Found docs package: ${packageName} -> ${targetName}`,
          elapsedSince(processStartedAt),
        );
      } else {
        MergeDocsLogger.warn(
          `${packageName} dist directory not found: ${distPath}`,
          elapsedSince(processStartedAt),
        );
      }
    } else if (packageName?.startsWith('@docs-islands/')) {
      MergeDocsLogger.warn(
        `Skipping @docs-islands package (not docs): ${packageName}`,
        elapsedSince(processStartedAt),
      );
    }
  } catch (error) {
    MergeDocsLogger.error(
      `Failed to parse ${packageJsonPath}: ${error}`,
      elapsedSince(processStartedAt),
    );
  }
}

async function mergeDistDirectories(packages: PackageInfo[]): Promise<void> {
  const mergeStartedAt = Date.now();
  const mainPackage = packages.find(
    (pkg) => pkg.name === '@docs-islands/monorepo-docs',
  );

  if (!mainPackage) {
    MergeDocsLogger.error(
      'Main package(@docs-islands/monorepo-docs) not found',
      elapsedSince(mergeStartedAt),
    );
    return;
  }

  const mainDistPath = mainPackage.distPath;

  await mkdir(mainDistPath, { recursive: true });

  MergeDocsLogger.info(
    `Main dist directory: ${mainDistPath}`,
    elapsedSince(mergeStartedAt),
  );

  for (const pkg of packages) {
    const packageMergeStartedAt = Date.now();

    try {
      const targetPath = join(mainDistPath, pkg.targetName);

      const normalizedSrc = resolve(pkg.distPath);
      const normalizedMain = resolve(mainDistPath);

      if (normalizedSrc === normalizedMain) {
        continue;
      }

      const srcStat = await stat(pkg.distPath);
      if (!srcStat.isDirectory()) {
        MergeDocsLogger.info(
          `Skip ${pkg.name}: source path is not a directory`,
          elapsedSince(packageMergeStartedAt),
        );
        continue;
      }

      const srcFiles = await readdir(pkg.distPath);
      if (srcFiles.length === 0) {
        MergeDocsLogger.info(
          `Skip ${pkg.name}: source directory is empty`,
          elapsedSince(packageMergeStartedAt),
        );
        continue;
      }

      MergeDocsLogger.info(
        `Merging ${pkg.name}`,
        elapsedSince(packageMergeStartedAt),
      );
      MergeDocsLogger.info(
        `  Source: ${pkg.distPath}`,
        elapsedSince(packageMergeStartedAt),
      );
      MergeDocsLogger.info(
        `  Target: ${targetPath}`,
        elapsedSince(packageMergeStartedAt),
      );

      await scanFiles(pkg.distPath, async (relativePath, absolutePath) => {
        const destPath = join(targetPath, relativePath);
        // Ensure the parent directory exists before copying
        await mkdir(dirname(destPath), { recursive: true });
        await copyFile(absolutePath, destPath);
      });

      MergeDocsLogger.success(
        `Successfully merged ${pkg.name} to ${pkg.targetName}`,
        elapsedSince(packageMergeStartedAt),
      );
    } catch (error) {
      MergeDocsLogger.error(
        `Failed to merge ${pkg.name}: ${error}`,
        elapsedSince(packageMergeStartedAt),
      );
    }
  }
}

async function main(): Promise<void> {
  const mergeStartedAt = Date.now();

  try {
    MergeDocsLogger.info(
      'Starting docs merge...',
      elapsedSince(mergeStartedAt),
    );
    MergeDocsLogger.info(
      `Project root: ${projectRoot}`,
      elapsedSince(mergeStartedAt),
    );

    const packages = await findDocsPackages();

    if (packages.length === 0) {
      MergeDocsLogger.info(
        'No @docs-islands/xxx-docs packages found',
        elapsedSince(mergeStartedAt),
      );
      return;
    }

    MergeDocsLogger.info(
      `Found ${packages.length} docs packages:`,
      elapsedSince(mergeStartedAt),
    );
    for (const pkg of packages) {
      MergeDocsLogger.info(
        `  - ${pkg.name} (${pkg.targetName})`,
        elapsedSince(mergeStartedAt),
      );
    }

    MergeDocsLogger.info(
      'Starting dist directory merge...',
      elapsedSince(mergeStartedAt),
    );
    await mergeDistDirectories(packages);

    MergeDocsLogger.info('Docs merge completed!', elapsedSince(mergeStartedAt));
  } catch (error) {
    MergeDocsLogger.error(
      `Error during merge process: ${error}`,
      elapsedSince(mergeStartedAt),
    );
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
