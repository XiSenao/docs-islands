import { RENDER_STRATEGY_CONSTANTS } from '../shared/constants';
import { normalizeSlashPath } from '../shared/path';

export interface DocsResolvedId {
  id: string;
}

export interface DocsRuntimeResolveContext<
  TResult extends DocsResolvedId = DocsResolvedId,
> {
  resolveId: (id: string, importer?: string) => Promise<TResult | null>;
  defaultImporter?: string;
}

export interface DocsRuntimeModuleResolver<
  TResult extends DocsResolvedId = DocsResolvedId,
> {
  resolveId: (id: string, importer?: string) => Promise<TResult | null>;
  resolvePagePathToDocumentModuleId: (
    pagePath: string,
    importer?: string,
  ) => Promise<string>;
  resolveDocumentModuleIdToPagePath: (
    documentModuleId: string,
    importer?: string,
  ) => Promise<string | null>;
}

export interface DocsStaticRouteResolver {
  readonly cachedResolvedIds: Map<string, string>;
  resolveId: (id: string, importer?: string) => string | null;
  resolvePagePathToDocumentModuleId: (
    pagePath: string,
    importer?: string,
  ) => string | null;
  resolveDocumentModuleIdToPagePath: (
    documentModuleId: string,
    importer?: string,
  ) => string | null;
  urlToDocumentPath: (url: string) => string;
  documentPathToPageUrl: (filePath: string) => string;
  normalizePath: (path: string) => string;
}

export interface DocsModuleResolution {
  createInlinePageRequest: (id: string) => string;
  isInlinePageRequest: (id: string) => boolean;
  createRuntimeResolver: (
    context: DocsRuntimeResolveContext,
  ) => DocsRuntimeModuleResolver;
}

export function isInlinePageRequest(id: string): boolean {
  const queryString = id.split('?')[1] || '';
  const queryItems = queryString.split('&');

  return queryItems.some((queryItem) => {
    const [key] = queryItem.split('=');
    return key === RENDER_STRATEGY_CONSTANTS.inlinePathResolver;
  });
}

export function createInlinePageRequest(id: string): string {
  if (!id.includes('?')) {
    return `${id}?${RENDER_STRATEGY_CONSTANTS.inlinePathResolver}`;
  }

  return `${id}&${RENDER_STRATEGY_CONSTANTS.inlinePathResolver}`;
}

export function createDocsRuntimeModuleResolver<
  TResult extends DocsResolvedId = DocsResolvedId,
>(
  context: DocsRuntimeResolveContext<TResult>,
): DocsRuntimeModuleResolver<TResult> {
  const resolveId = (id: string, importer?: string) =>
    context.resolveId(id, importer ?? context.defaultImporter);

  return {
    resolveId,
    async resolvePagePathToDocumentModuleId(pagePath, importer) {
      const resolvedId = await resolveId(
        createInlinePageRequest(pagePath),
        importer,
      );

      return resolvedId ? normalizeSlashPath(resolvedId.id) : pagePath;
    },
    async resolveDocumentModuleIdToPagePath(documentModuleId, importer) {
      const resolvedId = await resolveId(
        createInlinePageRequest(documentModuleId),
        importer,
      );

      return resolvedId?.id ?? null;
    },
  };
}
