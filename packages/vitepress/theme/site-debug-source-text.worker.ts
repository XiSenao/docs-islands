import type { PlainTextPreviewLineIndex } from './site-debug-source-preview';

interface BackgroundPlainTextLineIndexRequest {
  requestId: number;
  sourceContent: string;
}

interface BackgroundPlainTextLineIndexSuccessResponse {
  lineCount: number;
  lineStartOffsetsBuffer: ArrayBufferLike;
  requestId: number;
  success: true;
}

interface BackgroundPlainTextLineIndexErrorResponse {
  error: string;
  requestId: number;
  success: false;
}

type BackgroundPlainTextLineIndexResponse =
  | BackgroundPlainTextLineIndexErrorResponse
  | BackgroundPlainTextLineIndexSuccessResponse;

const createLineIndex = (sourceContent: string): PlainTextPreviewLineIndex => {
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

globalThis.addEventListener(
  'message',
  (event: MessageEvent<BackgroundPlainTextLineIndexRequest>) => {
    const { requestId, sourceContent } = event.data;

    try {
      const lineIndex = createLineIndex(sourceContent);
      const { buffer: lineStartOffsetsBuffer } = lineIndex.lineStartOffsets;
      const response: BackgroundPlainTextLineIndexSuccessResponse = {
        lineCount: lineIndex.lineCount,
        lineStartOffsetsBuffer,
        requestId,
        success: true,
      };

      (
        globalThis as typeof globalThis & {
          postMessage: (
            message: BackgroundPlainTextLineIndexResponse,
            transfer: Transferable[],
          ) => void;
        }
      ).postMessage(response, [response.lineStartOffsetsBuffer as ArrayBuffer]);
    } catch (error) {
      (
        globalThis as typeof globalThis & {
          postMessage: (message: BackgroundPlainTextLineIndexResponse) => void;
        }
      ).postMessage({
        error: error instanceof Error ? error.message : String(error),
        requestId,
        success: false,
      });
    }
  },
);
