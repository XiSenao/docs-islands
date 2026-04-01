import { describe, expect, it } from 'vitest';
import { PAGE_METAFILE_META_NAMES } from '../../../shared/constants';
import { createPageMetafileReferenceTags } from '../react-build-helper';

describe('react-build-helper page metafile references', () => {
  it('creates a preload tag plus page metafile meta tags', () => {
    expect(
      createPageMetafileReferenceTags({
        currentPagePublicPath:
          '/docs/assets/page-metafiles/pages/core-concepts.22222222.json',
        indexPublicPath: '/docs/assets/page-metafiles/manifest.11111111.json',
      }),
    ).toEqual([
      '<link rel="preload" href="/docs/assets/page-metafiles/manifest.11111111.json" as="fetch" type="application/json" crossorigin data-docs-islands-page-metafile-preload="index">',
      `<meta name="${PAGE_METAFILE_META_NAMES.index}" content="/docs/assets/page-metafiles/manifest.11111111.json">`,
      `<meta name="${PAGE_METAFILE_META_NAMES.current}" content="/docs/assets/page-metafiles/pages/core-concepts.22222222.json">`,
    ]);
  });

  it('always emits the shared index preload even when current page metafile is missing', () => {
    expect(
      createPageMetafileReferenceTags({
        indexPublicPath: '/docs/assets/page-metafiles/manifest.aaaaaaaa.json',
      }),
    ).toEqual([
      '<link rel="preload" href="/docs/assets/page-metafiles/manifest.aaaaaaaa.json" as="fetch" type="application/json" crossorigin data-docs-islands-page-metafile-preload="index">',
      `<meta name="${PAGE_METAFILE_META_NAMES.index}" content="/docs/assets/page-metafiles/manifest.aaaaaaaa.json">`,
    ]);
  });
});
