/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET_CLEAN_PATHNAME_RUNTIME, getCleanPathname } from '../runtime';

describe('Shared Runtime - getCleanPathname', () => {
  // Store original location and window properties
  const originalLocation = globalThis.location;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    // Mock window and location
    Object.defineProperty(globalThis, 'window', {
      writable: true,
      value: {
        __VP_SITE_DATA__: undefined,
      },
    });

    Object.defineProperty(globalThis, 'location', {
      writable: true,
      value: {
        pathname: '/',
      },
    });
  });

  afterEach(() => {
    // Restore original properties
    globalThis.location = originalLocation;
    globalThis.window = originalWindow;
  });

  describe('base path handling', () => {
    it('should handle root path with default base', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = { base: '/' };
      globalThis.location.pathname = '/';

      const result = getCleanPathname();

      expect(result).toBe('/');
    });

    it('should handle root path with custom base', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = { base: '/docs/' };
      globalThis.location.pathname = '/docs/';

      const result = getCleanPathname();

      expect(result).toBe('/');
    });

    it('should strip custom base from pathname', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = { base: '/my-docs/' };
      globalThis.location.pathname = '/my-docs/guide/getting-started';

      const result = getCleanPathname();

      expect(result).toBe('/guide/getting-started');
    });

    it('should handle base without trailing slash', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = { base: '/docs' };
      globalThis.location.pathname = '/docs/guide';

      const result = getCleanPathname();

      expect(result).toBe('/guide');
    });
  });

  describe('pathname normalization', () => {
    it.each([
      ['/about', '/about'],
      ['/guide/', '/guide/'],
      ['/guide/getting-started', '/guide/getting-started'],
      ['/api/reference/', '/api/reference/'],
    ])('should normalize %s to %s', (input, expected) => {
      (globalThis.window as any).__VP_SITE_DATA__ = { base: '/' };
      globalThis.location.pathname = input;

      const result = getCleanPathname();

      expect(result).toBe(expected);
    });

    it('should preserve .html extension', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = { base: '/' };
      globalThis.location.pathname = '/guide/introduction.html';

      const result = getCleanPathname();

      expect(result).toBe('/guide/introduction.html');
    });

    it('should preserve index.html extension', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = { base: '/' };
      globalThis.location.pathname = '/guide/index.html';

      const result = getCleanPathname();

      expect(result).toBe('/guide/index.html');
    });

    it('should handle multiple consecutive slashes', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = { base: '/' };
      globalThis.location.pathname = '//guide///getting-started//';

      const result = getCleanPathname();

      expect(result).toBe('/guide/getting-started/');
    });
  });

  describe('URL decoding', () => {
    it('should decode URL-encoded characters', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = { base: '/' };
      globalThis.location.pathname = '/guide/%E4%B8%AD%E6%96%87'; // Chinese characters

      const result = getCleanPathname();

      expect(result).toBe('/guide/中文');
    });

    it('should handle special characters in path', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = { base: '/' };
      globalThis.location.pathname = '/guide/hello%20world';

      const result = getCleanPathname();

      expect(result).toBe('/guide/hello world');
    });
  });

  describe('edge cases', () => {
    it('should handle missing __VP_SITE_DATA__', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = undefined;
      globalThis.location.pathname = '/guide/introduction';

      const result = getCleanPathname();

      expect(result).toBe('/guide/introduction');
    });

    it('should handle missing base in site data', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = {};
      globalThis.location.pathname = '/guide/introduction';

      const result = getCleanPathname();

      expect(result).toBe('/guide/introduction');
    });

    it('should handle empty pathname', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = { base: '/' };
      globalThis.location.pathname = '';

      const result = getCleanPathname();

      expect(result).toBe('/');
    });

    it('should handle pathname that does not start with base', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = { base: '/docs/' };
      globalThis.location.pathname = '/other/path';

      const result = getCleanPathname();

      expect(result).toBe('/other/path');
    });
  });

  describe('function runtime consistency', () => {
    it('should have consistent behavior between wrapper and runtime function', () => {
      (globalThis.window as any).__VP_SITE_DATA__ = { base: '/docs/' };
      globalThis.location.pathname = '/docs/guide/test.html';

      const wrapperResult = getCleanPathname();
      const runtimeResult = GET_CLEAN_PATHNAME_RUNTIME();

      expect(wrapperResult).toBe(runtimeResult);
      expect(wrapperResult).toBe('/guide/test.html');
    });
  });

  describe('server-side rendering compatibility', () => {
    it('should handle undefined window object', () => {
      const originalWindow = globalThis.window;

      // @ts-expect-error - Simulating server environment.
      globalThis.window = undefined;
      globalThis.location.pathname = '/guide/test';

      expect(() => {
        getCleanPathname();
      }).not.toThrow();

      globalThis.window = originalWindow;
    });
  });
});
