import type {
  ResolvedCheckerConfig,
  ResolvedLiminaConfig,
} from '#config/runner';
import { collectRawWorkspacePackages } from '#core/workspace/actions';
import {
  collectValidatedWorkspaceContext,
  WorkspaceRegionPathIndex,
} from '../workspace/validated-context';
import { resolveCheckerOwnership } from './checker-ownership-resolution';
import { resolveBuildGraphImportAnalysis } from './import-analysis-context';
import type {
  CheckerSelectionResolution,
  PrepareGeneratedTsconfigGraphOptions,
} from './types';

export async function resolveGeneratedGraphCheckerSelections(options: {
  config: ResolvedLiminaConfig;
  importAnalysisContext?: PrepareGeneratedTsconfigGraphOptions['importAnalysisContext'];
  projectConfigCache?: PrepareGeneratedTsconfigGraphOptions['projectConfigCache'];
  workspaceContext: NonNullable<
    PrepareGeneratedTsconfigGraphOptions['workspaceContext']
  >;
  workspacePathIndex?: WorkspaceRegionPathIndex;
}): Promise<CheckerSelectionResolution> {
  const activatedRegions =
    options.workspacePathIndex ??
    new WorkspaceRegionPathIndex(options.workspaceContext);
  return resolveCheckerOwnership({
    activatedRegions,
    config: options.config,
    importAnalysisContext: resolveBuildGraphImportAnalysis(options),
    projectConfigCache: options.projectConfigCache,
    workspaceSourceConfigPaths: options.workspaceContext.sourceConfigPaths,
  });
}

export async function resolveGeneratedGraphCheckers(
  config: ResolvedLiminaConfig,
  options: Pick<
    PrepareGeneratedTsconfigGraphOptions,
    | 'importAnalysisContext'
    | 'projectConfigCache'
    | 'workspaceContext'
    | 'workspacePathIndex'
  > = {},
): Promise<ResolvedCheckerConfig[]> {
  const workspaceContext =
    options.workspaceContext ??
    (await collectValidatedWorkspaceContext({
      config,
      rawPackages: await collectRawWorkspacePackages(config),
    }));
  const resolution = await resolveGeneratedGraphCheckerSelections({
    config,
    importAnalysisContext: options.importAnalysisContext,
    projectConfigCache: options.projectConfigCache,
    workspaceContext,
    workspacePathIndex: options.workspacePathIndex,
  });
  return resolution.selections.map(({ checker }) => checker);
}
