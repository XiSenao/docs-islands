/// <reference lib="dom" />

declare const __BASE__: string | undefined;
declare const __CLEAN_URLS__: boolean | undefined;

export interface CleanPathnameOptions {
  base?: string;
  cleanUrls?: boolean;
}

export const normalizeCleanPathname = (
  pathname: string,
  options: CleanPathnameOptions = {},
): string => {
  const rawBase = options.base ?? '/';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const bareBase = base === '/' ? base : base.slice(0, -1);
  let normalizedPathname = pathname || '/';

  try {
    normalizedPathname = decodeURI(normalizedPathname);
  } catch {
    // Keep the raw pathname when decoding fails.
  }

  if (normalizedPathname === bareBase) {
    normalizedPathname = '/';
  } else if (normalizedPathname.startsWith(base)) {
    normalizedPathname = normalizedPathname.slice(base.length - 1);
  }

  if (!normalizedPathname.startsWith('/')) {
    normalizedPathname = `/${normalizedPathname}`;
  }

  normalizedPathname = normalizedPathname.replaceAll(/\/{2,}/g, '/');
  normalizedPathname = normalizedPathname.replace(
    /(^|\/)index(?:\.html)?$/,
    '$1',
  );

  if (options.cleanUrls) {
    normalizedPathname = normalizedPathname.replace(/\.html$/, '');
  }

  return normalizedPathname === '' ? '/' : normalizedPathname;
};

export const GET_CLEAN_PATHNAME_RUNTIME = function getCleanPathname(
  injectedBase?: string,
  injectedCleanUrls?: boolean,
): string {
  const definedBase = typeof __BASE__ === 'string' ? __BASE__ : undefined;
  const definedCleanUrls =
    typeof __CLEAN_URLS__ === 'boolean' ? __CLEAN_URLS__ : undefined;

  const rawBase =
    typeof injectedBase === 'string'
      ? injectedBase
      : typeof definedBase === 'string'
        ? definedBase
        : '/';
  const rawCleanUrls =
    typeof injectedCleanUrls === 'boolean'
      ? injectedCleanUrls
      : typeof definedCleanUrls === 'boolean'
        ? definedCleanUrls
        : false;

  let pathname =
    typeof location === 'undefined' ? '/' : location.pathname || '/';
  try {
    pathname = decodeURI(pathname);
  } catch {
    // Keep the raw pathname when decoding fails.
  }

  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const bareBase = base === '/' ? base : base.slice(0, -1);

  if (pathname === bareBase) {
    pathname = '/';
  } else if (pathname.startsWith(base)) {
    pathname = pathname.slice(base.length - 1);
  }

  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`;
  }

  pathname = pathname.replaceAll(/\/{2,}/g, '/');
  pathname = pathname.replace(/(^|\/)index(?:\.html)?$/, '$1');
  if (rawCleanUrls) {
    pathname = pathname.replace(/\.html$/, '');
  }

  return pathname === '' ? '/' : pathname;
};

export function getCleanPathname(): string {
  return GET_CLEAN_PATHNAME_RUNTIME();
}
