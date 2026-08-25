import {
  type ResolvedCheckerModuleName,
  resolveTypeScriptModuleNameDetailed,
} from '#checkers';
import type { FrameworkSemanticFailureStage } from '../framework-semantic/contracts';
import type { ImportRecord } from '../import-analysis/runner';
import type { SvelteSemanticContextManager } from './context';
import type { SvelteSemanticCandidate } from './dependency';
import type { SvelteSemanticProject } from './types';

export type SvelteSemanticResolution =
  | {
      candidate: SvelteSemanticCandidate;
      kind: 'resolved';
      resolution: ResolvedCheckerModuleName | null;
      resolutionMode: string;
    }
  | {
      kind: 'unsupported';
      reason: string;
      stage: FrameworkSemanticFailureStage;
    };

function canonicalCandidate(options: {
  candidate: SvelteSemanticCandidate;
  resolution: ResolvedCheckerModuleName | null;
}): string {
  return JSON.stringify([
    options.candidate.semanticSpecifier,
    getResolvedFileName(options.resolution),
    getResolvedBy(options.resolution),
  ]);
}

function getResolvedFileName(
  resolution: ResolvedCheckerModuleName | null,
): string | null {
  return resolution === null ? null : resolution.resolvedFileName;
}

function getResolvedBy(
  resolution: ResolvedCheckerModuleName | null,
): string | null {
  return resolution === null ? null : resolution.resolvedBy;
}

function selectCandidate(options: {
  candidates: readonly SvelteSemanticCandidate[];
  project: SvelteSemanticProject;
}): SvelteSemanticResolution {
  const resolved = options.candidates.map((candidate) => ({
    candidate,
    resolution: resolveTypeScriptModuleNameDetailed({
      compilerOptions: options.project.options,
      containingFile: candidate.containingSourceFile.fileName,
      extensions: [...options.project.extensions],
      specifier: candidate.semanticSpecifier,
    }),
  }));
  const first = resolved[0];
  if (first === undefined) {
    return {
      kind: 'unsupported',
      reason:
        'Svelte source dependency did not map to a generated TypeScript dependency.',
      stage: 'source-map-mismatch',
    };
  }
  const identity = canonicalCandidate(first);
  if (
    resolved.some((candidate) => canonicalCandidate(candidate) !== identity)
  ) {
    return {
      kind: 'unsupported',
      reason:
        'Svelte generated dependency candidates did not agree on semantic specifier and target.',
      stage: 'source-map-mismatch',
    };
  }
  return {
    candidate: first.candidate,
    kind: 'resolved',
    resolution: first.resolution,
    resolutionMode: 'default',
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function resolveSvelteSemanticImport(options: {
  importRecord: ImportRecord;
  manager: SvelteSemanticContextManager;
  project: SvelteSemanticProject;
}): SvelteSemanticResolution {
  try {
    const preparation = options.manager
      .acquire(options.project)
      .prepare(options.importRecord.filePath);
    if (preparation.kind === 'unsupported') return preparation;
    return selectCandidate({
      candidates: preparation.candidates.filter(
        (candidate) =>
          candidate.sourceRecord.locator.sourceStart ===
            options.importRecord.locator.sourceStart &&
          candidate.sourceRecord.locator.sourceEnd ===
            options.importRecord.locator.sourceEnd &&
          candidate.sourceRecord.kind === options.importRecord.kind,
      ),
      project: options.project,
    });
  } catch (error) {
    return {
      kind: 'unsupported',
      reason: formatError(error),
      stage: 'context-creation',
    };
  }
}
