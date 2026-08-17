import type { ResolvedLiminaConfig } from '#config/runner';
import type { AnalysisProviderSet } from '#core';
import type {
  ImportAnalysisContext,
  ProjectInfo,
} from '#core/import-graph/context';
import type { WorkspacePackage } from '#core/workspace/actions';
import type { WorkspaceExportsResolutionIndex } from '../core/workspace/exports';
import type { WorkspaceLookupIndex } from '../core/workspace/lookup';
import type { DependencyGraphEdge, DependencyGraphView } from './types';

export interface DependencyGraphCollectionContext {
  config: ResolvedLiminaConfig;
  core: AnalysisProviderSet;
  edgesByKey: Map<string, DependencyGraphEdge>;
  fileOwnerLookup: Map<string, string[]>;
  importAnalysis: ImportAnalysisContext;
  ownsCore: boolean;
  problems: string[];
  semanticProblemIdentities: Set<string>;
  projects: ProjectInfo[];
  view: DependencyGraphView;
  workspaceExports: WorkspaceExportsResolutionIndex;
  workspaceLookup: WorkspaceLookupIndex;
  workspacePackages: WorkspacePackage[];
}
