import type {
  PageMetafile,
  PageMetafileManifest,
  PageMetafileManifestEntry,
} from '#dep-types/page';
import { createHash } from 'node:crypto';
import { join } from 'pathe';

export const PAGE_METAFILE_SCHEMA_VERSION = 1;
export const PAGE_METAFILE_ASSET_DIR = 'page-metafiles';

export interface PageMetafileAsset {
  content: string;
  filePath: string;
  pathname: string;
  publicPath: string;
}

export interface PageMetafileArtifacts {
  buildId: string;
  manifest: {
    content: string;
    filePath: string;
    payload: PageMetafileManifest;
    publicPath: string;
  };
  pages: PageMetafileAsset[];
}

const createContentHash = (content: string): string =>
  createHash('sha256').update(content).digest('hex').slice(0, 8);

const sortRecordEntries = <T>(
  entries: readonly (readonly [string, T])[],
): [string, T][] =>
  Array.from(entries, ([key, value]) => [key, value] as [string, T]).toSorted(
    ([left], [right]) => left.localeCompare(right),
  );

const toSortedRecord = <T>(
  entries: readonly (readonly [string, T])[],
): Record<string, T> => Object.fromEntries(sortRecordEntries(entries));

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

export const createPageMetafileArtifacts = ({
  assetsDir,
  pageMetafiles,
  wrapBaseUrl,
}: {
  assetsDir: string;
  pageMetafiles: Record<string, PageMetafile>;
  wrapBaseUrl: (value: string) => string;
}): PageMetafileArtifacts => {
  const sortedPageMetafiles = toSortedRecord(Object.entries(pageMetafiles));
  const buildId = createContentHash(JSON.stringify(sortedPageMetafiles));
  const pageAssets: PageMetafileAsset[] = [];

  for (const [pathname, pageMetafile] of Object.entries(sortedPageMetafiles)) {
    const pagePayload: PageMetafile = {
      ...pageMetafile,
      buildId,
      pathname,
      schemaVersion: PAGE_METAFILE_SCHEMA_VERSION,
    };
    const pageContent = JSON.stringify(pagePayload, null, 2);
    const pageFilePath = join(
      PAGE_METAFILE_ASSET_DIR,
      'pages',
      `${getPageMetafileRouteStem(pathname)}.${createContentHash(pageContent)}.json`,
    );

    pageAssets.push({
      content: pageContent,
      filePath: pageFilePath,
      pathname,
      publicPath: wrapBaseUrl(join('/', assetsDir, pageFilePath)),
    });
  }

  const manifestPages = toSortedRecord(
    pageAssets.map((pageAsset): [string, PageMetafileManifestEntry] => [
      pageAsset.pathname,
      {
        file: pageAsset.publicPath,
        loaderScript:
          sortedPageMetafiles[pageAsset.pathname]?.loaderScript || '',
        ssrInjectScript:
          sortedPageMetafiles[pageAsset.pathname]?.ssrInjectScript || '',
      },
    ]),
  );
  const manifestPayload: PageMetafileManifest = {
    buildId,
    pages: manifestPages,
    schemaVersion: PAGE_METAFILE_SCHEMA_VERSION,
  };
  const manifestContent = JSON.stringify(manifestPayload, null, 2);
  const manifestFilePath = join(
    PAGE_METAFILE_ASSET_DIR,
    `manifest.${createContentHash(manifestContent)}.json`,
  );

  return {
    buildId,
    manifest: {
      content: manifestContent,
      filePath: manifestFilePath,
      payload: manifestPayload,
      publicPath: wrapBaseUrl(join('/', assetsDir, manifestFilePath)),
    },
    pages: pageAssets,
  };
};
