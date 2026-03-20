import type { ConfigType } from '#dep-types/utils';
import { relative } from 'pathe';
import { normalizePath } from 'vite';

export const ensureTrailingSlash = (path: string): string =>
  path.endsWith('/') ? path : `${path}/`;

export const stripBaseFromPathname = (
  pathname: string,
  base: string,
): string => {
  const normalizedBase = ensureTrailingSlash(base);
  const bareBase =
    normalizedBase === '/' ? normalizedBase : normalizedBase.slice(0, -1);

  if (pathname === bareBase) {
    return '/';
  }

  if (!pathname.startsWith(normalizedBase)) {
    return pathname;
  }

  return pathname.slice(normalizedBase.length - 1) || '/';
};

export const normalizeRoutePathname = (
  pathname: string,
  cleanUrls: boolean,
): string => {
  let normalizedPathname = pathname || '/';

  if (!normalizedPathname.startsWith('/')) {
    normalizedPathname = `/${normalizedPathname}`;
  }

  normalizedPathname = normalizedPathname.replaceAll(/\/{2,}/g, '/');
  normalizedPathname = normalizedPathname.replace(
    /(^|\/)index(?:\.html)?$/,
    '$1',
  );

  if (cleanUrls) {
    normalizedPathname = normalizedPathname.replace(/\.html$/, '');
  }

  return normalizedPathname === '' ? '/' : normalizedPathname;
};

export const getPathnameByPagePath = (
  pagePath: string,
  cleanUrls: boolean,
): string =>
  normalizeRoutePathname(
    `/${normalizePath(pagePath).replace(/\.md$/, cleanUrls ? '' : '.html')}`,
    cleanUrls,
  );

export const getPagePathByPathname = (
  pathname: string,
  cleanUrls: boolean,
): string => {
  const normalizedPathname = normalizeRoutePathname(pathname, cleanUrls);

  if (normalizedPathname === '/') {
    return '/index.md';
  }

  if (normalizedPathname.endsWith('/')) {
    return `${normalizedPathname}index.md`;
  }

  if (normalizedPathname.endsWith('.html')) {
    return normalizedPathname.replace(/\.html$/, '.md');
  }

  return cleanUrls ? `${normalizedPathname}.md` : normalizedPathname;
};

export const getPathnameByMarkdownModuleId = (
  markdownModuleId: string,
  siteConfig: ConfigType,
): string => {
  const relativePath = normalizePath(
    relative(siteConfig.srcDir, markdownModuleId),
  );
  const pathname = getPathnameByPagePath(relativePath, siteConfig.cleanUrls);

  return siteConfig.base === '/'
    ? pathname
    : siteConfig.base.slice(0, -1) + pathname;
};
