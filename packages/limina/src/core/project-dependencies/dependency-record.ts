import { normalizeAbsolutePath } from '#utils/path';
import { getFrameworkSemanticFailureIdentity } from '../framework-semantic/contracts';
import type { CanonicalImportResolutionEvidence } from '../import-analysis/runner';
import { isDeclarationFile } from '../import-graph/declaration-classifier';
import type {
  DirectSourceDependency,
  MappedSourceDependency,
  ProjectDependency,
  ProjectDependencyCollection,
  ProjectDependencyRequest,
} from './contracts';
import { createProjectDependencyFailure, mapFailureStage } from './failure';
import { isTypeScriptSemanticSource } from './source-evidence';

type CheckerImportEvidence = CanonicalImportResolutionEvidence;

interface CollectRecordOptions {
  collection: ProjectDependencyCollection;
  importRecord: DirectSourceDependency['importRecord'];
  request: ProjectDependencyRequest;
}

function getResolutionMode(evidence: CheckerImportEvidence): string {
  return evidence.semanticEvidence?.resolutionMode ?? 'default';
}

function getSemanticSpecifier(options: {
  evidence: CheckerImportEvidence;
  importRecord: DirectSourceDependency['importRecord'];
}): string {
  return (
    options.evidence.semanticEvidence?.semanticSpecifier ??
    options.importRecord.specifier
  );
}

function getTargetKind(
  resolvedFilePath: string,
): DirectSourceDependency['targetKind'] {
  return isDeclarationFile(resolvedFilePath) ? 'declaration' : 'source';
}

function createDirectDependency(options: {
  evidence: CheckerImportEvidence;
  importRecord: DirectSourceDependency['importRecord'];
  resolvedFilePath: string;
}): DirectSourceDependency {
  return {
    importRecord: options.importRecord,
    provenance: 'direct-source',
    resolutionMode: getResolutionMode(options.evidence),
    resolvedFilePath: normalizeAbsolutePath(options.resolvedFilePath),
    semanticSpecifier: getSemanticSpecifier(options),
    sourceSpecifier: options.importRecord.specifier,
    targetKind: getTargetKind(options.resolvedFilePath),
  };
}

function createMappedDependency(options: {
  evidence: CheckerImportEvidence;
  importRecord: MappedSourceDependency['importRecord'];
  resolvedFilePath: string;
}): MappedSourceDependency {
  const semantic = options.evidence.semanticEvidence!;
  return {
    framework: semantic.framework,
    importRecord: options.importRecord,
    profile: semantic.profile as MappedSourceDependency['profile'],
    provenance: 'mapped-source',
    resolutionMode: semantic.resolutionMode,
    resolvedFilePath: normalizeAbsolutePath(options.resolvedFilePath),
    semanticSpecifier: semantic.semanticSpecifier,
    sourceSpecifier: semantic.sourceSpecifier,
    targetKind: getTargetKind(options.resolvedFilePath),
  };
}

function createDependency(options: {
  evidence: CheckerImportEvidence;
  importRecord: DirectSourceDependency['importRecord'];
  resolvedFilePath: string;
}): ProjectDependency {
  return options.evidence.semanticEvidence?.provenance === 'strict-source-map'
    ? createMappedDependency(options)
    : createDirectDependency(options);
}

function isNativeProjectDependencyTarget(resolvedFilePath: string): boolean {
  return (
    isDeclarationFile(resolvedFilePath) ||
    isTypeScriptSemanticSource(resolvedFilePath)
  );
}

function hasSemanticExtensionTarget(options: {
  evidence: CheckerImportEvidence;
  request: ProjectDependencyRequest;
  resolvedFilePath: string;
}): boolean {
  if (options.evidence.semanticEvidence === undefined) return false;
  const normalized = options.resolvedFilePath.toLowerCase();
  return options.request.context.extensions.some((extension) =>
    normalized.endsWith(extension.toLowerCase()),
  );
}

function getSemanticResolvedBy(
  evidence: CheckerImportEvidence,
): string | undefined {
  const semantic = evidence.semanticEvidence;
  if (semantic === undefined) return undefined;
  return semantic.target?.resolvedBy;
}

function getTypeScriptResolvedBy(
  evidence: CheckerImportEvidence,
): string | undefined {
  return evidence.typeScriptResolution?.resolvedBy;
}

function hasCheckerSourceTarget(evidence: CheckerImportEvidence): boolean {
  return [
    getSemanticResolvedBy(evidence),
    getTypeScriptResolvedBy(evidence),
  ].includes('checker-source');
}

function isProjectDependencyTarget(options: {
  evidence: CheckerImportEvidence;
  request: ProjectDependencyRequest;
  resolvedFilePath: string;
}): boolean {
  if (isNativeProjectDependencyTarget(options.resolvedFilePath)) return true;
  if (hasSemanticExtensionTarget(options)) return true;
  return hasCheckerSourceTarget(options.evidence);
}

function resolveWorkspaceTypeScriptExport(
  options: CollectRecordOptions,
): string | undefined {
  if (!usesTypeScriptAuthority(options.request)) return undefined;
  const resolve = options.request.resolveWorkspaceTypeScriptExport;
  if (resolve === undefined) return undefined;
  return normalizeWorkspaceResolution(resolve(options.importRecord.specifier));
}

function usesTypeScriptAuthority(request: ProjectDependencyRequest): boolean {
  return request.context.semanticAuthority.family === 'typescript';
}

function normalizeWorkspaceResolution(
  resolvedFilePath: string | null,
): string | undefined {
  return resolvedFilePath === null ? undefined : resolvedFilePath;
}

function getSemanticResolvedFileName(
  evidence: CheckerImportEvidence,
): string | undefined {
  const semantic = evidence.semanticEvidence;
  if (semantic === undefined) return undefined;
  return semantic.target?.resolvedFileName;
}

function getTypeScriptResolvedFileName(
  evidence: CheckerImportEvidence,
): string | undefined {
  return evidence.typeScriptResolution?.resolvedFileName;
}

function getResolvedFilePath(
  options: CollectRecordOptions,
  evidence: CheckerImportEvidence,
): string | undefined {
  const checkerResolution = [
    getSemanticResolvedFileName(evidence),
    getTypeScriptResolvedFileName(evidence),
  ].find((value): value is string => value !== undefined);
  if (checkerResolution !== undefined) return checkerResolution;
  return resolveWorkspaceTypeScriptExport(options);
}

function collectSemanticFailure(
  options: CollectRecordOptions,
  evidence: CheckerImportEvidence,
): boolean {
  const failure = evidence.semanticFailure;
  if (failure === undefined) return false;
  options.collection.failures.push(
    createProjectDependencyFailure({
      identity: getFrameworkSemanticFailureIdentity(failure),
      importRecord: options.importRecord,
      reason: failure.reason,
      request: options.request,
      stage: mapFailureStage(failure.stage),
    }),
  );
  return true;
}

function addResolvedDependency(options: {
  base: CollectRecordOptions;
  evidence: CheckerImportEvidence;
  resolvedFilePath: string;
}): void {
  options.base.collection.dependencies.push(
    createDependency({
      evidence: options.evidence,
      importRecord: options.base.importRecord,
      resolvedFilePath: options.resolvedFilePath,
    }),
  );
}

function getObservationKind(options: {
  evidence: CheckerImportEvidence;
  resolvedFilePath: string | undefined;
}): 'missing' | 'resource' {
  if (options.evidence.runtimeEvidence.classification === 'resource') {
    return 'resource';
  }
  return options.resolvedFilePath === undefined ? 'missing' : 'resource';
}

function addObservation(options: {
  base: CollectRecordOptions;
  evidence: CheckerImportEvidence;
  resolvedFilePath: string | undefined;
}): void {
  options.base.collection.observations.push({
    importRecord: options.base.importRecord,
    kind: getObservationKind(options),
  });
}

function resolveCheckerEvidence(options: CollectRecordOptions) {
  return options.request.importAnalysis.resolveCheckerImportEvidence(
    options.importRecord,
    options.importRecord.filePath,
    options.request.context.compilerOptions,
    {
      astroSemanticProject: options.request.context.astroSemanticProject,
      checkerPresets: [],
      configPath: options.request.context.configPath,
      extensions: [...options.request.context.extensions],
      resolverConfigPath: options.request.context.resolverConfigPath,
      semanticFamily: options.request.context.semanticAuthority.family,
      svelteSemanticProject: options.request.context.svelteSemanticProject,
      vueSemanticIdentity: options.request.context.vueSemanticIdentity,
    },
  );
}

export function collectProjectDependencyRecord(
  options: CollectRecordOptions,
): void {
  const evidence = resolveCheckerEvidence(options);
  if (collectSemanticFailure(options, evidence)) return;
  const resolvedFilePath = getResolvedFilePath(options, evidence);
  const projectTarget = getResolvedProjectTarget({
    base: options,
    evidence,
    resolvedFilePath,
  });
  if (projectTarget !== null) {
    addResolvedDependency({
      base: options,
      evidence,
      resolvedFilePath: projectTarget,
    });
    return;
  }
  addObservation({ base: options, evidence, resolvedFilePath });
}

function getResolvedProjectTarget(options: {
  base: CollectRecordOptions;
  evidence: CheckerImportEvidence;
  resolvedFilePath: string | undefined;
}): string | null {
  if (options.resolvedFilePath === undefined) return null;
  const isProjectTarget = isProjectDependencyTarget({
    evidence: options.evidence,
    request: options.base.request,
    resolvedFilePath: options.resolvedFilePath,
  });
  return isProjectTarget ? options.resolvedFilePath : null;
}
