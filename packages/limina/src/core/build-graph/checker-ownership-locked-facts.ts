import type { ResolvedLiminaConfig } from '#config/runner';
import { toRelativePath } from '#utils/path';
import { getLiminaDependencyIssueIdentity } from '../../dependency-contract';
import type { ImportAnalysisContext } from '../import-analysis/runner';
import { shouldInferDeclarationReferenceFromImportRecord } from '../import-graph/declaration-reference-evidence';
import {
  collectProjectDependencies,
  createAutoProjectSemanticContext,
  type createProjectDependencyCaches,
  type ProjectDependency,
  type ProjectDependencyFailure,
} from '../project-dependencies/runner';
import { getAutoScopeFilePackageRoot } from './auto-checker-file-roots';
import type { AutoScopeProject } from './auto-checker-types';
import type { CheckerOwnershipDiscovery } from './checker-ownership-discovery';
import type {
  CheckerDependencyFact,
  TypeConfigOwnershipState,
} from './checker-ownership-types';

interface PrewarmRequest {
  fileName: string;
  packageRootDir: string;
}

function formatProjectDependencyFailure(options: {
  config: ResolvedLiminaConfig;
  failure: ProjectDependencyFailure;
}): string {
  return [
    'Checker semantic dependency collection failed:',
    `  config: ${toRelativePath(options.config.rootDir, options.failure.configPath)}`,
    `  framework: ${options.failure.framework}`,
    `  stage: ${options.failure.stage}`,
    ...(options.failure.importRecord === undefined
      ? []
      : [
          `  file: ${toRelativePath(options.config.rootDir, options.failure.importRecord.filePath)}:${options.failure.importRecord.line}`,
          `  imported specifier: ${options.failure.importRecord.specifier}`,
        ]),
    `  reason: ${options.failure.reason}`,
  ].join('\n');
}

function createLockedDependencyFact(
  project: AutoScopeProject,
  dependency: ProjectDependency,
): CheckerDependencyFact {
  if (dependency.targetKind === 'source') {
    return {
      consumerConfigPath: project.configPath,
      importRecord: dependency.importRecord,
      physicalTargetPath: dependency.resolvedFilePath,
      physicalTargetProvenance: 'checker-source',
      typeEvidenceKind: 'checker-source',
    };
  }
  return {
    consumerConfigPath: project.configPath,
    importRecord: dependency.importRecord,
    physicalTargetPath: null,
    physicalTargetProvenance: null,
    typeEvidenceKind: 'concrete-declaration',
  };
}

export function collectLockedProjectFacts(options: {
  caches: ReturnType<typeof createProjectDependencyCaches>;
  config: ResolvedLiminaConfig;
  importAnalysis: ImportAnalysisContext;
  project: AutoScopeProject;
  state: TypeConfigOwnershipState & {
    semanticAuthority: Extract<
      TypeConfigOwnershipState['semanticAuthority'],
      { kind: 'locked' }
    >;
  };
}): { facts: CheckerDependencyFact[]; problems: string[] } {
  const facts: CheckerDependencyFact[] = [];
  const collection = collectProjectDependencies({
    caches: options.caches,
    context: createAutoProjectSemanticContext({
      authority: options.state.semanticAuthority,
      project: options.project,
    }),
    importAnalysis: options.importAnalysis,
  });
  const problems = collection.failures.map((failure) =>
    formatProjectDependencyFailure({ config: options.config, failure }),
  );
  for (const dependency of collection.dependencies) {
    if (
      !shouldInferDeclarationReferenceFromImportRecord(dependency.importRecord)
    ) {
      continue;
    }
    facts.push(createLockedDependencyFact(options.project, dependency));
  }
  return { facts, problems };
}

function isLockedAstroProject(state: TypeConfigOwnershipState): boolean {
  return (
    state.semanticAuthority.kind === 'locked' &&
    state.semanticAuthority.family === 'astro'
  );
}

function getProjectPrewarmRequests(options: {
  discovery: CheckerOwnershipDiscovery;
  project: AutoScopeProject;
}): PrewarmRequest[] {
  const state = options.discovery.plan.typeConfigs.get(
    options.project.configPath,
  )!;
  if (!isLockedAstroProject(state)) return [];
  return options.project.filePartition.astroFiles.map((fileName) => ({
    fileName,
    packageRootDir: getAutoScopeFilePackageRoot(options.project, fileName),
  }));
}

function collectPrewarmRequests(
  discovery: CheckerOwnershipDiscovery,
): PrewarmRequest[] {
  return [...discovery.projectByConfigPath.values()].flatMap((project) =>
    getProjectPrewarmRequests({ discovery, project }),
  );
}

function getPrewarmFailureReason(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function getPrewarmFailureIdentity(
  request: PrewarmRequest,
  reason: unknown,
): string {
  return (
    getLiminaDependencyIssueIdentity(reason) ??
    `astro-prewarm:${request.fileName}`
  );
}

function addPrewarmResult(options: {
  problemsByIdentity: Map<string, string>;
  request: PrewarmRequest;
  result: PromiseSettledResult<void>;
}): void {
  if (options.result.status === 'fulfilled') return;
  options.problemsByIdentity.set(
    getPrewarmFailureIdentity(options.request, options.result.reason),
    getPrewarmFailureReason(options.result.reason),
  );
}

export async function prewarmLockedFrameworkSources(options: {
  discovery: CheckerOwnershipDiscovery;
  importAnalysis: ImportAnalysisContext;
}): Promise<string[]> {
  const prewarm = options.importAnalysis.prewarmImportsFromFile;
  if (prewarm === undefined) return [];
  const requests = collectPrewarmRequests(options.discovery);
  const results = await Promise.allSettled(
    requests.map(({ fileName, packageRootDir }) =>
      prewarm(fileName, packageRootDir),
    ),
  );
  const problemsByIdentity = new Map<string, string>();
  for (const [index, result] of results.entries()) {
    addPrewarmResult({
      problemsByIdentity,
      request: requests[index]!,
      result,
    });
  }
  return [...problemsByIdentity.values()];
}
