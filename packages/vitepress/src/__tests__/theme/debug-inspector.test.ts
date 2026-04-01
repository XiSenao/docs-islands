import {
  createMetafileLookup,
  getBuildMetricForRender,
  type PageMetafile,
} from '../../../theme/debug-inspector';

describe('debug-inspector build metric lookup', () => {
  const partialLandingMetric = {
    componentName: 'Landing',
    estimatedAssetBytes: 128,
    estimatedCssBytes: 1426,
    estimatedJsBytes: 4096,
    estimatedTotalBytes: 5650,
    files: [
      {
        bytes: 1426,
        file: '/docs-islands/vitepress/assets/Landing.Cvl0mg3D.css',
        type: 'css' as const,
      },
      {
        bytes: 128,
        file: '/docs-islands/vitepress/assets/react.CHdo91hT.svg',
        type: 'asset' as const,
      },
    ],
    modules: [],
  };

  const fullLandingMetric = {
    ...partialLandingMetric,
    modules: [
      {
        bytes: 1426,
        file: '/docs-islands/vitepress/assets/Landing.Cvl0mg3D.css',
        id: '.vitepress/cache/browser-component-entries/Landing.tsx',
        sourceAssetFile:
          '/docs-islands/vitepress/assets/debug-sources/Landing.tsx',
        sourcePath: '.vitepress/cache/browser-component-entries/Landing.tsx',
      },
      {
        bytes: 810,
        file: '/docs-islands/vitepress/assets/Landing.Cvl0mg3D.css',
        id: '/docs/Landing/src/App.css',
        sourceAssetFile: '/docs-islands/vitepress/assets/debug-sources/App.css',
        sourcePath: '/docs/Landing/src/App.css',
      },
      {
        bytes: 128,
        file: '/docs-islands/vitepress/assets/react.CHdo91hT.svg',
        id: 'docs/Landing/src/assets/react.svg',
        sourceAssetFile:
          '/docs-islands/vitepress/assets/debug-sources/react.svg',
        sourcePath: 'docs/Landing/src/assets/react.svg',
      },
    ],
  };

  it('prefers richer component metrics for component-name fallback', () => {
    const partialPageMetafile: PageMetafile = {
      buildMetrics: {
        components: [partialLandingMetric],
        totalEstimatedComponentBytes: partialLandingMetric.estimatedTotalBytes,
      },
    };
    const fullPageMetafile: PageMetafile = {
      buildMetrics: {
        components: [fullLandingMetric],
        totalEstimatedComponentBytes: fullLandingMetric.estimatedTotalBytes,
      },
    };

    const lookup = createMetafileLookup({
      allPageMetafiles: [partialPageMetafile, fullPageMetafile],
      currentPageMetafile: partialPageMetafile,
    });

    expect(
      getBuildMetricForRender(lookup, 'Landing', 'unknown-render-id'),
    ).toBe(fullLandingMetric);
  });

  it('prefers richer component metrics for render-id lookups', () => {
    const partialPageMetafile: PageMetafile = {
      buildMetrics: {
        components: [partialLandingMetric],
        spaSyncEffects: {
          components: [
            {
              blockingCssBytes: 1426,
              blockingCssCount: 1,
              blockingCssFiles: [
                {
                  bytes: 1426,
                  file: '/docs-islands/vitepress/assets/Landing.Cvl0mg3D.css',
                  type: 'css',
                },
              ],
              componentName: 'Landing',
              embeddedHtmlBytes: 0,
              embeddedHtmlPatches: [],
              renderDirectives: ['ssr:only'],
              renderIds: ['landing-render-id'],
              requiresCssLoadingRuntime: false,
            },
          ],
          enabledComponentCount: 1,
          enabledRenderCount: 1,
          totalBlockingCssBytes: 1426,
          totalBlockingCssCount: 1,
          totalEmbeddedHtmlBytes: 0,
          usesCssLoadingRuntime: false,
        },
        totalEstimatedComponentBytes: partialLandingMetric.estimatedTotalBytes,
      },
    };
    const fullPageMetafile: PageMetafile = {
      buildMetrics: {
        components: [fullLandingMetric],
        spaSyncEffects:
          partialPageMetafile.buildMetrics?.spaSyncEffects ?? null,
        totalEstimatedComponentBytes: fullLandingMetric.estimatedTotalBytes,
      },
    };

    const lookup = createMetafileLookup({
      allPageMetafiles: [partialPageMetafile, fullPageMetafile],
      currentPageMetafile: partialPageMetafile,
    });

    expect(
      getBuildMetricForRender(lookup, 'Landing', 'landing-render-id'),
    ).toBe(fullLandingMetric);
  });
});
