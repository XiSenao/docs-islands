import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'rolldown';
import packageJson from './package.json' with { type: 'json' };

const supportedUIFrameworks = ['react'];
// TODO: #types is prepared for the dependent party.
const externalImports: string[] = [];

const supportedUIFrameworksNodeEntries = new Map(
  supportedUIFrameworks.map((framework) => [
    `./adapters/${framework}`,
    `./node/adapters/${framework}.js`,
  ]),
);

const supportedUIFrameworksClientEntries = new Map(
  supportedUIFrameworks.map((framework) => [
    `./adapters/${framework}/client`,
    `./client/adapters/${framework}.mjs`,
  ]),
);

const INTERNAL_SCOPES = ['@docs-islands/'] as const;
const RESOLVABLE_VERSION_PROTOCOL_PREFIXES = [
  'workspace:',
  'catalog:',
] as const;
const NON_PUBLISHABLE_VERSION_PROTOCOL_PREFIXES = [
  'link:',
  'file:',
  'portal:',
  'patch:',
] as const;
const packageRootDir = fileURLToPath(new URL('.', import.meta.url));
const workspaceConfigPath = fileURLToPath(
  new URL('../../pnpm-workspace.yaml', import.meta.url),
);
const installedPackageVersionCache = new Map<string, string>();

function sanitizeFiles(files: string[] | undefined): string[] {
  if (!Array.isArray(files)) {
    return [];
  }
  return files;
}

type DependencyMap = Record<string, string>;
type CatalogMap = Record<string, DependencyMap>;
interface DependencyResolutionOptions {
  allowInternal?: boolean;
  dropUnsupportedProtocols?: boolean;
}

function stripYamlQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseCatalogs(source: string): CatalogMap {
  const catalogs: CatalogMap = {};
  const lines = source.split(/\r?\n/u);
  let isInsideCatalogsSection = false;
  let currentCatalogName: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.replaceAll('\t', '    ');
    const trimmedLine = line.trim();

    if (!isInsideCatalogsSection) {
      if (trimmedLine === 'catalogs:') {
        isInsideCatalogsSection = true;
      }
      continue;
    }

    if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
      continue;
    }

    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      break;
    }

    if (indent === 2 && trimmedLine.endsWith(':')) {
      currentCatalogName = trimmedLine.slice(0, -1);
      catalogs[currentCatalogName] = {};
      continue;
    }

    if (indent !== 4 || !currentCatalogName) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const packageName = stripYamlQuotes(
      trimmedLine.slice(0, separatorIndex).trim(),
    );
    const versionRange = stripYamlQuotes(
      trimmedLine.slice(separatorIndex + 1).trim(),
    );

    if (packageName.length > 0 && versionRange.length > 0) {
      catalogs[currentCatalogName][packageName] = versionRange;
    }
  }

  return catalogs;
}

const workspaceCatalogs = parseCatalogs(
  readFileSync(workspaceConfigPath, 'utf8'),
);

function resolveInstalledPackageVersion(packageName: string): string {
  const cachedVersion = installedPackageVersionCache.get(packageName);
  if (cachedVersion) {
    return cachedVersion;
  }

  const manifestPath = path.resolve(
    packageRootDir,
    'node_modules',
    ...packageName.split('/'),
    'package.json',
  );

  if (!existsSync(manifestPath)) {
    throw new Error(
      `Unable to resolve installed version for "${packageName}" from ${manifestPath}`,
    );
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    version?: string;
  };
  if (!manifest.version) {
    throw new Error(
      `Installed manifest for "${packageName}" is missing a version field`,
    );
  }

  installedPackageVersionCache.set(packageName, manifest.version);
  return manifest.version;
}

function resolveWorkspaceProtocolVersion(
  packageName: string,
  versionRange: string,
): string {
  const publishedVersion = resolveInstalledPackageVersion(packageName);
  const workspaceRange = versionRange.slice('workspace:'.length);

  if (
    workspaceRange.length === 0 ||
    workspaceRange === '*' ||
    workspaceRange.startsWith('./') ||
    workspaceRange.startsWith('../') ||
    workspaceRange.startsWith('/')
  ) {
    return publishedVersion;
  }

  if (workspaceRange === '^' || workspaceRange === '~') {
    return `${workspaceRange}${publishedVersion}`;
  }

  return workspaceRange;
}

function resolveCatalogProtocolVersion(
  packageName: string,
  versionRange: string,
): string {
  const catalogName = versionRange.slice('catalog:'.length);
  const catalog = workspaceCatalogs[catalogName];
  const resolvedVersion = catalog?.[packageName];

  if (!resolvedVersion) {
    throw new Error(
      `Unable to resolve catalog version for "${packageName}" from catalog "${catalogName}"`,
    );
  }

  return resolvedVersion;
}

function resolvePublishedVersionRange(
  packageName: string,
  versionRange: string,
): string {
  if (versionRange.startsWith('workspace:')) {
    return resolveWorkspaceProtocolVersion(packageName, versionRange);
  }

  if (versionRange.startsWith('catalog:')) {
    return resolveCatalogProtocolVersion(packageName, versionRange);
  }

  return versionRange;
}

function sanitizeDependencyMap(
  dependencies: DependencyMap | undefined,
  options: DependencyResolutionOptions = {},
): DependencyMap | undefined {
  if (!dependencies || typeof dependencies !== 'object') {
    return undefined;
  }

  const { allowInternal = true, dropUnsupportedProtocols = false } = options;
  const resolvedEntries = Object.entries(dependencies).flatMap(
    ([packageName, versionRange]) => {
      const isInternal = INTERNAL_SCOPES.some((scope) =>
        packageName.startsWith(scope),
      );

      if (!allowInternal && isInternal) {
        return [];
      }

      const hasNonPublishableProtocol =
        NON_PUBLISHABLE_VERSION_PROTOCOL_PREFIXES.some((prefix) =>
          versionRange.startsWith(prefix),
        );

      if (hasNonPublishableProtocol) {
        if (dropUnsupportedProtocols) {
          return [];
        }

        throw new Error(
          `Unsupported dependency protocol in published manifest: ${packageName}@${versionRange}`,
        );
      }

      const hasResolvableProtocol = RESOLVABLE_VERSION_PROTOCOL_PREFIXES.some(
        (prefix) => versionRange.startsWith(prefix),
      );

      if (!hasResolvableProtocol) {
        return [[packageName, versionRange]];
      }

      return [
        [packageName, resolvePublishedVersionRange(packageName, versionRange)],
      ];
    },
  );

  if (resolvedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(resolvedEntries);
}

function sanitizeDevDependencies(
  devDependencies: Record<string, string> | undefined,
): Record<string, string> | undefined {
  return sanitizeDependencyMap(devDependencies, {
    allowInternal: false,
    dropUnsupportedProtocols: true,
  });
}

type ExportValue = string | { types?: string; default?: string };

type PackageJson = Omit<Partial<typeof packageJson>, 'exports'> & {
  devDependencies?: Record<string, string>;
  files?: string[];
  exports?: Record<string, ExportValue>;
  imports?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const isClientExportKey = (key: string): boolean => {
  return /^\.\/(?:client(?:\/.+)?|adapters\/.+\/client)$/.test(key);
};

const filterExports = (key: string) => {
  if (key.startsWith('./internal-helper')) {
    return true;
  }
  return false;
};

const rewriteExportPath = (
  key: string,
  value: string,
  exportCondition?: string,
): string => {
  if (
    exportCondition === 'types' &&
    value.endsWith('.ts') &&
    !value.endsWith('.d.ts') &&
    !value.endsWith('.d.mts')
  ) {
    const targetExt = isClientExportKey(key) ? '.d.mts' : '.d.ts';
    return value.replace('src/', '').replace('.ts', targetExt);
  }
  if (
    value.includes('src/') &&
    (value.endsWith('.d.mts') || value.endsWith('.d.ts'))
  ) {
    return value.replace('src/', '');
  }
  if (value.endsWith('.d.mts') || value.endsWith('.d.ts')) {
    return value;
  }
  if (value.includes('src/')) {
    const targetExt = isClientExportKey(key) ? '.mjs' : '.js';
    return value.replace('src/', '').replace('.ts', targetExt);
  }
  if (value.includes('theme/')) {
    const targetExt = isClientExportKey(key) ? '.mjs' : '.js';
    return value.replace('.ts', targetExt);
  }
  if (value.endsWith('.ts')) {
    return value.replace('.ts', '.js');
  }
  return value;
};

export default function generatePackageJson(): Plugin {
  return {
    name: 'rolldown-plugin-generate-package-json',
    generateBundle: {
      order: 'post',
      handler() {
        const packageJsonObject: PackageJson = { ...packageJson };
        delete packageJsonObject.scripts;
        const imports = packageJsonObject.imports;
        if (imports && typeof imports === 'object') {
          const filteredImports = Object.fromEntries(
            Object.entries(imports).filter(([key]) =>
              externalImports.some((importPath) => key.startsWith(importPath)),
            ),
          );
          if (Object.keys(filteredImports).length > 0) {
            packageJsonObject.imports =
              filteredImports as PackageJson['imports'];
          } else {
            delete packageJsonObject.imports;
          }
        }
        const originalExports = packageJson.exports;
        if (
          originalExports &&
          typeof originalExports === 'object' &&
          !Array.isArray(originalExports)
        ) {
          packageJsonObject.exports = Object.fromEntries(
            Object.entries(originalExports)
              .map(([key, value]): [string, ExportValue] => {
                if (supportedUIFrameworksNodeEntries.has(key)) {
                  return [key, supportedUIFrameworksNodeEntries.get(key)!];
                }
                if (supportedUIFrameworksClientEntries.has(key)) {
                  return [key, supportedUIFrameworksClientEntries.get(key)!];
                }
                // Handle object-type export values (e.g., { types: "..." })
                if (typeof value === 'object' && value !== null) {
                  const rewrittenEntries = Object.entries(value).map(
                    ([entryKey, entryValue]) => [
                      entryKey,
                      typeof entryValue === 'string'
                        ? rewriteExportPath(key, entryValue, entryKey)
                        : entryValue,
                    ],
                  );
                  return [
                    key,
                    Object.fromEntries(rewrittenEntries) as ExportValue,
                  ];
                }
                // Handle string-type export values
                if (typeof value === 'string') {
                  return [key, rewriteExportPath(key, value)];
                }

                return [key, value as ExportValue];
              })
              .filter(([key]) => !filterExports(key)),
          );
        }
        const sanitizedDependencies = sanitizeDependencyMap(
          packageJsonObject.dependencies,
        );
        if (sanitizedDependencies) {
          packageJsonObject.dependencies =
            sanitizedDependencies as PackageJson['dependencies'];
        } else {
          delete packageJsonObject.dependencies;
        }
        const sanitizedPeerDependencies = sanitizeDependencyMap(
          packageJsonObject.peerDependencies,
        );
        if (sanitizedPeerDependencies) {
          packageJsonObject.peerDependencies =
            sanitizedPeerDependencies as PackageJson['peerDependencies'];
        } else {
          delete packageJsonObject.peerDependencies;
        }
        const sanitizedOptionalDependencies = sanitizeDependencyMap(
          packageJsonObject.optionalDependencies,
        );
        if (sanitizedOptionalDependencies) {
          packageJsonObject.optionalDependencies =
            sanitizedOptionalDependencies as PackageJson['optionalDependencies'];
        } else {
          delete packageJsonObject.optionalDependencies;
        }
        const sanitized = sanitizeDevDependencies(
          packageJsonObject.devDependencies,
        );
        if (sanitized && Object.keys(sanitized).length > 0) {
          packageJsonObject.devDependencies =
            sanitized as PackageJson['devDependencies'];
        } else {
          delete packageJsonObject.devDependencies;
        }

        const sanitizedFiles = sanitizeFiles(packageJsonObject.files);
        if (sanitizedFiles && sanitizedFiles.length > 0) {
          packageJsonObject.files = sanitizedFiles;
          delete packageJsonObject.files;
        }
        this.emitFile({
          type: 'asset',
          source: JSON.stringify(packageJsonObject, null, 2),
          fileName: 'package.json',
        });
      },
    },
  };
}
