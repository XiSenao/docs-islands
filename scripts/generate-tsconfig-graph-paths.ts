import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';
import { glob } from 'tinyglobby';

interface PackageManifest {
  exports?: unknown;
  imports?: Record<string, unknown>;
  name?: string;
  workspaces?: string[];
}

interface WorkspacePackage {
  directory: string;
  manifest: PackageManifest;
  name: string;
}

interface CliOptions {
  check: boolean;
}

const rootDir = process.cwd();
const outputPath = path.join(rootDir, 'tsconfig.graph.paths.generated.json');
const internalPackageScope = '@docs-islands/';
const knownSourceExtensions = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.d.ts',
  '.d.mts',
  '.d.cts',
];

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function toWorkspacePath(absolutePath: string): string {
  return toPosixPath(path.relative(rootDir, absolutePath));
}

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  const unknownArgs = args.filter((arg) => arg !== '--check');

  if (unknownArgs.length > 0) {
    throw new Error(`Unknown option: ${unknownArgs.join(', ')}`);
  }

  return {
    check: args.includes('--check'),
  };
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

function collectPnpmWorkspacePatterns(source: string): string[] {
  const patterns: string[] = [];
  const lines = source.split(/\r?\n/u);
  let isInsidePackagesSection = false;

  for (const rawLine of lines) {
    const line = rawLine.replaceAll('\t', '    ');
    const trimmedLine = line.trim();

    if (!isInsidePackagesSection) {
      if (trimmedLine === 'packages:') {
        isInsidePackagesSection = true;
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

    if (trimmedLine.startsWith('- ')) {
      patterns.push(stripYamlQuotes(trimmedLine.slice(2)));
    }
  }

  return patterns;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function collectWorkspacePatterns(): Promise<string[]> {
  const rootPackageJson = await readJsonFile<PackageManifest>(
    path.join(rootDir, 'package.json'),
  );
  const patterns = new Set<string>();

  if (Array.isArray(rootPackageJson.workspaces)) {
    for (const pattern of rootPackageJson.workspaces) {
      patterns.add(pattern);
    }
  }

  const pnpmWorkspacePath = path.join(rootDir, 'pnpm-workspace.yaml');

  if (existsSync(pnpmWorkspacePath)) {
    const pnpmWorkspace = await readFile(pnpmWorkspacePath, 'utf8');

    for (const pattern of collectPnpmWorkspacePatterns(pnpmWorkspace)) {
      patterns.add(pattern);
    }
  }

  return [...patterns].sort();
}

async function collectWorkspacePackages(): Promise<WorkspacePackage[]> {
  const workspacePatterns = await collectWorkspacePatterns();
  const includePatterns = workspacePatterns
    .filter((pattern) => !pattern.startsWith('!'))
    .map((pattern) => `${pattern.replace(/\/$/u, '')}/package.json`);
  const ignorePatterns = workspacePatterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => `${pattern.slice(1).replace(/\/$/u, '')}/**`);
  const packageJsonPaths = await glob(includePatterns, {
    cwd: rootDir,
    absolute: false,
    ignore: ['**/node_modules/**', '**/dist/**', ...ignorePatterns],
  });
  const packages: WorkspacePackage[] = [];

  for (const packageJsonPath of [...new Set(packageJsonPaths)].sort()) {
    const manifest = await readJsonFile<PackageManifest>(
      path.join(rootDir, packageJsonPath),
    );

    if (!manifest.name?.startsWith(internalPackageScope)) {
      continue;
    }

    packages.push({
      directory: path.dirname(packageJsonPath),
      manifest,
      name: manifest.name,
    });
  }

  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

function collectTargetCandidates(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const priorityKeys = [
    'source',
    'development',
    'import',
    'module',
    'default',
    'types',
    'require',
  ];
  const candidates: string[] = [];
  const visitedKeys = new Set<string>();

  for (const key of priorityKeys) {
    if (!(key in record)) {
      continue;
    }

    visitedKeys.add(key);
    candidates.push(...collectTargetCandidates(record[key]));
  }

  for (const key of Object.keys(record).sort()) {
    if (visitedKeys.has(key)) {
      continue;
    }

    candidates.push(...collectTargetCandidates(record[key]));
  }

  return candidates;
}

function normalizePackageTarget(target: string): string | null {
  if (!target.startsWith('./')) {
    return null;
  }

  return target.slice(2);
}

function packageExportKeyToAlias(
  packageName: string,
  exportKey: string,
): string {
  if (exportKey === '.') {
    return packageName;
  }

  if (!exportKey.startsWith('./')) {
    return '';
  }

  return `${packageName}/${exportKey.slice(2)}`;
}

function removeKnownExtension(filePath: string): string {
  for (const extension of [
    '.d.mts',
    '.d.cts',
    '.d.ts',
    '.mts',
    '.cts',
    '.mjs',
    '.cjs',
    '.js',
    '.tsx',
    '.ts',
  ]) {
    if (filePath.endsWith(extension)) {
      return filePath.slice(0, -extension.length);
    }
  }

  return filePath;
}

function sourceFileCandidates(target: string): string[] {
  const normalizedTarget = normalizeSlashes(target);
  const withoutKnownExtension = removeKnownExtension(normalizedTarget);
  const withoutDistPrefix = normalizedTarget.startsWith('dist/')
    ? normalizedTarget.slice('dist/'.length)
    : normalizedTarget;
  const sourceBase = removeKnownExtension(withoutDistPrefix);
  const bases = normalizedTarget.startsWith('dist/')
    ? [
        sourceBase,
        `src/${sourceBase}`,
        `${sourceBase}/index`,
        `src/${sourceBase}/index`,
      ]
    : [
        withoutKnownExtension,
        sourceBase,
        `src/${sourceBase}`,
        `${sourceBase}/index`,
        `src/${sourceBase}/index`,
      ];
  const candidates: string[] = [];

  for (const base of bases) {
    for (const extension of knownSourceExtensions) {
      candidates.push(`${base}${extension}`);
    }
  }

  return [...new Set(candidates)];
}

function normalizeSlashes(value: string): string {
  return value.replaceAll('\\', '/');
}

function wildcardBaseDirectory(pattern: string): string {
  const wildcardIndex = pattern.indexOf('*');
  const prefix =
    wildcardIndex === -1 ? pattern : pattern.slice(0, wildcardIndex);
  const lastSlashIndex = prefix.lastIndexOf('/');

  return lastSlashIndex === -1 ? '.' : prefix.slice(0, lastSlashIndex);
}

function mapDistWildcardToSourcePattern(target: string): string[] {
  if (!target.startsWith('dist/')) {
    return [];
  }

  const sourcePattern = removeKnownExtension(target.slice('dist/'.length));

  return [
    `${sourcePattern}.ts`,
    `src/${sourcePattern}.ts`,
    `${sourcePattern}.tsx`,
    `src/${sourcePattern}.tsx`,
    `${sourcePattern}.d.ts`,
    `src/${sourcePattern}.d.ts`,
  ];
}

function resolveWildcardTarget(
  packageDirectory: string,
  target: string,
): string | null {
  const candidatePatterns = [target, ...mapDistWildcardToSourcePattern(target)];

  for (const candidatePattern of candidatePatterns) {
    const baseDirectory = wildcardBaseDirectory(candidatePattern);

    if (existsSync(path.join(rootDir, packageDirectory, baseDirectory))) {
      return toPosixPath(path.join(packageDirectory, candidatePattern));
    }
  }

  return null;
}

function resolveExactTarget(
  packageDirectory: string,
  target: string,
): string | null {
  if (target.startsWith('dist/')) {
    for (const candidate of sourceFileCandidates(target)) {
      const absoluteCandidate = path.join(rootDir, packageDirectory, candidate);

      if (existsSync(absoluteCandidate)) {
        return toWorkspacePath(absoluteCandidate);
      }
    }
  }

  const absoluteTarget = path.join(rootDir, packageDirectory, target);

  if (existsSync(absoluteTarget)) {
    return toWorkspacePath(absoluteTarget);
  }

  for (const candidate of sourceFileCandidates(target)) {
    const absoluteCandidate = path.join(rootDir, packageDirectory, candidate);

    if (existsSync(absoluteCandidate)) {
      return toWorkspacePath(absoluteCandidate);
    }
  }

  return null;
}

function resolvePackageTarget(
  packageDirectory: string,
  rawTarget: string,
): string | null {
  const target = normalizePackageTarget(rawTarget);

  if (!target) {
    return null;
  }

  if (target.includes('*')) {
    return resolveWildcardTarget(packageDirectory, target);
  }

  return resolveExactTarget(packageDirectory, target);
}

function collectExportEntries(
  workspacePackage: WorkspacePackage,
): [string, string][] {
  const exportsField = workspacePackage.manifest.exports;

  if (!exportsField) {
    return [];
  }

  const exportEntries =
    typeof exportsField === 'object' &&
    exportsField !== null &&
    !Array.isArray(exportsField) &&
    Object.keys(exportsField).some((key) => key.startsWith('.'))
      ? Object.entries(exportsField as Record<string, unknown>)
      : [['.', exportsField] as const];
  const entries: [string, string][] = [];

  for (const [exportKey, exportValue] of exportEntries.sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const alias = packageExportKeyToAlias(workspacePackage.name, exportKey);

    if (!alias) {
      continue;
    }

    for (const candidate of collectTargetCandidates(exportValue)) {
      const resolvedTarget = resolvePackageTarget(
        workspacePackage.directory,
        candidate,
      );

      if (resolvedTarget) {
        entries.push([alias, resolvedTarget]);
        break;
      }
    }
  }

  return entries;
}

function collectImportEntries(
  workspacePackage: WorkspacePackage,
): [string, string][] {
  const importsField = workspacePackage.manifest.imports;

  if (!importsField) {
    return [];
  }

  const entries: [string, string][] = [];

  for (const [importKey, importValue] of Object.entries(importsField).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (!importKey.startsWith('#')) {
      continue;
    }

    for (const candidate of collectTargetCandidates(importValue)) {
      const resolvedTarget = resolvePackageTarget(
        workspacePackage.directory,
        candidate,
      );

      if (resolvedTarget) {
        entries.push([importKey, resolvedTarget]);
        break;
      }
    }
  }

  return entries;
}

function compareAliases(left: string, right: string): number {
  const leftGroup = left.startsWith('@') ? 1 : 0;
  const rightGroup = right.startsWith('@') ? 1 : 0;

  if (leftGroup !== rightGroup) {
    return leftGroup - rightGroup;
  }

  const leftRoot = left.startsWith('@')
    ? left.split('/').slice(0, 2).join('/')
    : (left.split('/')[0] ?? left);
  const rightRoot = right.startsWith('@')
    ? right.split('/').slice(0, 2).join('/')
    : (right.split('/')[0] ?? right);

  if (leftRoot === rightRoot) {
    const leftPrefixLength = left.split('*')[0]?.length ?? left.length;
    const rightPrefixLength = right.split('*')[0]?.length ?? right.length;

    if (leftPrefixLength !== rightPrefixLength) {
      return rightPrefixLength - leftPrefixLength;
    }
  }

  return left.localeCompare(right);
}

function addPathEntry(
  paths: Map<string, string[]>,
  alias: string,
  target: string,
): void {
  const targets = paths.get(alias) ?? [];

  if (!targets.includes(target)) {
    targets.push(target);
  }

  paths.set(alias, targets);
}

function toTsconfigPathTarget(target: string): string {
  if (target.startsWith('./') || target.startsWith('../')) {
    return target;
  }

  return `./${target}`;
}

function formatPaths(paths: Map<string, string[]>): string {
  const lines: string[] = [];
  const entries = [...paths.entries()].sort(([left], [right]) =>
    compareAliases(left, right),
  );

  for (const [alias, targets] of entries) {
    const pathTargets = targets.map((target) => toTsconfigPathTarget(target));

    if (pathTargets.length === 1) {
      lines.push(
        `      ${JSON.stringify(alias)}: [${JSON.stringify(pathTargets[0])}],`,
      );
      continue;
    }

    lines.push(`      ${JSON.stringify(alias)}: [`);

    for (const target of pathTargets) {
      lines.push(`        ${JSON.stringify(target)},`);
    }

    lines.push('      ],');
  }

  return lines.join('\n');
}

async function formatGeneratedConfig(
  paths: Map<string, string[]>,
): Promise<string> {
  const rawConfig = `{
  "$schema": "https://json.schemastore.org/tsconfig",
  /**
   * GENERATED FILE - DO NOT EDIT BY HAND.
   *
   * Run \`pnpm tsconfig:graph:paths\` to regenerate this file from workspace
   * package exports/imports.
   */
  "compilerOptions": {
    "paths": {
${formatPaths(paths)}
    },
  },
}
`;

  return format(rawConfig, {
    ...(await resolveConfig(outputPath)),
    filepath: outputPath,
  });
}

async function readCurrentGeneratedConfig(): Promise<string | null> {
  if (!existsSync(outputPath)) {
    return null;
  }

  return readFile(outputPath, 'utf8');
}

async function writeGeneratedConfigIfChanged(
  content: string,
): Promise<boolean> {
  const currentContent = await readCurrentGeneratedConfig();

  if (currentContent === content) {
    return false;
  }

  await writeFile(outputPath, content);

  return true;
}

async function main(): Promise<void> {
  const options = parseCliOptions();
  const workspacePackages = await collectWorkspacePackages();
  const paths = new Map<string, string[]>();

  for (const workspacePackage of workspacePackages) {
    for (const [alias, target] of collectImportEntries(workspacePackage)) {
      addPathEntry(paths, alias, target);
    }
  }

  for (const workspacePackage of workspacePackages) {
    for (const [alias, target] of collectExportEntries(workspacePackage)) {
      addPathEntry(paths, alias, target);
    }
  }

  const generatedConfig = await formatGeneratedConfig(paths);
  const outputRelativePath = toWorkspacePath(outputPath);

  if (options.check) {
    const currentContent = await readCurrentGeneratedConfig();

    if (currentContent !== generatedConfig) {
      throw new Error(
        `${outputRelativePath} is stale. Run \`pnpm tsconfig:graph:paths\` and commit the result.`,
      );
    }

    process.stdout.write(
      `Verified ${outputRelativePath} with ${paths.size} path aliases.\n`,
    );
    return;
  }

  const didWrite = await writeGeneratedConfigIfChanged(generatedConfig);
  const action = didWrite ? 'Generated' : 'Skipped unchanged';

  process.stdout.write(
    `${action} ${outputRelativePath} with ${paths.size} path aliases.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
