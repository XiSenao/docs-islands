import type {
  ComponentBundleInfo,
  ConfigType,
  UsedSnippetContainerType,
} from '@docs-islands/vitepress-types';
import { resolveConfig } from '@docs-islands/vitepress-utils';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'pathe';
import { afterAll, describe, expect, it } from 'vitest';
import { bundleMultipleComponentsForBrowser } from '../bundleMultipleComponentsForBrowser';

describe('bundleMultipleComponentsForBrowser', () => {
  const defaultConfig = resolveConfig({});
  const resolveMockConfig = (config: ConfigType) => {
    const root = dirname(fileURLToPath(import.meta.url));
    const cacheDir = join(root, 'dist/.cache');
    const outDir = join(root, 'dist/multiple-components-for-browser-outputs');
    const sourceDir = join(root, 'source');
    const publicDir = join(root, 'source/public');

    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    if (!fs.existsSync(sourceDir)) {
      fs.mkdirSync(sourceDir, { recursive: true });
    }
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    return { ...config, root, cacheDir, outDir, srcDir: sourceDir, publicDir };
  };

  const config = resolveMockConfig(defaultConfig);
  const reactComponentSource = join(
    config.srcDir,
    '/rendering-strategy-comps/react',
  );

  const clientComponents: ComponentBundleInfo[] = [
    {
      componentName: 'Landing',
      componentPath: join(reactComponentSource, 'Landing.tsx'),
      importReference: {
        importedName: 'Landing',
        identifier: join(reactComponentSource, 'Landing.tsx'),
      },
      pendingRenderIds: new Set(['8b05459e']),
      renderDirectives: new Set(['client:load']),
    },
    {
      componentName: 'ReactComp2',
      componentPath: join(reactComponentSource, 'ReactComp2.tsx'),
      importReference: {
        importedName: 'ReactComp2',
        identifier: join(reactComponentSource, 'ReactComp2.tsx'),
      },
      pendingRenderIds: new Set(['ac62f9f7']),
      renderDirectives: new Set(['ssr:only']),
    },
    {
      componentName: 'ReactComp3',
      componentPath: join(reactComponentSource, 'ReactComp3.tsx'),
      importReference: {
        importedName: 'default',
        identifier: join(reactComponentSource, 'ReactComp3.tsx'),
      },
      pendingRenderIds: new Set(['af2c1304']),
      renderDirectives: new Set(['client:load']),
    },
    {
      componentName: 'ReactComp4',
      componentPath: join(reactComponentSource, 'ReactComp4.tsx'),
      importReference: {
        importedName: 'default',
        identifier: join(reactComponentSource, 'ReactComp4.tsx'),
      },
      pendingRenderIds: new Set(['59f81efc']),
      renderDirectives: new Set(['client:visible']),
    },
  ];
  const usedSnippetContainer = new Map<string, UsedSnippetContainerType>([
    [
      '8b05459e',
      {
        props: new Map([]),
        renderId: '8b05459e',
        renderDirective: 'client:load',
        renderComponent: 'Landing',
        ssrHtml: '...',
        useSpaSyncRender: true,
      },
    ],
    [
      'ac62f9f7',
      {
        props: new Map([['render-strategy', 'ssr:only']]),
        renderId: 'ac62f9f7',
        renderDirective: 'ssr:only',
        renderComponent: 'ReactComp2',
        ssrHtml: '...',
        useSpaSyncRender: true,
      },
    ],
    [
      'af2c1304',
      {
        props: new Map([['render-strategy', 'client:load']]),
        renderId: 'af2c1304',
        renderDirective: 'client:load',
        renderComponent: 'ReactComp3',
        ssrHtml: '...',
        useSpaSyncRender: true,
      },
    ],
    [
      '59f81efc',
      {
        props: new Map([['render-strategy', 'client:visible']]),
        renderId: '59f81efc',
        renderDirective: 'client:visible',
        renderComponent: 'ReactComp4',
        ssrHtml:
          '<div class="react-comp4-demo"><strong>4: Rendering Strategy: client:visible</strong><ol><li><strong>Component Name:</strong> <span>ReactComp4</span></li><li><strong>Page Title:</strong> <span>Rendering Strategy</span></li><li><button style="padding:5px;border-radius:8px;font-size:14px;margin-right:8px;background-color:#56a8ab;color:#9ee2d3;border:none" type="button">Click Me!</button><strong>Pre-rendering Client Visible Hydration Mode, React Instance Count:</strong> <span>0</span></li></ol></div>',
        useSpaSyncRender: false,
      },
    ],
  ]);

  afterAll(() => {
    if (fs.existsSync(config.outDir)) {
      fs.rmSync(config.outDir, { recursive: true, force: true });
    }
  });

  it('should correctly bundle browser assets and validate their contents', async () => {
    const { loaderScript, modulePreloads, cssBundlePaths, ssrInjectScript } =
      await bundleMultipleComponentsForBrowser(
        config,
        clientComponents,
        usedSnippetContainer,
      );

    const allBundlePaths = [
      loaderScript,
      ...modulePreloads,
      ...cssBundlePaths,
      ssrInjectScript,
    ].filter(Boolean);

    expect(
      allBundlePaths.length,
      'Should generate some bundle files',
    ).toBeGreaterThan(0);

    for (const bundlePath of allBundlePaths) {
      const fullPath = join(config.outDir, bundlePath);
      expect(
        fs.existsSync(fullPath),
        `Asset file should exist at: ${fullPath}`,
      ).toBe(true);
    }

    expect(
      cssBundlePaths.length,
      'CSS bundle paths should not be empty',
    ).toBeGreaterThan(0);

    expect(
      typeof ssrInjectScript,
      'ssrInjectScript should be a string path',
    ).toBe('string');
    const fullSsrInjectScriptPath = join(config.outDir, ssrInjectScript);
    const ssrInjectScriptContent = fs.readFileSync(
      fullSsrInjectScriptPath,
      'utf8',
    );

    const checkInjectSSR = [...usedSnippetContainer.values()].filter(
      (usedSnippet) => usedSnippet.ssrHtml && !usedSnippet.useSpaSyncRender,
    );

    expect(
      checkInjectSSR.length,
      'There should be components to check for SSR injection',
    ).toBeGreaterThan(0);
    for (const usedSnippet of checkInjectSSR) {
      expect(
        ssrInjectScriptContent,
        `ssrInjectScript should contain the HTML for renderId ${usedSnippet.renderId}`,
      ).to.include(usedSnippet.ssrHtml as string);
    }

    expect(typeof loaderScript, 'loaderScript should be a string path').toBe(
      'string',
    );
    const fullLoaderScriptPath = join(config.outDir, loaderScript);
    const loaderScriptContent = fs.readFileSync(fullLoaderScriptPath, 'utf8');

    const clientComponentNames = clientComponents
      .filter(
        (component) =>
          !(
            component.renderDirectives.has('ssr:only') &&
            component.renderDirectives.size === 1
          ) && component.pendingRenderIds.size > 0,
      )
      .map((component) => component.componentName);

    expect(
      clientComponentNames.length,
      'There should be client component names to check in loader script',
    ).toBeGreaterThan(0);
    for (const componentName of clientComponentNames) {
      expect(
        loaderScriptContent,
        `loaderScript should include the component name: ${componentName}`,
      ).to.include(componentName);
    }
  });
});
