import type { ConfigType } from '#dep-types/utils';
import { relative } from 'pathe';
import { normalizePath } from 'vite';

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
