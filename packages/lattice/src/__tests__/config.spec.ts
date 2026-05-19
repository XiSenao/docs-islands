import { describe, expect, it } from 'vitest';
import { defineConfig } from '../config';

describe('defineConfig', () => {
  it('returns the explicit user config unchanged', () => {
    const config = defineConfig({
      workspace: {
        internalScopes: ['@example/'],
      },
      pipelines: {
        typecheck: ['graph:check'],
      },
    });

    expect(config.workspace?.internalScopes).toEqual(['@example/']);
    expect(config.pipelines?.typecheck).toEqual(['graph:check']);
  });
});
