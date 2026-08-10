import type { VueSourceProfile } from '#checkers';
import ts from 'typescript';
import { collectSourceTextImports } from './oxc-imports';
import {
  buildLineStarts,
  getLine,
  type ImportRecord,
  setImportRecordDomain,
} from './records';
import { maskVitePressMarkdownCodeRanges } from './vue-markdown-source';

const scriptExtractorRE =
  /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script>/giu;
const htmlAttrRE =
  /(?:^|\s)(?<name>[:A-Z_a-z][\w.:-]*)(?:\s*=\s*(?:"(?<doubleQuoted>[^"]*)"|'(?<singleQuoted>[^']*)'|(?<unquoted>[^\s"'<=>`]+)))?/gu;
const genericImportRE =
  /\bimport\s*\(\s*(['"])(?<specifier>[^'"\r\n]+)\1\s*\)/gu;

function getVueCollectionSource(options: {
  sourceProfile: VueSourceProfile;
  sourceText: string;
}): string {
  return options.sourceProfile === 'vitepress-markdown'
    ? maskVitePressMarkdownCodeRanges(options.sourceText)
    : options.sourceText;
}

function getDefinedAttributeValue(
  groups: Record<string, string | undefined>,
): string | undefined {
  return [groups.doubleQuoted, groups.singleQuoted, groups.unquoted].find(
    (value) => value !== undefined,
  );
}

function getMatchedAttributeValue(match: RegExpMatchArray): string {
  if (match.groups === undefined) return '';
  return getDefinedAttributeValue(match.groups) ?? '';
}

function isNamedAttribute(match: RegExpMatchArray, name: string): boolean {
  if (match.groups === undefined) return false;
  return match.groups.name === name;
}

function getHtmlAttributeValue(attrs: string, name: string): string | null {
  for (const match of attrs.matchAll(htmlAttrRE)) {
    if (isNamedAttribute(match, name)) return getMatchedAttributeValue(match);
  }
  return null;
}

function getVueScriptKindFromLang(
  lang: string | null | undefined,
): ts.ScriptKind {
  if (lang === 'tsx') return ts.ScriptKind.TSX;
  if (lang === 'jsx') return ts.ScriptKind.TSX;
  return ts.ScriptKind.TS;
}

function getVueScriptKind(attrs: string): ts.ScriptKind {
  return getVueScriptKindFromLang(getHtmlAttributeValue(attrs, 'lang'));
}

function getMatchContent(match: RegExpMatchArray): string {
  return match[2] ?? '';
}

function getMatchAttributes(match: RegExpMatchArray): string {
  return match[1] ?? '';
}

function getAttributesStart(match: RegExpMatchArray, attrs: string): number {
  const matchStart = match.index ?? 0;
  const openTag = match[0].slice(0, match[0].indexOf('>'));
  return matchStart + Math.max(openTag.indexOf(attrs), 0);
}

interface PositionedAttribute {
  sourceStart: number;
  value: string;
}

function createPositionedAttribute(options: {
  attrsStart: number;
  match: RegExpMatchArray;
}): PositionedAttribute {
  const value = getMatchedAttributeValue(options.match);
  const valueStart = options.match[0].lastIndexOf(value);
  return {
    sourceStart:
      options.attrsStart + (options.match.index ?? 0) + Math.max(valueStart, 0),
    value,
  };
}

function findPositionedAttribute(options: {
  attrs: string;
  attrsStart: number;
  name: string;
}): PositionedAttribute | null {
  const match = [...options.attrs.matchAll(htmlAttrRE)].find((candidate) =>
    isNamedAttribute(candidate, options.name),
  );
  if (match === undefined) return null;
  return createPositionedAttribute({ attrsStart: options.attrsStart, match });
}

function createVueAttributeImportRecord(options: {
  domain: 'vue-generic-attribute' | 'vue-script-attribute';
  filePath: string;
  kind: 'vue-generic-type' | 'vue-script-src';
  lineStarts: readonly number[];
  sourceStart: number;
  specifier: string;
}): ImportRecord {
  return {
    domain: options.domain,
    filePath: options.filePath,
    kind: options.kind,
    line: getLine(options.lineStarts, options.sourceStart),
    locator: {
      occurrence: 0,
      sourceEnd: options.sourceStart + options.specifier.length,
      sourceStart: options.sourceStart,
    },
    specifier: options.specifier,
  };
}

function collectScriptSrcImport(options: {
  attrs: string;
  attrsStart: number;
  filePath: string;
  lineStarts: readonly number[];
}): ImportRecord[] {
  const attribute = findPositionedAttribute({ ...options, name: 'src' });
  if (attribute === null || attribute.value.length === 0) return [];
  return [
    createVueAttributeImportRecord({
      domain: 'vue-script-attribute',
      filePath: options.filePath,
      kind: 'vue-script-src',
      lineStarts: options.lineStarts,
      sourceStart: attribute.sourceStart,
      specifier: attribute.value,
    }),
  ];
}

function collectGenericImports(options: {
  attrs: string;
  attrsStart: number;
  filePath: string;
  lineStarts: readonly number[];
}): ImportRecord[] {
  const attribute = findPositionedAttribute({ ...options, name: 'generic' });
  if (attribute === null) return [];
  return [...attribute.value.matchAll(genericImportRE)].flatMap((match) =>
    createGenericImportRecord({ ...options, attribute, match }),
  );
}

function getGenericSpecifier(match: RegExpMatchArray): string | null {
  if (match.groups === undefined) return null;
  return match.groups.specifier ?? null;
}

function createGenericImportRecord(options: {
  attribute: PositionedAttribute;
  attrs: string;
  attrsStart: number;
  filePath: string;
  lineStarts: readonly number[];
  match: RegExpMatchArray;
}): ImportRecord[] {
  const specifier = getGenericSpecifier(options.match);
  if (specifier === null) return [];
  const specifierOffset = options.match[0].indexOf(specifier);
  return [
    createVueAttributeImportRecord({
      domain: 'vue-generic-attribute',
      filePath: options.filePath,
      kind: 'vue-generic-type',
      lineStarts: options.lineStarts,
      sourceStart:
        options.attribute.sourceStart +
        (options.match.index ?? 0) +
        Math.max(specifierOffset, 0),
      specifier,
    }),
  ];
}

function collectVueAttributeImports(options: {
  filePath: string;
  sourceText: string;
}): ImportRecord[] {
  const records: ImportRecord[] = [];
  const lineStarts = buildLineStarts(options.sourceText);
  for (const match of options.sourceText.matchAll(scriptExtractorRE)) {
    const attrs = getMatchAttributes(match);
    const attrsStart = getAttributesStart(match, attrs);
    records.push(
      ...collectScriptSrcImport({
        attrs,
        attrsStart,
        filePath: options.filePath,
        lineStarts,
      }),
      ...collectGenericImports({
        attrs,
        attrsStart,
        filePath: options.filePath,
        lineStarts,
      }),
    );
  }
  return records;
}

function normalizeVueImportRecords(
  records: readonly ImportRecord[],
): ImportRecord[] {
  const occurrenceByIdentity = new Map<string, number>();
  return [...records]
    .sort(
      (left, right) =>
        left.locator.sourceStart - right.locator.sourceStart ||
        left.locator.sourceEnd - right.locator.sourceEnd,
    )
    .map((record) => {
      const identity = JSON.stringify([record.kind, record.specifier]);
      const occurrence = occurrenceByIdentity.get(identity) ?? 0;
      occurrenceByIdentity.set(identity, occurrence + 1);
      return {
        ...record,
        locator: { ...record.locator, occurrence },
      };
    });
}

function getContentStart(match: RegExpMatchArray, content: string): number {
  return (match.index ?? 0) + match[0].indexOf(content);
}

function collectRegexScriptBlock(options: {
  filePath: string;
  lineStarts: number[];
  match: RegExpMatchArray;
}): ImportRecord[] {
  const attrs = getMatchAttributes(options.match);
  if (getHtmlAttributeValue(attrs, 'src') !== null) return [];
  const content = getMatchContent(options.match);
  const contentStart = getContentStart(options.match, content);
  return collectSourceTextImports({
    filePath: options.filePath,
    lineOffset: getLine(options.lineStarts, contentStart) - 1,
    scriptKind: getVueScriptKind(attrs),
    sourceOffset: contentStart,
    sourceText: content,
  });
}

function collectVueImportsWithRegex(options: {
  filePath: string;
  sourceText: string;
}): ImportRecord[] {
  const imports: ImportRecord[] = [];
  const lineStarts = buildLineStarts(options.sourceText);
  for (const match of options.sourceText.matchAll(scriptExtractorRE)) {
    imports.push(
      ...collectRegexScriptBlock({
        filePath: options.filePath,
        lineStarts,
        match,
      }),
    );
  }
  return imports;
}

export function collectVueImports(options: {
  filePath: string;
  sourceProfile: VueSourceProfile;
  sourceText: string;
}): ImportRecord[] {
  const collectionOptions = {
    filePath: options.filePath,
    sourceText: getVueCollectionSource(options),
  };
  const scriptImports = collectVueImportsWithRegex(collectionOptions);
  return normalizeVueImportRecords([
    ...setImportRecordDomain(scriptImports, 'vue-script'),
    ...collectVueAttributeImports(collectionOptions),
  ]);
}
