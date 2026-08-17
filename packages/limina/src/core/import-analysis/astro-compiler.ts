import { normalizeAbsolutePath } from '#utils/path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  isSupportedDependencyVersion,
  LiminaDependencyError,
  liminaRuntimeDependencyContracts,
} from '../../dependency-contract';
import { loadInitializedAstroCompiler } from './astro-compiler-loader';
import type { AstroCompiler } from './astro-compiler-types';
import type { FrameworkImportParserIdentity } from './types';

export type {
  AstroCompiler,
  AstroCompilerDiagnostic,
  AstroCompilerModule,
  AstroNode,
  AstroParseResult,
} from './astro-compiler-types';

const ASTRO_COMPILER_PACKAGE = '@astrojs/compiler';
const ASTRO_COMPILER_CONTRACT =
  liminaRuntimeDependencyContracts[ASTRO_COMPILER_PACKAGE];
const SUPPORTED_ASTRO_COMPILER_RANGE = ASTRO_COMPILER_CONTRACT.supportedRange;
const requireFromLimina = createRequire(import.meta.url);

interface ResolvedAstroCompiler {
  resolvedPath: string;
  version: string;
}

type DefaultCompilerResolutionState =
  | { error: unknown; kind: 'failed' }
  | { kind: 'resolved'; value: ResolvedAstroCompiler }
  | { kind: 'unresolved' };

let defaultCompilerResolutionState: DefaultCompilerResolutionState = {
  kind: 'unresolved',
};

interface AstroCompilerManifest {
  exports?: {
    '.'?: {
      import?: unknown;
    };
  };
  name?: unknown;
  version?: unknown;
}

function hasErrorCode(error: unknown): error is { code: unknown } {
  return error !== null && typeof error === 'object' && 'code' in error;
}

function isModuleNotFoundError(error: unknown): boolean {
  return hasErrorCode(error) && error.code === 'MODULE_NOT_FOUND';
}

function createMissingCompilerError(): LiminaDependencyError {
  return new LiminaDependencyError({
    failureKind: 'missing',
    message: [
      'Missing Limina runtime dependency:',
      `  package: ${ASTRO_COMPILER_PACKAGE}`,
      '  feature: Astro import analysis',
      '  resolution scope: the workspace running Limina',
      '  reason: Limina could not resolve its Astro analysis runtime from its installation environment.',
      `  fix: install '${ASTRO_COMPILER_PACKAGE}@${SUPPORTED_ASTRO_COMPILER_RANGE}' in the workspace running Limina.`,
    ].join('\n'),
    ownership: 'limina-runtime',
    packageName: ASTRO_COMPILER_PACKAGE,
    scope: 'limina-install',
  });
}

function createUnsupportedCompilerError(options: {
  version: string;
}): LiminaDependencyError {
  return new LiminaDependencyError({
    failureKind: 'unsupported',
    message: [
      'Missing Limina runtime dependency:',
      `  package: ${ASTRO_COMPILER_PACKAGE}`,
      `  installed version: ${options.version}`,
      `  supported range: ${SUPPORTED_ASTRO_COMPILER_RANGE}`,
      '  resolution scope: the workspace running Limina',
      '  reason: Limina relies on the asynchronous parse API and positioned AST verified for Astro compiler majors 2 through 4.',
      `  fix: adjust '${ASTRO_COMPILER_PACKAGE}' in the workspace running Limina.`,
    ].join('\n'),
    ownership: 'limina-runtime',
    packageName: ASTRO_COMPILER_PACKAGE,
    scope: 'limina-install',
    version: options.version,
  });
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

function readPackageManifest(directory: string): AstroCompilerManifest | null {
  try {
    return JSON.parse(
      readFileSync(path.join(directory, 'package.json'), 'utf8'),
    ) as AstroCompilerManifest;
  } catch {
    return null;
  }
}

function isAstroCompilerManifest(
  manifest: AstroCompilerManifest | null,
): manifest is AstroCompilerManifest {
  return manifest !== null && manifest.name === ASTRO_COMPILER_PACKAGE;
}

function findAstroCompilerManifest(resolvedPath: string): {
  directory: string;
  manifest: AstroCompilerManifest;
} | null {
  for (const directory of collectAncestorDirectories(resolvedPath)) {
    const manifest = readPackageManifest(directory);
    if (isAstroCompilerManifest(manifest)) {
      return { directory, manifest };
    }
  }
  return null;
}

function getRootExport(
  manifest: AstroCompilerManifest,
): { import?: unknown } | null {
  const exports = manifest.exports;
  if (exports === undefined) return null;
  return exports['.'] ?? null;
}

function isRelativeImportTarget(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return value.startsWith('./');
}

function getCompilerImportPath(options: {
  directory: string;
  manifest: AstroCompilerManifest;
}): string | null {
  const rootExport = getRootExport(options.manifest);
  if (rootExport === null) return null;
  const importTarget = rootExport.import;
  if (!isRelativeImportTarget(importTarget)) return null;
  return normalizeAbsolutePath(path.resolve(options.directory, importTarget));
}

function getCompilerVersion(
  compilerPackage: ReturnType<typeof findAstroCompilerManifest>,
): string {
  if (compilerPackage === null) return 'unknown';
  const version = compilerPackage.manifest.version;
  if (typeof version !== 'string') return 'unknown';
  return version;
}

function getCompilerPackageImportPath(
  compilerPackage: ReturnType<typeof findAstroCompilerManifest>,
): string | null {
  if (compilerPackage === null) return null;
  return getCompilerImportPath(compilerPackage);
}

function resolveInstalledAstroCompiler(options: {
  resolvedPath: string;
}): ResolvedAstroCompiler {
  const compilerPackage = findAstroCompilerManifest(options.resolvedPath);
  const version = getCompilerVersion(compilerPackage);
  if (
    !isSupportedDependencyVersion({
      contract: ASTRO_COMPILER_CONTRACT,
      version,
    })
  ) {
    throw createUnsupportedCompilerError({ ...options, version });
  }
  const importPath = getCompilerPackageImportPath(compilerPackage);
  if (importPath === null) {
    throw createUnsupportedCompilerError({ ...options, version });
  }
  return { resolvedPath: importPath, version };
}

function resolveAstroCompilerEntry(resolveCompilerEntry: () => string): string {
  return normalizeAbsolutePath(resolveCompilerEntry());
}

function resolveAstroCompilerUncached(
  resolveCompilerEntry: () => string,
): ResolvedAstroCompiler {
  try {
    const resolvedPath = resolveAstroCompilerEntry(resolveCompilerEntry);
    return resolveInstalledAstroCompiler({ resolvedPath });
  } catch (error) {
    if (isModuleNotFoundError(error)) {
      throw createMissingCompilerError();
    }
    throw error;
  }
}

function attemptDefaultAstroCompilerResolution(): ResolvedAstroCompiler {
  try {
    const resolved = resolveAstroCompilerUncached(() =>
      requireFromLimina.resolve(ASTRO_COMPILER_PACKAGE),
    );
    defaultCompilerResolutionState = { kind: 'resolved', value: resolved };
    return resolved;
  } catch (error) {
    defaultCompilerResolutionState = { error, kind: 'failed' };
    throw error;
  }
}

function resolveDefaultAstroCompiler(): ResolvedAstroCompiler {
  if (defaultCompilerResolutionState.kind === 'resolved') {
    return defaultCompilerResolutionState.value;
  }
  if (defaultCompilerResolutionState.kind === 'failed') {
    throw defaultCompilerResolutionState.error;
  }
  return attemptDefaultAstroCompilerResolution();
}

function resolveAstroCompiler(
  resolveCompilerEntry: (() => string) | undefined,
): ResolvedAstroCompiler {
  return resolveCompilerEntry === undefined
    ? resolveDefaultAstroCompiler()
    : resolveAstroCompilerUncached(resolveCompilerEntry);
}

export async function loadAstroCompiler(options: {
  packageRootDir: string;
  resolvedPath: string;
}): Promise<AstroCompiler> {
  return await loadInitializedAstroCompiler({
    createMissingParseError: () =>
      createUnsupportedCompilerError({
        version: 'unknown parse API',
      }),
    resolvedPath: options.resolvedPath,
  });
}

export function getAstroParserIdentity(): FrameworkImportParserIdentity {
  const resolved = resolveDefaultAstroCompiler();
  return {
    kind: ASTRO_COMPILER_PACKAGE,
    mode: 'async-positioned-ast',
    version: `${resolved.version}:${resolved.resolvedPath}`,
  };
}

export function resolveAstroParser(options: {
  packageRootDir: string;
  resolveCompilerEntry?: () => string;
}): ResolvedAstroCompiler {
  return resolveAstroCompiler(options.resolveCompilerEntry);
}
