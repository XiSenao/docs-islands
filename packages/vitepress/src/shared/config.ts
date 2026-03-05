import type { ConfigType } from '#dep-types/utils';
import { getProjectRoot, slash } from '@docs-islands/utils/path';
import { join, resolve } from 'pathe';
import { normalizePath } from 'vite';
import type { DefaultTheme, UserConfig } from 'vitepress';

export const resolveConfig = (
  rawVitepressConfig: UserConfig<DefaultTheme.Config>,
): ConfigType => {
  const vitepressResolve = (root: string, file: string) =>
    normalizePath(resolve(root, `.vitepress`, file));
  const root = normalizePath(resolve(getProjectRoot()));
  const assetsDir = rawVitepressConfig.assetsDir
    ? slash(rawVitepressConfig.assetsDir).replaceAll(/^\.?\/|\/$/g, '')
    : 'assets';
  const mpa = rawVitepressConfig.mpa ?? false;
  const base = rawVitepressConfig.base
    ? rawVitepressConfig.base.replace(/([^/])$/, '$1/')
    : '/';
  const srcDir = normalizePath(resolve(root, rawVitepressConfig.srcDir || '.'));
  const publicDir = resolve(srcDir, 'public');
  const outDir = rawVitepressConfig.outDir
    ? normalizePath(resolve(root, rawVitepressConfig.outDir))
    : vitepressResolve(root, 'dist');
  const cacheDir = rawVitepressConfig.cacheDir
    ? normalizePath(resolve(root, rawVitepressConfig.cacheDir))
    : vitepressResolve(root, 'cache');
  const cleanUrls = rawVitepressConfig.cleanUrls ?? false;

  const config: ConfigType = {
    root,
    outDir,
    base,
    srcDir,
    assetsDir,
    mpa,
    publicDir,
    cacheDir,
    cleanUrls,
    wrapBaseUrl: (path: string) => {
      return path.startsWith('http') ? path : join('/', base, path);
    },
  };

  return config;
};
