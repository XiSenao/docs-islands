import fs from 'node:fs';
import { join } from 'pathe';

const TEXT_FILE_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.cts',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.less',
  '.md',
  '.mjs',
  '.mts',
  '.pcss',
  '.sass',
  '.scss',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
]);

export const isSiteDebugTextLikeArtifact = (filePath?: string): boolean => {
  if (!filePath) {
    return false;
  }

  const normalizedPath = filePath.replace(/[#?].*$/, '');
  const extension = /\.[^./\\]+$/.exec(normalizedPath)?.[0]?.toLowerCase();

  if (!extension) {
    return true;
  }

  return TEXT_FILE_EXTENSIONS.has(extension);
};

export const readSiteDebugTextArtifact = (filePath: string): string | null => {
  if (!isSiteDebugTextLikeArtifact(filePath) || !fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, 'utf8');
};

export const resolveSiteDebugOutputAssetPath = ({
  assetsDir,
  outDir,
  publicPath,
}: {
  assetsDir: string;
  outDir: string;
  publicPath: string;
}): string => {
  const normalizedPath = publicPath
    .replace(/[#?].*$/, '')
    .replaceAll('\\', '/');
  const assetRoot = `/${assetsDir}/`;
  const assetRootIndex = normalizedPath.indexOf(assetRoot);
  const relativeAssetPath =
    assetRootIndex === -1
      ? normalizedPath.replace(/^\/+/, '')
      : normalizedPath.slice(assetRootIndex + 1);

  return join(outDir, relativeAssetPath);
};

export const resolveSiteDebugPath = (base: string, suffix: string) => {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;

  return `${normalizedBase}${suffix}`;
};
