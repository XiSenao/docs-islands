import { isBuildCapablePreset } from '#checkers';
import type { formatImportRecordLocation } from '#core/import-graph/context';
import { collectImportsFromFile } from '#core/import-graph/context';
import { uniqueCodeUnitSortedStrings } from '#utils/collections';
import { normalizeAbsolutePath } from '#utils/path';
import {
  addAmbiguousFrameworkSourceOwnerProblem,
  addMissingFrameworkBuildOwnerProblem,
  createFrameworkDependencyEdge,
  recordFrameworkDependencyEdge,
} from './framework-dependency-edge';
import { getFrameworkFilePackageRoot } from './framework-file-root';
import { reportUnresolvedFrameworkImport } from './framework-import-problems';
import { addFrameworkSemanticDependencyProblem } from './provider-problems';
import type { ReferenceImportContext } from './reference-import-types';
import { processDeclarationProviderImport } from './reference-imports';
import type {
  GeneratedBuildModule,
  GovernedSourceUnit,
  SourceProject,
} from './types';

export interface GovernedBuildOwner {
  buildModule?: GeneratedBuildModule;
  checkerName: string;
}

type FrameworkImportRecord = Parameters<typeof formatImportRecordLocation>[1];

interface FrameworkImportOptions {
  buildOwnersByConfigPath: ReadonlyMap<string, GovernedBuildOwner>;
  context: ReferenceImportContext;
  fileName: string;
  importRecord: FrameworkImportRecord;
  project: SourceProject;
  source: GovernedSourceUnit;
}

interface OwnedResolution {
  filePath: string;
  owners: string[];
}

interface FrameworkImportTarget {
  resolution: OwnedResolution;
  targetConfigPath: string;
}

function getResolvedFilePath(
  resolution: { resolvedFileName: string } | null | undefined,
): string | null {
  return resolution?.resolvedFileName ?? null;
}

function isFrameworkFile(filePath: string): boolean {
  return filePath.endsWith('.astro') || filePath.endsWith('.svelte');
}

function selectOwnedResolution(options: {
  context: ReferenceImportContext;
  oxcResolvedFilePath: string | null;
  typeScriptResolvedFilePath: string | null;
}): OwnedResolution | null {
  const candidates = uniqueCodeUnitSortedStrings(
    [options.typeScriptResolvedFilePath, options.oxcResolvedFilePath].filter(
      (filePath): filePath is string => filePath !== null,
    ),
  );
  return (
    candidates
      .map((candidate) => {
        const filePath = normalizeAbsolutePath(candidate);
        return {
          filePath,
          owners: options.context.fileOwnerLookup.get(filePath) ?? [],
        };
      })
      .find(({ owners }) => owners.length > 0) ?? null
  );
}

function selectFrameworkResolutionEvidence(options: {
  oxcResolvedFilePath: string | null;
  semanticFramework: 'astro' | 'vue' | undefined;
  typeScriptResolvedFilePath: string | null;
}): {
  oxcResolvedFilePath: string | null;
  typeScriptResolvedFilePath: string | null;
} {
  if (options.semanticFramework === 'astro') {
    return {
      oxcResolvedFilePath: null,
      typeScriptResolvedFilePath: options.typeScriptResolvedFilePath,
    };
  }
  return {
    oxcResolvedFilePath: options.oxcResolvedFilePath,
    typeScriptResolvedFilePath: options.typeScriptResolvedFilePath,
  };
}

function hasBlockingFrameworkEvidence(options: {
  evidence: ReturnType<
    ReferenceImportContext['importAnalysis']['resolveImportEvidence']
  >;
  importOptions: FrameworkImportOptions;
}): boolean {
  if (options.evidence.runtimeEvidence.classification === 'resource') {
    return true;
  }
  if (options.evidence.semanticFailure === undefined) return false;
  addFrameworkSemanticDependencyProblem({
    context: options.importOptions.context,
    failure: options.evidence.semanticFailure,
    importRecord: options.importOptions.importRecord,
    project: options.importOptions.project,
  });
  return true;
}

function resolveFrameworkImportResolution(
  options: FrameworkImportOptions,
): OwnedResolution | null {
  const evidence = options.context.importAnalysis.resolveImportEvidence(
    options.importRecord,
    options.fileName,
    options.project.options,
    {
      ...options.source.context,
      astroSemanticProject: options.source.astroSemanticProject,
      configPath: options.source.configPath,
      resolverConfigPath: options.source.configPath,
    },
  );
  if (hasBlockingFrameworkEvidence({ evidence, importOptions: options })) {
    return null;
  }
  const resolution = selectOwnedResolution({
    context: options.context,
    ...selectFrameworkResolutionEvidence({
      oxcResolvedFilePath: evidence.oxcResolvedFilePath,
      semanticFramework: evidence.semanticEvidence?.framework,
      typeScriptResolvedFilePath: getResolvedFilePath(
        evidence.typeScriptResolution,
      ),
    }),
  });
  reportUnresolvedFrameworkImport({
    context: options.context,
    importRecord: options.importRecord,
    resolutionFound: resolution !== null,
    source: options.source,
  });
  return resolution;
}

function getUniqueTargetConfigPath(options: {
  importOptions: FrameworkImportOptions;
  resolution: OwnedResolution;
}): string | null {
  const ownerConfigPaths = uniqueCodeUnitSortedStrings(
    options.resolution.owners,
  );
  if (ownerConfigPaths.length > 1) {
    addAmbiguousFrameworkSourceOwnerProblem({
      ...options.importOptions,
      ownerConfigPaths,
      resolvedFilePath: options.resolution.filePath,
    });
    return null;
  }
  return ownerConfigPaths[0] ?? null;
}

function resolveFrameworkImportTarget(
  options: FrameworkImportOptions,
): FrameworkImportTarget | null {
  const resolution = resolveFrameworkImportResolution(options);
  if (resolution === null) return null;
  const targetConfigPath = getUniqueTargetConfigPath({
    importOptions: options,
    resolution,
  });
  if ([null, options.source.configPath].includes(targetConfigPath)) return null;
  return { resolution, targetConfigPath: targetConfigPath! };
}

function shouldRecordDeclarationProviderImport(
  source: GovernedSourceUnit,
  resolution: OwnedResolution,
): boolean {
  return (
    isBuildCapablePreset(source.primaryCheckerName) &&
    !isFrameworkFile(resolution.filePath)
  );
}

function recordFrameworkSchedulingDependency(
  importOptions: FrameworkImportOptions,
  target: FrameworkImportTarget,
): void {
  const targetOwner = importOptions.buildOwnersByConfigPath.get(
    target.targetConfigPath,
  );
  if (targetOwner === undefined) {
    addMissingFrameworkBuildOwnerProblem({
      ...importOptions,
      targetConfigPath: target.targetConfigPath,
    });
    return;
  }
  recordFrameworkDependencyEdge(
    importOptions.context,
    createFrameworkDependencyEdge({
      ...importOptions,
      resolvedFilePath: target.resolution.filePath,
      targetCheckerName: targetOwner.checkerName,
      targetConfigPath: target.targetConfigPath,
    }),
  );
}

function processFrameworkImport(options: FrameworkImportOptions): void {
  const target = resolveFrameworkImportTarget(options);
  if (target === null) return;
  if (
    shouldRecordDeclarationProviderImport(options.source, target.resolution)
  ) {
    processDeclarationProviderImport({
      ...options,
      astroSemanticProject: options.source.astroSemanticProject,
      resolutionContext: options.source.context,
    });
    return;
  }
  recordFrameworkSchedulingDependency(options, target);
}

function processFrameworkFile(
  options: Omit<FrameworkImportOptions, 'importRecord'>,
): void {
  let imports: ReturnType<typeof collectImportsFromFile>;
  try {
    imports = collectImportsFromFile(
      options.fileName,
      getFrameworkFilePackageRoot({
        activatedRegions: options.context.activatedRegions,
        fallbackPackageRootDir: options.source.packageRootDir,
        fileName: options.fileName,
      }),
      options.context.importAnalysis,
    );
  } catch (error) {
    options.context.problems.push(formatThrownError(error));
    return;
  }
  for (const importRecord of imports) {
    processFrameworkImport({ ...options, importRecord });
  }
}

function formatThrownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getFrameworkSourceFileNames(source: GovernedSourceUnit): string[] {
  if (!isBuildCapablePreset(source.primaryCheckerName)) {
    return source.ownedFileNames;
  }
  return source.ownedFileNames.filter(isFrameworkFile);
}

function processFrameworkSource(options: {
  buildOwnersByConfigPath: ReadonlyMap<string, GovernedBuildOwner>;
  context: ReferenceImportContext;
  primaryProjectsByConfigPath: ReadonlyMap<string, SourceProject>;
  source: GovernedSourceUnit;
}): void {
  const project = options.primaryProjectsByConfigPath.get(
    options.source.configPath,
  );
  if (project === undefined) return;
  for (const fileName of getFrameworkSourceFileNames(options.source)) {
    processFrameworkFile({ ...options, fileName, project });
  }
}

export function processFrameworkSourceReferences(options: {
  buildOwnersByConfigPath: ReadonlyMap<string, GovernedBuildOwner>;
  context: ReferenceImportContext;
  governedSources: readonly GovernedSourceUnit[];
  primaryProjectsByConfigPath: ReadonlyMap<string, SourceProject>;
}): void {
  for (const source of options.governedSources) {
    processFrameworkSource({ ...options, source });
  }
}
