/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { REACT_RUNTIME_EXTERNALIZATION_PLUGIN_NAME } from '../plugin-names';

vi.mock('@vitejs/plugin-react-swc', () => ({
  default: vi.fn(() => ({
    name: 'mock-react-swc',
  })),
}));

describe('reactAdapter', () => {
  it('keeps build adapter responsibilities focused on bundling and SSR helpers', async () => {
    const { reactAdapter } = await import('../adapter');

    expect('generateDevRuntime' in reactAdapter).toBe(false);
    expect('constants' in reactAdapter).toBe(false);
    expect(
      reactAdapter
        .browserBundlerPlugins()
        .some(
          (plugin) => plugin.name === REACT_RUNTIME_EXTERNALIZATION_PLUGIN_NAME,
        ),
    ).toBe(true);
  });
});
