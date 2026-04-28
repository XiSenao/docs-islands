import { VITEPRESS_RUNTIME_LOG_GROUPS } from '#shared/constants/log-groups/runtime';

/**
 * Internal client runtime source that is compiled into a build artifact and
 * injected into the host document.
 *
 * The build pipeline passes this runtime the page's high-priority CSS bundle
 * URLs. At runtime it appends stylesheet links to the host document and protects
 * dependency loading with timeout, retry, duplicate detection, and partial/strict
 * failure handling.
 *
 * This module is not a public extension point. Keep the behavior stable unless
 * changing the injected runtime contract. Its `cssLoading` logs are emitted only
 * under `__DEBUG__` for docs-islands development diagnostics and are not governed
 * by upstream site logger configuration.
 */
import { createLogger } from './light-logger';

type FailureStrategy = 'partial' | 'strict';

interface CSSLoadingConfig {
  timeout: number;
  retryCount: number;
  retryDelay: number;
  failureStrategy: FailureStrategy;
}

interface LoadResult {
  success: boolean;
  cached?: boolean;
  loadTime?: number;
  retries?: number;
  error?: string;
}

interface PerformanceMetrics {
  totalStartTime: number;
  individualLoadTimes: Map<string, number>;
  duplicatesDetected: number;
  retriesPerformed: number;
  totalLoadTime?: number;
}

interface StyleLoadResult {
  success: boolean;
  loadedCount: number;
  failedCount: number;
  totalCount: number;
  timedOut: boolean;
  metrics: PerformanceMetrics;
}

interface LoadStyleOptions {
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  failureStrategy?: FailureStrategy;
}

const MAIN_NAME = '@docs-islands/vitepress';

const getCssLoadingLogger = () =>
  createLogger({
    main: MAIN_NAME,
  }).getLoggerByGroup(VITEPRESS_RUNTIME_LOG_GROUPS.cssLoading);

const logCssLoading = (
  type: 'error' | 'info' | 'success' | 'warn',
  message: string,
): void => getCssLoadingLogger()[type](message, { elapsedTimeMs: 0 });

function createCSSLoadingConfig(): CSSLoadingConfig {
  const productionConfig = {
    timeout: 6000,
    retryCount: 1,
    retryDelay: 300,
    failureStrategy: 'partial' as const,
  };
  const debugConfig = {
    timeout: 15_000,
    retryCount: 3,
    retryDelay: 500,
    failureStrategy: 'strict' as const,
  };
  if (__DEBUG__) {
    return debugConfig;
  }
  return productionConfig;
}

/**
 * CSS loading runtime.
 *
 * Features:
 * 1) Timeout protection — prevent infinite waiting.
 * 2) Enhanced fault tolerance — support partial loading success strategy.
 * 3) Performance monitoring — detailed loading time and status tracking.
 * 4) Duplicate loading detection — avoid loading duplicate CSS.
 * 5) Retry mechanism — automatically retry when the network is unstable.
 * 6) Progressive failure strategy — balance completeness and performance.
 *
 * @param highPriorityRenderStyles - Array of CSS file URLs.
 * @param options - Configuration options.
 * @returns Loading result details.
 */
async function loadHighPriorityStyles(
  highPriorityRenderStyles: string[],
  options: LoadStyleOptions = {},
): Promise<StyleLoadResult> {
  const {
    timeout = 8000, // 8 seconds timeout.
    retryCount = 2, // Retry count.
    retryDelay = 500, // Retry delay.
    failureStrategy = 'partial', // 'partial' | 'strict'.
  } = options;

  return new Promise<StyleLoadResult>((resolve) => {
    const startTime = performance.now();
    let loadedCount = 0;
    let failedCount = 0;
    const totalStyles = highPriorityRenderStyles.length;
    let isResolved = false;
    const loadResults = new Map<string, LoadResult>(); // Track the loading result of each CSS.
    const performanceMetrics: PerformanceMetrics = {
      totalStartTime: startTime,
      individualLoadTimes: new Map<string, number>(),
      duplicatesDetected: 0,
      retriesPerformed: 0,
    };

    if (totalStyles === 0) {
      resolve({
        success: true,
        loadedCount: 0,
        failedCount: 0,
        totalCount: 0,
        timedOut: false,
        metrics: performanceMetrics,
      });
      return;
    }

    // Timeout protection.
    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        const endTime = performance.now();
        performanceMetrics.totalLoadTime = endTime - startTime;

        if (__DEBUG__) {
          logCssLoading(
            'warn',
            `CSS loading timeout after ${timeout}ms. Loaded: ${loadedCount}/${totalStyles}, Failed: ${failedCount}`,
          );
        }

        resolve({
          success: failureStrategy === 'partial' ? loadedCount > 0 : false,
          loadedCount,
          failedCount,
          totalCount: totalStyles,
          timedOut: true,
          metrics: performanceMetrics,
        });
      }
    }, timeout);

    const checkCompletion = () => {
      if (isResolved) return;

      const completedCount = loadedCount + failedCount;
      if (completedCount === totalStyles) {
        isResolved = true;
        clearTimeout(timeoutId);

        const endTime = performance.now();
        performanceMetrics.totalLoadTime = endTime - startTime;

        if (__DEBUG__) {
          logCssLoading(
            'success',
            `Success rate: ${loadedCount}/${totalStyles} (${((loadedCount / totalStyles) * 100).toFixed(1)}%)`,
          );

          if (performanceMetrics.duplicatesDetected > 0) {
            logCssLoading(
              'info',
              `Detected and skipped ${performanceMetrics.duplicatesDetected} duplicate CSS files`,
            );
          }

          if (performanceMetrics.retriesPerformed > 0) {
            logCssLoading(
              'info',
              `Performed ${performanceMetrics.retriesPerformed} retries`,
            );
          }
        }

        const success =
          failureStrategy === 'strict' ? failedCount === 0 : loadedCount > 0;
        resolve({
          success,
          loadedCount,
          failedCount,
          totalCount: totalStyles,
          timedOut: false,
          metrics: performanceMetrics,
        });
      }
    };

    const loadStyleWithRetry = (styleUrl: string, retries = 0): void => {
      const loadStartTime = performance.now();

      const existingLink = document.querySelector<HTMLLinkElement>(
        `link[href="${styleUrl}"]`,
      );
      if (existingLink) {
        performanceMetrics.duplicatesDetected++;
        loadedCount++;
        loadResults.set(styleUrl, { success: true, cached: true });
        checkCompletion();
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = styleUrl;
      link.dataset.vriteCssBundle = styleUrl;
      link.crossOrigin = 'anonymous';

      const onLoad = (): void => {
        const loadTime = performance.now() - loadStartTime;
        performanceMetrics.individualLoadTimes.set(styleUrl, loadTime);
        loadedCount++;
        loadResults.set(styleUrl, { success: true, loadTime, retries });

        if (__DEBUG__ && loadTime > 1000) {
          logCssLoading(
            'warn',
            `Slow CSS loading detected: ${styleUrl} took ${loadTime.toFixed(2)}ms`,
          );
        }

        checkCompletion();
      };

      const onError = (): void => {
        if (retries < retryCount) {
          performanceMetrics.retriesPerformed++;

          if (__DEBUG__) {
            logCssLoading(
              'error',
              `CSS loading failed for ${styleUrl}, retrying (${retries + 1}/${retryCount})`,
            );
          }

          // Remove the failed link element.
          if (link.parentNode) {
            link.remove();
          }

          // Delay retry.
          setTimeout(
            (): void => {
              loadStyleWithRetry(styleUrl, retries + 1);
            },
            retryDelay * (retries + 1),
          );
        } else {
          const loadTime = performance.now() - loadStartTime;
          failedCount++;
          loadResults.set(styleUrl, {
            success: false,
            loadTime,
            retries,
            error: 'Load failed',
          });

          if (__DEBUG__) {
            logCssLoading(
              'error',
              `CSS loading failed permanently: ${styleUrl} after ${retries} retries`,
            );
          }

          checkCompletion();
        }
      };

      link.addEventListener('load', onLoad);
      link.addEventListener('error', onError);

      document.head.append(link);
    };

    // Start loading all CSS files.
    for (const styleUrl of highPriorityRenderStyles) {
      loadStyleWithRetry(styleUrl);
    }
  });
}

declare const __DEBUG__: boolean;

// TODO: Export CSS loading config to users.
export default async function cssLoadingRuntime(
  highPriorityRenderStyles: string[],
): Promise<StyleLoadResult> {
  const cssLoadingConfig = createCSSLoadingConfig();
  const loadResult = await loadHighPriorityStyles(
    highPriorityRenderStyles,
    cssLoadingConfig,
  );

  if (__DEBUG__) {
    if (loadResult.timedOut) {
      logCssLoading(
        'error',
        `CSS loading timed out. Loaded: ${loadResult.loadedCount}/${loadResult.totalCount}`,
      );
    } else if (loadResult.failedCount > 0) {
      logCssLoading(
        'error',
        `Some CSS files failed to load: ${loadResult.failedCount}/${loadResult.totalCount} failed`,
      );
    }

    if (loadResult.metrics?.totalLoadTime) {
      logCssLoading(
        'success',
        `Total CSS loading time: ${loadResult.metrics.totalLoadTime.toFixed(2)}ms`,
      );
    }
  }
  return loadResult;
}
