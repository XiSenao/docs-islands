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

const logger = Logger.getLoggerByGroup('merge-docs');

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

  logger.info(`Found ${packageJsonPaths.length} package.json files to check`);

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

      logger.info(`Checking docs package: ${packageName}`);
      logger.info(`  Package path: ${packageDir}`);
      logger.info(`  Expected dist path: ${distPath}`);

      if (existsSync(distPath)) {
        packages.push({
          name: packageName,
          path: packageDir,
          distPath,
          targetName,
        });
        logger.success(`Found docs package: ${packageName} -> ${targetName}`);
      } else {
        logger.warn(`${packageName} dist directory not found: ${distPath}`);
      }
    } else if (packageName?.startsWith('@docs-islands/')) {
      logger.warn(`Skipping @docs-islands package (not docs): ${packageName}`);
    }
  } catch (error) {
    logger.error(`Failed to parse ${packageJsonPath}: ${error}`);
  }
}

async function mergeDistDirectories(packages: PackageInfo[]): Promise<void> {
  const mainPackage = packages.find(
    (pkg) => pkg.name === '@docs-islands/monorepo-docs',
  );

  if (!mainPackage) {
    logger.error('Main package(@docs-islands/monorepo-docs) not found');
    return;
  }

  const mainDistPath = mainPackage.distPath;

  await mkdir(mainDistPath, { recursive: true });

  logger.info(`Main dist directory: ${mainDistPath}`);

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
        logger.info(`Skip ${pkg.name}: source path is not a directory`);
        continue;
      }

      const srcFiles = await readdir(pkg.distPath);
      if (srcFiles.length === 0) {
        logger.info(`Skip ${pkg.name}: source directory is empty`);
        continue;
      }

      logger.info(`Merging ${pkg.name}`);
      logger.info(`  Source: ${pkg.distPath}`);
      logger.info(`  Target: ${targetPath}`);

      await scanFiles(pkg.distPath, async (relativePath, absolutePath) => {
        const destPath = join(targetPath, relativePath);
        // Ensure the parent directory exists before copying
        await mkdir(dirname(destPath), { recursive: true });
        await copyFile(absolutePath, destPath);
      });

      logger.success(`Successfully merged ${pkg.name} to ${pkg.targetName}`);
    } catch (error) {
      logger.error(`Failed to merge ${pkg.name}: ${error}`);
    }
  }
}

async function main(): Promise<void> {
  try {
    logger.info('Starting docs merge...');
    logger.info(`Project root: ${projectRoot}`);

    const packages = await findDocsPackages();

    if (packages.length === 0) {
      logger.info('No @docs-islands/xxx-docs packages found');
      return;
    }

    logger.info(`Found ${packages.length} docs packages:`);
    for (const pkg of packages) {
      logger.info(`  - ${pkg.name} (${pkg.targetName})`);
    }

    logger.info('Starting dist directory merge...');
    await mergeDistDirectories(packages);

    logger.info('Docs merge completed!');
  } catch (error) {
    logger.error(`Error during merge process: ${error}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
