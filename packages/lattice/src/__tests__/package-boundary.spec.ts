import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditPublishedPackageBoundaries } from '../commands/package-boundary';

async function createDistPackage(files: Record<string, string>): Promise<{
  cleanup: () => Promise<void>;
  distDir: string;
}> {
  const distDir = await mkdtemp(path.join(tmpdir(), 'lattice-boundary-'));

  await writeFile(
    path.join(distDir, 'package.json'),
    JSON.stringify({
      name: '@example/pkg',
      exports: {
        '.': './index.js',
      },
      dependencies: {
        '@example/dep': '1.0.0',
      },
    }),
  );

  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = path.join(distDir, relativePath);

    await writeFile(filePath, source);
  }

  return {
    cleanup: async () => {
      await rm(distDir, {
        force: true,
        recursive: true,
      });
    },
    distDir,
  };
}

describe('auditPublishedPackageBoundaries', () => {
  it('allows declared dependencies and relative imports', async () => {
    const pkg = await createDistPackage({
      'index.js': "import '@example/dep';\nimport './local.js';\n",
      'local.js': 'export const value = 1;\n',
    });

    try {
      await expect(
        auditPublishedPackageBoundaries({
          distDir: pkg.distDir,
        }),
      ).resolves.toEqual([]);
    } finally {
      await pkg.cleanup();
    }
  });

  it('reports browser output importing node builtins', async () => {
    const pkg = await createDistPackage({
      'index.js': "import 'node:fs';\n",
    });

    try {
      const violations = await auditPublishedPackageBoundaries({
        distDir: pkg.distDir,
      });

      expect(violations).toEqual([
        expect.objectContaining({
          environment: 'browser',
          specifier: 'node:fs',
        }),
      ]);
    } finally {
      await pkg.cleanup();
    }
  });
});
