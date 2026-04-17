import type { SiteDevToolsAiAnalysisTarget } from '../src/shared/site-devtools-ai';
import { buildSiteDevToolsAiAnalysisPrompt } from '../src/shared/site-devtools-ai';
import type { SiteDevToolsAiBuildReportReference } from './debug-inspector';

const getNonEmptyPrompt = (value?: string | null) =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

export const resolveSiteDevToolsAiCopyPrompt = ({
  activeBuildReport,
  analysisSource,
  buildReportPromptByFile,
  liveAnalysisTarget,
  resolvedAnalysisTarget,
}: {
  activeBuildReport?: SiteDevToolsAiBuildReportReference | null;
  analysisSource: 'build-report' | 'live-analysis' | null;
  buildReportPromptByFile: Readonly<Record<string, string>>;
  liveAnalysisTarget: SiteDevToolsAiAnalysisTarget | null;
  resolvedAnalysisTarget: SiteDevToolsAiAnalysisTarget | null;
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

  return fallbackTarget
    ? buildSiteDevToolsAiAnalysisPrompt(fallbackTarget)
    : '';
};
