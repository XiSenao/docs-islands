import { createPlainTextPreviewLineIndex } from './site-devtools-source-text-index';

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

globalThis.addEventListener(
  'message',
  (event: MessageEvent<BackgroundPlainTextLineIndexRequest>) => {
    const { requestId, sourceContent } = event.data;

    try {
      const lineIndex = createPlainTextPreviewLineIndex(sourceContent);
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
