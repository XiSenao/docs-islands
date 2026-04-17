export interface PlainTextPreviewLineIndex {
  lineCount: number;
  lineStartOffsets: Uint32Array;
}

export const createPlainTextPreviewLineIndex = (
  sourceContent: string,
): PlainTextPreviewLineIndex => {
  if (sourceContent.length === 0) {
    return {
      lineCount: 0,
      lineStartOffsets: new Uint32Array(),
    };
  }

  const offsets = [0];

  for (let index = 0; index < sourceContent.length; index += 1) {
    const characterCode = sourceContent.codePointAt(index);

    if (characterCode === 13) {
      const nextIndex = index + 1;

      if (
        nextIndex < sourceContent.length &&
        sourceContent.codePointAt(nextIndex) === 10
      ) {
        offsets.push(nextIndex + 1);
        index = nextIndex;
        continue;
      }

      offsets.push(nextIndex);
      continue;
    }

    if (characterCode === 10) {
      offsets.push(index + 1);
    }
  }

  return {
    lineCount: offsets.length,
    lineStartOffsets: Uint32Array.from(offsets),
  };
};
