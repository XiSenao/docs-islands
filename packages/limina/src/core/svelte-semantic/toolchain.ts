import { normalizeAbsolutePath } from '#utils/path';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { svelte2tsx } from 'svelte2tsx';
import {
  checkerToolchainDependencyContracts,
  isSupportedDependencyVersion,
  LiminaDependencyError,
  readResolvedPackageVersion,
} from '../../dependency-contract';
import { isResolvedFromLeafInstalledPackage } from '../packages/leaf-package-resolution';

type SvelteTransform = typeof svelte2tsx;

interface Svelte2TsxModule {
  svelte2tsx?: unknown;
}

export interface SvelteCompiler {
  VERSION?: string;
  parse(source: string, options?: Record<string, unknown>): unknown;
}

export interface SvelteSemanticToolchain {
  compiler: SvelteCompiler;
  compilerPath: string;
  compilerVersion: string;
  transform: SvelteTransform;
  transformPath: string;
  transformVersion: string;
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

const svelte2tsxContract = checkerToolchainDependencyContracts.svelte2tsx;

function createMissingTransformError(packageRootDir: string): Error {
  return new LiminaDependencyError({
    failureKind: 'missing',
    message: [
      'Unable to load the Svelte semantic toolchain:',
      '  package: svelte2tsx',
      `  leaf package root: ${packageRootDir}`,
      '  dependency category: checker toolchain',
      '  reason: svelte2tsx is not installed in the source config leaf dependency scope.',
      `  fix: install svelte2tsx@${svelte2tsxContract.supportedRange} alongside svelte-check in ${packageRootDir}`,
    ].join('\n'),
    ownership: svelte2tsxContract.ownership,
    packageName: svelte2tsxContract.packageName,
    scope: packageRootDir,
  });
}

function createUnsupportedTransformError(options: {
  packageRootDir: string;
  version: string | undefined;
}): Error {
  const installedVersion = options.version ?? 'unknown';
  return new LiminaDependencyError({
    failureKind: 'unsupported',
    message: [
      'Unable to load the Svelte semantic toolchain:',
      '  package: svelte2tsx',
      `  leaf package root: ${options.packageRootDir}`,
      '  dependency category: checker toolchain',
      `  installed version: ${installedVersion}`,
      `  supported range: ${svelte2tsxContract.supportedRange}`,
      `  fix: install svelte2tsx@${svelte2tsxContract.supportedRange} alongside svelte-check in ${options.packageRootDir}`,
    ].join('\n'),
    ownership: svelte2tsxContract.ownership,
    packageName: svelte2tsxContract.packageName,
    scope: options.packageRootDir,
    version: options.version,
  });
}

function resolvePackageSpecifier(options: {
  missingError: () => Error;
  requireFromLeaf: ReturnType<typeof createRequire>;
  specifier: string;
}): string {
  try {
    return normalizeAbsolutePath(
      options.requireFromLeaf.resolve(options.specifier),
    );
  } catch (error) {
    if (isModuleNotFoundError(error)) throw options.missingError();
    throw error;
  }
}

function requireLeafInstalledPackage(options: {
  missingError: () => Error;
  packageName: string;
  packageRootDir: string;
  resolvedPath: string;
}): string {
  if (
    !isResolvedFromLeafInstalledPackage({
      packageName: options.packageName,
      packageRootDir: options.packageRootDir,
      resolvedPath: options.resolvedPath,
    })
  ) {
    throw options.missingError();
  }
  return options.resolvedPath;
}

function resolveLeafPackageEntry(options: {
  missingError: () => Error;
  packageName: string;
  packageRootDir: string;
  requireFromLeaf: ReturnType<typeof createRequire>;
  specifier: string;
}): string {
  return requireLeafInstalledPackage({
    ...options,
    resolvedPath: resolvePackageSpecifier(options),
  });
}

function loadLeafCompiler(options: {
  packageRootDir: string;
  requireFromLeaf: ReturnType<typeof createRequire>;
}): { compiler: SvelteCompiler; compilerPath: string } {
  const compilerPath = resolveLeafPackageEntry({
    missingError: () => createMissingCompilerError(options.packageRootDir),
    packageName: 'svelte',
    packageRootDir: options.packageRootDir,
    requireFromLeaf: options.requireFromLeaf,
    specifier: 'svelte/compiler',
  });
  return {
    compiler: options.requireFromLeaf(compilerPath) as SvelteCompiler,
    compilerPath,
  };
}

function getCompilerVersion(options: {
  compiler: SvelteCompiler;
  compilerPath: string;
}): string {
  return (
    readResolvedPackageVersion({
      packageName: 'svelte',
      resolvedPath: options.compilerPath,
    }) ??
    options.compiler.VERSION ??
    'unknown'
  );
}

function requireTransform(
  requireFromLeaf: ReturnType<typeof createRequire>,
  transformPath: string,
): SvelteTransform {
  const module = requireFromLeaf(transformPath) as Svelte2TsxModule;
  if (typeof module.svelte2tsx === 'function') {
    return module.svelte2tsx as SvelteTransform;
  }
  throw new TypeError(
    `The installed svelte2tsx entry does not export a svelte2tsx function: ${transformPath}`,
  );
}

function loadLeafTransform(options: {
  packageRootDir: string;
  requireFromLeaf: ReturnType<typeof createRequire>;
}): {
  transform: SvelteTransform;
  transformPath: string;
  transformVersion: string;
} {
  const transformPath = resolveLeafPackageEntry({
    missingError: () => createMissingTransformError(options.packageRootDir),
    packageName: svelte2tsxContract.packageName,
    packageRootDir: options.packageRootDir,
    requireFromLeaf: options.requireFromLeaf,
    specifier: svelte2tsxContract.packageName,
  });
  const transformVersion = readResolvedPackageVersion({
    packageName: svelte2tsxContract.packageName,
    resolvedPath: transformPath,
  });
  if (
    transformVersion === undefined ||
    !isSupportedDependencyVersion({
      contract: svelte2tsxContract,
      version: transformVersion,
    })
  ) {
    throw createUnsupportedTransformError({
      packageRootDir: options.packageRootDir,
      version: transformVersion,
    });
  }
  return {
    transform: requireTransform(options.requireFromLeaf, transformPath),
    transformPath,
    transformVersion,
  };
}

export function resolveSvelteSemanticToolchain(
  packageRootDir: string,
): SvelteSemanticToolchain {
  const requireFromLeaf = createRequire(
    path.join(packageRootDir, 'package.json'),
  );
  const { compiler, compilerPath } = loadLeafCompiler({
    packageRootDir,
    requireFromLeaf,
  });
  const transform = loadLeafTransform({ packageRootDir, requireFromLeaf });
  return {
    compiler,
    compilerPath,
    compilerVersion: getCompilerVersion({ compiler, compilerPath }),
    ...transform,
  };
}
