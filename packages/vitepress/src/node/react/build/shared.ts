import type { OutputAsset, OutputChunk } from '#dep-types/rollup';
import { isAbsolute, relative, resolve } from 'pathe';

export function isOutputChunk(
  chunk: OutputChunk | OutputAsset,
): chunk is OutputChunk {
  return chunk.type === 'chunk';
}

export function isOutputAsset(
  chunk: OutputChunk | OutputAsset,
): chunk is OutputAsset {
  return chunk.type === 'asset';
}

export function resolveSafeOutputPath(
  outDir: string,
  fileName: string,
): string {
  if (typeof fileName !== 'string' || fileName.trim().length === 0) {
    throw new TypeError(
      `[react-build] Invalid output file name: ${String(fileName)}`,
    );
  }

  if (fileName.includes('\0')) {
    throw new Error(
      '[react-build] Output file name must not contain null bytes',
    );
  }

  if (isAbsolute(fileName)) {
    throw new Error(
      `[react-build] Absolute output paths are not allowed: ${fileName}`,
    );
  }

  const normalizedOutDir = resolve(outDir);
  const fullOutputPath = resolve(normalizedOutDir, fileName);
  const relativePath = relative(normalizedOutDir, fullOutputPath);

  if (
    relativePath === '' ||
    relativePath === '.' ||
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    relativePath.startsWith('..\\') ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `[react-build] Refusing to write outside output directory. outDir="${normalizedOutDir}", fileName="${fileName}"`,
    );
  }

  return fullOutputPath;
}
