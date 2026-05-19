import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';
import { parse } from 'yaml';
import type { ResolvedLatticeConfig } from './config';
import { normalizeAbsolutePath, normalizeWorkspacePath } from './utils/path';

const pnpmWorkspaceFileName = 'pnpm-workspace.yaml';
const pnpmLockfileName = 'pnpm-lock.yaml';

export interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: unknown;
  imports?: Record<string, unknown>;
  name?: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  private?: boolean;
  scripts?: Record<string, string>;
  workspaces?: string[];
}

export interface WorkspacePackage {
  directory: string;
  manifest: PackageManifest;
  name: string;
}

export interface LockfileDependency {
  specifier?: string;
  version?: string;
}

export interface LockfileImporter {
  dependencies?: Record<string, LockfileDependency>;
  devDependencies?: Record<string, LockfileDependency>;
  optionalDependencies?: Record<string, LockfileDependency>;
  peerDependencies?: Record<string, LockfileDependency>;
}

export interface Lockfile {
  importers?: Record<string, LockfileImporter>;
}

export interface ImporterInfo {
  directory: string;
  name?: string;
  workspaceDependencies: Set<string>;
}

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

export function getInternalScopes(config: ResolvedLatticeConfig): string[] {
  return config.workspace?.internalScopes ?? [];
}

export function isInternalSpecifier(
  specifier: string,
  config: ResolvedLatticeConfig,
): boolean {
  return getInternalScopes(config).some((scope) => specifier.startsWith(scope));
}

export function stripYamlQuotes(value: string): string {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function collectPnpmWorkspacePatterns(source: string): string[] {
  const patterns: string[] = [];
  const lines = source.split(/\r?\n/u);
  let isInsidePackagesSection = false;

  for (const rawLine of lines) {
    const line = rawLine.replaceAll('\t', '    ');
    const trimmedLine = line.trim();

    if (!isInsidePackagesSection) {
      if (trimmedLine === 'packages:') {
        isInsidePackagesSection = true;
      }
      continue;
    }

    if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
      continue;
    }

    const indent = line.length - line.trimStart().length;

    if (indent === 0) {
      break;
    }

    if (trimmedLine.startsWith('- ')) {
      patterns.push(stripYamlQuotes(trimmedLine.slice(2)));
    }
  }

  return patterns;
}

export function collectWorkspacePatterns(
  config: ResolvedLatticeConfig,
): string[] {
  const rootPackageJsonPath = path.join(config.rootDir, 'package.json');
  const patterns = new Set<string>(config.workspace?.packagePatterns ?? []);

  if (existsSync(rootPackageJsonPath)) {
    const rootPackageJson = readJsonFile<PackageManifest>(rootPackageJsonPath);

    if (Array.isArray(rootPackageJson.workspaces)) {
      for (const pattern of rootPackageJson.workspaces) {
        patterns.add(pattern);
      }
    }
  }

  const workspacePath = path.join(config.rootDir, pnpmWorkspaceFileName);

  if (existsSync(workspacePath)) {
    for (const pattern of collectPnpmWorkspacePatterns(
      readFileSync(workspacePath, 'utf8'),
    )) {
      patterns.add(pattern);
    }
  }

  return [...patterns].sort();
}

export async function collectWorkspacePackages(
  config: ResolvedLatticeConfig,
): Promise<WorkspacePackage[]> {
  const workspacePatterns = collectWorkspacePatterns(config);
  const includePatterns = workspacePatterns
    .filter((pattern) => !pattern.startsWith('!'))
    .map((pattern) => `${pattern.replace(/\/$/u, '')}/package.json`);
  const ignorePatterns = workspacePatterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => `${pattern.slice(1).replace(/\/$/u, '')}/**`);
  const packageJsonPaths = await glob(includePatterns, {
    cwd: config.rootDir,
    absolute: false,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      ...(config.workspace?.ignore ?? []),
      ...ignorePatterns,
    ],
  });
  const packages: WorkspacePackage[] = [];
  const internalScopes = getInternalScopes(config);

  for (const packageJsonPath of [...new Set(packageJsonPaths)].sort()) {
    const manifest = readJsonFile<PackageManifest>(
      path.join(config.rootDir, packageJsonPath),
    );

    if (
      internalScopes.length > 0 &&
      !internalScopes.some((scope) => manifest.name?.startsWith(scope))
    ) {
      continue;
    }

    if (!manifest.name) {
      continue;
    }

    packages.push({
      directory: normalizeAbsolutePath(
        path.dirname(path.join(config.rootDir, packageJsonPath)),
      ),
      manifest,
      name: manifest.name,
    });
  }

  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

export function readPnpmLockfile(config: ResolvedLatticeConfig): Lockfile {
  const lockfilePath = path.join(config.rootDir, pnpmLockfileName);
  const lockfile = parse(readFileSync(lockfilePath, 'utf8')) as Lockfile;

  if (!lockfile.importers || typeof lockfile.importers !== 'object') {
    throw new Error(`${pnpmLockfileName} does not contain importers.`);
  }

  return lockfile;
}

export function getDependencySections(
  importer: LockfileImporter,
): Record<string, LockfileDependency>[] {
  return [
    importer.dependencies,
    importer.devDependencies,
    importer.optionalDependencies,
    importer.peerDependencies,
  ].filter((section): section is Record<string, LockfileDependency> =>
    Boolean(section),
  );
}

export function isWorkspaceLockfileDependency(
  dependency: LockfileDependency,
): boolean {
  return (
    dependency.specifier?.startsWith('workspace:') === true &&
    dependency.version?.startsWith('link:') === true
  );
}

export function getPackageRootSpecifier(specifier: string): string {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');

    return scope && name ? `${scope}/${name}` : specifier;
  }

  return specifier.split('/')[0] ?? specifier;
}

export function findPackageForSpecifier(
  specifier: string,
  packages: WorkspacePackage[],
): WorkspacePackage | null {
  const packageName = getPackageRootSpecifier(specifier);

  return (
    packages.find(
      (workspacePackage) => workspacePackage.name === packageName,
    ) ?? null
  );
}

export function readPackageName(directoryPath: string): string | undefined {
  const packageJsonPath = path.join(directoryPath, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return undefined;
  }

  return readJsonFile<{ name?: string }>(packageJsonPath).name;
}

export function collectImporters(
  config: ResolvedLatticeConfig,
  packages: WorkspacePackage[],
): ImporterInfo[] {
  const lockfile = readPnpmLockfile(config);
  const packagesByDirectory = new Map(
    packages.map((workspacePackage) => [
      normalizeWorkspacePath(config.rootDir, workspacePackage.directory),
      workspacePackage,
    ]),
  );
  const importers: ImporterInfo[] = [];

  for (const [rawImporterDirectory, importer] of Object.entries(
    lockfile.importers!,
  )) {
    const importerDirectory =
      rawImporterDirectory === '.'
        ? config.rootDir
        : normalizeAbsolutePath(
            path.join(config.rootDir, rawImporterDirectory),
          );
    const workspaceDependencies = new Set<string>();

    for (const dependencies of getDependencySections(importer)) {
      for (const [dependencyName, dependency] of Object.entries(dependencies)) {
        if (
          !isInternalSpecifier(dependencyName, config) ||
          !isWorkspaceLockfileDependency(dependency)
        ) {
          continue;
        }

        const linkedPackageDirectory = normalizeWorkspacePath(
          config.rootDir,
          path.resolve(
            importerDirectory,
            dependency.version!.slice('link:'.length),
          ),
        );
        const linkedPackage = packagesByDirectory.get(linkedPackageDirectory);

        if (linkedPackage?.name === dependencyName) {
          workspaceDependencies.add(dependencyName);
        }
      }
    }

    importers.push({
      directory: importerDirectory,
      name: readPackageName(importerDirectory),
      workspaceDependencies,
    });
  }

  return importers.sort(
    (left, right) => right.directory.length - left.directory.length,
  );
}
