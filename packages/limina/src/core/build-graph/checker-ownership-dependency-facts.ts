import {
  type CheckerProjectConfigCache,
  type CheckerProjectParseContext,
  getBuildCheckerSupportedExtensions,
  parseCheckerProjectConfigForContext,
  resolveVueSourceProfile,
} from '#checkers';
import type { CheckerName, ResolvedLiminaConfig } from '#config/runner';
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
import type {
  CheckerDependencyFact,
  TypeConfigOwnershipState,
} from './checker-ownership-types';
import { capabilityDiscoveryExtensions } from './generated/file-extensions';

interface EvidenceProject {
  checkerName: CheckerName;
  project: {
    checkerPresets: CheckerProjectParseContext['checkerPresets'];
    configPath: string;
    extensions: string[];
    fileNames: string[];
    options: AutoScopeProject['options'];
    resolverConfigPath: string;
    vueSemanticIdentity?: CheckerProjectParseContext['vueSemanticIdentity'];
  };
}

interface FactCollectionContext {
  config: ResolvedLiminaConfig;
  core: TypeEvidenceCore;
  importAnalysis: ImportAnalysisContext;
  project: AutoScopeProject;
  semantic: EvidenceProject;
}

function getEvidenceChecker(state: TypeConfigOwnershipState): CheckerName {
  if (state.localOwner.kind === 'pending') return 'tsc';
  return {
    astro: 'tsc',
    'svelte-check': 'tsc',
    tsc: 'tsc',
    tsgo: 'tsgo',
    'vue-tsc': 'vue-tsc',
  }[state.localOwner.checker] as CheckerName;
}

function createParseContext(
  checkerName: CheckerName,
): CheckerProjectParseContext {
  if (checkerName === 'tsc' || checkerName === 'tsgo') {
    return {
      checkerPresets: [checkerName],
      extensions: capabilityDiscoveryExtensions,
    };
  }
  return { checkerPresets: [checkerName], extensions: [] };
}

function getSemanticExtensions(
  checkerName: CheckerName,
  parsed: ReturnType<typeof parseCheckerProjectConfigForContext>,
): string[] {
  if (checkerName === 'vue-tsc') return parsed.extensions;
  return getBuildCheckerSupportedExtensions(checkerName);
}

function createEvidenceProject(options: {
  project: AutoScopeProject;
  projectConfigCache?: CheckerProjectConfigCache;
  rootDir: string;
  state: TypeConfigOwnershipState;
}): EvidenceProject {
  const checkerName = getEvidenceChecker(options.state);
  const context = createParseContext(checkerName);
  const parsed = parseCheckerProjectConfigForContext({
    allowNoInputDiagnostics: true,
    cache: options.projectConfigCache,
    configPath: options.project.configPath,
    context,
    projectRootDir: options.rootDir,
  });
  return {
    checkerName,
    project: {
      checkerPresets: [checkerName],
      configPath: options.project.configPath,
      extensions: [...getSemanticExtensions(checkerName, parsed)],
      fileNames: [...parsed.fileNames],
      options: parsed.options,
      resolverConfigPath: options.project.configPath,
      vueSemanticIdentity: parsed.vueSemanticIdentity,
    },
  };
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
  const typeEvidence = options.context.core.resolveImportEvidence({
    checkerName: options.context.semantic.checkerName,
    importRecord: options.importRecord,
    project: options.context.semantic.project,
  });
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
  if (typeEvidence.type.kind === 'unsupported-checker') {
    options.problems.push(
      createUnsupportedProblem({
        config: options.context.config,
        evidence: typeEvidence.type,
        fact: base,
      }),
    );
    return;
  }
  options.facts.push({ ...base, typeEvidenceKind: typeEvidence.type.kind });
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
  for (const fileName of options.project.filePartition.typescriptFiles) {
    collectFileFacts({ context, facts, fileName, problems });
  }
  options.core.completeProject(options.project.configPath);
  return { facts, problems };
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
    const collected = collectProjectFacts({
      ...options,
      project,
      state: options.discovery.plan.typeConfigs.get(project.configPath)!,
    });
    facts.push(...collected.facts);
    problems.push(...collected.problems);
  }
  return { facts, problems };
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
