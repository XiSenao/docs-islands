import {
  createWindowedCodePreviewRangeRenderer,
  isWindowedCodePreviewSupersededError,
  type WindowedCodePreviewRangeInput,
  type WindowedCodePreviewRangeResult,
} from './site-devtools-source-highlight';

interface BackgroundWindowedCodePreviewWorkerRequest
  extends WindowedCodePreviewRangeInput {
  requestId: number;
}

interface BackgroundWindowedCodePreviewWorkerSuccessResponse
  extends WindowedCodePreviewRangeResult {
  requestId: number;
  success: true;
}

interface BackgroundWindowedCodePreviewWorkerErrorResponse {
  error: string;
  requestId: number;
  success: false;
}

type BackgroundWindowedCodePreviewWorkerResponse =
  | BackgroundWindowedCodePreviewWorkerErrorResponse
  | BackgroundWindowedCodePreviewWorkerSuccessResponse;

const rangeRenderer = createWindowedCodePreviewRangeRenderer();
let latestRequestId = 0;
let pendingRequest: BackgroundWindowedCodePreviewWorkerRequest | null = null;
let processing = false;

const shouldContinueRequest = (requestId: number) =>
  latestRequestId === requestId;

const processPendingRequests = async () => {
  if (processing) {
    return;
  }

  processing = true;

  while (pendingRequest) {
    const currentRequest = pendingRequest;
    const currentRequestId = currentRequest.requestId;

    pendingRequest = null;

    try {
      const result = await rangeRenderer.render(
        currentRequest,
        shouldContinueRequest.bind(null, currentRequestId),
      );

      if (latestRequestId !== currentRequestId) {
        continue;
      }

      (
        globalThis as typeof globalThis & {
          postMessage: (
            message: BackgroundWindowedCodePreviewWorkerResponse,
          ) => void;
        }
      ).postMessage({
        ...result,
        requestId: currentRequestId,
        success: true,
      });
    } catch (error) {
      if (isWindowedCodePreviewSupersededError(error)) {
        continue;
      }

      if (latestRequestId !== currentRequestId) {
        continue;
      }

      (
        globalThis as typeof globalThis & {
          postMessage: (
            message: BackgroundWindowedCodePreviewWorkerResponse,
          ) => void;
        }
      ).postMessage({
        error: error instanceof Error ? error.message : String(error),
        requestId: currentRequestId,
        success: false,
      });
    }
  }

  processing = false;
};

globalThis.addEventListener(
  'message',
  (event: MessageEvent<BackgroundWindowedCodePreviewWorkerRequest>) => {
    pendingRequest = event.data;
    latestRequestId = Math.max(latestRequestId, event.data.requestId);
    processPendingRequests().catch(() => {
      processing = false;
    });
  },
);
