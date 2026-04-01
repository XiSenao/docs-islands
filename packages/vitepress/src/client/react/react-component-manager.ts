import type {
  ComponentInfo,
  PageMetafile,
  PageMetafileManifest,
} from '#dep-types/page';
import {
  PAGE_METAFILE_META_NAMES,
  RENDER_STRATEGY_CONSTANTS,
} from '#shared/constants';
import {
  createSiteDebugLogger,
  dispatchSiteDebugPageMetafileEvent,
  getSiteDebugNow,
} from '#shared/debug';
import getLoggerInstance from '#shared/logger';
import { formatErrorMessage } from '@docs-islands/utils/logger';
import { getCleanPathname } from '../../shared/runtime';

const loggerInstance = getLoggerInstance();
const Logger = loggerInstance.getLoggerByGroup('react-component-manager');
const DebugLogger = createSiteDebugLogger('react-component-manager');
const LEGACY_PAGE_METAFILE_URL = 'assets/vrite-page-metafile.json';

interface ComponentSubscription {
  resolve: (value: boolean) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

interface RuntimeSubscription {
  resolve: (value: boolean) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

const baseUrl = typeof __BASE__ === 'string' ? __BASE__ : '/';

const summarizePageMetafile = (pageMetafile: PageMetafile | null) => ({
  componentCount: pageMetafile?.buildMetrics?.components.length ?? 0,
  cssBundleCount: pageMetafile?.cssBundlePaths.length ?? 0,
  hasLoaderScript: Boolean(pageMetafile?.loaderScript),
  hasSsrInjectScript: Boolean(pageMetafile?.ssrInjectScript),
  modulePreloadCount: pageMetafile?.modulePreloads.length ?? 0,
  totalEstimatedComponentBytes:
    pageMetafile?.buildMetrics?.totalEstimatedComponentBytes ?? 0,
});

export class ReactComponentManager {
  private readonly loadedComponents = new Map<string, ComponentInfo>();
  private readonly loadingPageMetafiles = new Map<
    string,
    Promise<PageMetafile | null>
  >();
  private readonly subscriptions = new Map<string, ComponentSubscription[]>();
  private readonly runtimeSubscriptions: RuntimeSubscription[] = [];
  private pageMetafile: Record<string, PageMetafile> = {};
  private pageMetafileBuildId: string | null = null;
  private pageMetafileIndex: PageMetafileManifest['pages'] = {};
  private pageMetafileIndexLoaded = false;
  private isInitialized = false;
  private reactLoadPromise: Promise<boolean> | null = null;
  private reactLoaded = false;

  public constructor() {
    this.ensureGlobalBindings();
  }

  public async initializeInDev(): Promise<void> {
    this.ensureGlobalBindings();
    if (import.meta.env.DEV) {
      if (this.isInitialized) {
        Logger.warn('Already initialized');
        return;
      }
      this.isInitialized = true;
      this.notifyRuntimeReady();
      Logger.success('Initialization completed');
      DebugLogger.info('runtime initialized in development', {
        mode: 'dev',
      });
    }
  }

  public async initializeInProd(): Promise<void> {
    // Skip initialization in the Node.js environment.
    if (globalThis.window === undefined) {
      return;
    }

    this.ensureGlobalBindings();
    if (import.meta.env.PROD) {
      if (this.isInitialized) {
        Logger.warn('Already initialized');
        return;
      }

      /**
       * The metafile contains metadata for all page components. For each page component, this metadata includes:
       *
       *  1. Script information for the required React component dependencies.
       *  2. modulePreloads information for preloading these component scripts.
       *
       * Its primary purpose is to provide the necessary script dependency information for a page during the initial load
       * and subsequent route transitions. This serves as an optimization technique in production.
       *
       * Development Stage:
       *
       * The VitePress development environment operates in Single-Page Application (SPA) mode,
       * which offers advantages such as a fast startup time and the benefits of Hot Module Replacement (HMR) for
       * an improved documentation-writing experience.
       *
       * Because this is a lazy-loading strategy, it does not require the entire application context to be loaded up front.
       * The most straightforward approach is to inject the script information after the VitePress content has rendered
       * (triggering the onContentUpdated hook). This injection analyzes whether the page depends on React components for rendering.
       * If a dependency is detected, the React components are lazy-loaded, and the rendering process is completed.
       * This is the task handled by the virtual:react virtual module.
       *
       * Production Stage:
       *
       * The VitePress production environment employs a hybrid model: Server-Side Generation (SSG) for the initial render and SPA for route transitions.
       * Consequently, it is necessary to preprocess the metafile to gather the script information
       * for all React components and their corresponding modulePreloads across the entire application.
       *
       * In a production environment, the focus is on optimizing the user experience.
       * During the build phase, script dependency information for every page is preprocessed and collected.
       * This information is then injected into the page on the initial render.
       * During route transitions, this data allows for efficiently determining if the destination page requires React components for rendering,
       * enabling subsequent tasks to be completed with high performance.
       *
       * MPA (Multi-Page Application) Mode:
       *
       * VitePress also provides an experimental MPA mode.
       * The vrite application utilizes MPA mode exclusively for single-page preview scenarios.
       * These preview scenarios do not contain routes linking to other preview pages, so handling route transitions is unnecessary.
       * Each MPA page is mutually independent.
       *
       * As a result, preprocessing the metafile is not required.
       * It is sufficient to expose the script information to each page during the build phase to handle the initial page load.
       */
      if (!import.meta.env.MPA) {
        await this.loadPageMetafileIndex();
        await this.ensurePageMetafile(getCleanPathname(), {
          preferInjectedCurrentMeta: true,
        });
        this.initialModulePreloads(getCleanPathname());
      }

      this.isInitialized = true;
      this.notifyRuntimeReady();
      Logger.success('Initialization completed');
      DebugLogger.info('runtime initialized in production', {
        mode: 'prod',
        pageCount: Object.keys(this.pageMetafile).length,
      });
    }
  }

  /**
   * We employ a staged preloading strategy to balance concurrent page requests and UX.
   *
   * 1) Initial Load:
   *    At build time, obtain the metafile for the current page and inject only essential scripts:
   *    the loaderScript, React component scripts, and ssrInjectScript. This covers the initial page load.
   *
   * 2) Post-Render Preloading:
   *    After the initial render completes, a metafile of all application pages becomes available.
   *    Dynamically preload the loaderScript and ssrInjectScript for other pages to accelerate subsequent transitions.
   *
   * 3) Just-in-Time Preloading:
   *    Immediately prior to navigating to a target page, preload all of its dependent React component scripts.
   */
  private initialModulePreloads(pageId: string): void {
    const initialModulePreloads =
      reactComponentManager.getAllInitialModulePreloadScripts();
    const currentPageMetafile =
      reactComponentManager.getPageComponentInfo(pageId);
    const prefetchScriptLinks = new Set<string>(initialModulePreloads);

    if (currentPageMetafile) {
      const { loaderScript, ssrInjectScript } = currentPageMetafile;
      prefetchScriptLinks.delete(loaderScript);
      if (ssrInjectScript) {
        prefetchScriptLinks.delete(ssrInjectScript);
      }
    }

    if (prefetchScriptLinks.size > 0) {
      for (const scriptLink of prefetchScriptLinks) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = scriptLink;
        link.as = 'script';
        link.referrerPolicy = 'no-referrer';
        document.head.append(link);
      }
    }
  }

  private syncPageMetafileCacheFromWindow(): void {
    if (globalThis.window !== undefined) {
      this.pageMetafile = window[RENDER_STRATEGY_CONSTANTS.pageMetafile] || {};
    }
  }

  private resetPageMetafileState(): void {
    this.pageMetafile = {};
    this.pageMetafileBuildId = null;
    this.pageMetafileIndex = {};
    this.pageMetafileIndexLoaded = true;

    if (globalThis.window !== undefined) {
      window[RENDER_STRATEGY_CONSTANTS.pageMetafile] = {};
    }

    dispatchSiteDebugPageMetafileEvent({
      buildId: null,
      kind: 'state-reset',
      pageCount: 0,
      pageMetafile: null,
    });
  }

  private getInjectedPageMetafileUrl(metaName: string): string | null {
    if (globalThis.window === undefined) {
      return null;
    }

    const injectedValue = document
      .querySelector(`meta[name="${metaName}"]`)
      ?.getAttribute('content')
      ?.trim();

    return injectedValue || null;
  }

  private resolveRequestUrl(targetUrl: string): string {
    if (/^(?:[a-z]+:)?\/\//i.test(targetUrl) || targetUrl.startsWith('/')) {
      return targetUrl;
    }

    return baseUrl.endsWith('/')
      ? `${baseUrl}${targetUrl}`
      : `${baseUrl}/${targetUrl}`;
  }

  private setFallbackPageMetafileIndex(): void {
    this.pageMetafileIndex = Object.fromEntries(
      Object.entries(this.pageMetafile).map(([pathname, pageMetafile]) => [
        pathname,
        {
          file: '',
          loaderScript: pageMetafile.loaderScript,
          ssrInjectScript: pageMetafile.ssrInjectScript,
        },
      ]),
    );
    this.pageMetafileIndexLoaded = true;
  }

  private async loadLegacyGlobalMetafile(): Promise<void> {
    const response = await fetch(
      this.resolveRequestUrl(LEGACY_PAGE_METAFILE_URL),
    );

    if (!response.ok) {
      throw new Error(
        `Legacy page metafile request failed with status ${response.status}`,
      );
    }

    this.pageMetafile = await response.json();

    if (globalThis.window !== undefined) {
      window[RENDER_STRATEGY_CONSTANTS.pageMetafile] = this.pageMetafile;
    }

    this.setFallbackPageMetafileIndex();
    dispatchSiteDebugPageMetafileEvent({
      buildId: this.pageMetafileBuildId,
      kind: 'legacy-global-loaded',
      pageCount: Object.keys(this.pageMetafile).length,
      pageId: getCleanPathname(),
      pageMetafile: this.pageMetafile[getCleanPathname()] || null,
    });
    Logger.success('Legacy global page metafile loaded successfully');
    DebugLogger.info('legacy global page metafile loaded', {
      pageCount: Object.keys(this.pageMetafile).length,
    });
  }

  private async loadPageMetafileIndex(): Promise<void> {
    this.syncPageMetafileCacheFromWindow();

    if (this.pageMetafileIndexLoaded) {
      return;
    }

    const injectedIndexUrl = this.getInjectedPageMetafileUrl(
      PAGE_METAFILE_META_NAMES.index,
    );

    if (!injectedIndexUrl) {
      try {
        await this.loadLegacyGlobalMetafile();
      } catch (error) {
        Logger.warn(
          `Failed to load page metafile index, message: ${formatErrorMessage(error)}`,
        );
        DebugLogger.warn('page metafile index load failed', {
          message: formatErrorMessage(error),
        });
        this.resetPageMetafileState();
      }
      return;
    }

    try {
      const response = await fetch(this.resolveRequestUrl(injectedIndexUrl));

      if (!response.ok) {
        throw new Error(
          `Page metafile index request failed with status ${response.status}`,
        );
      }

      const pageMetafileManifest =
        (await response.json()) as Partial<PageMetafileManifest>;

      if (
        pageMetafileManifest == null ||
        typeof pageMetafileManifest !== 'object' ||
        pageMetafileManifest.pages == null ||
        typeof pageMetafileManifest.pages !== 'object'
      ) {
        throw new Error('Page metafile index payload is invalid.');
      }

      this.pageMetafileBuildId =
        typeof pageMetafileManifest.buildId === 'string'
          ? pageMetafileManifest.buildId
          : null;
      this.pageMetafileIndex = pageMetafileManifest.pages;
      this.pageMetafileIndexLoaded = true;

      if (globalThis.window !== undefined) {
        window[RENDER_STRATEGY_CONSTANTS.pageMetafile] = this.pageMetafile;
      }

      Logger.success('Page metafile index loaded successfully');
      DebugLogger.info('page metafile index loaded', {
        buildId: this.pageMetafileBuildId,
        pageCount: Object.keys(this.pageMetafileIndex).length,
        schemaVersion:
          typeof pageMetafileManifest.schemaVersion === 'number'
            ? pageMetafileManifest.schemaVersion
            : null,
      });
    } catch (error) {
      Logger.warn(
        `Failed to load page metafile index, message: ${formatErrorMessage(error)}`,
      );
      DebugLogger.warn('page metafile index load failed', {
        message: formatErrorMessage(error),
      });

      try {
        await this.loadLegacyGlobalMetafile();
      } catch (legacyError) {
        Logger.warn(
          `Failed to load legacy global page metafile, message: ${formatErrorMessage(legacyError)}`,
        );
        DebugLogger.warn('legacy global page metafile load failed', {
          message: formatErrorMessage(legacyError),
        });
        this.resetPageMetafileState();
      }
    }
  }

  private cachePageMetafile(
    pathname: string,
    pageMetafile: PageMetafile,
  ): void {
    if (globalThis.window !== undefined) {
      const cachedPageMetafiles =
        window[RENDER_STRATEGY_CONSTANTS.pageMetafile] || {};

      cachedPageMetafiles[pathname] = pageMetafile;
      window[RENDER_STRATEGY_CONSTANTS.pageMetafile] = cachedPageMetafiles;
      this.pageMetafile = cachedPageMetafiles;
      dispatchSiteDebugPageMetafileEvent({
        buildId: pageMetafile.buildId ?? this.pageMetafileBuildId,
        kind: 'page-loaded',
        pageCount: Object.keys(cachedPageMetafiles).length,
        pageId: pathname,
        pageMetafile,
      });
      return;
    }

    this.pageMetafile[pathname] = pageMetafile;
    dispatchSiteDebugPageMetafileEvent({
      buildId: pageMetafile.buildId ?? this.pageMetafileBuildId,
      kind: 'page-loaded',
      pageCount: Object.keys(this.pageMetafile).length,
      pageId: pathname,
      pageMetafile,
    });
  }

  private async loadPageMetafile(
    pathname: string,
    requestUrl: string,
  ): Promise<PageMetafile | null> {
    try {
      const response = await fetch(this.resolveRequestUrl(requestUrl));

      if (!response.ok) {
        throw new Error(
          `Page metafile request failed with status ${response.status}`,
        );
      }

      const pageMetafile = (await response.json()) as PageMetafile;

      if (
        this.pageMetafileBuildId &&
        typeof pageMetafile.buildId === 'string' &&
        pageMetafile.buildId !== this.pageMetafileBuildId
      ) {
        DebugLogger.warn('page metafile build mismatch detected', {
          buildId: pageMetafile.buildId,
          expectedBuildId: this.pageMetafileBuildId,
          pageId: pathname,
        });
      }

      this.cachePageMetafile(pathname, pageMetafile);
      DebugLogger.info('page metafile loaded', {
        pageId: pathname,
        ...summarizePageMetafile(pageMetafile),
      });

      return pageMetafile;
    } catch (error) {
      Logger.warn(
        `Failed to load page metafile for ${pathname}, message: ${formatErrorMessage(error)}`,
      );
      DebugLogger.warn('page metafile load failed', {
        message: formatErrorMessage(error),
        pageId: pathname,
      });
    }

    return null;
  }

  private async ensurePageMetafile(
    pathname: string,
    options?: {
      preferInjectedCurrentMeta?: boolean;
    },
  ): Promise<PageMetafile | null> {
    this.syncPageMetafileCacheFromWindow();

    if (this.pageMetafile[pathname]) {
      return this.pageMetafile[pathname] || null;
    }

    await this.loadPageMetafileIndex();

    if (this.pageMetafile[pathname]) {
      return this.pageMetafile[pathname] || null;
    }

    const pendingPageMetafile = this.loadingPageMetafiles.get(pathname);
    if (pendingPageMetafile) {
      return pendingPageMetafile;
    }

    let requestUrl = options?.preferInjectedCurrentMeta
      ? this.getInjectedPageMetafileUrl(PAGE_METAFILE_META_NAMES.current)
      : null;

    if (!requestUrl) {
      requestUrl = this.pageMetafileIndex[pathname]?.file || null;
    }

    if (!requestUrl) {
      return null;
    }

    const loadPromise = this.loadPageMetafile(pathname, requestUrl);
    this.loadingPageMetafiles.set(pathname, loadPromise);

    try {
      return await loadPromise;
    } finally {
      this.loadingPageMetafiles.delete(pathname);
    }
  }

  private setupGlobalComponents(): void {
    if (
      globalThis.window !== undefined &&
      !window[RENDER_STRATEGY_CONSTANTS.injectComponent]
    ) {
      window[RENDER_STRATEGY_CONSTANTS.injectComponent] = {};
    }
  }

  private setupComponentManager(): void {
    if (
      globalThis.window !== undefined &&
      !window[RENDER_STRATEGY_CONSTANTS.componentManager]
    ) {
      window[RENDER_STRATEGY_CONSTANTS.componentManager] = this;
    }
  }

  private ensureGlobalBindings(): void {
    this.setupComponentManager();
    this.setupGlobalComponents();
  }

  private isRuntimeReady(): boolean {
    return (
      this.isInitialized &&
      globalThis.window !== undefined &&
      window[RENDER_STRATEGY_CONSTANTS.componentManager] === this &&
      Boolean(window[RENDER_STRATEGY_CONSTANTS.injectComponent])
    );
  }

  private isReactAvailable(): boolean {
    return (
      globalThis.window !== undefined &&
      globalThis.React &&
      globalThis.ReactDOM &&
      typeof globalThis.React.createElement === 'function' &&
      typeof globalThis.ReactDOM.createRoot === 'function' &&
      typeof globalThis.ReactDOM.hydrateRoot === 'function'
    );
  }

  public async loadReact(): Promise<boolean> {
    if (this.reactLoaded || this.isReactAvailable()) {
      this.reactLoaded = true;
      return true;
    }

    if (this.reactLoadPromise) {
      return this.reactLoadPromise;
    }

    this.reactLoadPromise = this.performReactLoad();
    return this.reactLoadPromise;
  }

  private async performReactLoad(): Promise<boolean> {
    if (globalThis.window === undefined) {
      Logger.warn('React can only be loaded in browser environment');
      return false;
    }

    const loadStart = getSiteDebugNow();

    try {
      Logger.info('Starting React lazy loading...');
      DebugLogger.info('react runtime load started');

      const [reactModule, reactDOMModule] = await Promise.all([
        import('react'),
        import('react-dom/client'),
      ]);

      globalThis.React = reactModule.default || reactModule;
      globalThis.ReactDOM = reactDOMModule.default || reactDOMModule;

      if (!this.isReactAvailable()) {
        Logger.error('Failed to load React or ReactDOM');
        return false;
      }

      this.reactLoaded = true;
      Logger.success('React lazy loading completed');
      DebugLogger.info('react runtime load completed', {
        durationMs: Number((getSiteDebugNow() - loadStart).toFixed(2)),
        reactVersion: globalThis.React?.version ?? null,
      });
      return true;
    } catch (error) {
      Logger.error(
        `React lazy loading failed, message: ${formatErrorMessage(error)}`,
      );
      DebugLogger.error('react runtime load failed', {
        durationMs: Number((getSiteDebugNow() - loadStart).toFixed(2)),
        message: formatErrorMessage(error),
      });
      this.reactLoadPromise = null;
    }
    return false;
  }

  public getAllInitialModulePreloadScripts(): string[] {
    const modulePreloadScripts = new Set<string>();

    if (Object.keys(this.pageMetafileIndex).length > 0) {
      for (const pageMetafileIndex of Object.values(this.pageMetafileIndex)) {
        if (pageMetafileIndex.loaderScript) {
          modulePreloadScripts.add(pageMetafileIndex.loaderScript);
        }
        if (pageMetafileIndex.ssrInjectScript) {
          modulePreloadScripts.add(pageMetafileIndex.ssrInjectScript);
        }
      }
    } else {
      for (const pathname of Object.keys(this.pageMetafile)) {
        const { loaderScript, ssrInjectScript } = this.pageMetafile[pathname];
        if (loaderScript) {
          modulePreloadScripts.add(loaderScript);
        }
        if (ssrInjectScript) {
          modulePreloadScripts.add(ssrInjectScript);
        }
      }
    }

    return [...modulePreloadScripts];
  }

  public getPageComponentInfo(pathname: string): PageMetafile | null {
    this.syncPageMetafileCacheFromWindow();
    return this.pageMetafile[pathname] || null;
  }

  public async loadPageComponents(): Promise<boolean> {
    const pageId = getCleanPathname();
    const componentInfo = await this.ensurePageMetafile(pageId);
    if (!componentInfo) {
      DebugLogger.info('page component load skipped', {
        pageId,
        reason: 'page metafile not found',
      });
      return false;
    }
    const loadStart = getSiteDebugNow();
    const { loaderScript, modulePreloads, cssBundlePaths } = componentInfo;
    DebugLogger.info('page component load started', {
      pageId,
      ...summarizePageMetafile(componentInfo),
    });

    try {
      /**
       * CSS has side effects, so when switching routes,
       * it is necessary to manage existing CSS and inject new ones while maintaining order.
       */
      if (cssBundlePaths && cssBundlePaths.length > 0) {
        const existingCssMap = new Map<string, Element>();
        const cssToRemove = new Set<Element>();
        const requiredCssSet = new Set(cssBundlePaths);

        // Collect existing CSS links with vrite bundle markers.
        for (const link of document.querySelectorAll(
          'link[data-vrite-css-bundle]',
        )) {
          const href = link.getAttribute('href');
          if (href) {
            existingCssMap.set(href, link);
            // Mark for removal if not in current page requirements.
            if (!requiredCssSet.has(href)) {
              cssToRemove.add(link);
            }
          }
        }

        // Remove unused CSS links to prevent style conflicts.
        for (const link of cssToRemove) link.remove();

        // Insert new CSS elements while maintaining cssBundlePaths order.
        let newCssCount = 0;
        for (let i = 0; i < cssBundlePaths.length; i++) {
          const src = cssBundlePaths[i];

          if (!existingCssMap.has(src)) {
            // Create a new CSS link element.
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = src;
            link.dataset.vriteCssBundle = src;
            link.crossOrigin = 'anonymous';

            // Add error handling for CSS load failures.
            link.addEventListener('error', () => {
              Logger.warn(`Failed to load CSS bundle: ${src}`);
            });

            // Find the appropriate insertion position to maintain order.
            let insertPosition = null;

            // Look for the next existing CSS in cssBundlePaths to insert before it.
            for (let j = i + 1; j < cssBundlePaths.length; j++) {
              const nextExisting = existingCssMap.get(cssBundlePaths[j]);
              if (nextExisting) {
                insertPosition = nextExisting;
                break;
              }
            }

            // Insert the new CSS element at the correct position.
            if (insertPosition) {
              document.head.insertBefore(link, insertPosition);
            } else {
              // If no next existing element is found, append to the end.
              document.head.append(link);
            }

            newCssCount++;
          }
        }

        if (newCssCount > 0) {
          Logger.info(
            `Loaded ${newCssCount} new CSS bundle(s) in correct order`,
          );
        }

        if (cssToRemove.size > 0) {
          Logger.info(`Removed ${cssToRemove.size} unused CSS bundle(s)`);
        }

        if (newCssCount > 0 || cssToRemove.size > 0) {
          DebugLogger.info('page css bundles synchronized', {
            addedCssBundles: newCssCount,
            pageId,
            removedCssBundles: cssToRemove.size,
          });
        }
      }

      const existingScript = document.querySelector(
        `script[src="${loaderScript}"]`,
      );
      if (existingScript) {
        Logger.info('Current page components already loaded');
        DebugLogger.info('page component load skipped', {
          durationMs: Number((getSiteDebugNow() - loadStart).toFixed(2)),
          pageId,
          reason: 'loader script already present',
        });
        return true;
      }
      // Preload dependency modules before script execution while avoiding duplicate preload tags.
      if (modulePreloads && modulePreloads.length > 0) {
        for (const src of modulePreloads) {
          if (
            !document.querySelector(`link[rel="modulepreload"][href="${src}"]`)
          ) {
            const link = document.createElement('link');
            link.rel = 'modulepreload';
            link.href = src;
            document.head.append(link);
          }
        }
      }

      const script = document.createElement('script');
      script.type = 'module';
      script.src = loaderScript;

      return new Promise((resolve, reject) => {
        script.addEventListener('load', () => {
          Logger.success('Page components loaded successfully');
          DebugLogger.info('page component load completed', {
            durationMs: Number((getSiteDebugNow() - loadStart).toFixed(2)),
            pageId,
            script: loaderScript,
          });
          resolve(true);
        });
        script.addEventListener('error', (error) => {
          Logger.error(
            `Failed to load page components, message: ${String(error)}`,
          );
          DebugLogger.error('page component load failed', {
            durationMs: Number((getSiteDebugNow() - loadStart).toFixed(2)),
            pageId,
            script: loaderScript,
          });
          reject(new Error(`Failed to load script: ${loaderScript}`));
        });
        document.head.append(script);
      });
    } catch (error) {
      Logger.error(
        `Component loading error, message: ${formatErrorMessage(error)}`,
      );
      DebugLogger.error('page component load failed', {
        durationMs: Number((getSiteDebugNow() - loadStart).toFixed(2)),
        message: formatErrorMessage(error),
        pageId,
      });
      return false;
    }
  }

  public async subscribeComponent(
    pageId: string,
    componentName: string,
    timeout = 10_000,
  ): Promise<boolean> {
    const subscriptionStart = getSiteDebugNow();

    try {
      /**
       * At this time, it is only necessary to notify that React needs to be loaded,
       * without waiting for React to finish loading.
       */
      this.loadReact();

      const key = `${pageId}-${componentName}`;

      if (this.isComponentLoaded(key)) {
        DebugLogger.info('component subscription resolved from cache', {
          componentName,
          pageId,
        });
        return true;
      }

      DebugLogger.info('component subscription started', {
        componentName,
        pageId,
        timeout,
      });

      return new Promise((resolve, reject) => {
        if (!this.subscriptions.has(key)) {
          this.subscriptions.set(key, []);
        }

        const timeoutId = setTimeout(() => {
          DebugLogger.error('component subscription timed out', {
            componentName,
            pageId,
            timeout,
          });
          this.rejectSubscriptions(
            key,
            new Error(
              `Component subscription timeout: ${componentName} (${timeout}ms)`,
            ),
          );
        }, timeout);

        this.subscriptions.get(key)!.push({
          resolve: (value) => {
            clearTimeout(timeoutId);
            DebugLogger.info('component subscription resolved', {
              componentName,
              durationMs: Number(
                (getSiteDebugNow() - subscriptionStart).toFixed(2),
              ),
              pageId,
            });
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timeoutId);
            DebugLogger.error('component subscription rejected', {
              componentName,
              durationMs: Number(
                (getSiteDebugNow() - subscriptionStart).toFixed(2),
              ),
              message: error.message,
              pageId,
            });
            reject(error);
          },
          timestamp: Date.now(),
        });
      });
    } catch (error) {
      Logger.error(
        `Failed to subscribe to component ${componentName}, message: ${formatErrorMessage(error)}`,
      );
      DebugLogger.error('component subscription setup failed', {
        componentName,
        message: formatErrorMessage(error),
        pageId,
      });
    }
    return false;
  }

  public async subscribeRuntimeReady(timeout = 10_000): Promise<boolean> {
    this.ensureGlobalBindings();

    if (this.isRuntimeReady()) {
      return true;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.rejectRuntimeSubscriptions(
          new Error(`Runtime ready subscription timeout (${timeout}ms)`),
        );
      }, timeout);

      this.runtimeSubscriptions.push({
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        timestamp: Date.now(),
      });
    });
  }

  public notifyRuntimeReady(): void {
    this.ensureGlobalBindings();

    if (!this.isRuntimeReady() || this.runtimeSubscriptions.length === 0) {
      return;
    }

    const subscribers = [...this.runtimeSubscriptions];
    this.runtimeSubscriptions.length = 0;

    for (const subscriber of subscribers) {
      try {
        subscriber.resolve(true);
      } catch (error) {
        Logger.error(
          `Runtime subscription callback execution error, message: ${formatErrorMessage(error)}`,
        );
      }
    }
  }

  public notifyComponentLoaded(pageId: string, componentName: string): void {
    const key = `${pageId}-${componentName}`;

    try {
      if (
        globalThis.window !== undefined &&
        window[RENDER_STRATEGY_CONSTANTS.injectComponent]?.[pageId]?.[
          componentName
        ]?.component
      ) {
        this.loadedComponents.set(key, {
          name: componentName,
          Component:
            window[RENDER_STRATEGY_CONSTANTS.injectComponent][pageId][
              componentName
            ].component!,
          renderDirectives: new Set(),
          loadTime: Date.now(),
        });

        DebugLogger.info('component module registered', {
          componentName,
          estimatedTotalBytes:
            this.pageMetafile[pageId]?.buildMetrics?.components.find(
              (metric) => metric.componentName === componentName,
            )?.estimatedTotalBytes ?? null,
          pageId,
        });
      }

      if (this.subscriptions.has(key)) {
        const subscribers = this.subscriptions.get(key)!;
        for (const subscriber of subscribers) {
          try {
            subscriber.resolve(true);
          } catch (error) {
            Logger.error(
              `Subscription callback execution error, message: ${formatErrorMessage(error)}`,
            );
          }
        }

        this.subscriptions.delete(key);
      }
    } catch (error) {
      Logger.error(
        `Component load notification failed, message: ${formatErrorMessage(error)}`,
      );
      this.rejectSubscriptions(key, new Error('Component loading failed'));
    }
  }

  public notifyComponentsLoaded(
    pageId: string,
    componentNames: string[],
  ): void {
    for (const componentName of componentNames) {
      this.notifyComponentLoaded(pageId, componentName);
    }
  }

  public isComponentLoaded(key: string): boolean {
    return this.loadedComponents.has(key);
  }

  public getComponent(
    pageId: string,
    componentName: string,
  ): ComponentInfo['Component'] | null {
    if (
      globalThis.window !== undefined &&
      window[RENDER_STRATEGY_CONSTANTS.injectComponent]?.[pageId]?.[
        componentName
      ]
    ) {
      return (
        window[RENDER_STRATEGY_CONSTANTS.injectComponent][pageId][componentName]
          .component || null
      );
    }
    return null;
  }

  public clearPageSubscriptions(pageId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.subscriptions.keys()) {
      if (key.startsWith(`${pageId}-`)) {
        keysToDelete.push(key);
      }
    }

    const navigationError = new Error('Page navigation cancelled');
    for (const key of keysToDelete) {
      this.rejectSubscriptions(key, navigationError);
    }
  }

  private rejectSubscriptions(key: string, error: Error): void {
    if (this.subscriptions.has(key)) {
      const subscribers = this.subscriptions.get(key)!;
      for (const subscriber of subscribers) {
        try {
          subscriber.reject(error);
        } catch (rejectionError) {
          Logger.error(
            `Subscription rejection handling error, message: ${formatErrorMessage(rejectionError)}`,
          );
        }
      }
      this.subscriptions.delete(key);
    }
  }

  private rejectRuntimeSubscriptions(error: Error): void {
    if (this.runtimeSubscriptions.length === 0) {
      return;
    }

    const subscribers = [...this.runtimeSubscriptions];
    this.runtimeSubscriptions.length = 0;

    for (const subscriber of subscribers) {
      try {
        subscriber.reject(error);
      } catch (rejectionError) {
        Logger.error(
          `Runtime subscription rejection handling error, message: ${formatErrorMessage(rejectionError)}`,
        );
      }
    }
  }

  public reset(): void {
    const resetError = new Error('ReactComponentManager reset');

    for (const key of this.subscriptions.keys()) {
      this.rejectSubscriptions(key, resetError);
    }

    this.rejectRuntimeSubscriptions(resetError);

    this.loadedComponents.clear();
  }

  public destroy(): void {
    this.reset();
    this.loadingPageMetafiles.clear();
    this.pageMetafile = {};
    this.pageMetafileBuildId = null;
    this.pageMetafileIndex = {};
    this.pageMetafileIndexLoaded = false;
    this.isInitialized = false;
    this.reactLoadPromise = null;
    this.reactLoaded = false;
  }

  public isReactLoaded(): boolean {
    return this.reactLoaded && this.isReactAvailable();
  }
}

export const reactComponentManager: ReactComponentManager =
  new ReactComponentManager();
