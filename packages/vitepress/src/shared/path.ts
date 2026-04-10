import type { ConfigType } from '#dep-types/utils';
import { getPathnameByDocumentModuleId } from '@docs-islands/core/shared/path';

export * from '@docs-islands/core/shared/path';

export const getPathnameByMarkdownModuleId = (
  markdownModuleId: string,
  siteConfig: ConfigType,
): string =>
  getPathnameByDocumentModuleId(markdownModuleId, {
    base: siteConfig.base,
    cleanUrls: siteConfig.cleanUrls,
    sourceDir: siteConfig.srcDir,
  });

export { type DocsSitePathOptions } from '@docs-islands/core/shared/path';
