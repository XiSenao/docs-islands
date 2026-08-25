import type { VueSourceProfile } from '#checkers';
import type { ImportRecord } from '#core/import-analysis/runner';
import { normalizeAbsolutePath } from '#utils/path';
import type {
  FrameworkSemanticDependencyPreparation,
  FrameworkSemanticUnmappedGeneratedDependency,
} from '../framework-semantic/contracts';
import {
  enumerateGeneratedSemanticDependencies,
  recordMatchesMappedRanges,
} from '../framework-semantic/generated-dependencies';
import type { VueSemanticContext } from './context';
import type { SemanticDependencyEvidence } from './dependency';
import {
  createVueEvidence,
  getVueMappedRangeIdentities,
  getVueServiceScript,
} from './dependency';

export type VueDependencyPreparation =
  | (Extract<FrameworkSemanticDependencyPreparation, { kind: 'supported' }> & {
      candidates: SemanticDependencyEvidence[];
    })
  | Extract<FrameworkSemanticDependencyPreparation, { kind: 'unsupported' }>;

interface VuePreparationState {
  candidates: SemanticDependencyEvidence[];
  matchedSourceRecords: Set<ImportRecord>;
  unmapped: FrameworkSemanticUnmappedGeneratedDependency[];
}

const TYPESCRIPT_SUB_SEMANTIC_KINDS = new Set<ImportRecord['kind']>([
  'environment-pragma',
  'jsx-import-source',
  'triple-slash-path',
  'triple-slash-types',
]);

function createPreparationFailure(options: {
  reason: string;
  stage:
    | 'service-script-materialization'
    | 'source-map-ambiguity'
    | 'source-map-mismatch';
}): Extract<VueDependencyPreparation, { kind: 'unsupported' }> {
  return { kind: 'unsupported', ...options };
}

function getVuePreparationContext(options: {
  context: VueSemanticContext;
  filePath: string;
}):
  | {
      kind: 'supported';
      profile: VueSourceProfile;
      sourceFile: NonNullable<
        ReturnType<VueSemanticContext['getSemanticSourceFile']>
      >;
    }
  | Extract<VueDependencyPreparation, { kind: 'unsupported' }> {
  const normalized = normalizeAbsolutePath(options.filePath);
  const profile = options.context.identity.profilesByFileName.get(normalized);
  if (profile === undefined) {
    return createPreparationFailure({
      reason:
        'Vue semantic project does not classify the framework source with a Vue source profile.',
      stage: 'service-script-materialization',
    });
  }
  const materialized = getMaterializedVueSource(options);
  if (materialized === null) {
    return createPreparationFailure({
      reason:
        'Vue semantic context did not materialize a TypeScript service script for the framework source.',
      stage: 'service-script-materialization',
    });
  }
  return {
    kind: 'supported',
    profile,
    sourceFile: materialized.sourceFile,
  };
}

function getMaterializedVueSource(options: {
  context: VueSemanticContext;
  filePath: string;
}): {
  sourceFile: NonNullable<
    ReturnType<VueSemanticContext['getSemanticSourceFile']>
  >;
} | null {
  const normalized = normalizeAbsolutePath(options.filePath);
  const service = getVueServiceScript({
    context: options.context,
    fileName: normalized,
  });
  const sourceFile = options.context.getSemanticSourceFile(normalized);
  if (service === null || sourceFile === undefined) return null;
  return { sourceFile };
}

function createMappedRanges(options: {
  context: VueSemanticContext;
  sourceRecords: readonly ImportRecord[];
}): ReadonlyMap<ImportRecord, ReadonlySet<string> | null> {
  return new Map(
    options.sourceRecords.map(
      (sourceRecord) =>
        [
          sourceRecord,
          TYPESCRIPT_SUB_SEMANTIC_KINDS.has(sourceRecord.kind)
            ? null
            : getVueMappedRangeIdentities({
                context: options.context,
                importRecord: sourceRecord,
              }),
        ] as const,
    ),
  );
}

function getMatchingSourceRecords(options: {
  dependency: ReturnType<typeof enumerateGeneratedSemanticDependencies>[number];
  mappedRanges: ReadonlyMap<ImportRecord, ReadonlySet<string> | null>;
  sourceRecords: readonly ImportRecord[];
}): ImportRecord[] {
  return options.sourceRecords.filter((sourceRecord) => {
    const ranges = options.mappedRanges.get(sourceRecord);
    if (ranges === null || ranges === undefined) return false;
    return recordMatchesMappedRanges({
      mappedRanges: ranges,
      record: options.dependency.record,
    });
  });
}

function processGeneratedDependency(options: {
  context: VueSemanticContext;
  dependency: ReturnType<typeof enumerateGeneratedSemanticDependencies>[number];
  mappedRanges: ReadonlyMap<ImportRecord, ReadonlySet<string> | null>;
  profile: VueSourceProfile;
  sourceRecords: readonly ImportRecord[];
  state: VuePreparationState;
}): Extract<VueDependencyPreparation, { kind: 'unsupported' }> | null {
  const matches = getMatchingSourceRecords(options);
  if (matches.length > 1) {
    return createPreparationFailure({
      reason:
        'Vue generated dependency reverse-mapped to multiple source dependencies.',
      stage: 'source-map-ambiguity',
    });
  }
  const mapped = getMappedVueDependency(options.dependency, matches[0]);
  if (mapped === null) {
    options.state.unmapped.push({
      generatedFilePath: options.dependency.generatedFilePath,
      semanticSpecifier: options.dependency.record.specifier,
    });
    return null;
  }
  options.state.matchedSourceRecords.add(mapped.sourceRecord);
  options.state.candidates.push(
    ...createVueEvidence({
      context: options.context,
      importRecord: mapped.sourceRecord,
      literals: [mapped.literal],
      profile: options.profile,
      provenance: 'strict-source-map',
    }),
  );
  return null;
}

function getMappedVueDependency(
  dependency: ReturnType<typeof enumerateGeneratedSemanticDependencies>[number],
  sourceRecord: ImportRecord | undefined,
): {
  literal: NonNullable<typeof dependency.literal>;
  sourceRecord: ImportRecord;
} | null {
  if (sourceRecord === undefined) return null;
  if (dependency.literal === null) return null;
  return { literal: dependency.literal, sourceRecord };
}

function processGeneratedDependencies(options: {
  context: VueSemanticContext;
  generated: ReturnType<typeof enumerateGeneratedSemanticDependencies>;
  mappedRanges: ReadonlyMap<ImportRecord, ReadonlySet<string> | null>;
  profile: VueSourceProfile;
  sourceRecords: readonly ImportRecord[];
  state: VuePreparationState;
}): Extract<VueDependencyPreparation, { kind: 'unsupported' }> | null {
  for (const dependency of options.generated) {
    const failure = processGeneratedDependency({ ...options, dependency });
    if (failure !== null) return failure;
  }
  return null;
}

function finishVuePreparation(options: {
  sourceRecords: readonly ImportRecord[];
  state: VuePreparationState;
}): VueDependencyPreparation {
  const missing = options.sourceRecords.find(
    (sourceRecord) =>
      !TYPESCRIPT_SUB_SEMANTIC_KINDS.has(sourceRecord.kind) &&
      !options.state.matchedSourceRecords.has(sourceRecord),
  );
  if (missing !== undefined) {
    return createPreparationFailure({
      reason: `Vue source dependency did not map to a generated TypeScript dependency: ${missing.specifier}`,
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

export function prepareVueSemanticDependencies(options: {
  context: VueSemanticContext;
  filePath: string;
  sourceRecords: readonly ImportRecord[];
}): VueDependencyPreparation {
  options.context.assertActive();
  const prepared = getVuePreparationContext(options);
  if (prepared.kind === 'unsupported') return prepared;
  const generated = enumerateGeneratedSemanticDependencies({
    generatedFilePath: prepared.sourceFile.fileName,
    sourceFile: prepared.sourceFile,
    tsModule: options.context.tsModule,
  });
  const state: VuePreparationState = {
    candidates: [],
    matchedSourceRecords: new Set(),
    unmapped: [],
  };
  const failure = processGeneratedDependencies({
    ...options,
    generated,
    mappedRanges: createMappedRanges(options),
    profile: prepared.profile,
    state,
  });
  if (failure !== null) return failure;
  return finishVuePreparation({ sourceRecords: options.sourceRecords, state });
}
