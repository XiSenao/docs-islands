import { createRequire } from 'node:module';
import path from 'pathe';

import {
  type CheckerPackageResolver,
  collectMissingCheckerPeerDependencies,
  formatMissingCheckerPeerDependencies,
  getCheckerAdapter,
} from '#checkers';
import type {
  CheckerExecutionKind,
  ResolvedCheckerConfig,
} from '#config/runner';

export function getExecutionCheckers(options: {
  checkers: ResolvedCheckerConfig[];
  executionKind: CheckerExecutionKind;
}): ResolvedCheckerConfig[] {
  return options.checkers.filter((checker) => {
    const adapter = getCheckerAdapter(checker.name);
    return adapter?.execution === options.executionKind;
  });
}

function getErrorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error
    ? String(error.code)
    : undefined;
}

function handlePackageResolutionError(options: {
  error: unknown;
  packageName: string;
}): string | undefined {
  const code = getErrorCode(options.error);

  if (code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
    return options.packageName;
  }

  if (code === 'MODULE_NOT_FOUND') {
    return undefined;
  }

  throw options.error;
}

function resolvePackageFromRoot(options: {
  packageName: string;
  projectRootDir: string;
}): string | undefined {
  const requireFromRoot = createRequire(
    path.join(options.projectRootDir, 'package.json'),
  );

  try {
    return requireFromRoot.resolve(`${options.packageName}/package.json`);
  } catch (error) {
    return handlePackageResolutionError({
      error,
      packageName: options.packageName,
    });
  }
}

export function collectCheckerPeerDependencyDetails(options: {
  checkers: ResolvedCheckerConfig[];
  projectRootDir: string;
  resolvePackage?: CheckerPackageResolver;
}): ReturnType<typeof collectMissingCheckerPeerDependencies> {
  const resolvePackage = options.resolvePackage ?? resolvePackageFromRoot;
  const missingDependencies = collectMissingCheckerPeerDependencies({
    checkers: options.checkers,
    projectRootDir: options.projectRootDir,
    resolvePackage,
  });
  return missingDependencies;
}

export function collectCheckerPeerDependencyProblems(options: {
  checkers: ResolvedCheckerConfig[];
  projectRootDir: string;
  resolvePackage?: CheckerPackageResolver;
}): string[] {
  const missingDependencies = collectCheckerPeerDependencyDetails(options);
  return missingDependencies.length === 0
    ? []
    : [formatMissingCheckerPeerDependencies(missingDependencies)];
}
