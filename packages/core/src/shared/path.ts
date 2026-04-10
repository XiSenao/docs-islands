import { relative } from 'pathe';

export interface DocsSitePathOptions {
  base: string;
  cleanUrls: boolean;
  sourceDir: string;
}

export const normalizeSlashPath = (path: string): string =>
  path.replaceAll('\\', '/');

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
    `/${normalizeSlashPath(pagePath).replace(/\.md$/, cleanUrls ? '' : '.html')}`,
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

export const getHtmlOutputPathByPathname = (
  pathname: string,
  cleanUrls: boolean,
): string => {
  const normalizedPathname = normalizeRoutePathname(pathname, cleanUrls);

  if (normalizedPathname === '/') {
    return 'index.html';
  }

  if (normalizedPathname.endsWith('/')) {
    return `${normalizedPathname.slice(1)}index.html`;
  }

  if (cleanUrls) {
    return `${normalizedPathname.slice(1)}.html`;
  }

  return normalizedPathname.slice(1);
};

export const getPathnameByDocumentModuleId = (
  documentModuleId: string,
  options: DocsSitePathOptions,
): string => {
  const relativePath = normalizeSlashPath(
    relative(options.sourceDir, documentModuleId),
  );
  const pathname = getPathnameByPagePath(relativePath, options.cleanUrls);

  return options.base === '/'
    ? pathname
    : ensureTrailingSlash(options.base).slice(0, -1) + pathname;
};
