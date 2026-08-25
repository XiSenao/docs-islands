import { normalizeAbsolutePath } from '#utils/path';
import ts from 'typescript';
import {
  buildLineStarts,
  getLine,
  setImportRecordDomain,
} from '../import-analysis/records';
import type { ImportRecord } from '../import-analysis/runner';
import { collectTypeScriptSourceTextImports } from '../import-analysis/typescript-imports';
import type { SvelteSemanticToolchain } from './toolchain';

interface SvelteProgramRange {
  end: number;
  start: number;
}

interface SvelteScript {
  content: SvelteProgramRange;
}

interface SvelteAstRoot {
  instance?: SvelteScript | null;
  module?: SvelteScript | null;
}

const SCRIPT_OPENING_TAG = /<script[^>]*>/giu;
const TYPESCRIPT_LANG_ATTRIBUTE =
  /\blang\s*=\s*(?:"(?:ts|typescript)"|'(?:ts|typescript)'|(?:ts|typescript)\b)/iu;

export function getSvelteScriptKind(sourceText: string): ts.ScriptKind {
  const scriptTags = sourceText.match(SCRIPT_OPENING_TAG) ?? [];
  return scriptTags.some((tag) => TYPESCRIPT_LANG_ATTRIBUTE.test(tag))
    ? ts.ScriptKind.TS
    : ts.ScriptKind.JS;
}

function hasIntegerBounds(range: SvelteProgramRange): boolean {
  return Number.isInteger(range.start) && Number.isInteger(range.end);
}

function hasOrderedBounds(range: SvelteProgramRange): boolean {
  return range.start >= 0 && range.end >= range.start;
}

function isValidRange(range: SvelteProgramRange, sourceText: string): boolean {
  return (
    hasIntegerBounds(range) &&
    hasOrderedBounds(range) &&
    range.end <= sourceText.length
  );
}

function collectScriptRecords(options: {
  domain: 'svelte-instance-script' | 'svelte-module-script';
  filePath: string;
  lineStarts: readonly number[];
  script: SvelteScript | null | undefined;
  scriptKind: ts.ScriptKind;
  sourceText: string;
}): ImportRecord[] {
  if (options.script == null) return [];
  if (!isValidRange(options.script.content, options.sourceText)) {
    throw new Error('Svelte compiler returned an invalid script source range.');
  }
  const { end, start } = options.script.content;
  return setImportRecordDomain(
    collectTypeScriptSourceTextImports({
      filePath: options.filePath,
      lineOffset: getLine(options.lineStarts, start) - 1,
      scriptKind: options.scriptKind,
      sourceOffset: start,
      sourceText: options.sourceText.slice(start, end),
    }),
    options.domain,
  );
}

function collectSourceRecords(options: {
  filePath: string;
  root: SvelteAstRoot;
  sourceText: string;
}): ImportRecord[] {
  const lineStarts = buildLineStarts(options.sourceText);
  const scriptKind = getSvelteScriptKind(options.sourceText);
  return [
    ...collectScriptRecords({
      ...options,
      domain: 'svelte-module-script',
      lineStarts,
      script: options.root.module,
      scriptKind,
    }),
    ...collectScriptRecords({
      ...options,
      domain: 'svelte-instance-script',
      lineStarts,
      script: options.root.instance,
      scriptKind,
    }),
  ].sort(
    (left, right) =>
      left.locator.sourceStart - right.locator.sourceStart ||
      left.locator.sourceEnd - right.locator.sourceEnd,
  );
}

export function collectSvelteSemanticSourceRecords(options: {
  filePath: string;
  sourceText: string;
  toolchain: SvelteSemanticToolchain;
}): ImportRecord[] {
  const filePath = normalizeAbsolutePath(options.filePath);
  const root = options.toolchain.compiler.parse(options.sourceText, {
    filename: filePath,
    modern: true,
  }) as SvelteAstRoot;
  return collectSourceRecords({
    filePath,
    root,
    sourceText: options.sourceText,
  });
}
