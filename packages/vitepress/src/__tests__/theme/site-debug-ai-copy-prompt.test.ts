import { describe, expect, it } from 'vitest';
import type { SiteDebugAiAnalysisTarget } from '../../../src/shared/site-debug-ai';
import { buildSiteDebugAiAnalysisPrompt } from '../../../src/shared/site-debug-ai';
import { resolveSiteDebugAiCopyPrompt } from '../../../theme/site-debug-ai-copy-prompt';

const createAnalysisTarget = (
  overrides: Partial<SiteDebugAiAnalysisTarget> = {},
): SiteDebugAiAnalysisTarget => ({
  artifactKind: 'bundle-chunk',
  artifactLabel: 'Demo Chunk',
  content: 'export const demo = true;',
  displayPath: '/assets/demo.js',
  language: 'js',
  ...overrides,
});

describe('resolveSiteDebugAiCopyPrompt', () => {
  it('uses the live analysis target prompt during real-time analysis', () => {
    const liveTarget = createAnalysisTarget();

    expect(
      resolveSiteDebugAiCopyPrompt({
        activeBuildReport: null,
        analysisSource: 'live-analysis',
        buildReportPromptByFile: {},
        liveAnalysisTarget: liveTarget,
        resolvedAnalysisTarget: null,
      }),
    ).toBe(buildSiteDebugAiAnalysisPrompt(liveTarget));
  });

  it('prefers the prompt attached to the active build report', () => {
    const buildTarget = createAnalysisTarget({
      artifactKind: 'page-build',
      artifactLabel: 'Core Concepts Page',
      displayPath: '/core-concepts',
      language: 'md',
    });

    expect(
      resolveSiteDebugAiCopyPrompt({
        activeBuildReport: {
          generatedAt: '2026-04-05T00:00:00.000Z',
          model: 'doubao-test-model',
          prompt: 'prompt from active build report',
          provider: 'doubao',
          reportFile: '/docs/assets/page-metafiles/ai/pages/core-concepts.json',
          reportId: 'report-1',
          reportLabel: 'Doubao Pro',
        },
        analysisSource: 'build-report',
        buildReportPromptByFile: {
          '/docs/assets/page-metafiles/ai/pages/core-concepts.json':
            'prompt from cached report file',
        },
        liveAnalysisTarget: createAnalysisTarget(),
        resolvedAnalysisTarget: buildTarget,
      }),
    ).toBe('prompt from active build report');
  });

  it('falls back to the loaded build report prompt cache before rebuilding a prompt', () => {
    const buildTarget = createAnalysisTarget({
      artifactKind: 'page-build',
      artifactLabel: 'Core Concepts Page',
      displayPath: '/core-concepts',
      language: 'md',
    });

    expect(
      resolveSiteDebugAiCopyPrompt({
        activeBuildReport: {
          generatedAt: '2026-04-05T00:00:00.000Z',
          model: 'doubao-test-model',
          provider: 'doubao',
          reportFile: '/docs/assets/page-metafiles/ai/pages/core-concepts.json',
          reportId: 'report-1',
          reportLabel: 'Doubao Pro',
        },
        analysisSource: 'build-report',
        buildReportPromptByFile: {
          '/docs/assets/page-metafiles/ai/pages/core-concepts.json':
            'prompt from loaded build report payload',
        },
        liveAnalysisTarget: createAnalysisTarget(),
        resolvedAnalysisTarget: buildTarget,
      }),
    ).toBe('prompt from loaded build report payload');
  });

  it('rebuilds a prompt from the resolved build report target when no saved prompt exists', () => {
    const buildTarget = createAnalysisTarget({
      artifactKind: 'page-build',
      artifactLabel: 'Core Concepts Page',
      displayPath: '/core-concepts',
      language: 'md',
    });

    expect(
      resolveSiteDebugAiCopyPrompt({
        activeBuildReport: {
          generatedAt: '2026-04-05T00:00:00.000Z',
          model: 'doubao-test-model',
          provider: 'doubao',
          reportFile: '/docs/assets/page-metafiles/ai/pages/core-concepts.json',
          reportId: 'report-1',
          reportLabel: 'Doubao Pro',
        },
        analysisSource: 'build-report',
        buildReportPromptByFile: {},
        liveAnalysisTarget: createAnalysisTarget(),
        resolvedAnalysisTarget: buildTarget,
      }),
    ).toBe(buildSiteDebugAiAnalysisPrompt(buildTarget));
  });
});
