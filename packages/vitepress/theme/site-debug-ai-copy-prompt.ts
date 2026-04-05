import type { SiteDebugAiAnalysisTarget } from '../src/shared/site-debug-ai';
import { buildSiteDebugAiAnalysisPrompt } from '../src/shared/site-debug-ai';
import type { SiteDebugAiBuildReportReference } from './debug-inspector';

const getNonEmptyPrompt = (value?: string | null) =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

export const resolveSiteDebugAiCopyPrompt = ({
  activeBuildReport,
  analysisSource,
  buildReportPromptByFile,
  liveAnalysisTarget,
  resolvedAnalysisTarget,
}: {
  activeBuildReport?: SiteDebugAiBuildReportReference | null;
  analysisSource: 'build-report' | 'live-analysis' | null;
  buildReportPromptByFile: Readonly<Record<string, string>>;
  liveAnalysisTarget: SiteDebugAiAnalysisTarget | null;
  resolvedAnalysisTarget: SiteDebugAiAnalysisTarget | null;
}) => {
  if (analysisSource === 'build-report') {
    const buildReportPrompt =
      getNonEmptyPrompt(activeBuildReport?.prompt) ??
      (activeBuildReport?.reportFile
        ? getNonEmptyPrompt(
            buildReportPromptByFile[activeBuildReport.reportFile],
          )
        : null);

    if (buildReportPrompt) {
      return buildReportPrompt;
    }
  }

  const fallbackTarget =
    analysisSource === 'build-report'
      ? (resolvedAnalysisTarget ?? liveAnalysisTarget)
      : liveAnalysisTarget;

  return fallbackTarget ? buildSiteDebugAiAnalysisPrompt(fallbackTarget) : '';
};
