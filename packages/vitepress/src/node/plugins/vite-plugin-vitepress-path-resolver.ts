import { RENDER_STRATEGY_CONSTANTS } from '#shared/constants';
import logger from '#shared/logger';
import { getProjectRoot } from '@docs-islands/utils/path';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'pathe';
import { normalizePath } from 'vite';
import type { DefaultTheme, Plugin, SiteConfig } from 'vitepress';

class VitePressPathResolver {
  private readonly base: string;
  private readonly srcDir: string;
  private readonly cleanUrls: boolean;
  private readonly pages = new Set<string>();
  private rewrites: SiteConfig<DefaultTheme.Config>['rewrites'] = {
    map: {},
    inv: {},
  };

  public cachedResolvedIds: Map<string, string> = new Map<string, string>();

  constructor(config: SiteConfig<DefaultTheme.Config>) {
    const root = normalizePath(resolve(getProjectRoot()));
    const srcDir = normalizePath(resolve(root, config.srcDir || '.'));
    const base = config.site.base
      ? config.site.base.replace(/([^/])$/, '$1/')
      : '/';
    const cleanUrls = config.site.cleanUrls ?? false;
    this.srcDir = normalizePath(srcDir);
    this.base = base;
    this.cleanUrls = cleanUrls;

    if (config.pages) {
      for (const page of config.pages) this.pages.add(page);
    }

    if (config.rewrites) {
      this.rewrites = config.rewrites;
    }
  }

  resolveId(id: string, importer?: string): string | null {
    if (!needInlinePathResolver(id)) return null;

    let cleanedId = cleanUrl(id);
    if (!cleanedId.endsWith('.md') && cleanedId.startsWith(this.base)) {
      cleanedId = join('/', cleanedId.slice(this.base.length));
    }

    if (!isAbsolute(cleanedId)) {
      cleanedId =
        cleanedId.startsWith('.') && importer
          ? resolve(dirname(importer), cleanedId)
          : resolve(this.srcDir, cleanedId);
    }

    // File path to page URL.
    if (cleanedId.endsWith('.md')) {
      return this.markdownPathToPageUrl(cleanedId);
    }
    return this.pageUrlToMarkdownPath(cleanedId);
  }

  private resolveMdFile(filePath: string): string | null {
    const normalizedPath = normalizePath(filePath);

    const relativePath = relative(this.srcDir, normalizedPath);
    if (this.pages.has(relativePath)) {
      return normalizedPath;
    }

    return null;
  }

  // Convert the URL to a Markdown file path.
  private pageUrlToMarkdownPath(url: string): string | null {
    try {
      const filePath = this.urlToMarkdownPath(url);
      return this.resolveMdFile(filePath);
    } catch {
      return null;
    }
  }

  // Convert the URL to a Markdown file path.
  urlToMarkdownPath(url: string): string {
    let relativePath = url.replace(
      new RegExp(
        `^${this.base.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)}`,
      ),
      '',
    );
    relativePath = relativePath.replace(/[#?].*$/, '');

    if (this.cleanUrls) {
      // /foo -> /foo.md
      if (!relativePath.endsWith('/') && !relativePath.endsWith('.html')) {
        relativePath += '.md';
      }
    } else {
      // /foo.html -> /foo.md
      relativePath = relativePath.replace(/\.html$/, '.md');
    }

    // /foo/ -> /foo/index.md
    if (relativePath.endsWith('/')) {
      relativePath += 'index.md';
    }

    /**
     * empty -> index.md
     * / -> index.md
     */
    if (!relativePath || relativePath === '/') {
      relativePath = 'index.md';
    }

    if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1);
    }

    if (this.rewrites.inv[relativePath]) {
      relativePath = this.rewrites.inv[relativePath]!;
    }

    return resolve(this.srcDir, relativePath);
  }

  // Convert the Markdown file path to a URL.
  markdownPathToPageUrl(filePath: string): string {
    const relativePath = normalizePath(relative(this.srcDir, filePath));
    const rewrittenPath = this.rewrites.map[relativePath];
    const finalPath = rewrittenPath || relativePath;

    let url = `/${finalPath
      .replace(/\.md$/, this.cleanUrls ? '' : '.html')
      .replace(/(^|\/)index(?:\.html)?$/, '$1')}`;

    if (url === '' || url === '/index') {
      url = '/';
    }

    return this.base === '/' ? url : this.base.slice(0, -1) + url;
  }

  // Synchronize the latest routing information during hot updates.
  updateConfig(config: Partial<SiteConfig<DefaultTheme.Config>>): void {
    this.cachedResolvedIds.clear();
    if (config.pages) {
      this.pages.clear();
      for (const page of config.pages) this.pages.add(page);
    }

    if (config.rewrites) {
      this.rewrites = config.rewrites;
    }
  }

  normalizePath(path: string): string {
    return decodeURIComponent(path)
      .replace(/[#?].*$/, '')
      .replace(/(^|\/)index(?:\.html)?$/, '$1');
  }
}

const needInlinePathResolver = (id: string) => {
  const queryString = id.split('?')[1] || '';
  const queryStringIterator = queryString.split('&') || [];
  const queryItemString = queryStringIterator.find((queryItemString) =>
    queryItemString.startsWith(RENDER_STRATEGY_CONSTANTS.inlinePathResolver),
  );
  if (queryItemString) {
    const [key] = queryItemString.split('=');
    if (key === RENDER_STRATEGY_CONSTANTS.inlinePathResolver) {
      return true;
    }
  }
  return false;
};

const cleanUrl = (url: string): string =>
  url.replace(/#.*$/s, '').replace(/\?.*$/s, '');

export default function createVitePressPathResolverPlugin(): Plugin {
  let resolver: VitePressPathResolver | null = null;

  return {
    name: 'vite-plugin-vitepress-path-resolver',
    enforce: 'post',

    configResolved(config) {
      const vitepressConfig = config.vitepress;
      if (vitepressConfig) {
        resolver = new VitePressPathResolver(vitepressConfig);
      }
    },

    resolveId: {
      order: 'pre',
      handler(id, importer) {
        if (!resolver) return null;

        const ext = extname(cleanUrl(id));
        if (ext !== '.md' && ext !== '' && ext !== '.html') {
          return null;
        }

        const cahcedKey = `${id}#${importer}`;
        if (resolver.cachedResolvedIds.has(cahcedKey)) {
          return resolver.cachedResolvedIds.get(cahcedKey);
        }

        const resolved = resolver.resolveId(id, importer);

        if (resolved) {
          logger
            .getLoggerByGroup('vitepress-path-resolver')
            .success(
              `${id.replace(/[&?]+__INLINE_PATH_RESOLVER__/, '')} -> ${resolved}`,
            );
          resolver.cachedResolvedIds.set(cahcedKey, resolved);
        }

        return resolved;
      },
    },

    // Update resolver when configuration changes.
    async handleHotUpdate({ server }) {
      if (!resolver) return;

      const vitepressConfig = server.config.vitepress;
      if (vitepressConfig) {
        resolver.updateConfig(vitepressConfig);
      }
    },
  };
}

export function transformPathForInlinePathResolver(id: string): string {
  if (!id.includes('?')) {
    return `${id}?${RENDER_STRATEGY_CONSTANTS.inlinePathResolver}`;
  }
  return `${id}&${RENDER_STRATEGY_CONSTANTS.inlinePathResolver}`;
}

export function createPathResolver(
  config: SiteConfig<DefaultTheme.Config>,
): VitePressPathResolver {
  return new VitePressPathResolver(config);
}

export type { VitePressPathResolver };
