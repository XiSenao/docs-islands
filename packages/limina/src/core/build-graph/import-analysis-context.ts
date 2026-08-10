import type { ResolvedLiminaConfig } from '#config/runner';
import {
  createImportAnalysisContext,
  type ImportAnalysisContext,
} from '#core/import-graph/context';
import type { VueSemanticContextManager } from '../vue-semantic/context';
import type { PrepareGeneratedTsconfigGraphOptions } from './types';

export function resolveBuildGraphImportAnalysis(options: {
  config: ResolvedLiminaConfig;
  importAnalysisContext?: PrepareGeneratedTsconfigGraphOptions['importAnalysisContext'];
  vueSemanticContexts?: VueSemanticContextManager;
}): ImportAnalysisContext {
  if (options.importAnalysisContext !== undefined) {
    return options.importAnalysisContext;
  }
  return createImportAnalysisContext({
    projectRootDir: options.config.rootDir,
    vueSemanticContexts: options.vueSemanticContexts,
  });
}
