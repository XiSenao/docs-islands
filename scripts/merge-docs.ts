import { scanFiles } from '@docs-islands/utils/fs-utils';
import Logger from '@docs-islands/utils/logger';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'tinyglobby';

const { dirname, join, resolve } = path;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

interface PackageInfo {
  name: string;
  path: string;
  distPath: string;
  targetName: string;
}

async function findDocsPackages(): Promise<PackageInfo[]> {
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

  Logger.getLoggerByGroup('merge-docs').info(
    `Found ${packageJsonPaths.length} package.json files to check`,
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
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const packageName = packageJson.name;

    // Check if it matches the @docs-islands/xxx-docs pattern.
    const match = packageName?.match(/^@docs-islands\/(.+)-docs$/);
    if (match) {
      const targetName = match[1];
      const packageDir = dirname(packageJsonPath);
      const distPath = join(packageDir, '.vitepress/dist');

      Logger.getLoggerByGroup('merge-docs').info(
        `Checking docs package: ${packageName}`,
      );
      Logger.getLoggerByGroup('merge-docs').info(
        `  Package path: ${packageDir}`,
      );
      Logger.getLoggerByGroup('merge-docs').info(
        `  Expected dist path: ${distPath}`,
      );

      if (existsSync(distPath)) {
        packages.push({
          name: packageName,
          path: packageDir,
          distPath,
          targetName,
        });
        Logger.getLoggerByGroup('merge-docs').success(
          `Found docs package: ${packageName} -> ${targetName}`,
        );
      } else {
        Logger.getLoggerByGroup('merge-docs').warn(
          `${packageName} dist directory not found: ${distPath}`,
        );
      }
    } else if (packageName?.startsWith('@docs-islands/')) {
      Logger.getLoggerByGroup('merge-docs').warn(
        `Skipping @docs-islands package (not docs): ${packageName}`,
      );
    }
  } catch (error) {
    Logger.getLoggerByGroup('merge-docs').error(
      `Failed to parse ${packageJsonPath}: ${error}`,
    );
  }
}

async function mergeDistDirectories(packages: PackageInfo[]): Promise<void> {
  const mainPackage = packages.find(
    (pkg) => pkg.name === '@docs-islands/monorepo-docs',
  );

  if (!mainPackage) {
    Logger.getLoggerByGroup('merge-docs').error(
      'Main package(@docs-islands/monorepo-docs) not found',
    );
    return;
  }

  const mainDistPath = mainPackage.distPath;

  await mkdir(mainDistPath, { recursive: true });

  Logger.getLoggerByGroup('merge-docs').info(
    `Main dist directory: ${mainDistPath}`,
  );

  for (const pkg of packages) {
    try {
      const targetPath = join(mainDistPath, pkg.targetName);

      const normalizedSrc = resolve(pkg.distPath);
      const normalizedMain = resolve(mainDistPath);

      if (normalizedSrc === normalizedMain) {
        continue;
      }

      const srcStat = await stat(pkg.distPath);
      if (!srcStat.isDirectory()) {
        Logger.getLoggerByGroup('merge-docs').info(
          `Skip ${pkg.name}: source path is not a directory`,
        );
        continue;
      }

      const srcFiles = await readdir(pkg.distPath);
      if (srcFiles.length === 0) {
        Logger.getLoggerByGroup('merge-docs').info(
          `Skip ${pkg.name}: source directory is empty`,
        );
        continue;
      }

      Logger.getLoggerByGroup('merge-docs').info(`Merging ${pkg.name}`);
      Logger.getLoggerByGroup('merge-docs').info(`  Source: ${pkg.distPath}`);
      Logger.getLoggerByGroup('merge-docs').info(`  Target: ${targetPath}`);

      await scanFiles(pkg.distPath, async (relativePath, absolutePath) => {
        const destPath = join(targetPath, relativePath);
        // Ensure the parent directory exists before copying
        await mkdir(dirname(destPath), { recursive: true });
        await copyFile(absolutePath, destPath);
      });

      Logger.getLoggerByGroup('merge-docs').success(
        `Successfully merged ${pkg.name} to ${pkg.targetName}`,
      );
    } catch (error) {
      Logger.getLoggerByGroup('merge-docs').error(
        `Failed to merge ${pkg.name}: ${error}`,
      );
    }
  }
}

async function main(): Promise<void> {
  try {
    Logger.getLoggerByGroup('merge-docs').info('Starting docs merge...');
    Logger.getLoggerByGroup('merge-docs').info(`Project root: ${projectRoot}`);

    const packages = await findDocsPackages();

    if (packages.length === 0) {
      Logger.getLoggerByGroup('merge-docs').info(
        'No @docs-islands/xxx-docs packages found',
      );
      return;
    }

    Logger.getLoggerByGroup('merge-docs').info(
      `Found ${packages.length} docs packages:`,
    );
    for (const pkg of packages) {
      Logger.getLoggerByGroup('merge-docs').info(
        `  - ${pkg.name} (${pkg.targetName})`,
      );
    }

    Logger.getLoggerByGroup('merge-docs').info(
      'Starting dist directory merge...',
    );
    await mergeDistDirectories(packages);

    Logger.getLoggerByGroup('merge-docs').info('Docs merge completed!');
  } catch (error) {
    Logger.getLoggerByGroup('merge-docs').error(
      `Error during merge process: ${error}`,
    );
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
