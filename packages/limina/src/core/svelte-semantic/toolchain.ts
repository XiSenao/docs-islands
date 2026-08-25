import { normalizeAbsolutePath } from '#utils/path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { svelte2tsx } from 'svelte2tsx';
import { isResolvedFromLeafInstalledPackage } from '../packages/leaf-package-resolution';

export interface SvelteCompiler {
  VERSION?: string;
  parse(source: string, options?: Record<string, unknown>): unknown;
}

export interface SvelteSemanticToolchain {
  compiler: SvelteCompiler;
  compilerPath: string;
  compilerVersion: string;
  transform: typeof svelte2tsx;
}

function hasErrorCode(error: unknown): error is { code: unknown } {
  return error !== null && typeof error === 'object' && 'code' in error;
}

function isModuleNotFoundError(error: unknown): boolean {
  return hasErrorCode(error) && error.code === 'MODULE_NOT_FOUND';
}

function createMissingCompilerError(packageRootDir: string): Error {
  return new Error(
    [
      'Unable to load the Svelte semantic toolchain:',
      '  package: svelte/compiler',
      `  leaf package root: ${packageRootDir}`,
      '  dependency category: analysis runtime',
      '  reason: the Svelte compiler is not installed in the source config leaf dependency scope.',
      `  fix: install svelte in ${packageRootDir}`,
    ].join('\n'),
  );
}

function collectAncestorDirectories(resolvedPath: string): string[] {
  const directories: string[] = [];
  let directory = path.dirname(resolvedPath);
  while (true) {
    directories.push(directory);
    const parentDirectory = path.dirname(directory);
    if (parentDirectory === directory) return directories;
    directory = parentDirectory;
  }
}

function readManifest(manifestPath: string): {
  name?: unknown;
  version?: unknown;
} | null {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name?: unknown;
      version?: unknown;
    };
  } catch {
    return null;
  }
}

function getSvelteManifestVersion(
  manifest: {
    name?: unknown;
    version?: unknown;
  } | null,
): string | null | undefined {
  if (manifest === null) return undefined;
  if (manifest.name !== 'svelte') return undefined;
  return normalizeManifestVersion(manifest.version);
}

function normalizeManifestVersion(version: unknown): string | null {
  return typeof version === 'string' ? version : null;
}

function readManifestVersion(manifestPath: string): string | null | undefined {
  return getSvelteManifestVersion(readManifest(manifestPath));
}

function readSvelteManifestVersion(resolvedPath: string): string | null {
  for (const directory of collectAncestorDirectories(resolvedPath)) {
    const version = readManifestVersion(path.join(directory, 'package.json'));
    if (version !== undefined) return version;
  }
  return null;
}

function loadLeafCompiler(options: {
  packageRootDir: string;
  requireFromLeaf: ReturnType<typeof createRequire>;
}): { compiler: SvelteCompiler; compilerPath: string } {
  const compilerPath = normalizeAbsolutePath(
    options.requireFromLeaf.resolve('svelte/compiler'),
  );
  if (
    !isResolvedFromLeafInstalledPackage({
      packageName: 'svelte',
      packageRootDir: options.packageRootDir,
      resolvedPath: compilerPath,
    })
  ) {
    throw createMissingCompilerError(options.packageRootDir);
  }
  return {
    compiler: options.requireFromLeaf('svelte/compiler') as SvelteCompiler,
    compilerPath,
  };
}

function getCompilerVersion(options: {
  compiler: SvelteCompiler;
  compilerPath: string;
}): string {
  return (
    readSvelteManifestVersion(options.compilerPath) ??
    options.compiler.VERSION ??
    'unknown'
  );
}

export function resolveSvelteSemanticToolchain(
  packageRootDir: string,
): SvelteSemanticToolchain {
  const requireFromLeaf = createRequire(
    path.join(packageRootDir, 'package.json'),
  );
  try {
    const { compiler, compilerPath } = loadLeafCompiler({
      packageRootDir,
      requireFromLeaf,
    });
    return {
      compiler,
      compilerPath,
      compilerVersion: getCompilerVersion({ compiler, compilerPath }),
      transform: svelte2tsx,
    };
  } catch (error) {
    if (isModuleNotFoundError(error)) {
      throw createMissingCompilerError(packageRootDir);
    }
    throw error;
  }
}
