import type { Rollup } from 'vite';

export const isReactChunk = (chunkInfo: Rollup.PreRenderedChunk): boolean => {
  if (!chunkInfo.isDynamicEntry || chunkInfo.type !== 'chunk') {
    return false;
  }

  return chunkInfo.moduleIds.some((moduleId) =>
    moduleId.includes('/node_modules/react/index.js'),
  );
};

export const isReactClientChunk = (
  chunkInfo: Rollup.PreRenderedChunk,
): boolean => {
  if (!chunkInfo.isDynamicEntry || chunkInfo.type !== 'chunk') {
    return false;
  }

  return chunkInfo.moduleIds.some((moduleId) =>
    moduleId.includes('/node_modules/react-dom/client.js'),
  );
};
