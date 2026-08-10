type SourceRange = readonly [start: number, end: number];

interface RangeSearchResult {
  nextCursor: number;
  range: SourceRange | null;
}

type RangeSearcher = (
  sourceText: string,
  cursor: number,
) => RangeSearchResult | null;

function getBacktickRunLength(sourceText: string, start: number): number {
  let end = start;
  while (sourceText[end] === '`') end += 1;
  return end - start;
}

function findFenceEnd(
  sourceText: string,
  start: number,
  maximumOpenerLength: number,
): number | null {
  for (
    let openerLength = maximumOpenerLength;
    openerLength >= 3;
    openerLength -= 1
  ) {
    const closingStart = sourceText.indexOf(
      '`'.repeat(openerLength),
      start + openerLength + 1,
    );
    if (closingStart !== -1) return closingStart + openerLength;
  }
  return null;
}

function findNextFenceRange(
  sourceText: string,
  cursor: number,
): RangeSearchResult | null {
  const start = sourceText.indexOf('```', cursor);
  if (start === -1) return null;
  const openerLength = getBacktickRunLength(sourceText, start);
  const end = findFenceEnd(sourceText, start, openerLength);
  if (end === null) return { nextCursor: start + 1, range: null };
  return { nextCursor: end, range: [start, end] };
}

function collectRanges(
  sourceText: string,
  search: RangeSearcher,
): SourceRange[] {
  const ranges: SourceRange[] = [];
  let cursor = 0;
  let result = search(sourceText, cursor);
  while (result !== null) {
    if (result.range !== null) ranges.push(result.range);
    cursor = result.nextCursor;
    result = search(sourceText, cursor);
  }
  return ranges;
}

function isInlineCodeContent(character: string | undefined): boolean {
  return character !== undefined && character !== '\n' && character !== '`';
}

function validateInlineCodeEnd(
  sourceText: string,
  start: number,
  end: number,
): number | null {
  if (end === start + 1) return null;
  if (sourceText[end] !== '`') return null;
  return end + 1;
}

function findInlineCodeEnd(sourceText: string, start: number): number | null {
  let end = start + 1;
  while (isInlineCodeContent(sourceText[end])) end += 1;
  return validateInlineCodeEnd(sourceText, start, end);
}

function findNextInlineCodeRange(
  sourceText: string,
  cursor: number,
): RangeSearchResult | null {
  const start = sourceText.indexOf('`', cursor);
  if (start === -1) return null;
  const end = findInlineCodeEnd(sourceText, start);
  if (end === null) return { nextCursor: start + 1, range: null };
  return { nextCursor: end, range: [start, end] };
}

function maskCodeUnit(codeUnits: string[], index: number): void {
  if (codeUnits[index] === '\r') return;
  if (codeUnits[index] === '\n') return;
  codeUnits[index] = ' ';
}

function maskSourceRange(codeUnits: string[], range: SourceRange): void {
  const [start, end] = range;
  for (let index = start; index < end; index += 1) {
    maskCodeUnit(codeUnits, index);
  }
}

function maskSourceRanges(
  sourceText: string,
  ranges: readonly SourceRange[],
): string {
  const codeUnits = sourceText.split('');
  for (const range of ranges) maskSourceRange(codeUnits, range);
  return codeUnits.join('');
}

export function maskVitePressMarkdownCodeRanges(sourceText: string): string {
  const withoutFences = maskSourceRanges(
    sourceText,
    collectRanges(sourceText, findNextFenceRange),
  );
  return maskSourceRanges(
    withoutFences,
    collectRanges(withoutFences, findNextInlineCodeRange),
  );
}
