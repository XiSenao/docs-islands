import { LightGeneralLogger } from '#shared/logger';

type Environment = 'development' | 'production' | 'debug';
type FailureStrategy = 'partial' | 'strict';

interface CSSLoadingConfig {
  timeout: number;
  retryCount: number;
  retryDelay: number;
  enablePerformanceMonitoring: boolean;
  enableDuplicateDetection: boolean;
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
  enablePerformanceMonitoring?: boolean;
  enableDuplicateDetection?: boolean;
  failureStrategy?: FailureStrategy;
}

function createCSSLoadingConfig(
  environment: Environment = 'production',
): CSSLoadingConfig {
  const baseConfig: Record<Environment, CSSLoadingConfig> = {
    development: {
      timeout: 10_000,
      retryCount: 3,
      retryDelay: 1000,
      enablePerformanceMonitoring: true,
      enableDuplicateDetection: true,
      failureStrategy: 'partial' as const,
    },
    production: {
      timeout: 6000,
      retryCount: 1,
      retryDelay: 300,
      enablePerformanceMonitoring: false,
      enableDuplicateDetection: true,
      failureStrategy: 'partial' as const,
    },
    debug: {
      timeout: 15_000,
      retryCount: 3,
      retryDelay: 500,
      enablePerformanceMonitoring: true,
      enableDuplicateDetection: true,
      failureStrategy: 'strict' as const,
    },
  };

  return baseConfig[environment] ?? baseConfig.production;
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
    enablePerformanceMonitoring = true,
    enableDuplicateDetection = true,
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

        if (enablePerformanceMonitoring) {
          LightGeneralLogger(
            'warn',
            `CSS loading timeout after ${timeout}ms. Loaded: ${loadedCount}/${totalStyles}, Failed: ${failedCount}`,
            'css-loading-runtime',
          ).log();
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

        if (enablePerformanceMonitoring) {
          LightGeneralLogger(
            'success',
            `Success rate: ${loadedCount}/${totalStyles} (${((loadedCount / totalStyles) * 100).toFixed(1)}%)`,
            'css-loading-runtime',
          ).log();

          if (performanceMetrics.duplicatesDetected > 0) {
            LightGeneralLogger(
              'info',
              `Detected and skipped ${performanceMetrics.duplicatesDetected} duplicate CSS files`,
              'css-loading-runtime',
            ).log();
          }

          if (performanceMetrics.retriesPerformed > 0) {
            LightGeneralLogger(
              'info',
              `Performed ${performanceMetrics.retriesPerformed} retries`,
              'css-loading-runtime',
            ).log();
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

      // Duplicate loading detection.
      if (enableDuplicateDetection) {
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

        if (enablePerformanceMonitoring && loadTime > 1000) {
          LightGeneralLogger(
            'warn',
            `Slow CSS loading detected: ${styleUrl} took ${loadTime.toFixed(2)}ms`,
            'css-loading-runtime',
          ).log();
        }

        checkCompletion();
      };

      const onError = (): void => {
        if (retries < retryCount) {
          performanceMetrics.retriesPerformed++;
          LightGeneralLogger(
            'error',
            `CSS loading failed for ${styleUrl}, retrying (${retries + 1}/${retryCount})`,
            'css-loading-runtime',
          ).log();

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

          if (enablePerformanceMonitoring) {
            LightGeneralLogger(
              'error',
              `CSS loading failed permanently: ${styleUrl} after ${retries} retries`,
              'css-loading-runtime',
            ).log();
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

const environment: Environment = (() => {
  if (globalThis.window !== undefined) {
    if (
      globalThis.location.hostname === 'localhost' ||
      globalThis.location.hostname === '127.0.0.1'
    ) {
      return 'development';
    }
    if (
      globalThis.location.search.includes('debug=true') ||
      globalThis.location.search.includes('css-debug')
    ) {
      return 'debug';
    }
  }
  return 'production';
})() as Environment;

const cssLoadingConfig: CSSLoadingConfig = createCSSLoadingConfig(environment);

// TODO: Export CSS loading config to users.
export default async function cssLoadingRuntime(
  highPriorityRenderStyles: string[],
): Promise<StyleLoadResult> {
  const loadResult = await loadHighPriorityStyles(
    highPriorityRenderStyles,
    cssLoadingConfig,
  );

  if (
    globalThis.window !== undefined &&
    (globalThis.location.hostname === 'localhost' ||
      globalThis.location.search.includes('debug'))
  ) {
    if (loadResult.timedOut) {
      LightGeneralLogger(
        'error',
        `CSS loading timed out. Loaded: ${loadResult.loadedCount}/${loadResult.totalCount}`,
        'css-loading-runtime',
      ).log();
    } else if (loadResult.failedCount > 0) {
      LightGeneralLogger(
        'error',
        `Some CSS files failed to load: ${loadResult.failedCount}/${loadResult.totalCount} failed`,
        'css-loading-runtime',
      ).log();
    }

    if (loadResult.metrics?.totalLoadTime) {
      LightGeneralLogger(
        'success',
        `Total CSS loading time: ${loadResult.metrics.totalLoadTime.toFixed(2)}ms`,
        'css-loading-runtime',
      ).log();
    }
  }
  return loadResult;
}
