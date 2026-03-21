import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';
import { describe, expect, it } from 'vitest';
import { createImportReferenceResolver } from '../export-resolver';

const fixtureRoot = fileURLToPath(
  new URL('fixtures/export-resolution', import.meta.url),
);
const pageImporter = path.join(fixtureRoot, 'page.md');

const resolveFixtureId = async (
  id: string,
  importer = pageImporter,
): Promise<{ id: string } | null> => {
  if (!id.startsWith('.')) {
    return null;
  }

  const importerDirectory = path.dirname(importer);
  const resolvedBasePath = path.resolve(importerDirectory, id);
  const candidatePaths = [
    resolvedBasePath,
    `${resolvedBasePath}.ts`,
    `${resolvedBasePath}.tsx`,
    `${resolvedBasePath}.js`,
    `${resolvedBasePath}.jsx`,
    path.join(resolvedBasePath, 'index.ts'),
    path.join(resolvedBasePath, 'index.tsx'),
    path.join(resolvedBasePath, 'index.js'),
    path.join(resolvedBasePath, 'index.jsx'),
  ];

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      return { id: normalizePath(candidatePath) };
    }
  }

  return null;
};

describe('createImportReferenceResolver', () => {
  const resolver = createImportReferenceResolver({
    resolveId: resolveFixtureId,
  });

  it('resolves export * chains to the leaf module', async () => {
    const reference = await resolver.resolveImportReference(
      './barrel',
      'Hero',
      pageImporter,
    );

    expect(reference).toEqual({
      identifier: normalizePath(path.join(fixtureRoot, 'named-leaf.tsx')),
      importedName: 'Hero',
      warnings: [],
    });
  });

  it('resolves named re-export aliases to the final imported name', async () => {
    const reference = await resolver.resolveImportReference(
      './barrel',
      'Button',
      pageImporter,
    );

    expect(reference).toEqual({
      identifier: normalizePath(path.join(fixtureRoot, 'button-leaf.tsx')),
      importedName: 'ForwardedButton',
      warnings: [],
    });
  });

  it('resolves named exports that forward a default export', async () => {
    const reference = await resolver.resolveImportReference(
      './barrel',
      'Card',
      pageImporter,
    );

    expect(reference).toEqual({
      identifier: normalizePath(path.join(fixtureRoot, 'default-card.tsx')),
      importedName: 'default',
      warnings: [],
    });
  });

  it('resolves default export forwarding chains to the final leaf module', async () => {
    const reference = await resolver.resolveImportReference(
      './barrel',
      'default',
      pageImporter,
    );

    expect(reference).toEqual({
      identifier: normalizePath(path.join(fixtureRoot, 'default-leaf.tsx')),
      importedName: 'default',
      warnings: [],
    });
  });

  it('resolves import-then-export forwarding chains', async () => {
    const reference = await resolver.resolveImportReference(
      './local-forward',
      'Chip',
      pageImporter,
    );

    expect(reference).toEqual({
      identifier: normalizePath(path.join(fixtureRoot, 'local-leaf.tsx')),
      importedName: 'LocalChip',
      warnings: [],
    });
  });

  it('warns when an intermediate re-export module contains side-effect imports', async () => {
    const reference = await resolver.resolveImportReference(
      './side-effect-proxy',
      'Hero',
      pageImporter,
    );

    expect(reference).toEqual({
      identifier: normalizePath(path.join(fixtureRoot, 'named-leaf.tsx')),
      importedName: 'Hero',
      warnings: [expect.stringContaining('side-effect-proxy.ts')],
    });
    expect(reference!.warnings[0]).toContain('./side-effect-dep');
  });

  it('warns for each intermediate module with side-effect imports in a chain', async () => {
    const reference = await resolver.resolveImportReference(
      './side-effect-barrel',
      'Hero',
      pageImporter,
    );

    expect(reference).toEqual({
      identifier: normalizePath(path.join(fixtureRoot, 'named-leaf.tsx')),
      importedName: 'Hero',
      warnings: [
        expect.stringContaining('side-effect-barrel.ts'),
        expect.stringContaining('side-effect-proxy.ts'),
      ],
    });
  });

  it('returns no warnings when re-export modules have no side-effect imports', async () => {
    const reference = await resolver.resolveImportReference(
      './barrel',
      'Hero',
      pageImporter,
    );

    expect(reference!.warnings).toEqual([]);
  });
});
