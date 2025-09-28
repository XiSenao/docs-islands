import type { ConfigType, PrintOptions } from '@docs-islands/vitepress-types';
import { ConsoleTheme, ConsoleThemeMap } from '@docs-islands/vitepress-types';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'pathe';
import colors from 'picocolors';
import { normalizePath } from 'vite';
import type { DefaultTheme, UserConfig } from 'vitepress';

const NODE_BUILTIN_NAMESPACE = 'node:';
const NPM_BUILTIN_NAMESPACE = 'npm:';
const BUN_BUILTIN_NAMESPACE = 'bun:';
const nodeBuiltins = builtinModules.filter(id => !id.includes(':'));

function createIsBuiltin(builtins: Array<string | RegExp>): (id: string) => boolean {
  const plainBuiltinsSet = new Set(builtins.filter(builtin => typeof builtin === 'string'));
  const regexBuiltins = builtins.filter(builtin => typeof builtin !== 'string');

  return id => plainBuiltinsSet.has(id) || regexBuiltins.some(regexp => regexp.test(id));
}

const isBuiltinCache = new WeakMap<
  Array<string | RegExp>,
  (id: string, importer?: string) => boolean
>();

function isBuiltin(builtins: Array<string | RegExp>, id: string): boolean {
  let isBuiltin = isBuiltinCache.get(builtins);
  if (!isBuiltin) {
    isBuiltin = createIsBuiltin(builtins);
    isBuiltinCache.set(builtins, isBuiltin);
  }
  return isBuiltin(id);
}

const nodeLikeBuiltins: Array<string | RegExp> = [
  ...nodeBuiltins,
  new RegExp(`^${NODE_BUILTIN_NAMESPACE}`),
  new RegExp(`^${NPM_BUILTIN_NAMESPACE}`),
  new RegExp(`^${BUN_BUILTIN_NAMESPACE}`)
];

export function isNodeLikeBuiltin(id: string): boolean {
  return isBuiltin(nodeLikeBuiltins, id);
}

export const print = (text: string, options?: PrintOptions): void => {
  const { theme = ConsoleTheme.SUCCESS, bold = false } = options || {};
  const consoleThemeColor = ConsoleThemeMap[theme] || ConsoleThemeMap[ConsoleTheme.SUCCESS];
  const colorFunction = colors[consoleThemeColor];
  const renderContent = typeof colorFunction === 'function' ? colorFunction(text) : text;
  const boldContent = bold ? colors.bold(renderContent) : renderContent;
  console.log(boldContent);
};

export function slash(p: string): string {
  return p.replaceAll('\\', '/');
}

export function getProjectRoot(): string {
  if (process.env.PROJECT_ROOT) {
    return process.env.PROJECT_ROOT;
  }

  const findPackageJson = (dir: string): string | null => {
    const packageJsonPath = join(dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return dir;
    }

    const parentDir = dirname(dir);
    if (parentDir === dir) {
      return null;
    }

    return findPackageJson(parentDir);
  };

  const rootFromPackageJson = findPackageJson(process.cwd());
  if (rootFromPackageJson) {
    return rootFromPackageJson;
  }

  return process.cwd();
}

export const resolveConfig = (rawVitepressConfig: UserConfig<DefaultTheme.Config>): ConfigType => {
  const vitepressResolve = (root: string, file: string) =>
    normalizePath(resolve(root, `.vitepress`, file));
  const root = normalizePath(resolve(getProjectRoot()));
  const assetsDir = rawVitepressConfig.assetsDir
    ? slash(rawVitepressConfig.assetsDir).replaceAll(/^\.?\/|\/$/g, '')
    : 'assets';
  const mpa = rawVitepressConfig.mpa ?? false;
  const base = rawVitepressConfig.base ? rawVitepressConfig.base.replace(/([^/])$/, '$1/') : '/';
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
    }
  };

  return config;
};

export const getPathnameByMarkdownModuleId = (
  markdownModuleId: string,
  siteConfig: ConfigType
): string => {
  const relativePath = normalizePath(relative(siteConfig.srcDir, markdownModuleId));
  let pathname = `/${relativePath
    .replace(/\.md$/, siteConfig.cleanUrls ? '' : '.html')
    .replace(/(^|\/)index(\.html)?$/, '$1')}`;

  if (pathname === '' || pathname === '/index') {
    pathname = '/';
  }

  return siteConfig.base === '/' ? pathname : siteConfig.base.slice(0, -1) + pathname;
};
