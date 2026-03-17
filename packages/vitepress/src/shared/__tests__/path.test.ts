import { describe, expect, it } from 'vitest';
import {
  getPathnameByMarkdownModuleId,
  getPathnameByPagePath,
  normalizeRoutePathname,
  stripBaseFromPathname,
} from '../path';

describe('Shared Path Helpers', () => {
  describe('stripBaseFromPathname', () => {
    it('should strip a matching base and preserve the leading slash', () => {
      expect(stripBaseFromPathname('/docs/guide/start', '/docs/')).toBe(
        '/guide/start',
      );
    });

    it('should treat the bare base path as root', () => {
      expect(stripBaseFromPathname('/docs', '/docs/')).toBe('/');
    });
  });

  describe('normalizeRoutePathname', () => {
    it('should normalize index.html to directory routes', () => {
      expect(normalizeRoutePathname('/guide/index.html', false)).toBe(
        '/guide/',
      );
    });

    it('should strip html extensions when clean urls are enabled', () => {
      expect(normalizeRoutePathname('/guide/getting-started.html', true)).toBe(
        '/guide/getting-started',
      );
    });

    it('should preserve html extensions when clean urls are disabled', () => {
      expect(normalizeRoutePathname('/guide/getting-started.html', false)).toBe(
        '/guide/getting-started.html',
      );
    });
  });

  describe('getPathnameByPagePath', () => {
    it('should generate clean url keys for index pages', () => {
      expect(getPathnameByPagePath('guide/index.md', true)).toBe('/guide/');
    });

    it('should generate html keys when clean urls are disabled', () => {
      expect(getPathnameByPagePath('guide/getting-started.md', false)).toBe(
        '/guide/getting-started.html',
      );
    });
  });

  describe('getPathnameByMarkdownModuleId', () => {
    it('should include the site base after normalization', () => {
      expect(
        getPathnameByMarkdownModuleId('/repo/docs/guide/index.md', {
          root: '/repo',
          outDir: '/repo/.vitepress/dist',
          base: '/docs/',
          srcDir: '/repo/docs',
          assetsDir: 'assets',
          mpa: false,
          publicDir: '/repo/docs/public',
          cacheDir: '/repo/.vitepress/cache',
          cleanUrls: false,
          wrapBaseUrl: (path: string) => path,
        }),
      ).toBe('/docs/guide/');
    });
  });
});
