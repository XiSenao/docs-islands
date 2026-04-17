import type { ConfigType } from '#dep-types/utils';
import { resolveConfig } from '#shared/config';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'pathe';
import { afterAll, describe, expect, it } from 'vitest';
import { reactAdapter } from '../../adapters/react/adapter';
import { buildUIFrameworkIntegrationInMPA } from '../buildUIFrameworkIntegrationInMPA';

const resolveMockConfig = (config: ConfigType) => {
  const root = dirname(fileURLToPath(import.meta.url));
  const cacheDir = join(root, 'dist/.cache');
  const outDir = join(
    root,
    'dist/build-ui-framework-integration-in-mpa-outputs',
  );
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

  return {
    ...config,
    root,
    cacheDir,
    outDir,
    srcDir: sourceDir,
    publicDir,
  };
};

describe('buildUIFrameworkIntegrationInMPA', () => {
  const defaultConfig = resolveConfig({});
  const config = resolveMockConfig(defaultConfig);

  afterAll(() => {
    if (fs.existsSync(config.outDir)) {
      fs.rmSync(config.outDir, { recursive: true, force: true });
    }
  });

  it('builds the framework integration runtime successfully in MPA mode', async () => {
    const { entryPoint, modulePreloads } =
      await buildUIFrameworkIntegrationInMPA(config, reactAdapter);

    const expectedAssets = [entryPoint, ...modulePreloads].filter(Boolean);
    expect(expectedAssets.length).toBeGreaterThan(0);

    for (const assetPath of expectedAssets) {
      const fullPath = join(config.outDir, assetPath);
      expect(fs.existsSync(fullPath), `${fullPath} should exist`).toBe(true);
    }

    const entryPath = join(config.outDir, entryPoint);
    // The module should now load successfully in the Node.js environment.
    const module = await import(entryPath);
    expect(module).toBeDefined();
    expect(typeof module).toBe('object');
  });
});
