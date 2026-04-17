import type {
  PageMetafile,
  PageMetafileManifest,
  PageMetafileManifestEntry,
} from '#dep-types/page';
import type { SiteDevToolsAiBuildReportsPageContext } from '#dep-types/utils';
import { PAGE_METAFILE_META_NAMES } from '#shared/constants';
import { getPagePathByPathname } from '#shared/path';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { join, relative } from 'pathe';
import { normalizePath } from 'vite';
import type { RenderingStaticPageResolver } from '../core/module-resolution';
import {
  getPageMetafileRouteStem,
  PAGE_METAFILE_ASSET_DIR,
  PAGE_METAFILE_SCHEMA_VERSION,
} from '../page-metafile-shared';

export {
  getPageMetafileRouteStem,
  PAGE_METAFILE_ASSET_DIR,
  PAGE_METAFILE_SCHEMA_VERSION,
} from '../page-metafile-shared';

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

const escapeRegExp = (value: string): string =>
  value.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

const PAGE_METAFILE_INDEX_PRELOAD_ATTR =
  'data-docs-islands-page-metafile-preload';

const stripInjectedPageMetafileReferences = (html: string): string =>
  html
    .replaceAll(
      new RegExp(
        String.raw`<meta\s+name="${escapeRegExp(PAGE_METAFILE_META_NAMES.index)}"[^>]*>\s*`,
        'g',
      ),
      '',
    )
    .replaceAll(
      new RegExp(
        String.raw`<meta\s+name="${escapeRegExp(PAGE_METAFILE_META_NAMES.current)}"[^>]*>\s*`,
        'g',
      ),
      '',
    )
    .replaceAll(
      new RegExp(
        String.raw`<link rel="preload" href="[^"]+" as="fetch" type="application/json" crossorigin ${PAGE_METAFILE_INDEX_PRELOAD_ATTR}="index">\s*`,
        'g',
      ),
      '',
    );

const collectHtmlFilePaths = (directoryPath: string): string[] => {
  const htmlFilePaths: string[] = [];

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      htmlFilePaths.push(...collectHtmlFilePaths(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      htmlFilePaths.push(entryPath);
    }
  }

  return htmlFilePaths;
};

export const createPageMetafileReferenceTags = ({
  currentPagePublicPath,
  indexPublicPath,
}: {
  currentPagePublicPath?: string;
  indexPublicPath: string;
}): string[] => {
  const referenceTags = [
    `<link rel="preload" href="${indexPublicPath}" as="fetch" type="application/json" crossorigin ${PAGE_METAFILE_INDEX_PRELOAD_ATTR}="index">`,
    `<meta name="${PAGE_METAFILE_META_NAMES.index}" content="${indexPublicPath}">`,
  ];

  if (currentPagePublicPath) {
    referenceTags.push(
      `<meta name="${PAGE_METAFILE_META_NAMES.current}" content="${currentPagePublicPath}">`,
    );
  }

  return referenceTags;
};

export const resolveSiteDevToolsBuildReportPageContext = ({
  cleanUrls,
  pageId,
  pageResolver,
  srcDir,
}: {
  cleanUrls: boolean;
  pageId: string;
  pageResolver?: RenderingStaticPageResolver | null;
  srcDir: string;
}): SiteDevToolsAiBuildReportsPageContext => {
  const fallbackPagePath = getPagePathByPathname(pageId, cleanUrls).replace(
    /^\/+/,
    '',
  );
  let filePath = normalizePath(join(srcDir, fallbackPagePath));

  if (pageResolver) {
    try {
      filePath = normalizePath(pageResolver.urlToDocumentPath(pageId));
    } catch {
      // Fall back to the route-derived page path when rewrites are unavailable.
    }
  }

  return {
    filePath,
    routePath: pageId,
  };
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

export const injectPageMetafileReferences = ({
  currentPagePublicPathByHtmlPath,
  indexPublicPath,
  outDir,
}: {
  currentPagePublicPathByHtmlPath: Map<string, string>;
  indexPublicPath: string;
  outDir: string;
}): void => {
  for (const htmlFilePath of collectHtmlFilePaths(outDir)) {
    const relativeHtmlPath = relative(outDir, htmlFilePath).replaceAll(
      '\\',
      '/',
    );
    const currentPagePublicPath =
      currentPagePublicPathByHtmlPath.get(relativeHtmlPath);
    const html = fs.readFileSync(htmlFilePath, 'utf8');
    const sanitizedHtml = stripInjectedPageMetafileReferences(html);
    const injectedMetaTags = createPageMetafileReferenceTags({
      currentPagePublicPath,
      indexPublicPath,
    });

    const updatedHtml = sanitizedHtml.includes('</head>')
      ? sanitizedHtml.replace(
          '</head>',
          `${injectedMetaTags.join('\n')}\n</head>`,
        )
      : `${injectedMetaTags.join('\n')}\n${sanitizedHtml}`;

    fs.writeFileSync(htmlFilePath, updatedHtml);
  }
};
