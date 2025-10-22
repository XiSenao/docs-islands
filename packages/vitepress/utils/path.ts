import fs from 'node:fs';
import { dirname, join, relative } from 'pathe';
import { normalizePath } from 'vite';
import type { ConfigType } from '../src/types/utils';

export function slash(p: string): string {
  return p.replaceAll('\\', '/');
}

export function getProjectRoot(): string {
  if (process.env.PROJECT_ROOT) {
    return process.env.PROJECT_ROOT;
  }

  const findPackageJson = (dir: string): string | null => {
    const packageJsonPath = join(dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return dir;
    }

    const parentDir = dirname(dir);
    if (parentDir === dir) {
      return null;
    }

    return findPackageJson(parentDir);
  };

  const rootFromPackageJson = findPackageJson(process.cwd());
  if (rootFromPackageJson) {
    return rootFromPackageJson;
  }

  return process.cwd();
}

export const getPathnameByMarkdownModuleId = (
  markdownModuleId: string,
  siteConfig: ConfigType,
): string => {
  const relativePath = normalizePath(
    relative(siteConfig.srcDir, markdownModuleId),
  );
  let pathname = `/${relativePath
    .replace(/\.md$/, siteConfig.cleanUrls ? '' : '.html')
    .replace(/(^|\/)index(?:\.html)?$/, '$1')}`;

  if (pathname === '' || pathname === '/index') {
    pathname = '/';
  }

  return siteConfig.base === '/'
    ? pathname
    : siteConfig.base.slice(0, -1) + pathname;
};
