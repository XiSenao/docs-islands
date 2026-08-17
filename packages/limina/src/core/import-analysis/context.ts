import { createModuleResolutionRequestIndex } from './request-index';
import { createResolutionProvider } from './resolution-provider';
import {
  clearOxcResolverCaches,
  createImportAnalysisCaches,
} from './resolver-caches';
import { createSourceProvider } from './source-provider';
import type {
  CreateImportAnalysisContextOptions,
  ImportAnalysisContext,
} from './types';

export function createImportAnalysisContext(
  options: CreateImportAnalysisContextOptions = {},
): ImportAnalysisContext {
  const caches = createImportAnalysisCaches();
  const requests = createModuleResolutionRequestIndex({
    caches,
    metrics: options.metrics,
  });
  const source = createSourceProvider({ caches, contextOptions: options });
  const resolution = createResolutionProvider({
    astroSemanticContexts: options.astroSemanticContexts,
    caches,
    metrics: options.metrics,
    requests,
    vueSemanticContexts: options.vueSemanticContexts,
  });
  return {
    clearOxcResolverCaches: () => clearOxcResolverCaches(caches),
    collectImportsFromFile: source.collectImportsFromFile,
    prewarmImportsFromFile: source.prewarmImportsFromFile,
    ...resolution,
  };
}
