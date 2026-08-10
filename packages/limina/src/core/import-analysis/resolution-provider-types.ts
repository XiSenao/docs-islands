import type { VueSemanticContextManager } from '../vue-semantic/context';
import type { ModuleResolutionRequestIndex } from './request-index';
import type {
  ImportAnalysisCaches,
  ImportAnalysisContext,
  ImportAnalysisMetricsRecorder,
} from './types';

export type ResolutionProvider = Pick<
  ImportAnalysisContext,
  | 'resolveInternalImport'
  | 'resolveModulePair'
  | 'resolveModulePairForImport'
  | 'resolveOxcImport'
  | 'resolveTypeScriptImport'
>;

export interface ProviderDependencies {
  caches: ImportAnalysisCaches;
  metrics: ImportAnalysisMetricsRecorder | undefined;
  requests: ModuleResolutionRequestIndex;
  vueSemanticContexts?: VueSemanticContextManager;
}
