import type { Plugin } from 'rolldown';
import packageJson from './package.json' with { type: 'json' };

const supportedUIFrameworks = ['react'];

const supportedUIFrameworksNodeEntries = new Map(
  supportedUIFrameworks.map(framework => [`./${framework}`, `./node/${framework}.js`])
);

const supportedUIFrameworksClientEntries = new Map(
  supportedUIFrameworks.map(framework => [`./${framework}/client`, `./client/${framework}.mjs`])
);

const INTERNAL_SCOPES = ['@docs-islands/'] as const;
const UNSUPPORTED_VERSION_PROTOCOL_PREFIXES = [
  'workspace:',
  'link:',
  'file:',
  'portal:',
  'patch:'
] as const;

function sanitizeFiles(files: string[] | undefined): string[] {
  if (!Array.isArray(files)) {
    return [];
  }
  return files;
}

function sanitizeDevDependencies(
  devDependencies: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!devDependencies || typeof devDependencies !== 'object') {
    return undefined;
  }

  const filtered = Object.entries(devDependencies).filter(([packageName, versionRange]) => {
    const isInternal = INTERNAL_SCOPES.some(scope => packageName.startsWith(scope));
    const hasUnsupportedProtocol = UNSUPPORTED_VERSION_PROTOCOL_PREFIXES.some(prefix =>
      versionRange.startsWith(prefix)
    );
    return !isInternal && !hasUnsupportedProtocol;
  });

  if (filtered.length === 0) {
    return undefined;
  }

  return Object.fromEntries(filtered);
}

type PackageJson = Omit<Partial<typeof packageJson>, 'exports'> & {
  devDependencies?: Record<string, string>;
  files?: string[];
  exports?: Record<string, string>;
};

export default function generatePackageJson(): Plugin {
  return {
    name: 'rolldown-plugin-generate-package-json',
    generateBundle: {
      order: 'post',
      handler() {
        const packageJsonObject: PackageJson = { ...packageJson };
        delete packageJsonObject.scripts;
        const originalExports = packageJson.exports;
        if (
          originalExports &&
          typeof originalExports === 'object' &&
          !Array.isArray(originalExports)
        ) {
          packageJsonObject.exports = Object.fromEntries(
            Object.entries(originalExports)
              .map(([key, value]) => {
                if (supportedUIFrameworksNodeEntries.has(key)) {
                  return [key, supportedUIFrameworksNodeEntries.get(key)!];
                }
                if (supportedUIFrameworksClientEntries.has(key)) {
                  return [key, supportedUIFrameworksClientEntries.get(key)!];
                }
                if (value.includes('src/')) {
                  const targetExt = key.startsWith('./client') ? '.mjs' : '.js';
                  return [key, value.replace('src/', '').replace('.ts', targetExt)];
                }
                if (value.endsWith('.ts')) {
                  return [key, value.replace('.ts', '.js')];
                }

                return [key, value];
              })
              .filter(([key]) => !key.includes('dev'))
          );
        }
        const sanitized = sanitizeDevDependencies(packageJsonObject.devDependencies);
        if (sanitized && Object.keys(sanitized).length > 0) {
          packageJsonObject.devDependencies = sanitized as PackageJson['devDependencies'];
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
          fileName: 'package.json'
        });
      }
    }
  };
}
