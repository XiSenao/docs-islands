import type {
  AstroSemanticProject,
  CheckerProjectParseContext,
} from '#checkers';
import type { ResolvedLiminaConfig } from '#config/runner';
import type {
  ImportAnalysisContext,
  ImportRecord,
} from '#core/import-analysis/runner';
import type { DeclarationProviderResolution } from '../import-graph/declaration-provider';
import type { WorkspaceRegionPathIndex } from '../workspace/validated-context';
import type { GeneratedDependencyEdge, SourceProject } from './types';

export type ResolvedProvider = Extract<
  DeclarationProviderResolution,
  { kind: 'declaration' | 'source' }
>;

export interface ReferenceImportContext {
  activatedRegions: WorkspaceRegionPathIndex;
  config: ResolvedLiminaConfig;
  dtsProjectsBySourcePath: Map<string, SourceProject[]>;
  fileOwnerLookup: Map<string, string[]>;
  importAnalysis: ImportAnalysisContext;
  problems: string[];
  dependencyEdgesByKey: Map<string, GeneratedDependencyEdge>;
  semanticProblemIdentities: Set<string>;
}

export interface ReferenceImportOptions {
  astroSemanticProject?: AstroSemanticProject;
  context: ReferenceImportContext;
  fileName: string;
  importRecord: ImportRecord;
  project: SourceProject;
  resolutionContext?: CheckerProjectParseContext;
}

export interface ReferenceTarget {
  providerSourceFilePath: string;
  resolvedFilePath: string;
  targetSourceConfigPath: string;
}
