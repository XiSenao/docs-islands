import { pack } from '@publint/pack';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface PackedDistTarball {
  cleanup: () => Promise<void>;
  destination: string;
  tarball: Buffer;
  tarballPath: string;
}

export async function packDistTarball(
  distDir: string,
): Promise<PackedDistTarball> {
  const destination = await mkdtemp(path.join(tmpdir(), '__DOCS_ISLANDS__'));
  const tarballPath = await pack(distDir, {
    destination,
    packageManager: 'pnpm',
    ignoreScripts: true,
  });
  const tarball = await readFile(tarballPath);

  return {
    cleanup: async () => {
      await rm(destination, {
        recursive: true,
        force: true,
      }).catch(() => null);
    },
    destination,
    tarball,
    tarballPath,
  };
}
