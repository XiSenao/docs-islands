import { describe, expect, it } from 'vitest';
import { REACT_FRAMEWORK } from '../framework';
import { ReactRenderController } from '../react-render-controller';

describe('ReactRenderController', () => {
  it('returns empty runtime when the page has no client components', async () => {
    const controller = new ReactRenderController();
    controller.setCompilationContainer(REACT_FRAMEWORK, '/guide/no-react.md', {
      code: '',
      helperCode: '',
      importsByLocalName: new Map(),
      ssrOnlyComponentNames: new Set(),
    });

    await expect(
      controller.generateClientRuntimeInDEV('/guide/no-react.md'),
    ).resolves.toBe('');
  });

  it('emits retryable dev runtime with empty-shell render fallback', async () => {
    const controller = new ReactRenderController();
    controller.setCompilationContainer(REACT_FRAMEWORK, '/guide/react.md', {
      code: `const Demo = () => null;`,
      helperCode: `const __RENDER_INLINE_COMPONENT_REFERENCE__ = { Demo: { component: Demo } };`,
      importsByLocalName: new Map([
        ['Demo', { identifier: '/components/Demo.tsx', importedName: 'Demo' }],
      ]),
      ssrOnlyComponentNames: new Set(),
    });

    const code = await controller.generateClientRuntimeInDEV('/guide/react.md');

    expect(code).toContain('const __MAX_RENDER_ATTEMPTS__ = 10;');
    expect(code).toContain('function __queueRenderRetry__()');
    expect(code).not.toContain('@docs-islands/vitepress/internal/debug');
    expect(code).toContain(
      "renderMode: __hasSsrContent__(dom) ? 'hydrate' : 'render'",
    );
    expect(code).toContain('const renderMode =');
    expect(code).toContain("renderDirective === 'client:only'");
    expect(code).toContain('if (hasPendingTargets) {');
  });

  it('injects siteDebug runtime helpers only when the capability is enabled', async () => {
    const controller = new ReactRenderController({
      enableSiteDebugRuntime: true,
    });
    controller.setCompilationContainer(REACT_FRAMEWORK, '/guide/react.md', {
      code: `const Demo = () => null;`,
      helperCode: `const __RENDER_INLINE_COMPONENT_REFERENCE__ = { Demo: { component: Demo } };`,
      importsByLocalName: new Map([
        ['Demo', { identifier: '/components/Demo.tsx', importedName: 'Demo' }],
      ]),
      ssrOnlyComponentNames: new Set(),
    });

    const code = await controller.generateClientRuntimeInDEV('/guide/react.md');

    expect(code).toContain('@docs-islands/vitepress/internal/debug');
  });
});
