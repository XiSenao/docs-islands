import { pkgExists } from '@docs-islands/utils';
import { fileURLToPath } from 'node:url';
import type { DefaultTheme, UserConfig } from 'vitepress';
import { ensureVitepressViteConfig } from '../core/integration-plugin';

interface ViteAliasEntry {
  find: string | RegExp;
  replacement: string;
}

const siteDebugOptionalDependencyFallbacks = [
  {
    dependency: 'vue-json-pretty',
    specifiers: [
      {
        find: 'vue-json-pretty',
        replacement: fileURLToPath(
          new URL(
            '../../../theme/optional-deps/vue-json-pretty.ts',
            import.meta.url,
          ),
        ),
      },
      {
        find: 'vue-json-pretty/lib/styles.css',
        replacement: fileURLToPath(
          new URL('../../../theme/optional-deps/empty.css', import.meta.url),
        ),
      },
    ],
  },
  {
    dependency: 'prettier',
    specifiers: [
      {
        find: 'prettier/standalone',
        replacement: fileURLToPath(
          new URL(
            '../../../theme/optional-deps/prettier-standalone.ts',
            import.meta.url,
          ),
        ),
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
          replacement: fileURLToPath(
            new URL(
              '../../../theme/optional-deps/prettier-plugin.ts',
              import.meta.url,
            ),
          ),
        }),
      ),
    ],
  },
  {
    dependency: 'shiki',
    specifiers: [
      {
        find: 'shiki',
        replacement: fileURLToPath(
          new URL('../../../theme/optional-deps/shiki.ts', import.meta.url),
        ),
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
