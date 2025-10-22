import type { OutputAsset, OutputChunk } from '#dep-types/rollup';

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
