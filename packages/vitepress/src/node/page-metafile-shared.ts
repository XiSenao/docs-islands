export const PAGE_METAFILE_SCHEMA_VERSION = 1;
export const PAGE_METAFILE_ASSET_DIR = 'page-metafiles';

export const getPageMetafileRouteStem = (pathname: string): string => {
  let normalizedPathname = pathname === '/' ? '/index' : pathname;

  if (normalizedPathname.endsWith('/')) {
    normalizedPathname = `${normalizedPathname}index`;
  }

  normalizedPathname = normalizedPathname.replace(/\.html$/, '');

  const segments = normalizedPathname
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));

  return segments.length > 0 ? segments.join('/') : 'index';
};
