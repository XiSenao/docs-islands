export const GET_CLEAN_PATHNAME_RUNTIME = function getCleanPathname(): string {
  const siteData = typeof window !== 'undefined' ? window.__VP_SITE_DATA__ : undefined;
  let rawBase = '/';
  if (siteData?.base) {
    rawBase = siteData.base;
  } else if ('__BASE__' in globalThis && typeof __BASE__ === 'string') {
    // Development mode, __BASE__ is defined in the globalThis.
    rawBase = __BASE__;
  }

  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

  let pathname = decodeURI(location.pathname);
  if (pathname.startsWith(base)) pathname = pathname.slice(base.length - 1);
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  pathname = pathname.replaceAll(/\/{2,}/g, '/');
  return pathname;
};

export function getCleanPathname(): string {
  return GET_CLEAN_PATHNAME_RUNTIME();
}
