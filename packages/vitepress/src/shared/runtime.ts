// This function is injected as a string into browser runtime via function.toString()
// It will never execute in Node.js environment, but needs DOM types for compilation
/// <reference lib="dom" />

export const GET_CLEAN_PATHNAME_RUNTIME = function getCleanPathname(): string {
  const siteData = globalThis.window
    ? globalThis.window.__VP_SITE_DATA__
    : undefined;
  let rawBase = '/';
  if (siteData?.base) {
    rawBase = siteData.base;
  } else if (typeof __BASE__ !== 'undefined' && typeof __BASE__ === 'string') {
    // Development mode, __BASE__ is defined in the globalThis.
    rawBase = __BASE__;
  }

  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

  // location is available in browser environment where this code runs
  let pathname =
    typeof location === 'undefined' ? '/' : decodeURI(location.pathname);
  if (pathname.startsWith(base)) pathname = pathname.slice(base.length - 1);
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  pathname = pathname.replaceAll(/\/{2,}/g, '/');
  return pathname;
};

export function getCleanPathname(): string {
  return GET_CLEAN_PATHNAME_RUNTIME();
}
