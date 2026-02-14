/**
 * @vitest-environment node
 */
import { RENDER_STRATEGY_CONSTANTS } from '#shared/constants';
import { describe, expect, it, vi } from 'vitest';
import coreTransformComponentTags, { travelImports } from '../transform';

vi.mock('#shared/logger', () => ({
  default: {
    getLoggerByGroup: () => ({
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

const attrNames = {
  renderId: RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
  renderDirective: RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
  renderComponent: RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
  renderWithSpaSync: RENDER_STRATEGY_CONSTANTS.renderWithSpaSync.toLowerCase(),
};

describe('coreTransformComponentTags', () => {
  it('transforms self-closing component with default ssr:only and spa:sr true', () => {
    const code = `# Title\n\n<HelloWorld />\n`;
    const { code: out, renderIdToRenderDirectiveMap } =
      coreTransformComponentTags(
        code,
        ['HelloWorld'],
        '/docs/index.md',
        attrNames,
      );

    expect(out).toMatch(/<div.*__render_component__="HelloWorld"/s);
    expect(out).toContain(`${attrNames.renderDirective}="ssr:only"`);
    expect(out).toContain(`${attrNames.renderWithSpaSync}="true"`);
    expect(renderIdToRenderDirectiveMap.size).toBe(1);

    // renderId should be 8 hex characters.
    const id = [...renderIdToRenderDirectiveMap.keys()][0];
    expect(id).toMatch(/^[\da-f]{8}$/i);
  });

  it('client:only does not support spa:sr', () => {
    const codeDefault = `# Title

<HelloWorld client:only />`;
    const { code: out } = coreTransformComponentTags(
      codeDefault,
      ['HelloWorld'],
      '/docs/index.md',
      attrNames,
    );

    expect(out).toContain(`${attrNames.renderDirective}="client:only"`);
    expect(out).toContain(`${attrNames.renderWithSpaSync}="false"`);

    const codeWithSpaSr = `# Title

<HelloWorld client:only spa:sr />`;
    const { code: out2 } = coreTransformComponentTags(
      codeWithSpaSr,
      ['HelloWorld'],
      '/docs/guide.md',
      attrNames,
    );

    expect(out2).toContain(`${attrNames.renderDirective}="client:only"`);
    expect(out2).toContain(`${attrNames.renderWithSpaSync}="false"`);
  });

  it('disables spa:sr when spa:sr:disable is set for ssr:only default', () => {
    const codeDefault = `# Title

<HelloWorld />`;
    const { code: outDefault } = coreTransformComponentTags(
      codeDefault,
      ['HelloWorld'],
      '/docs/guide.md',
      attrNames,
    );

    expect(outDefault).toContain(`${attrNames.renderDirective}="ssr:only"`);
    expect(outDefault).toContain(`${attrNames.renderWithSpaSync}="true"`);

    const codeWithSpaSrDisable = `# Title

<HelloWorld spa:sr:disable />`;
    const { code: outWithSpaSrDisable } = coreTransformComponentTags(
      codeWithSpaSrDisable,
      ['HelloWorld'],
      '/docs/guide.md',
      attrNames,
    );

    expect(outWithSpaSrDisable).toContain(
      `${attrNames.renderDirective}="ssr:only"`,
    );
    expect(outWithSpaSrDisable).toContain(
      `${attrNames.renderWithSpaSync}="false"`,
    );
  });

  it('keeps user props on transformed container and excludes strategy attrs', () => {
    const code = `# Title

<HelloWorld client:load title="Hi" data-id="x" />`;
    const { code: out } = coreTransformComponentTags(
      code,
      ['HelloWorld'],
      '/docs/props.md',
      attrNames,
    );

    expect(out).toMatch(/title="Hi"/);
    expect(out).toMatch(/data-id="x"/);
    // Should include our internal attrs too
    expect(out).toContain(attrNames.renderId);
    expect(out).toContain(attrNames.renderComponent);
  });

  it('escapes user props with HTML-safe encoding for attribute values', () => {
    const code = `# Title

<HelloWorld title='He said "hello" & goodbye' description="it's fine" />`;
    const { code: out } = coreTransformComponentTags(
      code,
      ['HelloWorld'],
      '/docs/escape-props.md',
      attrNames,
    );

    expect(out).toContain('title="He said &quot;hello&quot; &amp; goodbye"');
    expect(out).toContain('description="it&#39;s fine"');
    expect(out).not.toContain('\\"');
  });

  it('transforms multiline self-closing component tags parsed as html_inline', () => {
    const code = `<HelloWorld
  client:only
  uniqueid="escape-attr-e2e"
  title='He said "hello" & goodbye'
  data-note="it's fine"
/>`;

    const { code: out, renderIdToRenderDirectiveMap } =
      coreTransformComponentTags(
        code,
        ['HelloWorld'],
        '/docs/escaped-props-inline.md',
        attrNames,
      );

    expect(renderIdToRenderDirectiveMap.size).toBe(1);
    expect(out).toContain(`${attrNames.renderDirective}="client:only"`);
    expect(out).toContain('uniqueid="escape-attr-e2e"');
    expect(out).toContain('title="He said &quot;hello&quot; &amp; goodbye"');
    expect(out).toContain('data-note="it&#39;s fine"');
    expect(out).not.toContain('<helloworld');
  });

  it('skips non self-closing tags and leaves original markup', () => {
    const code = `# Title

<HelloWorld></HelloWorld>`;
    const { code: out, renderIdToRenderDirectiveMap } =
      coreTransformComponentTags(
        code,
        ['HelloWorld'],
        '/docs/fail.md',
        attrNames,
      );
    expect(out).toContain('<HelloWorld></HelloWorld>');
    expect(renderIdToRenderDirectiveMap.size).toBe(0);
  });

  it('enforces component tag name to match imported local name (case sensitive)', () => {
    const code = `
      # Title

      <Helloworld />
    `;
    const { code: out, renderIdToRenderDirectiveMap } =
      coreTransformComponentTags(
        code,
        ['HelloWorld'],
        '/docs/case.md',
        attrNames,
      );
    // Not transformed due to case mismatch.
    expect(out).toContain('<Helloworld />');
    expect(renderIdToRenderDirectiveMap.size).toBe(0);
  });

  describe('Windows CI specific fixes', () => {
    it('handles multiple components without empty lines (Windows CI issue)', () => {
      // This mimics the exact scenario that failed in Windows CI
      const code =
        '<HelloWorld invalid:directive uniqueId="invalid-directive" />\n<HelloWorld client:invalid uniqueId="client-invalid" />';
      const { code: out, renderIdToRenderDirectiveMap } =
        coreTransformComponentTags(
          code,
          ['HelloWorld'],
          '/error-handling/invalid-directive.md',
          attrNames,
        );

      // Both components should be transformed successfully
      expect(renderIdToRenderDirectiveMap.size).toBe(2);

      // Check that both components got converted to div elements
      const divMatches = out.match(/<div.*?><\/div>/gs);
      expect(divMatches).toHaveLength(2);

      // Verify both unique IDs are preserved
      expect(out).toContain('uniqueId="invalid-directive"');
      expect(out).toContain('uniqueId="client-invalid"');

      // Both should default to ssr:only due to invalid directives
      expect(out).toMatch(
        new RegExp(`${attrNames.renderDirective}="ssr:only"`, 'g'),
      );
    });

    it('correctly handles CRLF line endings (Windows line endings)', () => {
      const codeWithCRLF =
        '# Title\r\n\r\n<HelloWorld prop="value" />\r\n<TestComponent />\r\n';
      const { code: out, renderIdToRenderDirectiveMap } =
        coreTransformComponentTags(
          codeWithCRLF,
          ['HelloWorld', 'TestComponent'],
          '/docs/windows-line-endings.md',
          attrNames,
        );

      // Both components should be processed correctly despite CRLF endings
      expect(renderIdToRenderDirectiveMap.size).toBe(2);

      // Verify line offset calculations work correctly with CRLF
      const divMatches = out.match(/<div.*?><\/div>/gs);
      expect(divMatches).toHaveLength(2);
    });

    it('handles position adjustments with leading whitespace', () => {
      // Test case where leading whitespace affects positions
      // Use HTML blocks that MarkdownIt will actually parse as HTML
      const codeWithWhitespace = `<HelloWorld />
    <HelloWorld attr="value" />`;

      const { code: out, renderIdToRenderDirectiveMap } =
        coreTransformComponentTags(
          codeWithWhitespace,
          ['HelloWorld'],
          '/docs/whitespace-positions.md',
          attrNames,
        );

      // Both components should be transformed despite leading whitespace
      expect(renderIdToRenderDirectiveMap.size).toBe(2);

      // Verify the original indentation structure is preserved for the second component
      expect(out).toMatch(/\s+<div.*?HelloWorld.*?><\/div>/s);
    });

    it('correctly sorts components by absolute positions (not relative)', () => {
      // This test ensures the sorting fix works - components should be processed in reverse order
      const code =
        '<FirstComponent />\n<SecondComponent />\n<ThirdComponent />';
      const { code: out } = coreTransformComponentTags(
        code,
        ['FirstComponent', 'SecondComponent', 'ThirdComponent'],
        '/docs/sorting-test.md',
        attrNames,
      );

      // All components should be transformed
      const divMatches = out.match(/<div.*?><\/div>/gs);
      expect(divMatches).toHaveLength(3);

      // The transformation should maintain the original order in the output
      const firstDivIndex = out.indexOf('<div');
      const lastDivIndex = out.lastIndexOf('</div>');
      expect(firstDivIndex).toBeLessThan(lastDivIndex);
    });

    it('handles complex tag boundary detection for self-closing components', () => {
      // Test the improved tag boundary detection logic
      // Simplified to avoid MarkdownIt parsing issues
      const code = `<HelloWorld prop="value" />
<HelloWorld booleanProp />`;

      const { code: out, renderIdToRenderDirectiveMap } =
        coreTransformComponentTags(
          code,
          ['HelloWorld'],
          '/docs/complex-boundaries.md',
          attrNames,
        );

      // Both components should be correctly identified and transformed
      expect(renderIdToRenderDirectiveMap.size).toBe(2);

      // Verify props are preserved correctly
      expect(out).toContain('prop="value"');
      expect(out).toContain('booleanProp');
    });

    it('maintains component processing order consistency across platforms', () => {
      // Regression test to ensure the fix works consistently
      const problematicCode =
        '<HelloWorld invalid:directive uniqueId="first" />\n<HelloWorld client:invalid uniqueId="second" />';

      // Run the transformation multiple times to check consistency
      const results = Array.from({ length: 5 }, () =>
        coreTransformComponentTags(
          problematicCode,
          ['HelloWorld'],
          '/test/consistency.md',
          attrNames,
        ),
      );

      // All runs should produce the same number of processed components
      for (const { renderIdToRenderDirectiveMap } of results) {
        expect(renderIdToRenderDirectiveMap.size).toBe(2);
      }

      // All runs should produce the same output structure
      const firstOutput = results[0].code;
      for (const { code } of results.slice(1)) {
        expect(code.match(/<div/g)?.length).toBe(
          firstOutput.match(/<div/g)?.length,
        );
      }
    });
  });
});

describe('travelImports', () => {
  it('parses named, default and namespace imports', () => {
    const codeDefault = `import React from 'react'`;
    const codeNamed = `import { useState as useS, useEffect } from 'react'`;
    const codeNamespace = `import * as ReactDOM from 'react-dom/client'`;

    const resDefault = travelImports(codeDefault)!;
    const resNamed = travelImports(codeNamed)!;
    const resNamespace = travelImports(codeNamespace)!;

    expect(resDefault).toEqual([
      { importedName: 'default', localName: 'React' },
    ]);
    expect(resNamed).toEqual(
      expect.arrayContaining([
        { importedName: 'useState', localName: 'useS' },
        { importedName: 'useEffect', localName: 'useEffect' },
      ]),
    );
    expect(resNamespace).toEqual([
      { importedName: '*', localName: 'ReactDOM' },
    ]);
  });
});
