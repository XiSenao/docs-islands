import { describe, expect, it } from 'vitest';
import { defineConfig } from '../config';

describe('defineConfig', () => {
  it('returns the explicit user config unchanged', () => {
    const config = defineConfig({
      workspace: {
        internalScopes: ['@example/'],
      },
      pipelines: {
        typecheck: ['paths:check'],
      },
    });

    expect(config.workspace?.internalScopes).toEqual(['@example/']);
    expect(config.pipelines?.typecheck).toEqual(['paths:check']);
  });
});
