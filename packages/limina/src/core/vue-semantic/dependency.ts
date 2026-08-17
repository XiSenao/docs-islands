import type { VolarSourceScript, VueSourceProfile } from '#checkers';
import type { ImportRecord } from '#core/import-analysis/runner';
import { normalizeAbsolutePath } from '#utils/path';
import type ts from 'typescript';
import type { FrameworkSemanticCandidate } from '../framework-semantic/contracts';
import type { VueSemanticContext } from './context';

export type SemanticDependencyEvidence = FrameworkSemanticCandidate<
  ts.SourceFile,
  ts.StringLiteralLike,
  VueSourceProfile
>;

export type SemanticDependencyResult =
  | {
      candidates: readonly SemanticDependencyEvidence[];
      kind: 'supported';
    }
  | {
      kind: 'unsupported';
      reason: string;
    };

function rangeIdentity(start: number, end: number): string {
  return JSON.stringify([start, end]);
}

function getLiteralRangeIdentities(
  literal: ts.StringLiteralLike,
  sourceFile: ts.SourceFile,
): readonly string[] {
  const start = literal.getStart(sourceFile);
  const end = literal.getEnd();
  return [rangeIdentity(start, end), rangeIdentity(start + 1, end - 1)];
}

function findLiteralsAtRanges(options: {
  rangeIdentities: ReadonlySet<string>;
  sourceFile: ts.SourceFile;
  tsModule: typeof ts;
}): ts.StringLiteralLike[] {
  const literals: ts.StringLiteralLike[] = [];
  const visit = (node: ts.Node): void => {
    if (
      options.tsModule.isStringLiteralLike(node) &&
      getLiteralRangeIdentities(node, options.sourceFile).some((identity) =>
        options.rangeIdentities.has(identity),
      )
    ) {
      literals.push(node);
    }
    options.tsModule.forEachChild(node, visit);
  };
  visit(options.sourceFile);
  return literals;
}

function getServiceScript(options: {
  context: VueSemanticContext;
  fileName: string;
}) {
  const sourceScript = options.context.language.scripts.get(
    normalizeAbsolutePath(options.fileName),
  );
  if (sourceScript === undefined) return null;
  return createServiceScriptPair(sourceScript);
}

function getGeneratedScript(sourceScript: VolarSourceScript) {
  const generated = sourceScript.generated;
  if (generated === undefined) return null;
  return generated;
}

function getGeneratedServiceScript(
  generated: NonNullable<VolarSourceScript['generated']>,
) {
  const provider = generated.languagePlugin.typescript;
  if (provider === undefined) return null;
  const serviceScript = provider.getServiceScript(generated.root);
  if (serviceScript === undefined) return null;
  return serviceScript;
}

function createServiceScriptPair(sourceScript: VolarSourceScript) {
  const generated = getGeneratedScript(sourceScript);
  if (generated === null) return null;
  const serviceScript = getGeneratedServiceScript(generated);
  if (serviceScript === null) return null;
  return { serviceScript, sourceScript };
}

function getMappedRangeIdentities(options: {
  context: VueSemanticContext;
  importRecord: ImportRecord;
}): ReadonlySet<string> | null {
  const service = getServiceScript({
    context: options.context,
    fileName: options.importRecord.filePath,
  });
  if (service === null) return null;
  const mapper = options.context.language.maps.get(
    service.serviceScript.code,
    service.sourceScript,
  );
  const ranges = [
    ...mapper.toGeneratedRange(
      options.importRecord.locator.sourceStart,
      options.importRecord.locator.sourceEnd,
      false,
    ),
  ];
  if (ranges.length === 0) return null;
  return new Set(ranges.map(([start, end]) => rangeIdentity(start, end)));
}

function createEvidence(options: {
  context: VueSemanticContext;
  importRecord: ImportRecord;
  literals: readonly ts.StringLiteralLike[];
  profile?: VueSourceProfile;
  provenance: SemanticDependencyEvidence['provenance'];
}): SemanticDependencyEvidence[] {
  return options.literals.map((literal) => ({
    containingSourceFile: literal.getSourceFile(),
    framework: 'vue',
    identityId: options.context.identity.id,
    literal,
    profile: options.profile,
    provenance: options.provenance,
    semanticSpecifier: literal.text,
    sourceRecord: options.importRecord,
    sourceSpecifier: options.importRecord.specifier,
  }));
}

function collectMappedDependency(options: {
  context: VueSemanticContext;
  importRecord: ImportRecord;
  profile: VueSourceProfile;
}): SemanticDependencyResult {
  const ranges = getMappedRangeIdentities(options);
  if (ranges === null) {
    return {
      kind: 'unsupported',
      reason:
        'Vue source dependency did not map to a strict semantic service-script range.',
    };
  }
  return collectMappedLiterals(options, ranges);
}

function collectMappedLiterals(
  options: {
    context: VueSemanticContext;
    importRecord: ImportRecord;
    profile: VueSourceProfile;
  },
  ranges: ReadonlySet<string>,
): SemanticDependencyResult {
  const sourceFile = options.context.getSemanticSourceFile(
    normalizeAbsolutePath(options.importRecord.filePath),
  );
  if (sourceFile === undefined) {
    return {
      kind: 'unsupported',
      reason: 'Vue semantic Program does not contain the mapped source file.',
    };
  }
  const literals = findLiteralsAtRanges({
    rangeIdentities: ranges,
    sourceFile,
    tsModule: options.context.tsModule,
  });
  if (literals.length === 0) {
    return {
      kind: 'unsupported',
      reason:
        'Vue strict source-map ranges did not identify a semantic module literal.',
    };
  }
  return {
    candidates: createEvidence({
      ...options,
      literals,
      provenance: 'strict-source-map',
    }),
    kind: 'supported',
  };
}

function collectDirectDependency(options: {
  context: VueSemanticContext;
  importRecord: ImportRecord;
}): SemanticDependencyResult {
  const sourceFile = options.context.getSemanticSourceFile(
    normalizeAbsolutePath(options.importRecord.filePath),
  );
  if (sourceFile === undefined) {
    return {
      kind: 'unsupported',
      reason: 'Vue semantic Program does not contain the source file.',
    };
  }
  const targetRange = rangeIdentity(
    options.importRecord.locator.sourceStart,
    options.importRecord.locator.sourceEnd,
  );
  const literals = findLiteralsAtRanges({
    rangeIdentities: new Set([targetRange]),
    sourceFile,
    tsModule: options.context.tsModule,
  }).filter((literal) => literal.text === options.importRecord.specifier);
  if (literals.length !== 1) {
    return {
      kind: 'unsupported',
      reason:
        'Native source dependency did not identify one direct semantic module literal.',
    };
  }
  return {
    candidates: createEvidence({
      ...options,
      literals,
      provenance: 'direct-source',
    }),
    kind: 'supported',
  };
}

export function collectSemanticDependencyEvidence(options: {
  context: VueSemanticContext;
  importRecord: ImportRecord;
}): SemanticDependencyResult {
  options.context.assertActive();
  const profile = options.context.identity.profilesByFileName.get(
    normalizeAbsolutePath(options.importRecord.filePath),
  );
  return profile === undefined
    ? collectDirectDependency(options)
    : collectMappedDependency({ ...options, profile });
}
