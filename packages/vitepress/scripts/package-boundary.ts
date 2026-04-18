import { init, parse } from 'es-module-lexer';
import { readdir, readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';

type RuntimeEnvironment = 'browser' | 'node';

interface DistPackageJson {
  dependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
  name: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface PublishedPackageBoundaryViolation {
  environment: RuntimeEnvironment;
  filePath: string;
  message: string;
  specifier: string;
}

interface SelfSpecifierMatchers {
  exact: Set<string>;
  prefixes: string[];
}

const NODE_BUILTIN_SPECIFIERS = new Set(
  builtinModules.flatMap((specifier) =>
    specifier.startsWith('node:')
      ? [specifier, specifier.slice('node:'.length)]
      : [specifier, `node:${specifier}`],
  ),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRelativeOrAbsoluteSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('file:') ||
    specifier.startsWith('http:') ||
    specifier.startsWith('https:') ||
    specifier.startsWith('data:')
  );
}

function getPackageRootSpecifier(specifier: string): string {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    return scope && name ? `${scope}/${name}` : specifier;
  }

  return specifier.split('/')[0] ?? specifier;
}

function collectSelfSpecifierMatchers(
  packageName: string,
  exportsField: DistPackageJson['exports'],
): SelfSpecifierMatchers {
  const exact = new Set<string>([packageName]);
  const prefixes: string[] = [];

  if (!isRecord(exportsField)) {
    return {
      exact,
      prefixes,
    };
  }

  for (const exportKey of Object.keys(exportsField)) {
    if (exportKey === '.') {
      exact.add(packageName);
      continue;
    }

    if (!exportKey.startsWith('./')) {
      continue;
    }

    const normalizedSubpath = exportKey.slice('./'.length);
    if (normalizedSubpath.length === 0) {
      continue;
    }

    const wildcardIndex = normalizedSubpath.indexOf('*');
    if (wildcardIndex !== -1) {
      prefixes.push(
        `${packageName}/${normalizedSubpath.slice(0, wildcardIndex)}`,
      );
      continue;
    }

    exact.add(`${packageName}/${normalizedSubpath}`);
  }

  return {
    exact,
    prefixes,
  };
}

function isAllowedSelfSpecifier(
  specifier: string,
  matchers: SelfSpecifierMatchers,
): boolean {
  return (
    matchers.exact.has(specifier) ||
    matchers.prefixes.some((prefix) => specifier.startsWith(prefix))
  );
}

function normalizePublishedModulePath(relativeFilePath: string): string {
  return relativeFilePath.replace(/\\/g, '/');
}

function classifyRuntimeEnvironment(
  relativeFilePath: string,
): RuntimeEnvironment {
  return normalizePublishedModulePath(relativeFilePath).startsWith('node/')
    ? 'node'
    : 'browser';
}

async function collectPublishedModuleFiles(
  directoryPath: string,
): Promise<string[]> {
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectPublishedModuleFiles(absolutePath)));
      continue;
    }

    if (/\.[cm]?js$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

function validatePublishedSpecifier(options: {
  allowedExternalPackages: Set<string>;
  environment: RuntimeEnvironment;
  packageName: string;
  selfSpecifiers: SelfSpecifierMatchers;
  specifier: string;
}): string | null {
  const {
    allowedExternalPackages,
    environment,
    packageName,
    selfSpecifiers,
    specifier,
  } = options;

  if (isRelativeOrAbsoluteSpecifier(specifier)) {
    return null;
  }

  if (NODE_BUILTIN_SPECIFIERS.has(specifier)) {
    if (environment === 'node') {
      return null;
    }

    return `browser/runtime output must not import Node builtin "${specifier}"`;
  }

  const packageRoot = getPackageRootSpecifier(specifier);

  if (packageRoot === packageName) {
    if (isAllowedSelfSpecifier(specifier, selfSpecifiers)) {
      return null;
    }

    return `self import "${specifier}" is not exposed by dist/package.json exports`;
  }

  if (allowedExternalPackages.has(packageRoot)) {
    return null;
  }

  return `"${specifier}" resolves to package "${packageRoot}" which is not listed in dependencies, peerDependencies, optionalDependencies, or self exports`;
}

export async function auditPublishedPackageBoundaries(
  distDir: string,
): Promise<PublishedPackageBoundaryViolation[]> {
  const manifestPath = path.join(distDir, 'package.json');
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  ) as DistPackageJson;
  const allowedExternalPackages = new Set<string>([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
  const selfSpecifiers = collectSelfSpecifierMatchers(
    manifest.name,
    manifest.exports,
  );
  const publishedFiles = await collectPublishedModuleFiles(distDir);
  const violations: PublishedPackageBoundaryViolation[] = [];

  await init;

  for (const filePath of publishedFiles) {
    const relativeFilePath = path.relative(distDir, filePath);
    const environment = classifyRuntimeEnvironment(relativeFilePath);
    const source = await readFile(filePath, 'utf8');
    const [importSpecifiers] = parse(source);

    for (const importSpecifier of importSpecifiers) {
      if (!importSpecifier.n) {
        continue;
      }

      const message = validatePublishedSpecifier({
        allowedExternalPackages,
        environment,
        packageName: manifest.name,
        selfSpecifiers,
        specifier: importSpecifier.n,
      });

      if (!message) {
        continue;
      }

      violations.push({
        environment,
        filePath: relativeFilePath,
        message,
        specifier: importSpecifier.n,
      });
    }
  }

  return violations.toSorted((left, right) => {
    if (left.filePath === right.filePath) {
      return left.specifier.localeCompare(right.specifier);
    }

    return left.filePath.localeCompare(right.filePath);
  });
}
