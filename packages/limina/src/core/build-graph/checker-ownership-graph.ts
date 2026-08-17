import type { CheckerProjectConfigCache } from '#checkers';
import type { ResolvedLiminaConfig } from '#config/runner';
import { compareCodeUnits } from '#utils/collections';
import type { WorkspaceRegionPathIndex } from '../workspace/validated-context';
import { collectAutoScope } from './auto-checker-scope';
import type { AutoScopeProject } from './auto-checker-types';
import type {
  CheckerOwnershipPlan,
  SolutionOwnershipState,
  TypeConfigOwnershipState,
} from './checker-ownership-types';
import type { AutoScope } from './types';

export function collectOwnershipScopes(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  config: ResolvedLiminaConfig;
  entryConfigPaths: readonly string[];
  projectConfigCache?: CheckerProjectConfigCache;
}): AutoScope[] {
  return options.entryConfigPaths.flatMap((entryConfigPath) => {
    const scope = collectAutoScope({ ...options, entryConfigPath });
    return scope === null ? [] : [scope];
  });
}

function sameProjectShape(
  left: AutoScopeProject,
  right: AutoScopeProject,
): boolean {
  return (
    left.fileNames.length === right.fileNames.length &&
    left.fileNames.every(
      (fileName, index) => right.fileNames[index] === fileName,
    )
  );
}

export function createProjectByConfigPath(
  scopes: readonly AutoScope[],
): Map<string, AutoScopeProject> {
  const projects = new Map<string, AutoScopeProject>();
  for (const project of scopes.flatMap((scope) => scope.projects)) {
    assertConsistentProjectShape(projects.get(project.configPath), project);
    projects.set(project.configPath, project);
  }
  return projects;
}

function assertConsistentProjectShape(
  current: AutoScopeProject | undefined,
  incoming: AutoScopeProject,
): void {
  if (current === undefined || sameProjectShape(current, incoming)) return;
  throw new Error(
    `Checker ownership discovery observed inconsistent effective files for ${incoming.configPath}.`,
  );
}

function addSolutionReferences(
  references: Map<string, Set<string>>,
  solutionPath: string,
  targetPaths: readonly string[],
): void {
  const values = references.get(solutionPath);
  if (values === undefined) {
    references.set(solutionPath, new Set(targetPaths));
    return;
  }
  for (const targetPath of targetPaths) values.add(targetPath);
}

export function createDirectSolutionReferences(
  scopes: readonly AutoScope[],
): Map<string, string[]> {
  const references = new Map<string, Set<string>>();
  for (const scope of scopes) {
    for (const [solutionPath, targetPaths] of scope.collection
      .solutionReferencesBySourcePath) {
      addSolutionReferences(references, solutionPath, targetPaths);
    }
  }
  return new Map(
    [...references].map(([solutionPath, targetPaths]) => [
      solutionPath,
      [...targetPaths].sort(compareCodeUnits),
    ]),
  );
}

interface LeafTraversal {
  directReferences: ReadonlyMap<string, string[]>;
  leaves: Set<string>;
  projectByConfigPath: ReadonlyMap<string, AutoScopeProject>;
  visited: Set<string>;
  visiting: Set<string>;
}

function addProjectLeaf(traversal: LeafTraversal, configPath: string): boolean {
  if (!traversal.projectByConfigPath.has(configPath)) return false;
  traversal.leaves.add(configPath);
  return true;
}

function shouldSkipVisit(
  traversal: LeafTraversal,
  configPath: string,
): boolean {
  if (addProjectLeaf(traversal, configPath)) return true;
  return traversal.visited.has(configPath);
}

function assertNotVisiting(traversal: LeafTraversal, configPath: string): void {
  if (!traversal.visiting.has(configPath)) return;
  throw new Error(`Circular solution references reach ${configPath}.`);
}

function visitSolutionConfig(
  traversal: LeafTraversal,
  configPath: string,
): void {
  if (shouldSkipVisit(traversal, configPath)) return;
  assertNotVisiting(traversal, configPath);
  traversal.visiting.add(configPath);
  for (const targetPath of getDirectReferences(traversal, configPath)) {
    visitSolutionConfig(traversal, targetPath);
  }
  traversal.visiting.delete(configPath);
  traversal.visited.add(configPath);
}

function getDirectReferences(
  traversal: LeafTraversal,
  configPath: string,
): string[] {
  return traversal.directReferences.get(configPath) ?? [];
}

function collectSolutionLeaves(options: {
  directReferences: ReadonlyMap<string, string[]>;
  projectByConfigPath: ReadonlyMap<string, AutoScopeProject>;
  solutionPath: string;
}): string[] {
  const traversal: LeafTraversal = {
    ...options,
    leaves: new Set(),
    visited: new Set(),
    visiting: new Set(),
  };
  visitSolutionConfig(traversal, options.solutionPath);
  return [...traversal.leaves].sort(compareCodeUnits);
}

function createTypeState(configPath: string): TypeConfigOwnershipState {
  return {
    configPath,
    constraintCandidates: new Map(),
    evidence: [],
    kind: 'type',
    localOwner: { kind: 'pending' },
  };
}

export function createOwnershipPlan(options: {
  directReferences: ReadonlyMap<string, string[]>;
  projectByConfigPath: ReadonlyMap<string, AutoScopeProject>;
}): CheckerOwnershipPlan {
  const typeConfigs = new Map(
    [...options.projectByConfigPath.keys()].map((configPath) => [
      configPath,
      createTypeState(configPath),
    ]),
  );
  const solutions = new Map<string, SolutionOwnershipState>();
  for (const solutionPath of options.directReferences.keys()) {
    solutions.set(solutionPath, {
      configPath: solutionPath,
      constraintCandidates: new Map(),
      kind: 'solution',
      leafConfigPaths: collectSolutionLeaves({ ...options, solutionPath }),
    });
  }
  return {
    dependencyFacts: [],
    entryOwnerByConfigPath: new Map(),
    solutions,
    typeConfigs,
  };
}
