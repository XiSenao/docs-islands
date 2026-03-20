import { describe, expect, it } from 'vitest';
import { createPathResolver } from '../vite-plugin-vitepress-path-resolver';

describe('VitePressPathResolver', () => {
  const resolver = createPathResolver({
    srcDir: 'docs',
    site: {
      base: '/docs/',
      cleanUrls: true,
    },
    pages: ['index.md', 'guide/getting-started.md', 'guide/index.md'],
    rewrites: {
      map: {},
      inv: {},
    },
  } as any);

  it('should resolve html paths in clean url mode', () => {
    expect(
      resolver.urlToMarkdownPath('/docs/guide/getting-started.html'),
    ).toMatch(/docs\/guide\/getting-started\.md$/);
  });

  it('should resolve directory paths to index.md in clean url mode', () => {
    expect(resolver.urlToMarkdownPath('/docs/guide/')).toMatch(
      /docs\/guide\/index\.md$/,
    );
  });

  it('should convert markdown paths back to clean urls with base', () => {
    const markdownPath = resolver.urlToMarkdownPath(
      '/docs/guide/getting-started.html',
    );

    expect(resolver.markdownPathToPageUrl(markdownPath)).toBe(
      '/docs/guide/getting-started',
    );
  });
});
