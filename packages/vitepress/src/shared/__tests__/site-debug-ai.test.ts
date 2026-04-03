import { describe, expect, it } from 'vitest';
import {
  buildSiteDebugAiAnalysisPrompt,
  getSiteDebugAiArtifactKindLabel,
  getSiteDebugAiEndpoint,
  getSiteDebugAiProviderLabel,
} from '../site-debug-ai';

describe('site-debug-ai helpers', () => {
  it('normalizes the debug ai endpoint against the current site base', () => {
    expect(getSiteDebugAiEndpoint('/')).toBe('/__docs-islands/debug-ai');
    expect(getSiteDebugAiEndpoint('/docs')).toBe(
      '/docs/__docs-islands/debug-ai',
    );
    expect(getSiteDebugAiEndpoint('/docs/')).toBe(
      '/docs/__docs-islands/debug-ai',
    );
  });

  it('formats provider and artifact labels for the UI', () => {
    expect(getSiteDebugAiProviderLabel('claude-code')).toBe('Claude Code');
    expect(getSiteDebugAiProviderLabel('doubao')).toBe('Doubao');
    expect(getSiteDebugAiArtifactKindLabel('bundle-chunk')).toBe(
      'Bundle Chunk',
    );
    expect(getSiteDebugAiArtifactKindLabel('bundle-module')).toBe(
      'Bundle Module',
    );
    expect(getSiteDebugAiArtifactKindLabel('page-build')).toBe('Page Build');
  });

  it('builds a prompt from debug-console sections instead of raw artifact metadata', () => {
    const prompt = buildSiteDebugAiAnalysisPrompt({
      artifactKind: 'bundle-chunk',
      artifactLabel: 'ssr-inject-code.js',
      bytes: 52_428,
      content: 'console.log("hello build artifact")',
      context: {
        artifactHeaderItems: [
          {
            label: 'Type',
            value: 'JS',
          },
          {
            label: 'Path',
            value: '/assets/ssr-inject-code.js',
          },
          {
            label: 'Size',
            value: '51.2 KB',
          },
        ],
        bundleSummaryItems: [
          {
            label: 'Total',
            value: '51.2 KB',
          },
          {
            label: 'JS',
            value: '49.2 KB',
          },
          {
            label: 'CSS',
            value: '2.0 KB',
          },
        ],
        chunkResourceItems: [
          {
            current: true,
            file: '/assets/ssr-inject-code.js',
            label: 'ssr-inject-code.js',
            moduleCount: 2,
            share: '100.0%',
            size: '51.2 KB',
            type: 'js',
          },
        ],
        componentName: 'HelloWorld',
        liveContextItems: [
          {
            label: 'Total',
            value: '15.2 ms',
          },
          {
            label: 'Bundle',
            value: '51.2 KB',
          },
        ],
        moduleItems: [
          {
            current: true,
            file: '/assets/ssr-inject-code.js',
            id: '/src/components/HelloWorld.tsx',
            label: 'HelloWorld.tsx',
            renderedSize: '20.5 KB',
            share: '40.0%',
            sizeDelta: 'Delta +13.9%',
            sourceInfo: 'Source 18.0 KB',
          },
          {
            file: '/assets/ssr-inject-code.js',
            id: '\0vite/modulepreload-polyfill',
            label: 'modulepreload-polyfill',
            renderedSize: '12.7 KB',
            share: '24.8%',
            sourceInfo: 'Source n/a',
            statusLabel: 'generated virtual module',
          },
        ],
        pageId: '/guide/getting-started',
        renderId: 'render-123',
        renderStatus: 'Completed',
      },
      displayPath: '/assets/ssr-inject-code.js',
      language: 'js',
    });

    expect(prompt).toContain('## Role');
    expect(prompt).toContain('## Skills');
    expect(prompt).toContain('## Action');
    expect(prompt).toContain('## Artifact-Specific Checklist');
    expect(prompt).toContain('## Constraints');
    expect(prompt).toContain('## Output');
    expect(prompt).toContain('## Debug Console Snapshot');
    expect(prompt).toContain(
      'Identify the selected chunk resource type, size, and role inside the component bundle.',
    );
    expect(prompt).toContain(
      'Use Bundle Summary and Chunk Resources to judge whether this file is unusually large, dominant, or well-balanced.',
    );
    expect(prompt).not.toContain(
      'Interpret the source state carefully: distinguish source available, source unavailable, and generated virtual module.',
    );
    expect(prompt).toContain('Current Debug Context:');
    expect(prompt).toContain('- Component: HelloWorld');
    expect(prompt).toContain('- Page: /guide/getting-started');
    expect(prompt).toContain('- Render status: Completed');
    expect(prompt).toContain('Visible Render Metrics:');
    expect(prompt).toContain('- Total: 15.2 ms');
    expect(prompt).toContain('Artifact Panel:');
    expect(prompt).toContain('- Panel: Chunk Resource');
    expect(prompt).toContain('- Type: JS');
    expect(prompt).toContain('Bundle Summary:');
    expect(prompt).toContain('- CSS: 2.0 KB');
    expect(prompt).toContain('Chunk Resources (1 shown):');
    expect(prompt).toContain('focus: current artifact');
    expect(prompt).toContain('Module Source (2 shown):');
    expect(prompt).toContain('status: current selection');
    expect(prompt).toContain('generated virtual module');
    expect(prompt).toContain(
      'Source content and raw code are intentionally excluded from this prompt.',
    );
    expect(prompt).not.toContain('Artifact metadata:');
    expect(prompt).not.toContain('Top modules');
    expect(prompt).not.toContain('Related emitted files');
  });

  it('omits raw artifact content even when the source payload is large', () => {
    const head = 'head'.repeat(5000);
    const tail = 'tail'.repeat(5000);
    const prompt = buildSiteDebugAiAnalysisPrompt({
      artifactKind: 'bundle-module',
      artifactLabel: 'HugeModule.ts',
      content: `${head}\n${'middle'.repeat(5000)}\n${tail}`,
      displayPath: '/repo/HugeModule.ts',
      language: 'ts',
    });

    expect(prompt).toContain('## Role');
    expect(prompt).toContain('## Artifact-Specific Checklist');
    expect(prompt).toContain('## Constraints');
    expect(prompt).toContain('## Debug Console Snapshot');
    expect(prompt).toContain(
      'Identify what role the selected module likely plays inside its parent chunk, using the module row, artifact panel, and surrounding chunk context.',
    );
    expect(prompt).toContain(
      'Interpret the source state carefully: distinguish source available, source unavailable, and generated virtual module.',
    );
    expect(prompt).not.toContain(
      'Identify the selected chunk resource type, size, and role inside the component bundle.',
    );
    expect(prompt).not.toContain('Visible Render Metrics:');
    expect(prompt).toContain('Artifact Panel:');
    expect(prompt).toContain('- Title: HugeModule.ts');
    expect(prompt).toContain(
      'Source content and raw code are intentionally excluded from this prompt.',
    );
    expect(prompt).not.toContain(head.slice(0, 128));
    expect(prompt).not.toContain(tail.slice(-128));
    expect(prompt).not.toContain('```ts');
  });

  it('builds a page-level prompt when reports are grouped by page', () => {
    const prompt = buildSiteDebugAiAnalysisPrompt({
      artifactKind: 'page-build',
      artifactLabel: '/guide/getting-started',
      bytes: 10_240,
      content: 'page overview',
      context: {
        artifactHeaderItems: [
          {
            label: 'Path',
            value: '/guide/getting-started',
          },
          {
            label: 'Components',
            value: '2',
          },
        ],
        bundleSummaryItems: [
          {
            label: 'Total',
            value: '10.0 KB',
          },
          {
            label: 'JS',
            value: '6.5 KB',
          },
        ],
        chunkResourceItems: [
          {
            file: '/assets/demo-card.js',
            label: 'demo-card.js',
            moduleCount: 2,
            share: '55.0%',
            size: '5.5 KB',
            type: 'js',
          },
        ],
        moduleItems: [
          {
            file: '/assets/demo-card.js',
            id: '/src/components/DemoCard.tsx',
            label: 'DemoCard.tsx',
            renderedSize: '2.5 KB',
            share: '40.0%',
            sourceInfo: 'Source 2.2 KB',
          },
        ],
        pageId: '/guide/getting-started',
      },
      displayPath: '/guide/getting-started',
      language: 'text',
    });

    expect(prompt).toContain('## Artifact-Specific Checklist');
    expect(prompt).toContain('Summarize the page-level bundle shape');
    expect(prompt).toContain('Artifact Panel:');
    expect(prompt).toContain('- Panel: Page Build');
    expect(prompt).toContain('- Title: /guide/getting-started');
    expect(prompt).toContain('- Components: 2');
    expect(prompt).toContain('Chunk Resources (1 shown):');
    expect(prompt).toContain('Module Source (1 shown):');
    expect(prompt).not.toContain(
      'Identify the selected chunk resource type, size, and role inside the component bundle.',
    );
  });
});
