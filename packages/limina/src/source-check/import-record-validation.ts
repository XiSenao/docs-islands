import type { ResolvedLiminaConfig } from '#config/runner';
import type { AnalysisProviderSet } from '#core';
import {
  formatImportRecordLocation,
  type ImportRecord,
  type ProjectInfo,
} from '#core/import-graph/context';
import {
  getPackageRootSpecifier,
  type PackageOwner,
  type WorkspacePackage,
} from '#core/workspace/actions';
import {
  isPackageImportSpecifier,
  isRelativeSpecifier,
} from '#utils/module-specifier';
import { toRelativePath } from '#utils/path';
import { FrameworkSemanticResolutionError } from '../core/framework-semantic/contracts';
import { selectCanonicalImportFilePath } from '../core/import-analysis/canonical-resolution';
import type { WorkspaceLookupIndex } from '../core/workspace/lookup';
import type { WorkspaceRegionPathIndex } from '../core/workspace/validated-context';
import type { AmbientDeclarationIndex } from './ambient-declarations';
import {
  addBarePackageImportProblems,
  shouldSkipBarePackageAuthorization,
} from './bare-package-imports';
import type { SourceFinding } from './findings';
import {
  addSourceCrossGovernanceBoundaryProblem,
  addSourceImportOutsideActivatedRegionProblem,
} from './import-boundary-findings';
import { addPackageImportProblem } from './package-import-validator';
import { addRelativeImportProblems } from './relative-import-validation';
import type { CompiledImportAuthorityAllowRule } from './source-types';

interface ImportRecordOptions {
  ambientDeclarations: AmbientDeclarationIndex;
  config: ResolvedLiminaConfig;
  filePath: string;
  importAnalysis: AnalysisProviderSet['imports']['context'];
  importAuthorityAllowRules: CompiledImportAuthorityAllowRule[];
  importRecord: ImportRecord;
  owner: PackageOwner;
  packages: WorkspacePackage[];
  pathIndex: WorkspaceRegionPathIndex;
  findings: SourceFinding[];
  project: ProjectInfo;
  rootPackage: WorkspacePackage | null;
  workspaceLookup: WorkspaceLookupIndex;
}

function resolveImport(options: ImportRecordOptions): string | null {
  const evidence = options.importAnalysis.resolveImportEvidence(
    options.importRecord,
    options.filePath,
    options.project.options,
    options.project,
  );
  if (evidence.semanticFailure !== undefined) {
    throw new FrameworkSemanticResolutionError({
      failure: evidence.semanticFailure,
      message: [
        'Unable to resolve source import semantically:',
        `  importing config: ${toRelativePath(options.config.rootDir, options.project.configPath)}`,
        `  file: ${formatImportRecordLocation(options.config.rootDir, options.importRecord)}`,
        `  source specifier: ${options.importRecord.specifier}`,
        `  framework: ${evidence.semanticFailure.framework}`,
        `  stage: ${evidence.semanticFailure.stage}`,
        `  semantic scope: ${evidence.semanticFailure.scopeIdentity}`,
        `  reason: ${evidence.semanticFailure.reason}`,
      ].join('\n'),
    });
  }
  return selectCanonicalImportFilePath({ evidence, includeResource: true });
}

function addOutsideActivatedRegionProblem(options: {
  base: ImportRecordOptions;
  resolvedFilePath: string;
}): boolean {
  if (
    !options.base.workspaceLookup.isLocalPathOutsideActivatedRegion(
      options.resolvedFilePath,
    )
  ) {
    return false;
  }

  addSourceImportOutsideActivatedRegionProblem({
    config: options.base.config,
    importRecord: options.base.importRecord,
    owner: options.base.owner,
    findings: options.base.findings,
    resolvedFilePath: options.resolvedFilePath,
  });
  return true;
}

function addBoundaryProblemIfNeeded(options: {
  base: ImportRecordOptions;
  resolvedFilePath: string | null;
}): boolean {
  if (!options.resolvedFilePath) {
    return false;
  }

  const boundary = options.base.pathIndex.findBoundaryForPath(
    options.resolvedFilePath,
  );
  if (!boundary) {
    return addOutsideActivatedRegionProblem({
      base: options.base,
      resolvedFilePath: options.resolvedFilePath,
    });
  }

  addSourceCrossGovernanceBoundaryProblem({
    boundary,
    config: options.base.config,
    importRecord: options.base.importRecord,
    owner: options.base.owner,
    findings: options.base.findings,
    resolvedFilePath: options.resolvedFilePath,
  });
  return true;
}

function addRelativeProblemIfNeeded(options: {
  base: ImportRecordOptions;
  resolvedFilePath: string | null;
}): boolean {
  if (!isRelativeSpecifier(options.base.importRecord.specifier)) {
    return false;
  }

  addRelativeImportProblems({
    ambientDeclarations: options.base.ambientDeclarations,
    config: options.base.config,
    filePath: options.base.filePath,
    importRecord: options.base.importRecord,
    owner: options.base.owner,
    findings: options.base.findings,
    resolvedFilePath: options.resolvedFilePath,
    workspaceLookup: options.base.workspaceLookup,
  });
  return true;
}

function addPackageImportIfNeeded(options: {
  base: ImportRecordOptions;
  resolvedFilePath: string | null;
}): boolean {
  if (!isPackageImportSpecifier(options.base.importRecord.specifier)) {
    return false;
  }

  addPackageImportProblem({
    config: options.base.config,
    importRecord: options.base.importRecord,
    owner: options.base.owner,
    packages: options.base.packages,
    findings: options.base.findings,
    resolvedFilePath: options.resolvedFilePath,
    importAuthorityAllowRules: options.base.importAuthorityAllowRules,
    rootPackage: options.base.rootPackage,
    workspaceLookup: options.base.workspaceLookup,
  });
  return true;
}

function addBareImportIfNeeded(options: {
  base: ImportRecordOptions;
  resolvedFilePath: string | null;
}): void {
  if (shouldSkipBarePackageAuthorization(options.base.importRecord)) {
    return;
  }

  addBarePackageImportProblems({
    config: options.base.config,
    fallbackPackageName: getPackageRootSpecifier(
      options.base.importRecord.specifier,
    ),
    importAuthorityAllowRules: options.base.importAuthorityAllowRules,
    importRecord: options.base.importRecord,
    owner: options.base.owner,
    packages: options.base.packages,
    findings: options.base.findings,
    resolvedFilePath: options.resolvedFilePath,
    rootPackage: options.base.rootPackage,
    workspaceLookup: options.base.workspaceLookup,
  });
}

function addImportKindProblem(options: {
  base: ImportRecordOptions;
  resolvedFilePath: string | null;
}): void {
  if (addRelativeProblemIfNeeded(options)) {
    return;
  }

  if (addPackageImportIfNeeded(options)) {
    return;
  }

  addBareImportIfNeeded(options);
}

export function addImportRecordProblems(options: ImportRecordOptions): void {
  const context = {
    base: options,
    resolvedFilePath: resolveImport(options),
  };

  if (!addBoundaryProblemIfNeeded(context)) {
    addImportKindProblem(context);
  }
}
