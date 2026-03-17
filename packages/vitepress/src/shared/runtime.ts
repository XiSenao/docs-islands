// This function is injected as a string into browser runtime via function.toString()
// It will never execute in Node.js environment, but needs DOM types for compilation
/// <reference lib="dom" />

export const GET_CLEAN_PATHNAME_RUNTIME = function getCleanPathname(
  injectedBase?: string,
  injectedCleanUrls?: boolean,
): string {
  /**
   * `__VP_SITE_DATA__` is injected by the standard VitePress browser runtime in
   * non-MPA builds. It is not a reliable source in DEV/MPA-only runtime code,
   * so those modes must fall back to define-time constants instead.
   */
  const siteConfig = globalThis.window
    ? globalThis.window.__VP_SITE_DATA__
    : undefined;
  const siteBase = siteConfig?.base;
  const siteCleanUrls = siteConfig?.cleanUrls;
  const definedBase = typeof __BASE__ === 'string' ? __BASE__ : undefined;
  const definedCleanUrls =
    typeof __CLEAN_URLS__ === 'boolean' ? __CLEAN_URLS__ : undefined;

  /**
   * Runtime code injected via `Function#toString()` does not pass through the
   * Vite transform pipeline, so define replacements do not happen inside that
   * string body. For those runtimes we must pass the resolved values explicitly
   * as call arguments.
   */
  let rawBase = '/';
  for (const candidate of [injectedBase, definedBase, siteBase]) {
    if (typeof candidate === 'string') {
      rawBase = candidate;
      break;
    }
  }

  let rawCleanUrls = false;
  for (const candidate of [
    injectedCleanUrls,
    definedCleanUrls,
    siteCleanUrls,
  ]) {
    if (typeof candidate === 'boolean') {
      rawCleanUrls = candidate;
      break;
    }
  }

  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const bareBase = base === '/' ? base : base.slice(0, -1);

  // location is available in browser environment where this code runs
  let pathname =
    typeof location === 'undefined' ? '/' : location.pathname || '/';
  try {
    pathname = decodeURI(pathname);
  } catch {
    // Keep the raw pathname if decoding fails.
  }

  if (pathname === bareBase) {
    pathname = '/';
  } else if (pathname.startsWith(base)) {
    pathname = pathname.slice(base.length - 1);
  }

  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  pathname = pathname.replaceAll(/\/{2,}/g, '/');
  pathname = pathname.replace(/(^|\/)index(?:\.html)?$/, '$1');
  if (rawCleanUrls) pathname = pathname.replace(/\.html$/, '');
  if (pathname === '') pathname = '/';
  return pathname;
};

export function getCleanPathname(): string {
  return GET_CLEAN_PATHNAME_RUNTIME();
}
