import type { ImportRecord } from '#core/import-analysis/runner';
import type ts from 'typescript';
import type {
  FrameworkSemanticDependencyPreparation,
  FrameworkSemanticUnmappedGeneratedDependency,
} from '../framework-semantic/contracts';
import {
  enumerateGeneratedSemanticDependencies,
  recordMatchesMappedRanges,
} from '../framework-semantic/generated-dependencies';
import type {
  AstroMaterializedServiceScript,
  AstroSemanticContext,
} from './context';
import type { AstroSemanticCandidate } from './dependency';
import { getAstroMappedRangeIdentities } from './dependency';

export type AstroDependencyPreparation =
  | (Extract<FrameworkSemanticDependencyPreparation, { kind: 'supported' }> & {
      candidates: AstroSemanticCandidate[];
    })
  | Extract<FrameworkSemanticDependencyPreparation, { kind: 'unsupported' }>;

interface AstroPreparationState {
  candidates: AstroSemanticCandidate[];
  matchedSourceRecords: Set<ImportRecord>;
  unmapped: FrameworkSemanticUnmappedGeneratedDependency[];
}

type GeneratedDependency = ReturnType<
  typeof enumerateGeneratedSemanticDependencies
>[number];

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createPreparationFailure(options: {
  reason: string;
  stage:
    | 'service-script-materialization'
    | 'source-map-ambiguity'
    | 'source-map-mismatch';
}): Extract<AstroDependencyPreparation, { kind: 'unsupported' }> {
  return { kind: 'unsupported', ...options };
}

function createAstroPreparationState(): AstroPreparationState {
  return {
    candidates: [],
    matchedSourceRecords: new Set(),
    unmapped: [],
  };
}

function getPreparationServices(options: {
  context: AstroSemanticContext;
  filePath: string;
}):
  | { kind: 'supported'; services: AstroMaterializedServiceScript[] }
  | Extract<AstroDependencyPreparation, { kind: 'unsupported' }> {
  try {
    const services = options.context.getServiceScripts(options.filePath);
    if (services.length > 0) return { kind: 'supported', services };
    return createPreparationFailure({
      reason:
        'Astro semantic context did not materialize a primary or extra TypeScript service script.',
      stage: 'service-script-materialization',
    });
  } catch (error) {
    return createPreparationFailure({
      reason: `Astro semantic service-script materialization failed: ${formatError(error)}`,
      stage: 'service-script-materialization',
    });
  }
}

function createServiceMappedRanges(options: {
  context: AstroSemanticContext;
  service: AstroMaterializedServiceScript;
  sourceRecords: readonly ImportRecord[];
}): ReadonlyMap<ImportRecord, ReadonlySet<string>> {
  return new Map(
    options.sourceRecords.map(
      (sourceRecord) =>
        [
          sourceRecord,
          getAstroMappedRangeIdentities({
            context: options.context,
            importRecord: sourceRecord,
            service: options.service,
          }),
        ] as const,
    ),
  );
}

function getMatchingSourceRecords(options: {
  dependency: GeneratedDependency;
  mappedRanges: ReadonlyMap<ImportRecord, ReadonlySet<string>>;
  sourceRecords: readonly ImportRecord[];
}): ImportRecord[] {
  return options.sourceRecords.filter((sourceRecord) =>
    recordMatchesMappedRanges({
      mappedRanges: options.mappedRanges.get(sourceRecord)!,
      record: options.dependency.record,
    }),
  );
}

function addUnmappedGeneratedDependency(options: {
  dependency: GeneratedDependency;
  state: AstroPreparationState;
}): void {
  options.state.unmapped.push({
    generatedFilePath: options.dependency.generatedFilePath,
    semanticSpecifier: options.dependency.record.specifier,
  });
}

function addMappedAstroCandidate(options: {
  context: AstroSemanticContext;
  dependency: GeneratedDependency & { literal: ts.StringLiteralLike };
  sourceRecord: ImportRecord;
  state: AstroPreparationState;
}): void {
  options.state.matchedSourceRecords.add(options.sourceRecord);
  options.state.candidates.push({
    containingSourceFile: options.dependency.sourceFile,
    framework: 'astro',
    identityId: options.context.identity,
    literal: options.dependency.literal,
    provenance: 'strict-source-map',
    semanticSpecifier: options.dependency.record.specifier,
    sourceRecord: options.sourceRecord,
    sourceSpecifier: options.sourceRecord.specifier,
  });
}

function isMappedDependency(options: {
  dependency: GeneratedDependency;
  sourceRecord: ImportRecord | undefined;
}): options is typeof options & {
  dependency: GeneratedDependency & { literal: ts.StringLiteralLike };
  sourceRecord: ImportRecord;
} {
  return (
    options.sourceRecord !== undefined && options.dependency.literal !== null
  );
}

function processAstroGeneratedDependency(options: {
  context: AstroSemanticContext;
  dependency: GeneratedDependency;
  mappedRanges: ReadonlyMap<ImportRecord, ReadonlySet<string>>;
  sourceRecords: readonly ImportRecord[];
  state: AstroPreparationState;
}): Extract<AstroDependencyPreparation, { kind: 'unsupported' }> | null {
  const matches = getMatchingSourceRecords(options);
  if (matches.length > 1) {
    return createPreparationFailure({
      reason:
        'Astro generated dependency reverse-mapped to multiple source dependencies.',
      stage: 'source-map-ambiguity',
    });
  }
  const mapped = { dependency: options.dependency, sourceRecord: matches[0] };
  if (!isMappedDependency(mapped)) {
    addUnmappedGeneratedDependency(options);
    return null;
  }
  addMappedAstroCandidate({
    context: options.context,
    dependency: mapped.dependency,
    sourceRecord: mapped.sourceRecord,
    state: options.state,
  });
  return null;
}

function processAstroService(options: {
  context: AstroSemanticContext;
  service: AstroMaterializedServiceScript;
  sourceRecords: readonly ImportRecord[];
  state: AstroPreparationState;
}): Extract<AstroDependencyPreparation, { kind: 'unsupported' }> | null {
  const generated = enumerateGeneratedSemanticDependencies({
    generatedFilePath: options.service.sourceFile.fileName,
    sourceFile: options.service.sourceFile,
    tsModule: options.context.toolchain.tsModule,
  });
  const mappedRanges = createServiceMappedRanges(options);
  for (const dependency of generated) {
    const failure = processAstroGeneratedDependency({
      ...options,
      dependency,
      mappedRanges,
    });
    if (failure !== null) return failure;
  }
  return null;
}

function processAstroServices(options: {
  context: AstroSemanticContext;
  services: readonly AstroMaterializedServiceScript[];
  sourceRecords: readonly ImportRecord[];
  state: AstroPreparationState;
}): Extract<AstroDependencyPreparation, { kind: 'unsupported' }> | null {
  for (const service of options.services) {
    const failure = processAstroService({ ...options, service });
    if (failure !== null) return failure;
  }
  return null;
}

function finishAstroPreparation(options: {
  sourceRecords: readonly ImportRecord[];
  state: AstroPreparationState;
}): AstroDependencyPreparation {
  const missing = options.sourceRecords.find(
    (sourceRecord) => !options.state.matchedSourceRecords.has(sourceRecord),
  );
  if (missing !== undefined) {
    return createPreparationFailure({
      reason: `Astro source dependency did not map to a generated TypeScript dependency: ${missing.specifier}`,
      stage: 'source-map-mismatch',
    });
  }
  return {
    candidates: options.state.candidates,
    kind: 'supported',
    sourceRecords: [...options.sourceRecords],
    unmapped: options.state.unmapped,
  };
}

export function prepareAstroSemanticDependencies(options: {
  context: AstroSemanticContext;
  filePath: string;
  sourceRecords: readonly ImportRecord[];
}): AstroDependencyPreparation {
  options.context.assertActive();
  const services = getPreparationServices(options);
  if (services.kind === 'unsupported') return services;
  const state = createAstroPreparationState();
  const failure = processAstroServices({
    ...options,
    services: services.services,
    state,
  });
  if (failure !== null) return failure;
  return finishAstroPreparation({
    sourceRecords: options.sourceRecords,
    state,
  });
}
