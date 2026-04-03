/**
 * @vitest-environment node
 */
import type { PageMetafile } from '#dep-types/page';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSiteDebugAiModuleReportKey } from '../../../shared/site-debug-ai';
import { generateSiteDebugAiBuildReports } from '../site-debug-ai-build-reports';

const tempDirectories: string[] = [];

const createTempDirectory = (prefix = 'site-debug-ai-build-reports-') => {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirectories.push(directoryPath);
  return directoryPath;
};

const writeTextFile = (filePath: string, content: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const createPageMetafiles = (): Record<string, PageMetafile> => ({
  '/guide/getting-started': {
    buildMetrics: {
      components: [
        {
          componentName: 'DemoCard',
          entryFile: '/docs/assets/chunks/demo-card.js',
          estimatedAssetBytes: 1680,
          estimatedCssBytes: 120,
          estimatedJsBytes: 1560,
          estimatedTotalBytes: 1680,
          files: [
            {
              bytes: 1560,
              file: '/docs/assets/chunks/demo-card.js',
              type: 'js',
            },
          ],
          framework: 'react',
          modules: [
            {
              bytes: 920,
              file: '/docs/assets/chunks/demo-card.js',
              id: '/src/components/DemoCard.tsx',
              sourceAssetFile: '/docs/assets/sources/DemoCard.tsx',
              sourcePath: '/src/components/DemoCard.tsx',
            },
          ],
          renderDirectives: [],
          sourcePath: '/repo/src/components/DemoCard.tsx',
        },
      ],
      framework: 'react',
      loader: null,
      spaSyncEffects: null,
      ssrInject: null,
      totalEstimatedComponentBytes: 1680,
    },
    cssBundlePaths: [],
    loaderScript: '',
    modulePreloads: [],
    pathname: '/guide/getting-started',
    ssrInjectScript: '',
  },
});

const createSpaSyncOnlyPageMetafile = (): PageMetafile => ({
  buildMetrics: {
    components: [],
    framework: 'react',
    loader: {
      entryFile: '/docs/assets/unified-loader.js',
      files: [
        {
          bytes: 1200,
          file: '/docs/assets/unified-loader.js',
          type: 'js',
        },
      ],
      totalBytes: 1200,
    },
    spaSyncEffects: {
      components: [
        {
          blockingCssBytes: 0,
          blockingCssCount: 0,
          blockingCssFiles: [],
          componentName: 'SiteDebugConsoleOverview',
          embeddedHtmlPatches: [
            {
              bytes: 4200,
              html: '<section>overview</section>',
              renderId: 'render-overview',
            },
          ],
          embeddedHtmlBytes: 4200,
          renderDirectives: ['ssr:only'],
          renderIds: ['render-overview'],
          requiresCssLoadingRuntime: false,
        },
      ],
      enabledComponentCount: 1,
      enabledRenderCount: 1,
      totalBlockingCssBytes: 0,
      totalBlockingCssCount: 0,
      totalEmbeddedHtmlBytes: 4200,
      usesCssLoadingRuntime: false,
    },
    ssrInject: null,
    totalEstimatedComponentBytes: 0,
  },
  cssBundlePaths: ['/docs/assets/site-debug-console.css'],
  loaderScript: '/docs/assets/unified-loader.js',
  modulePreloads: ['/docs/assets/SiteDebugConsoleDocs.js'],
  pathname: '/guide/site-debug-console',
  ssrInjectScript: '',
});

afterEach(() => {
  vi.restoreAllMocks();

  for (const directoryPath of tempDirectories.splice(0)) {
    fs.rmSync(directoryPath, { force: true, recursive: true });
  }
});

describe('generateSiteDebugAiBuildReports', () => {
  it('skips generation when build reports are disabled', async () => {
    const pageMetafiles = createPageMetafiles();
    const result = await generateSiteDebugAiBuildReports({
      aiConfig: {
        providers: {
          doubao: {
            apiKey: 'test-key',
            enabled: true,
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: createTempDirectory('site-debug-ai-cache-'),
      outDir: createTempDirectory(),
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(result.generatedReportCount).toBe(0);
    expect(result.executionCount).toBe(0);
    expect(result.providers).toEqual([]);
    expect(result.skippedReason).toContain('disabled');
    expect(
      pageMetafiles['/guide/getting-started'].buildMetrics?.components[0]
        .aiReports,
    ).toBeUndefined();
  });

  it('treats buildReports presence as enabled and derives default runs from configured providers', async () => {
    const outDir = createTempDirectory();
    const cacheDir = createTempDirectory('site-debug-ai-cache-');
    const pageMetafiles = createPageMetafiles();

    writeTextFile(
      path.join(outDir, 'assets/chunks/demo-card.js'),
      'export const DemoCard = () => "demo";',
    );
    writeTextFile(
      path.join(outDir, 'assets/sources/DemoCard.tsx'),
      'export function DemoCard() { return <div>demo</div>; }',
    );

    const result = await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {},
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        analyzeTarget: async ({ target }) => ({
          detail: 'Generated from provider defaults',
          model: 'doubao-test-model',
          result: `analysis:${target.displayPath}`,
        }),
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            'claude-code': {
              available: false,
              detail: 'Unavailable in test',
              provider: 'claude-code',
            },
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(result.executionCount).toBe(1);
    expect(result.generatedReportCount).toBe(2);
    expect(result.providers).toEqual(['doubao']);
  });

  it('treats an explicit empty runs list as no-op instead of falling back to provider defaults', async () => {
    const result = await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          runs: [],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: createTempDirectory('site-debug-ai-cache-'),
      outDir: createTempDirectory(),
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(result.executionCount).toBe(0);
    expect(result.generatedReportCount).toBe(0);
    expect(result.providers).toEqual([]);
    expect(result.skippedReason).toContain(
      'siteDebug.analysis.buildReports.runs',
    );
  });

  it('writes chunk and module build reports and attaches references', async () => {
    const outDir = createTempDirectory();
    const cacheDir = createTempDirectory('site-debug-ai-cache-');
    const pageMetafiles = createPageMetafiles();
    const componentMetric =
      pageMetafiles['/guide/getting-started'].buildMetrics?.components[0];

    writeTextFile(
      path.join(outDir, 'assets/chunks/demo-card.js'),
      'export const DemoCard = () => "demo";',
    );
    writeTextFile(
      path.join(outDir, 'assets/sources/DemoCard.tsx'),
      'export function DemoCard() { return <div>demo</div>; }',
    );

    const result = await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          runs: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
              thinking: 'enabled',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            enabled: true,
            model: 'doubao-test-model',
            thinking: 'enabled',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        analyzeTarget: async ({ provider, target }) => ({
          detail: `Generated in test for ${provider}`,
          model: 'doubao-test-model',
          result: `analysis:${target.displayPath}`,
        }),
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            'claude-code': {
              available: false,
              detail: 'Unavailable in test',
              provider: 'claude-code',
            },
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const reportFiles = fs.readdirSync(
      path.join(outDir, 'assets/page-metafiles/ai/chunks'),
    );
    const moduleReportFiles = fs.readdirSync(
      path.join(outDir, 'assets/page-metafiles/ai/modules'),
    );
    const moduleKey = getSiteDebugAiModuleReportKey(
      '/docs/assets/chunks/demo-card.js',
      '/src/components/DemoCard.tsx',
    );

    expect(result.executionCount).toBe(1);
    expect(result.generatedReportCount).toBe(2);
    expect(result.providers).toEqual(['doubao']);
    expect(reportFiles).toHaveLength(1);
    expect(moduleReportFiles).toHaveLength(1);
    expect(componentMetric?.aiReports?.chunkReports).toEqual({
      '/docs/assets/chunks/demo-card.js': [
        expect.objectContaining({
          provider: 'doubao',
          reportFile: expect.stringContaining(
            '/docs/assets/page-metafiles/ai/chunks/',
          ),
          reportId: expect.any(String),
          reportLabel: expect.stringContaining('Doubao'),
        }),
      ],
    });
    expect(componentMetric?.aiReports?.moduleReports).toEqual({
      [moduleKey]: [
        expect.objectContaining({
          provider: 'doubao',
          reportFile: expect.stringContaining(
            '/docs/assets/page-metafiles/ai/modules/',
          ),
          reportId: expect.any(String),
          reportLabel: expect.stringContaining('Doubao'),
        }),
      ],
    });

    const chunkReportPath = path.join(
      outDir,
      'assets/page-metafiles/ai/chunks',
      reportFiles[0],
    );
    const moduleReportPath = path.join(
      outDir,
      'assets/page-metafiles/ai/modules',
      moduleReportFiles[0],
    );
    const chunkReport = JSON.parse(
      fs.readFileSync(chunkReportPath, 'utf8'),
    ) as {
      prompt: string;
      provider: string;
      reportId: string;
      reportLabel: string;
      result: string;
      target: { displayPath: string };
    };
    const moduleReport = JSON.parse(
      fs.readFileSync(moduleReportPath, 'utf8'),
    ) as {
      prompt: string;
      provider: string;
      reportId: string;
      reportLabel: string;
      result: string;
      target: { displayPath: string };
    };

    expect(chunkReport.provider).toBe('doubao');
    expect(chunkReport.reportId).toBeTruthy();
    expect(chunkReport.reportLabel).toContain('Doubao');
    expect(chunkReport.prompt).toContain('## Role');
    expect(chunkReport.prompt).toContain('## Artifact-Specific Checklist');
    expect(chunkReport.prompt).toContain('## Constraints');
    expect(chunkReport.prompt).toContain('## Debug Console Snapshot');
    expect(chunkReport.prompt).toContain(
      'Identify the selected chunk resource type, size, and role inside the component bundle.',
    );
    expect(chunkReport.prompt).toContain('Current Debug Context:');
    expect(chunkReport.prompt).toContain('Artifact Panel:');
    expect(chunkReport.prompt).toContain('Bundle Summary:');
    expect(chunkReport.prompt).toContain('Chunk Resources (1 shown):');
    expect(chunkReport.prompt).toContain('Module Source (1 shown):');
    expect(chunkReport.prompt).not.toContain('Visible Render Metrics:');
    expect(chunkReport.prompt).not.toContain('Artifact metadata:');
    expect(chunkReport.result).toContain('/docs/assets/chunks/demo-card.js');
    expect(moduleReport.provider).toBe('doubao');
    expect(moduleReport.reportId).toBeTruthy();
    expect(moduleReport.reportLabel).toContain('Doubao');
    expect(moduleReport.prompt).toContain('## Role');
    expect(moduleReport.prompt).toContain('## Artifact-Specific Checklist');
    expect(moduleReport.prompt).toContain('## Debug Console Snapshot');
    expect(moduleReport.prompt).toContain(
      'Identify what role the selected module likely plays inside its parent chunk, using the module row, artifact panel, and surrounding chunk context.',
    );
    expect(moduleReport.prompt).toContain('Artifact Panel:');
    expect(moduleReport.prompt).toContain('Bundle Summary:');
    expect(moduleReport.prompt).toContain('Module Source (1 shown):');
    expect(moduleReport.prompt).not.toContain('Visible Render Metrics:');
    expect(moduleReport.prompt).not.toContain('Artifact metadata:');
    expect(moduleReport.result).toContain('/src/components/DemoCard.tsx');
    expect(moduleReport.target.displayPath).toBe(
      '/src/components/DemoCard.tsx',
    );
    expect(result.reusedReportCount).toBe(0);
  });

  it('groups build-time prompts by page when buildReports.groupBy is set to page', async () => {
    const outDir = createTempDirectory();
    const cacheDir = createTempDirectory('site-debug-ai-cache-');
    const pageMetafiles = createPageMetafiles();
    const componentMetric =
      pageMetafiles['/guide/getting-started'].buildMetrics?.components[0];

    writeTextFile(
      path.join(outDir, 'assets/chunks/demo-card.js'),
      'export const DemoCard = () => "demo";',
    );
    writeTextFile(
      path.join(outDir, 'assets/sources/DemoCard.tsx'),
      'export function DemoCard() { return <div>demo</div>; }',
    );

    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    const result = await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          groupBy: 'page',
          runs: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            enabled: true,
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            'claude-code': {
              available: false,
              detail: 'Unavailable in test',
              provider: 'claude-code',
            },
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const moduleKey = getSiteDebugAiModuleReportKey(
      '/docs/assets/chunks/demo-card.js',
      '/src/components/DemoCard.tsx',
    );
    const pageReportFiles = fs.readdirSync(
      path.join(outDir, 'assets/page-metafiles/ai/pages'),
    );
    const chunkReference =
      componentMetric?.aiReports?.chunkReports?.[
        '/docs/assets/chunks/demo-card.js'
      ]?.[0];
    const moduleReference =
      componentMetric?.aiReports?.moduleReports?.[moduleKey]?.[0];
    const pageReport = JSON.parse(
      fs.readFileSync(
        path.join(outDir, 'assets/page-metafiles/ai/pages', pageReportFiles[0]),
        'utf8',
      ),
    ) as {
      prompt: string;
      result: string;
      target: {
        artifactKind: string;
        displayPath: string;
      };
    };

    expect(result.executionCount).toBe(1);
    expect(result.generatedReportCount).toBe(1);
    expect(result.providers).toEqual(['doubao']);
    expect(pageReportFiles).toHaveLength(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(pageReport.target.artifactKind).toBe('page-build');
    expect(pageReport.target.displayPath).toBe('/guide/getting-started');
    expect(pageReport.prompt).toContain('Page Build');
    expect(pageReport.prompt).toContain('- Components: 1');
    expect(pageReport.result).toBe('analysis:/guide/getting-started');
    expect(chunkReference?.reportFile).toContain(
      '/docs/assets/page-metafiles/ai/pages/',
    );
    expect(moduleReference?.reportFile).toContain(
      '/docs/assets/page-metafiles/ai/pages/',
    );
    expect(chunkReference?.reportFile).toBe(moduleReference?.reportFile);
    expect(chunkReference?.reportId).toBe(moduleReference?.reportId);
  });

  it('sanitizes local absolute filesystem paths before persisting page reports', async () => {
    const outDir = createTempDirectory();
    const cacheDir = createTempDirectory('site-debug-ai-cache-');
    const sourceDir = createTempDirectory('site-debug-ai-source-');
    const pageMetafiles = createPageMetafiles();
    const componentMetric =
      pageMetafiles['/guide/getting-started'].buildMetrics?.components[0];

    if (!componentMetric) {
      throw new Error('Expected component metric to be present in test setup.');
    }

    componentMetric.modules = [
      {
        bytes: 920,
        file: '/docs/assets/chunks/demo-card.js',
        id: '\u0000/Users/alice/Project/docs-islands/packages/vitepress/src/components/DemoCard.tsx?commonjs-module',
        sourcePath:
          '/Users/alice/Project/docs-islands/packages/vitepress/src/components/DemoCard.tsx',
      },
    ];

    writeTextFile(
      path.join(outDir, 'assets/chunks/demo-card.js'),
      'export const DemoCard = () => "demo";',
    );

    await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          groupBy: 'page',
          runs: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
          sourceDir,
          sourceMode: 'read-write',
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            enabled: true,
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        analyzeTarget: async ({ target }) => ({
          detail: 'Generated in test',
          model: 'doubao-test-model',
          result: `analysis:${target.context?.moduleItems?.[0]?.id ?? 'missing'}`,
        }),
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            'claude-code': {
              available: false,
              detail: 'Unavailable in test',
              provider: 'claude-code',
            },
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageMetafiles,
      root: '/Users/alice/Project/docs-islands/packages/vitepress/docs',
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const pageReportFiles = fs.readdirSync(
      path.join(outDir, 'assets/page-metafiles/ai/pages'),
    );
    const sourceReportFiles = fs.readdirSync(path.join(sourceDir, 'pages'));
    const pageReport = JSON.parse(
      fs.readFileSync(
        path.join(outDir, 'assets/page-metafiles/ai/pages', pageReportFiles[0]),
        'utf8',
      ),
    ) as {
      prompt: string;
      result: string;
      target: {
        context?: {
          moduleItems?: {
            id: string;
          }[];
        };
      };
    };
    const sourceReport = JSON.parse(
      fs.readFileSync(
        path.join(sourceDir, 'pages', sourceReportFiles[0]),
        'utf8',
      ),
    ) as {
      prompt: string;
      result: string;
      target: {
        context?: {
          moduleItems?: {
            id: string;
          }[];
        };
      };
    };

    expect(pageReport.prompt).not.toContain('/Users/alice/');
    expect(pageReport.result).not.toContain('/Users/alice/');
    expect(pageReport.target.context?.moduleItems?.[0]?.id).not.toContain(
      '/Users/alice/',
    );
    expect(pageReport.target.context?.moduleItems?.[0]?.id).toContain(
      '/src/components/DemoCard.tsx?commonjs-module',
    );
    expect(sourceReport.prompt).not.toContain('/Users/alice/');
    expect(sourceReport.result).not.toContain('/Users/alice/');
    expect(sourceReport.target.context?.moduleItems?.[0]?.id).toContain(
      '/src/components/DemoCard.tsx?commonjs-module',
    );
  });

  it('deduplicates shared chunk and module metrics in page-grouped prompts', async () => {
    const outDir = createTempDirectory();
    const cacheDir = createTempDirectory('site-debug-ai-cache-');
    const pageMetafiles: Record<string, PageMetafile> = {
      '/guide/shared-runtime': {
        buildMetrics: {
          components: [
            {
              componentName: 'AlphaCard',
              entryFile: '/docs/assets/chunks/alpha.js',
              estimatedAssetBytes: 0,
              estimatedCssBytes: 0,
              estimatedJsBytes: 350,
              estimatedTotalBytes: 350,
              files: [
                {
                  bytes: 100,
                  file: '/docs/assets/chunks/shared-runtime.js',
                  type: 'js',
                },
                {
                  bytes: 250,
                  file: '/docs/assets/chunks/alpha.js',
                  type: 'js',
                },
              ],
              framework: 'react',
              modules: [
                {
                  bytes: 100,
                  file: '/docs/assets/chunks/shared-runtime.js',
                  id: '/node_modules/react/jsx-runtime.js',
                },
                {
                  bytes: 250,
                  file: '/docs/assets/chunks/alpha.js',
                  id: '/src/components/AlphaCard.tsx',
                },
              ],
              renderDirectives: [],
              sourcePath: '/repo/src/components/AlphaCard.tsx',
            },
            {
              componentName: 'BetaCard',
              entryFile: '/docs/assets/chunks/beta.js',
              estimatedAssetBytes: 0,
              estimatedCssBytes: 0,
              estimatedJsBytes: 400,
              estimatedTotalBytes: 400,
              files: [
                {
                  bytes: 100,
                  file: '/docs/assets/chunks/shared-runtime.js',
                  type: 'js',
                },
                {
                  bytes: 300,
                  file: '/docs/assets/chunks/beta.js',
                  type: 'js',
                },
              ],
              framework: 'react',
              modules: [
                {
                  bytes: 100,
                  file: '/docs/assets/chunks/shared-runtime.js',
                  id: '/node_modules/react/jsx-runtime.js',
                },
                {
                  bytes: 300,
                  file: '/docs/assets/chunks/beta.js',
                  id: '/src/components/BetaCard.tsx',
                },
              ],
              renderDirectives: [],
              sourcePath: '/repo/src/components/BetaCard.tsx',
            },
          ],
          framework: 'react',
          loader: null,
          spaSyncEffects: null,
          ssrInject: null,
          totalEstimatedComponentBytes: 750,
        },
        cssBundlePaths: [],
        loaderScript: '',
        modulePreloads: [],
        pathname: '/guide/shared-runtime',
        ssrInjectScript: '',
      },
    };

    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          groupBy: 'page',
          runs: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            enabled: true,
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            'claude-code': {
              available: false,
              detail: 'Unavailable in test',
              provider: 'claude-code',
            },
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(analyzeTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          artifactKind: 'page-build',
          bytes: 650,
          context: expect.objectContaining({
            artifactHeaderItems: expect.arrayContaining([
              expect.objectContaining({
                label: 'Chunk Resources',
                value: '3',
              }),
              expect.objectContaining({
                label: 'Module Sources',
                value: '3',
              }),
            ]),
            bundleSummaryItems: expect.arrayContaining([
              expect.objectContaining({
                label: 'Total',
                value: '650 B',
              }),
              expect.objectContaining({
                label: 'JS',
                value: '650 B',
              }),
            ]),
            chunkResourceItems: expect.arrayContaining([
              expect.objectContaining({
                file: '/docs/assets/chunks/shared-runtime.js',
                size: '100 B',
              }),
            ]),
            moduleItems: expect.arrayContaining([
              expect.objectContaining({
                file: '/docs/assets/chunks/shared-runtime.js',
                id: '/node_modules/react/jsx-runtime.js',
                renderedSize: '100 B',
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('only includes pages with docs-islands component build metrics in page-grouped analysis', async () => {
    const outDir = createTempDirectory();
    const cacheDir = createTempDirectory('site-debug-ai-cache-');
    const pageMetafiles = {
      ...createPageMetafiles(),
      '/guide/plain-page': {
        buildMetrics: {
          components: [],
          framework: 'react',
          loader: null,
          spaSyncEffects: null,
          ssrInject: null,
          totalEstimatedComponentBytes: 0,
        },
        cssBundlePaths: [],
        loaderScript: '',
        modulePreloads: [],
        pathname: '/guide/plain-page',
        ssrInjectScript: '',
      } satisfies PageMetafile,
    };

    writeTextFile(
      path.join(outDir, 'assets/chunks/demo-card.js'),
      'export const DemoCard = () => "demo";',
    );
    writeTextFile(
      path.join(outDir, 'assets/sources/DemoCard.tsx'),
      'export function DemoCard() { return <div>demo</div>; }',
    );

    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    const result = await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          groupBy: 'page',
          runs: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            enabled: true,
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            'claude-code': {
              available: false,
              detail: 'Unavailable in test',
              provider: 'claude-code',
            },
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(result.generatedReportCount).toBe(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(analyzeTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          artifactKind: 'page-build',
          displayPath: '/guide/getting-started',
        }),
      }),
    );
    expect(
      pageMetafiles['/guide/plain-page'].buildMetrics?.components[0]?.aiReports,
    ).toBeUndefined();
  });

  it('generates page-grouped reports for docs-islands pages that only expose spa-sync page signals', async () => {
    const outDir = createTempDirectory();
    const cacheDir = createTempDirectory('site-debug-ai-cache-');
    const pageMetafiles = {
      '/guide/site-debug-console': createSpaSyncOnlyPageMetafile(),
    };

    writeTextFile(
      path.join(outDir, 'assets/unified-loader.js'),
      'export const loader = () => "loader";',
    );
    writeTextFile(
      path.join(outDir, 'assets/SiteDebugConsoleDocs.js'),
      'export const docs = () => "docs";',
    );
    writeTextFile(
      path.join(outDir, 'assets/site-debug-console.css'),
      '.site-debug-console { color: var(--vp-c-brand-1); }',
    );

    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    const result = await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          groupBy: 'page',
          runs: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            enabled: true,
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            'claude-code': {
              available: false,
              detail: 'Unavailable in test',
              provider: 'claude-code',
            },
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(result.generatedReportCount).toBe(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(analyzeTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          artifactKind: 'page-build',
          displayPath: '/guide/site-debug-console',
          context: expect.objectContaining({
            artifactHeaderItems: expect.arrayContaining([
              expect.objectContaining({
                label: 'Module Preloads',
                value: '1',
              }),
              expect.objectContaining({
                label: 'CSS Bundles',
                value: '1',
              }),
              expect.objectContaining({
                label: 'Embedded HTML',
                value: '4.1 KB',
              }),
            ]),
            liveContextItems: expect.arrayContaining([
              expect.objectContaining({
                label: 'Enabled Renders',
                value: '1',
              }),
            ]),
          }),
        }),
      }),
    );
    expect(
      pageMetafiles['/guide/site-debug-console'].buildMetrics?.aiReports,
    ).toEqual([
      expect.objectContaining({
        provider: 'doubao',
        reportFile: expect.stringContaining(
          '/docs/assets/page-metafiles/ai/pages/site-debug-console.',
        ),
      }),
    ]);
  });

  it('writes git-tracked reports in read-write mode and reuses them in read-only mode', async () => {
    const sourceDir = createTempDirectory('site-debug-ai-source-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const firstCacheDir = createTempDirectory('site-debug-ai-cache-');
    const secondCacheDir = createTempDirectory('site-debug-ai-cache-');
    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    const firstResult = await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          groupBy: 'page',
          runs: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
          sourceDir,
          sourceMode: 'read-write',
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            enabled: true,
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: firstCacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            'claude-code': {
              available: false,
              detail: 'Unavailable in test',
              provider: 'claude-code' as const,
            },
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: firstOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const secondResult = await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          groupBy: 'page',
          runs: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
          sourceDir,
          sourceMode: 'read-only',
        },
        providers: {
          doubao: {
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: secondCacheDir,
      dependencies: {
        analyzeTarget: vi.fn(async () => {
          throw new Error('read-only source reports should be reused');
        }),
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            'claude-code': {
              available: false,
              detail: 'Unavailable in test',
              provider: 'claude-code' as const,
            },
            doubao: {
              available: false,
              detail: 'Provider should not be needed when source reports exist',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: secondOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(firstResult.generatedReportCount).toBe(1);
    expect(firstResult.reusedReportCount).toBe(0);
    expect(secondResult.generatedReportCount).toBe(0);
    expect(secondResult.reusedReportCount).toBe(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(path.join(sourceDir, 'pages'))).toHaveLength(1);
  });

  it('skips missing git-tracked reports in read-only mode without calling providers', async () => {
    const outDir = createTempDirectory();
    const pageMetafiles = createPageMetafiles();
    const analyzeTarget = vi.fn(async ({ target }) => ({
      detail: 'should not run',
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    writeTextFile(
      path.join(outDir, 'assets/chunks/demo-card.js'),
      'export const DemoCard = () => "demo";',
    );
    writeTextFile(
      path.join(outDir, 'assets/sources/DemoCard.tsx'),
      'export function DemoCard() { return <div>demo</div>; }',
    );

    const result = await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          groupBy: 'page',
          runs: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
          sourceDir: createTempDirectory('site-debug-ai-source-'),
          sourceMode: 'read-only',
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            enabled: true,
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: createTempDirectory('site-debug-ai-cache-'),
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            'claude-code': {
              available: false,
              detail: 'Unavailable in test',
              provider: 'claude-code' as const,
            },
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir,
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(result.generatedReportCount).toBe(0);
    expect(result.reusedReportCount).toBe(0);
    expect(result.skippedReason).toContain('Missing committed build report');
    expect(analyzeTarget).not.toHaveBeenCalled();
    expect(
      pageMetafiles['/guide/getting-started'].buildMetrics?.components[0]
        .aiReports,
    ).toBeUndefined();
  });

  it('reuses cached reports by default when cache is omitted, equivalent to cache: true', async () => {
    const cacheDir = createTempDirectory('site-debug-ai-cache-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));
    const dependencies = {
      analyzeTarget,
      resolveCapabilities: async () => ({
        ok: true as const,
        providers: {
          'claude-code': {
            available: false,
            detail: 'Unavailable in test',
            provider: 'claude-code' as const,
          },
          doubao: {
            available: true,
            detail: 'Available in test',
            model: 'doubao-test-model',
            provider: 'doubao' as const,
          },
        },
      }),
    };

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    const firstResult = await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          runs: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            enabled: true,
            model: 'doubao-test-model',
            temperature: 0.2,
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies,
      outDir: firstOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });
    const secondPageMetafiles = createPageMetafiles();
    const secondResult = await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          runs: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'another-key',
            enabled: true,
            model: 'doubao-test-model',
            temperature: 0.2,
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        ...dependencies,
        analyzeTarget: vi.fn(async () => {
          throw new Error('cache should be reused');
        }),
      },
      outDir: secondOutDir,
      pageMetafiles: secondPageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(firstResult.generatedReportCount).toBe(2);
    expect(firstResult.executionCount).toBe(1);
    expect(firstResult.providers).toEqual(['doubao']);
    expect(firstResult.reusedReportCount).toBe(0);
    expect(analyzeTarget).toHaveBeenCalledTimes(2);
    expect(secondResult.generatedReportCount).toBe(0);
    expect(secondResult.executionCount).toBe(1);
    expect(secondResult.providers).toEqual(['doubao']);
    expect(secondResult.reusedReportCount).toBe(2);
    expect(
      secondPageMetafiles['/guide/getting-started'].buildMetrics?.components[0]
        .aiReports?.chunkReports?.['/docs/assets/chunks/demo-card.js']?.[0]
        ?.reportFile,
    ).toContain('/docs/assets/page-metafiles/ai/chunks/');
  });

  it('bypasses cached reports when cache is disabled', async () => {
    const cacheDir = createTempDirectory('site-debug-ai-cache-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const analyzeTarget = vi
      .fn()
      .mockImplementationOnce(async ({ target }) => ({
        detail: 'initial run',
        model: 'doubao-test-model',
        result: `first:${target.displayPath}`,
      }))
      .mockImplementationOnce(async ({ target }) => ({
        detail: 'initial run',
        model: 'doubao-test-model',
        result: `first:${target.displayPath}`,
      }))
      .mockImplementationOnce(async ({ target }) => ({
        detail: 'forced rerun',
        model: 'doubao-test-model',
        result: `forced:${target.displayPath}`,
      }))
      .mockImplementationOnce(async ({ target }) => ({
        detail: 'forced rerun',
        model: 'doubao-test-model',
        result: `forced:${target.displayPath}`,
      }));
    const dependencies = {
      analyzeTarget,
      resolveCapabilities: async () => ({
        ok: true as const,
        providers: {
          'claude-code': {
            available: false,
            detail: 'Unavailable in test',
            provider: 'claude-code' as const,
          },
          doubao: {
            available: true,
            detail: 'Available in test',
            model: 'doubao-test-model',
            provider: 'doubao' as const,
          },
        },
      }),
    };

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          runs: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            enabled: true,
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies,
      outDir: firstOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const forcedResult = await generateSiteDebugAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: false,
          runs: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            enabled: true,
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies,
      outDir: secondOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(analyzeTarget).toHaveBeenCalledTimes(4);
    expect(forcedResult.generatedReportCount).toBe(2);
    expect(forcedResult.executionCount).toBe(1);
    expect(forcedResult.providers).toEqual(['doubao']);
    expect(forcedResult.reusedReportCount).toBe(0);
  });
});
