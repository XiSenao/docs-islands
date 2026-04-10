import fs from 'node:fs';
import type { PluginOption } from 'vite';
import { resolveSiteDebugPath } from './shared';

export interface SiteDebugVitePluginOptions {
  base: string;
  enabled: boolean;
  pluginName: string;
}

export function getSiteDebugVitePlugins({
  base,
  enabled,
  pluginName,
}: SiteDebugVitePluginOptions): PluginOption[] {
  if (!enabled) {
    return [];
  }

  return [
    {
      name: pluginName,
      apply: 'serve',
      enforce: 'pre',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url) {
            next();
            return;
          }

          const requestUrl = new URL(req.url, 'http://docs-islands.local');
          const debugSourcePath = resolveSiteDebugPath(
            base,
            '__docs-islands/debug-source',
          );

          if (requestUrl.pathname !== debugSourcePath) {
            next();
            return;
          }

          const sourcePath = requestUrl.searchParams.get('path');

          if (!sourcePath) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('Missing "path" query parameter.');
            return;
          }

          try {
            if (!fs.existsSync(sourcePath)) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end('Source file not found.');
              return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(fs.readFileSync(sourcePath, 'utf8'));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(error instanceof Error ? error.message : String(error));
          }
        });
      },
    },
  ];
}
