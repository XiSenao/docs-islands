import { pkgExists } from '@docs-islands/utils';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DefaultTheme, UserConfig } from 'vitepress';
import { ensureVitepressViteConfig } from '../core/integration-plugin';

interface ViteAliasEntry {
  find: string | RegExp;
  replacement: string;
}

interface ResolveOptionalDependencyFallbackPathOptions {
  builtRelativePath?: string;
  searchStartDir?: string;
  sourceRelativePath: string;
}

const optionalDependencySearchStartDir = path.dirname(
  fileURLToPath(import.meta.url),
);

function findNearestPackageRoot(searchStartDir: string): string | undefined {
  let currentDir = searchStartDir;

  while (true) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

export function resolveSiteDebugOptionalDependencyFallbackPath({
  builtRelativePath,
  searchStartDir = optionalDependencySearchStartDir,
  sourceRelativePath,
}: ResolveOptionalDependencyFallbackPathOptions): string {
  const packageRoot = findNearestPackageRoot(searchStartDir);

  if (!packageRoot) {
    return fileURLToPath(new URL(sourceRelativePath, import.meta.url));
  }

  if (builtRelativePath) {
    const builtPath = path.join(packageRoot, builtRelativePath);

    if (fs.existsSync(builtPath)) {
      return builtPath;
    }
  }

  return path.join(packageRoot, sourceRelativePath);
}

const siteDebugOptionalDependencyFallbacks = [
  {
    dependency: 'vue-json-pretty',
    specifiers: [
      {
        find: 'vue-json-pretty',
        replacement: resolveSiteDebugOptionalDependencyFallbackPath({
          builtRelativePath: 'theme/optional-deps/vue-json-pretty.mjs',
          sourceRelativePath: 'theme/optional-deps/vue-json-pretty.ts',
        }),
      },
      {
        find: 'vue-json-pretty/lib/styles.css',
        replacement: resolveSiteDebugOptionalDependencyFallbackPath({
          builtRelativePath: 'theme/optional-deps/empty.css',
          sourceRelativePath: 'theme/optional-deps/empty.css',
        }),
      },
    ],
  },
  {
    dependency: 'prettier',
    specifiers: [
      {
        find: 'prettier/standalone',
        replacement: resolveSiteDebugOptionalDependencyFallbackPath({
          builtRelativePath: 'theme/optional-deps/prettier-standalone.mjs',
          sourceRelativePath: 'theme/optional-deps/prettier-standalone.ts',
        }),
      },
      ...[
        'prettier/plugins/babel',
        'prettier/plugins/estree',
        'prettier/plugins/html',
        'prettier/plugins/markdown',
        'prettier/plugins/postcss',
        'prettier/plugins/yaml',
      ].map(
        (specifier): ViteAliasEntry => ({
          find: specifier,
          replacement: resolveSiteDebugOptionalDependencyFallbackPath({
            builtRelativePath: 'theme/optional-deps/prettier-plugin.mjs',
            sourceRelativePath: 'theme/optional-deps/prettier-plugin.ts',
          }),
        }),
      ),
    ],
  },
  {
    dependency: 'shiki',
    specifiers: [
      {
        find: 'shiki',
        replacement: resolveSiteDebugOptionalDependencyFallbackPath({
          builtRelativePath: 'theme/optional-deps/shiki.mjs',
          sourceRelativePath: 'theme/optional-deps/shiki.ts',
        }),
      },
    ],
  },
] as const;

const normalizeAliasEntries = (
  alias: NonNullable<
    NonNullable<UserConfig<DefaultTheme.Config>['vite']>['resolve']
  >['alias'],
): ViteAliasEntry[] => {
  if (!alias) {
    return [];
  }

  if (Array.isArray(alias)) {
    return alias as ViteAliasEntry[];
  }

  return Object.entries(alias).map(([find, replacement]) => ({
    find,
    replacement,
  }));
};

export function applySiteDebugOptionalDependencyFallbacks(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  resolutionBase: string,
): void {
  const missingAliases = siteDebugOptionalDependencyFallbacks.flatMap(
    ({ dependency, specifiers }) =>
      pkgExists(dependency, resolutionBase) ? [] : specifiers,
  );

  if (missingAliases.length === 0) {
    return;
  }

  const viteConfig = ensureVitepressViteConfig(vitepressConfig);

  if (!viteConfig.resolve) {
    viteConfig.resolve = {};
  }

  const aliasEntries = normalizeAliasEntries(viteConfig.resolve.alias);

  for (const nextAlias of missingAliases) {
    const hasExistingAlias = aliasEntries.some(
      (aliasEntry) => aliasEntry.find === nextAlias.find,
    );

    if (!hasExistingAlias) {
      aliasEntries.push(nextAlias);
    }
  }

  viteConfig.resolve.alias = aliasEntries;
}
