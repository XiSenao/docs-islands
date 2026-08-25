import { normalizeAbsolutePath } from '#utils/path';
import {
  GREATEST_LOWER_BOUND,
  originalPositionFor,
  type TraceMap,
} from '@jridgewell/trace-mapping';
import type { ImportRecord } from '../import-analysis/runner';
import type { SvelteDependencyPreparation } from './dependency';

interface LineColumn {
  column: number;
  line: number;
}

interface SourceRange {
  end: number;
  start: number;
}

type SvelteSourceMapping =
  | { kind: 'ambiguous' }
  | { kind: 'missing' }
  | { kind: 'selected'; sourceRecord: ImportRecord };

function offsetToLineColumn(
  lineStarts: readonly number[],
  offset: number,
): LineColumn {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (lineStarts[middle]! <= offset) low = middle;
    else high = middle - 1;
  }
  return { column: offset - lineStarts[low]!, line: low + 1 };
}

function lineColumnToOffset(
  lineStarts: readonly number[],
  position: LineColumn,
): number | null {
  const lineStart = lineStarts[position.line - 1];
  if (lineStart === undefined) return null;
  return lineStart + position.column;
}

function hasOriginalPosition(position: {
  column: number | null;
  line: number | null;
  source: string | null;
}): position is { column: number; line: number; source: string } {
  return (
    position.source !== null &&
    position.line !== null &&
    position.column !== null
  );
}

function mapGeneratedOffset(options: {
  generatedLineStarts: readonly number[];
  offset: number;
  sourceFilePath: string;
  sourceLineStarts: readonly number[];
  trace: TraceMap;
}): number | null {
  const generated = offsetToLineColumn(
    options.generatedLineStarts,
    options.offset,
  );
  const original = originalPositionFor(options.trace, {
    bias: GREATEST_LOWER_BOUND,
    ...generated,
  });
  if (!hasOriginalPosition(original)) return null;
  if (normalizeAbsolutePath(original.source) !== options.sourceFilePath) {
    return null;
  }
  return lineColumnToOffset(options.sourceLineStarts, original);
}

function collectMappedOffsets(options: {
  generatedLineStarts: readonly number[];
  generatedRecord: ImportRecord;
  sourceFilePath: string;
  sourceLineStarts: readonly number[];
  trace: TraceMap;
}): number[] | null {
  const offsets: number[] = [];
  for (
    let offset = options.generatedRecord.locator.sourceStart;
    offset < options.generatedRecord.locator.sourceEnd;
    offset += 1
  ) {
    const sourceOffset = mapGeneratedOffset({ ...options, offset });
    if (sourceOffset === null) return null;
    offsets.push(sourceOffset);
  }
  return offsets;
}

function isContinuousMapping(offsets: readonly number[]): boolean {
  for (let index = 1; index < offsets.length; index += 1) {
    const delta = offsets[index]! - offsets[index - 1]!;
    if (!isValidMappingDelta(delta)) return false;
  }
  return true;
}

function isValidMappingDelta(delta: number): boolean {
  return delta >= 0 && delta <= 1;
}

export function mapGeneratedRange(options: {
  generatedLineStarts: readonly number[];
  generatedRecord: ImportRecord;
  sourceFilePath: string;
  sourceLineStarts: readonly number[];
  trace: TraceMap;
}): SourceRange | null {
  const offsets = collectMappedOffsets(options);
  if (!hasMappedOffsets(offsets)) return null;
  if (!isContinuousMapping(offsets)) return null;
  return { end: offsets.at(-1)! + 1, start: offsets[0]! };
}

function hasMappedOffsets(
  offsets: number[] | null,
): offsets is [number, ...number[]] {
  return offsets !== null && offsets.length > 0;
}

function sameRange(record: ImportRecord, range: SourceRange): boolean {
  return (
    record.locator.sourceStart === range.start &&
    record.locator.sourceEnd === range.end
  );
}

function selectMatchingRecord(matches: ImportRecord[]): SvelteSourceMapping {
  if (matches.length === 0) return { kind: 'missing' };
  if (matches.length > 1) return { kind: 'ambiguous' };
  return { kind: 'selected', sourceRecord: matches[0]! };
}

export function selectSvelteSourceMapping(options: {
  range: SourceRange | null;
  sourceRecords: readonly ImportRecord[];
}): SvelteSourceMapping {
  if (options.range === null) return { kind: 'missing' };
  return selectMatchingRecord(
    options.sourceRecords.filter((record) => sameRange(record, options.range!)),
  );
}

export function getSvelteSourceMappingFailure(
  mapping: SvelteSourceMapping,
): Extract<SvelteDependencyPreparation, { kind: 'unsupported' }> | null {
  return mapping.kind === 'ambiguous'
    ? {
        kind: 'unsupported',
        reason:
          'Svelte generated dependency reverse-mapped to multiple source dependencies.',
        stage: 'source-map-ambiguity',
      }
    : null;
}
