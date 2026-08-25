import { normalizeAbsolutePath } from '#utils/path';
import { TraceMap } from '@jridgewell/trace-mapping';
import path from 'node:path';
import ts from 'typescript';
import { findLiteralAtRecord } from '../framework-semantic/generated-dependencies';
import { buildLineStarts } from '../import-analysis/records';
import type { ImportRecord } from '../import-analysis/runner';
import { collectTypeScriptSourceTextImports } from '../import-analysis/typescript-imports';
import type {
  SvelteDependencyPreparation,
  SvelteSemanticCandidate,
  SvelteUnmappedGeneratedDependency,
} from './dependency';
import {
  getSvelteSourceMappingFailure,
  mapGeneratedRange,
  selectSvelteSourceMapping,
} from './source-mapping';
import {
  collectSvelteSemanticSourceRecords,
  getSvelteScriptKind,
} from './source-records';
import type { SvelteSemanticToolchain } from './toolchain';
import type { SvelteSemanticProject } from './types';

interface GeneratedSemanticScript {
  filePath: string;
  lineStarts: readonly number[];
  records: ImportRecord[];
  sourceFile: ts.SourceFile;
  trace: TraceMap;
}

interface SveltePreparationState {
  candidates: SvelteSemanticCandidate[];
  matchedSourceRecords: Set<ImportRecord>;
  unmapped: SvelteUnmappedGeneratedDependency[];
}

interface PreparationContext {
  generated: GeneratedSemanticScript;
  identity: string;
  sourceFilePath: string;
  sourceLineStarts: readonly number[];
  sourceRecords: ImportRecord[];
  state: SveltePreparationState;
}

function createGeneratedFilePath(filePath: string): string {
  return `${filePath}.tsx`;
}

function createGeneratedSemanticScript(options: {
  filePath: string;
  generated: ReturnType<SvelteSemanticToolchain['transform']>;
}): GeneratedSemanticScript {
  const filePath = createGeneratedFilePath(options.filePath);
  const sourceFile = ts.createSourceFile(
    filePath,
    options.generated.code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  return {
    filePath,
    lineStarts: buildLineStarts(options.generated.code),
    records: collectTypeScriptSourceTextImports({
      filePath,
      scriptKind: ts.ScriptKind.TSX,
      sourceText: options.generated.code,
    }),
    sourceFile,
    trace: new TraceMap(
      { ...options.generated.map, version: 3 as const },
      path.dirname(options.filePath),
    ),
  };
}

function createCandidate(options: {
  generatedRecord: ImportRecord;
  identity: string;
  literal: ts.StringLiteralLike;
  sourceRecord: ImportRecord;
}): SvelteSemanticCandidate {
  return {
    containingSourceFile: options.literal.getSourceFile(),
    framework: 'svelte',
    identityId: options.identity,
    literal: options.literal,
    provenance: 'strict-source-map',
    semanticSpecifier: options.generatedRecord.specifier,
    sourceRecord: options.sourceRecord,
    sourceSpecifier: options.sourceRecord.specifier,
  };
}

function createIdentity(options: {
  project: SvelteSemanticProject;
  toolchain: SvelteSemanticToolchain;
}): string {
  return JSON.stringify({
    adapterVersion: options.project.adapterVersion,
    compilerPath: options.toolchain.compilerPath,
    compilerVersion: options.toolchain.compilerVersion,
    configPath: options.project.configPath,
    generation: options.project.generation,
  });
}

function createPreparationContext(options: {
  filePath: string;
  generated: ReturnType<SvelteSemanticToolchain['transform']>;
  project: SvelteSemanticProject;
  sourceRecords: ImportRecord[];
  sourceText: string;
  toolchain: SvelteSemanticToolchain;
}): PreparationContext {
  return {
    generated: createGeneratedSemanticScript(options),
    identity: createIdentity(options),
    sourceFilePath: options.filePath,
    sourceLineStarts: buildLineStarts(options.sourceText),
    sourceRecords: options.sourceRecords,
    state: {
      candidates: [],
      matchedSourceRecords: new Set(),
      unmapped: [],
    },
  };
}

function addUnmappedDependency(
  context: PreparationContext,
  generatedRecord: ImportRecord,
): void {
  context.state.unmapped.push({
    generatedFilePath: context.generated.filePath,
    semanticSpecifier: generatedRecord.specifier,
  });
}

function addMappedCandidate(options: {
  context: PreparationContext;
  generatedRecord: ImportRecord;
  literal: ts.StringLiteralLike;
  sourceRecord: ImportRecord;
}): void {
  options.context.state.matchedSourceRecords.add(options.sourceRecord);
  options.context.state.candidates.push(
    createCandidate({
      generatedRecord: options.generatedRecord,
      identity: options.context.identity,
      literal: options.literal,
      sourceRecord: options.sourceRecord,
    }),
  );
}

function processGeneratedRecord(
  context: PreparationContext,
  generatedRecord: ImportRecord,
): Extract<SvelteDependencyPreparation, { kind: 'unsupported' }> | null {
  const range = mapGeneratedRange({
    generatedLineStarts: context.generated.lineStarts,
    generatedRecord,
    sourceFilePath: context.sourceFilePath,
    sourceLineStarts: context.sourceLineStarts,
    trace: context.generated.trace,
  });
  const mapping = selectSvelteSourceMapping({
    range,
    sourceRecords: context.sourceRecords,
  });
  const failure = getSvelteSourceMappingFailure(mapping);
  if (failure !== null) return failure;
  const literal = findLiteralAtRecord({
    record: generatedRecord,
    sourceFile: context.generated.sourceFile,
    tsModule: ts,
  });
  const mapped = getMappedSourceLiteral(mapping, literal);
  if (mapped === null) {
    addUnmappedDependency(context, generatedRecord);
    return null;
  }
  addMappedCandidate({
    context,
    generatedRecord,
    literal: mapped.literal,
    sourceRecord: mapped.sourceRecord,
  });
  return null;
}

function getMappedSourceLiteral(
  mapping: ReturnType<typeof selectSvelteSourceMapping>,
  literal: ts.StringLiteralLike | null,
): { literal: ts.StringLiteralLike; sourceRecord: ImportRecord } | null {
  if (mapping.kind !== 'selected') return null;
  if (literal === null) return null;
  return { literal, sourceRecord: mapping.sourceRecord };
}

function processGeneratedRecords(
  context: PreparationContext,
): Extract<SvelteDependencyPreparation, { kind: 'unsupported' }> | null {
  for (const generatedRecord of context.generated.records) {
    const failure = processGeneratedRecord(context, generatedRecord);
    if (failure !== null) return failure;
  }
  return null;
}

function finishPreparation(
  context: PreparationContext,
): SvelteDependencyPreparation {
  const missing = context.sourceRecords.find(
    (record) => !context.state.matchedSourceRecords.has(record),
  );
  if (missing !== undefined) {
    return {
      kind: 'unsupported',
      reason: `Svelte source dependency did not map to a generated TypeScript dependency: ${missing.specifier}`,
      stage: 'source-map-mismatch',
    };
  }
  return {
    candidates: context.state.candidates,
    kind: 'supported',
    sourceRecords: context.sourceRecords,
    unmapped: context.state.unmapped,
  };
}

function prepareUnchecked(options: {
  filePath: string;
  project: SvelteSemanticProject;
  sourceText: string;
  toolchain: SvelteSemanticToolchain;
}): SvelteDependencyPreparation {
  const filePath = normalizeAbsolutePath(options.filePath);
  const sourceRecords = collectSvelteSemanticSourceRecords({
    ...options,
    filePath,
  });
  const generated = options.toolchain.transform(options.sourceText, {
    filename: filePath,
    isTsFile: getSvelteScriptKind(options.sourceText) === ts.ScriptKind.TS,
    parse: options.toolchain.compiler.parse as never,
    version: options.toolchain.compilerVersion,
  });
  const context = createPreparationContext({
    ...options,
    filePath,
    generated,
    sourceRecords,
  });
  const failure = processGeneratedRecords(context);
  return failure ?? finishPreparation(context);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function prepareSvelteSemanticDependencies(options: {
  filePath: string;
  project: SvelteSemanticProject;
  sourceText: string;
  toolchain: SvelteSemanticToolchain;
}): SvelteDependencyPreparation {
  try {
    return prepareUnchecked(options);
  } catch (error) {
    return {
      kind: 'unsupported',
      reason: `Svelte semantic service-script materialization failed: ${formatError(error)}`,
      stage: 'service-script-materialization',
    };
  }
}
