import { querySelectorAllToArray } from '@docs-islands/utils/dom-iterable';
import type { SiteDebugRenderMetric } from '@docs-islands/vitepress/internal/debug';
import { getCurrentPageCandidates as getRuntimePageCandidates } from './debug-inspector';
import type { SiteDebugWindow } from './site-debug-shared';

export const getThemeSnapshot = () => {
  const root = document.documentElement;
  let storedPreference = '';

  try {
    storedPreference =
      globalThis.localStorage.getItem('vitepress-theme-appearance') ?? '';
  } catch {
    storedPreference = 'unavailable';
  }

  return {
    bodyDatasetTheme: document.body?.dataset.theme ?? '',
    computedColorScheme: getComputedStyle(root).colorScheme,
    prefersDark: globalThis.matchMedia('(prefers-color-scheme: dark)').matches,
    rootClassName: root.className,
    rootDatasetTheme: root.dataset.theme ?? '',
    storedPreference,
  };
};

export const getResourceTargetDetails = (target: EventTarget | null) => {
  if (target instanceof HTMLImageElement) {
    return {
      alt: target.alt,
      complete: target.complete,
      currentSrc: target.currentSrc || target.src,
      naturalHeight: target.naturalHeight,
      naturalWidth: target.naturalWidth,
      tagName: 'img',
    };
  }

  if (target instanceof HTMLScriptElement) {
    return {
      async: target.async,
      src: target.src,
      tagName: 'script',
      type: target.type,
    };
  }

  if (target instanceof HTMLLinkElement) {
    return {
      href: target.href,
      rel: target.rel,
      tagName: 'link',
    };
  }

  if (target instanceof HTMLElement) {
    return {
      className: target.className,
      id: target.id,
      tagName: target.tagName.toLowerCase(),
      text: target.textContent?.slice(0, 120) ?? '',
    };
  }

  return {
    targetType:
      target && typeof target === 'object' && 'constructor' in target
        ? String(
            (target as { constructor?: { name?: string } }).constructor?.name,
          )
        : typeof target,
  };
};

export const getCurrentPageCandidates = (
  debugWindow: SiteDebugWindow,
  currentPathname?: string,
) => getRuntimePageCandidates(debugWindow, currentPathname);

export const getCurrentPageId = (
  debugWindow: SiteDebugWindow,
  currentPathname?: string,
) => getCurrentPageCandidates(debugWindow, currentPathname)[0] ?? '/';

export const getSiteBasePath = (debugWindow: SiteDebugWindow) => {
  const base = debugWindow.__VP_SITE_DATA__?.base;

  return typeof base === 'string' && base.length > 0 ? base : '/';
};

export const getDevSourceEndpoint = (
  debugWindow: SiteDebugWindow,
  sourcePath?: string,
) => {
  if (!sourcePath || globalThis.window === undefined) {
    return null;
  }

  const base = getSiteBasePath(debugWindow);
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;

  return `${normalizedBase}__docs-islands/debug-source?path=${encodeURIComponent(sourcePath)}`;
};

export const getRenderMetricKey = (metric: SiteDebugRenderMetric) =>
  `${metric.pageId ?? 'unknown'}::${metric.renderId}`;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const getRenderContainerElement = (
  renderId: string,
  renderMetricContainerAttr: string,
): HTMLElement | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  const candidates = querySelectorAllToArray<HTMLElement>(
    document,
    `[${renderMetricContainerAttr}]`,
  );

  return (
    candidates.find(
      (element) => element.getAttribute(renderMetricContainerAttr) === renderId,
    ) ?? null
  );
};

export const getRenderContainerLabel = (
  element: HTMLElement | null,
): string => {
  if (!element) {
    return 'Container not found in DOM';
  }

  const id = element.id ? `#${element.id}` : '';
  const classNames = element.className
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((className) => `.${className}`)
    .join('');

  return `${element.tagName.toLowerCase()}${id}${classNames}`;
};

export const isElementVisibleInViewport = (
  element: HTMLElement | null,
): boolean => {
  if (!element || globalThis.window === undefined) {
    return false;
  }

  const rect = element.getBoundingClientRect();

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= window.innerHeight &&
    rect.left <= window.innerWidth
  );
};
