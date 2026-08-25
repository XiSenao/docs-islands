import {
  type CheckerProjectConfigCache,
  resolveVueSourceProfile,
} from '#checkers';
import type { ResolvedLiminaConfig } from '#config/runner';
import { collectImportsFromFile } from '#core/import-graph/context';
import { compareCodeUnits } from '#utils/collections';
import { normalizeAbsolutePath, toRelativePath } from '#utils/path';
import { selectCanonicalImportFilePath } from '../import-analysis/canonical-resolution';
import type { ImportAnalysisContext } from '../import-analysis/runner';
import { shouldInferDeclarationReferenceFromImportRecord } from '../import-graph/declaration-reference-evidence';
import { TypeEvidenceCore } from '../type-evidence';
import { getAutoScopeFilePackageRoot } from './auto-checker-file-roots';
import type { AutoScopeProject } from './auto-checker-types';
import type { CheckerOwnershipDiscovery } from './checker-ownership-discovery';
import {
  createEvidenceProject,
  type EvidenceProject,
} from './checker-ownership-evidence-project';
import type {
  CheckerDependencyFact,
  TypeConfigOwnershipState,
} from './checker-ownership-types';

interface FactCollectionContext {
  config: ResolvedLiminaConfig;
  core: TypeEvidenceCore;
  importAnalysis: ImportAnalysisContext;
  project: AutoScopeProject;
  semantic: EvidenceProject;
}

function physicalTargetFromEvidence(
  evidence: ReturnType<ImportAnalysisContext['resolveImportEvidence']>,
): string | null {
  const filePath = selectCanonicalImportFilePath({
    evidence,
    includeResource: false,
  });
  return filePath === null ? null : normalizeAbsolutePath(filePath);
}

function createUnsupportedProblem(options: {
  config: ResolvedLiminaConfig;
  evidence: Extract<
    ReturnType<TypeEvidenceCore['resolveImportEvidence']>['type'],
    { kind: 'unsupported-checker' }
  >;
  fact: Omit<CheckerDependencyFact, 'typeEvidenceKind'>;
}): string {
  return [
    'Unsupported checker type evidence:',
    `  config: ${toRelativePath(options.config.rootDir, options.fact.consumerConfigPath)}`,
    `  file: ${toRelativePath(options.config.rootDir, options.fact.importRecord.filePath)}:${options.fact.importRecord.line}`,
    `  imported specifier: ${options.fact.importRecord.specifier}`,
    `  checker: ${options.evidence.checker}`,
    `  reason: ${options.evidence.reason}`,
  ].join('\n');
}

function collectImportFact(options: {
  context: FactCollectionContext;
  facts: CheckerDependencyFact[];
  fileName: string;
  importRecord: CheckerDependencyFact['importRecord'];
  problems: string[];
}): void {
  if (!shouldInferDeclarationReferenceFromImportRecord(options.importRecord)) {
    return;
  }
  const physicalEvidence = options.context.importAnalysis.resolveImportEvidence(
    options.importRecord,
    options.fileName,
    options.context.semantic.project.options,
    options.context.semantic.project,
  );
  const base = {
    consumerConfigPath: options.context.project.configPath,
    importRecord: options.importRecord,
    physicalTargetPath: physicalTargetFromEvidence(physicalEvidence),
  };
  collectTypeEvidenceFact({ ...options, base });
}

function collectTypeEvidenceFact(options: {
  base: Omit<CheckerDependencyFact, 'typeEvidenceKind'>;
  context: FactCollectionContext;
  facts: CheckerDependencyFact[];
  importRecord: CheckerDependencyFact['importRecord'];
  problems: string[];
}): void {
  const typeEvidence = options.context.core.resolveImportEvidence({
    checkerName: options.context.semantic.checkerName,
    importRecord: options.importRecord,
    project: options.context.semantic.project,
  });
  if (typeEvidence.type.kind === 'unsupported-checker') {
    options.problems.push(
      createUnsupportedProblem({
        config: options.context.config,
        evidence: typeEvidence.type,
        fact: options.base,
      }),
    );
    return;
  }
  options.facts.push({
    ...options.base,
    typeEvidenceKind: typeEvidence.type.kind,
  });
}

function collectFileFacts(options: {
  context: FactCollectionContext;
  facts: CheckerDependencyFact[];
  fileName: string;
  problems: string[];
}): void {
  const imports = collectImportsFromFile(
    options.fileName,
    getAutoScopeFilePackageRoot(options.context.project, options.fileName),
    options.context.importAnalysis,
    resolveVueSourceProfile({
      fileName: options.fileName,
      identity: options.context.semantic.project.vueSemanticIdentity,
    }),
  );
  for (const importRecord of imports) {
    collectImportFact({ ...options, importRecord });
  }
}

function collectProjectFacts(options: {
  config: ResolvedLiminaConfig;
  core: TypeEvidenceCore;
  importAnalysis: ImportAnalysisContext;
  project: AutoScopeProject;
  projectConfigCache?: CheckerProjectConfigCache;
  state: TypeConfigOwnershipState;
}): { facts: CheckerDependencyFact[]; problems: string[] } {
  const facts: CheckerDependencyFact[] = [];
  const problems: string[] = [];
  const context: FactCollectionContext = {
    config: options.config,
    core: options.core,
    importAnalysis: options.importAnalysis,
    project: options.project,
    semantic: createEvidenceProject({
      project: options.project,
      projectConfigCache: options.projectConfigCache,
      rootDir: options.config.rootDir,
      state: options.state,
    }),
  };
  const factFileNames = getFactFileNames(options.project, options.state);
  for (const fileName of factFileNames) {
    collectFileFacts({ context, facts, fileName, problems });
  }
  options.core.completeProject(options.project.configPath);
  return { facts, problems };
}

function isVueFactOwner(state: TypeConfigOwnershipState): boolean {
  return (
    state.authoritativeOwner === 'vue-tsc' ||
    (state.localOwner.kind === 'resolved' &&
      state.localOwner.checker === 'vue-tsc')
  );
}

function getFactFileNames(
  project: AutoScopeProject,
  state: TypeConfigOwnershipState,
): string[] {
  if (!isVueFactOwner(state)) return project.filePartition.typescriptFiles;
  return [
    ...project.filePartition.typescriptFiles,
    ...project.filePartition.vueFiles,
  ];
}

function getGeneration(cache?: CheckerProjectConfigCache): number {
  return cache?.generation ?? 0;
}

function collectAllProjectFacts(options: {
  config: ResolvedLiminaConfig;
  core: TypeEvidenceCore;
  discovery: CheckerOwnershipDiscovery;
  importAnalysis: ImportAnalysisContext;
  projectConfigCache?: CheckerProjectConfigCache;
}): { facts: CheckerDependencyFact[]; problems: string[] } {
  const facts: CheckerDependencyFact[] = [];
  const problems: string[] = [];
  const projects = [...options.discovery.projectByConfigPath.values()].sort(
    (left, right) => compareCodeUnits(left.configPath, right.configPath),
  );
  for (const project of projects) {
    const state = options.discovery.plan.typeConfigs.get(project.configPath)!;
    if (isFrameworkAuthoritative(state)) continue;
    const collected = collectProjectFacts({
      ...options,
      project,
      state,
    });
    facts.push(...collected.facts);
    problems.push(...collected.problems);
  }
  return { facts, problems };
}

function isFrameworkAuthoritative(state: TypeConfigOwnershipState): boolean {
  return ['astro', 'svelte-check'].includes(state.authoritativeOwner ?? '');
}

export function collectCheckerDependencyFacts(options: {
  config: ResolvedLiminaConfig;
  discovery: CheckerOwnershipDiscovery;
  importAnalysis: ImportAnalysisContext;
  projectConfigCache?: CheckerProjectConfigCache;
}): string[] {
  const core = new TypeEvidenceCore({
    generation: getGeneration(options.projectConfigCache),
    importAnalysis: options.importAnalysis,
  });
  try {
    const collected = collectAllProjectFacts({ ...options, core });
    options.discovery.plan.dependencyFacts = collected.facts;
    return collected.problems;
  } finally {
    core.dispose();
  }
}
