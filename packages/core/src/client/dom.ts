import {
  NEED_PRE_RENDER_DIRECTIVES,
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '../shared/constants/render-strategy';
import type { RenderContainerInfo } from '../types/client';
import type { RenderDirective } from '../types/render';

export interface CollectRenderContainersOptions {
  root?: ParentNode;
  validateElement?: (element: Element) => boolean;
}

export interface SynchronizePageCssBundlesResult {
  addedCssBundles: number;
  removedCssBundles: number;
}

export const collectComponentProps = (
  element: Element,
  excludedAttrs: readonly string[] = RENDER_STRATEGY_ATTRS,
): Record<string, string> => {
  const props: Record<string, string> = {};

  for (const attr of element.getAttributeNames()) {
    if (!excludedAttrs.includes(attr)) {
      props[attr] = element.getAttribute(attr) ?? '';
    }
  }

  return props;
};

export const getRenderContainerInfo = (
  element: Element,
): RenderContainerInfo | null => {
  const renderId = element.getAttribute(
    RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
  );
  const renderDirective = element.getAttribute(
    RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
  );
  const renderComponent = element.getAttribute(
    RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
  );

  if (!renderId || !renderDirective || !renderComponent) {
    return null;
  }

  return {
    element,
    props: collectComponentProps(element),
    renderComponent,
    renderDirective: renderDirective as RenderDirective,
    renderId,
    renderWithSpaSync:
      element.getAttribute(RENDER_STRATEGY_CONSTANTS.renderWithSpaSync) ===
      'true',
  };
};

export const collectRenderContainers = ({
  root = document,
  validateElement,
}: CollectRenderContainersOptions = {}): RenderContainerInfo[] => {
  const elements = root.querySelectorAll(
    `[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}]`,
  );
  const containers: RenderContainerInfo[] = [];

  for (const element of elements) {
    if (validateElement && !validateElement(element)) {
      continue;
    }

    const info = getRenderContainerInfo(element);
    if (info) {
      containers.push(info);
    }
  }

  return containers;
};

export const requiresPreRenderDirective = (
  directive: string,
): directive is Exclude<RenderDirective, 'client:only'> =>
  NEED_PRE_RENDER_DIRECTIVES.includes(
    directive as Exclude<RenderDirective, 'client:only'>,
  );

export const ensureModulePreloads = (
  modulePreloads: Iterable<string>,
  root: Document = document,
): void => {
  for (const src of modulePreloads) {
    if (!src) {
      continue;
    }

    if (!root.querySelector(`link[rel="modulepreload"][href="${src}"]`)) {
      const link = root.createElement('link');
      link.rel = 'modulepreload';
      link.href = src;
      root.head.append(link);
    }
  }
};

export const prefetchScripts = (
  scripts: Iterable<string>,
  root: Document = document,
): void => {
  for (const scriptLink of scripts) {
    if (!scriptLink) {
      continue;
    }

    if (root.querySelector(`link[rel="prefetch"][href="${scriptLink}"]`)) {
      continue;
    }

    const link = root.createElement('link');
    link.rel = 'prefetch';
    link.href = scriptLink;
    link.as = 'script';
    link.referrerPolicy = 'no-referrer';
    root.head.append(link);
  }
};

export const synchronizePageCssBundles = (
  cssBundlePaths: readonly string[],
  root: Document = document,
): SynchronizePageCssBundlesResult => {
  const existingCssMap = new Map<string, Element>();
  const cssToRemove = new Set<Element>();
  const requiredCssSet = new Set(cssBundlePaths);

  for (const link of root.querySelectorAll('link[data-vrite-css-bundle]')) {
    const href = link.getAttribute('href');
    if (!href) {
      continue;
    }

    existingCssMap.set(href, link);
    if (!requiredCssSet.has(href)) {
      cssToRemove.add(link);
    }
  }

  for (const link of cssToRemove) {
    link.remove();
  }

  let addedCssBundles = 0;
  for (let i = 0; i < cssBundlePaths.length; i += 1) {
    const src = cssBundlePaths[i];
    if (!src || existingCssMap.has(src)) {
      continue;
    }

    const link = root.createElement('link');
    link.rel = 'stylesheet';
    link.href = src;
    link.dataset.vriteCssBundle = src;
    link.crossOrigin = 'anonymous';

    let insertPosition: Element | null = null;
    for (let j = i + 1; j < cssBundlePaths.length; j += 1) {
      const nextExisting = existingCssMap.get(cssBundlePaths[j] || '');
      if (nextExisting) {
        insertPosition = nextExisting;
        break;
      }
    }

    if (insertPosition) {
      root.head.insertBefore(link, insertPosition);
    } else {
      root.head.append(link);
    }

    addedCssBundles += 1;
  }

  return {
    addedCssBundles,
    removedCssBundles: cssToRemove.size,
  };
};

export const replaceSsrCssResources = (
  ssrOnlyCss: readonly string[],
  root: Document = document,
): void => {
  for (const css of ssrOnlyCss) {
    if (!css) {
      continue;
    }

    const existingCssElement = root.querySelector(`link[href="${css}"]`);
    const link = root.createElement('link');
    link.rel = 'stylesheet';
    link.href = css;
    link.dataset.vriteCssInDev = css;
    root.head.append(link);

    if (existingCssElement) {
      existingCssElement.remove();
    }
  }
};

export const applySsrRenderResult = (
  element: Element,
  options: {
    ssrHtml: string;
    ssrOnlyCss?: readonly string[];
  },
  root: Document = document,
): void => {
  if (options.ssrOnlyCss?.length) {
    replaceSsrCssResources(options.ssrOnlyCss, root);
  }

  element.innerHTML = options.ssrHtml;
};
