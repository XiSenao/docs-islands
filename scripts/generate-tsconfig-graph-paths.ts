import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { glob } from 'tinyglobby';
import ts from 'typescript';
import { parse } from 'yaml';

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

interface LockfileDependency {
  specifier?: string;
  version?: string;
}

interface LockfileImporter {
  dependencies?: Record<string, LockfileDependency>;
  devDependencies?: Record<string, LockfileDependency>;
  optionalDependencies?: Record<string, LockfileDependency>;
  peerDependencies?: Record<string, LockfileDependency>;
}

interface Lockfile {
  importers?: Record<string, LockfileImporter>;
}

interface GeneratedConfig {
  aliasCount: number;
  content: string;
  outputPath: string;
}

interface GenerateOptions {
  ensure?: boolean;
}

interface GenerateResult {
  aliasCount: number;
  buildConfigCount: number;
  buildConfigExtendsChangedCount: number;
  changed: boolean;
  outputCount: number;
}

interface BuildConfigExtendsMaintenanceResult {
  changed: boolean;
  changedCount: number;
  checkedCount: number;
  injectedCount: number;
  removedCount: number;
}

interface BuildConfigExtendsUpdateResult {
  changed: boolean;
  injectedCount: number;
  removedCount: number;
}

interface TextEdit {
  end: number;
  replacement: string;
  start: number;
}

const rootDir = process.cwd();
const generatedConfigFileName = 'tsconfig.graph.paths.generated.json';
const internalPackageScope = '@docs-islands/';
const generatedFileMarker = 'GENERATED FILE - DO NOT EDIT BY HAND.';
const stalePathsMessage =
  'TypeScript graph path state may be stale; updating generated paths and build config extends.\n';
const buildConfigPattern = '**/tsconfig*.build.json';
const formatDiagnosticsHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => rootDir,
  getNewLine: () => '\n',
};
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

function normalizeWorkspacePath(value: string): string {
  const relativePath = toPosixPath(path.relative(rootDir, value));

  return relativePath.length === 0 ? '.' : relativePath;
}

function toAbsolutePath(workspacePath: string): string {
  return path.resolve(rootDir, workspacePath);
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

async function readPnpmLockfile(): Promise<Lockfile> {
  const lockfilePath = path.join(rootDir, 'pnpm-lock.yaml');
  const lockfile = parse(await readFile(lockfilePath, 'utf8')) as Lockfile;

  if (!lockfile.importers || typeof lockfile.importers !== 'object') {
    throw new Error('pnpm-lock.yaml does not contain importers.');
  }

  return lockfile;
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

function normalizeSlashes(value: string): string {
  return value.replaceAll('\\', '/');
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
        return normalizeWorkspacePath(absoluteCandidate);
      }
    }
  }

  const absoluteTarget = path.join(rootDir, packageDirectory, target);

  if (existsSync(absoluteTarget)) {
    return normalizeWorkspacePath(absoluteTarget);
  }

  for (const candidate of sourceFileCandidates(target)) {
    const absoluteCandidate = path.join(rootDir, packageDirectory, candidate);

    if (existsSync(absoluteCandidate)) {
      return normalizeWorkspacePath(absoluteCandidate);
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
  packageDirectory: string,
  manifest: PackageManifest,
): [string, string][] {
  const importsField = manifest.imports;

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
      const resolvedTarget = resolvePackageTarget(packageDirectory, candidate);

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

function toTsconfigPathTarget(outputDirectory: string, target: string): string {
  const relativeTarget = toPosixPath(
    path.relative(outputDirectory, toAbsolutePath(target)),
  );

  if (relativeTarget.startsWith('./') || relativeTarget.startsWith('../')) {
    return relativeTarget;
  }

  return `./${relativeTarget}`;
}

function formatPaths(
  paths: Map<string, string[]>,
  outputDirectory: string,
): string {
  const lines: string[] = [];
  const entries = [...paths.entries()].sort(([left], [right]) =>
    compareAliases(left, right),
  );

  for (const [alias, targets] of entries) {
    const pathTargets = targets.map((target) =>
      toTsconfigPathTarget(outputDirectory, target),
    );

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
  outputPath: string,
): Promise<string> {
  const outputDirectory = path.dirname(outputPath);
  const rawConfig = `{
  "$schema": "https://json.schemastore.org/tsconfig",
  /**
   * ${generatedFileMarker}
   *
   * Run \`pnpm tsconfig:graph:paths\` to regenerate this file from pnpm-lock
   * importer workspace links and package exports/imports.
   */
  "compilerOptions": {
    "paths": {
${formatPaths(paths, outputDirectory)}
    },
  },
}
`;

  return format(rawConfig, {
    ...(await resolveConfig(outputPath)),
    filepath: outputPath,
  });
}

async function readCurrentGeneratedConfig(
  outputPath: string,
): Promise<string | null> {
  if (!existsSync(outputPath)) {
    return null;
  }

  return readFile(outputPath, 'utf8');
}

function getDependencySections(
  importer: LockfileImporter,
): Record<string, LockfileDependency>[] {
  return [
    importer.dependencies,
    importer.devDependencies,
    importer.optionalDependencies,
    importer.peerDependencies,
  ].filter((section): section is Record<string, LockfileDependency> =>
    Boolean(section),
  );
}

function isWorkspaceLockfileDependency(
  dependency: LockfileDependency,
): boolean {
  return (
    dependency.specifier?.startsWith('workspace:') === true &&
    dependency.version?.startsWith('link:') === true
  );
}

function collectWorkspaceDependencyNames(options: {
  importer: LockfileImporter;
  importerDirectory: string;
  workspacePackagesByDirectory: Map<string, WorkspacePackage>;
}): string[] {
  const dependencyNames = new Set<string>();

  for (const dependencies of getDependencySections(options.importer)) {
    for (const [dependencyName, dependency] of Object.entries(dependencies)) {
      if (
        !dependencyName.startsWith(internalPackageScope) ||
        !isWorkspaceLockfileDependency(dependency)
      ) {
        continue;
      }

      const linkedPackageDirectory = normalizeWorkspacePath(
        path.resolve(
          rootDir,
          options.importerDirectory,
          dependency.version!.slice('link:'.length),
        ),
      );
      const linkedPackage = options.workspacePackagesByDirectory.get(
        linkedPackageDirectory,
      );

      if (linkedPackage?.name === dependencyName) {
        dependencyNames.add(dependencyName);
      }
    }
  }

  return [...dependencyNames].sort();
}

async function readImporterManifest(
  importerDirectory: string,
): Promise<PackageManifest | null> {
  const packageJsonPath = path.join(rootDir, importerDirectory, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  return readJsonFile<PackageManifest>(packageJsonPath);
}

async function collectGeneratedConfigs(): Promise<GeneratedConfig[]> {
  const [lockfile, workspacePackages] = await Promise.all([
    readPnpmLockfile(),
    collectWorkspacePackages(),
  ]);
  const workspacePackagesByName = new Map(
    workspacePackages.map((workspacePackage) => [
      workspacePackage.name,
      workspacePackage,
    ]),
  );
  const workspacePackagesByDirectory = new Map(
    workspacePackages.map((workspacePackage) => [
      workspacePackage.directory,
      workspacePackage,
    ]),
  );
  const generatedConfigs: GeneratedConfig[] = [];

  for (const [rawImporterDirectory, importer] of Object.entries(
    lockfile.importers!,
  ).sort(([left], [right]) => left.localeCompare(right))) {
    const importerDirectory =
      rawImporterDirectory === '.' ? '.' : rawImporterDirectory;
    const importerManifest = await readImporterManifest(importerDirectory);

    if (!importerManifest) {
      continue;
    }

    const paths = new Map<string, string[]>();

    for (const [alias, target] of collectImportEntries(
      importerDirectory,
      importerManifest,
    )) {
      addPathEntry(paths, alias, target);
    }

    for (const dependencyName of collectWorkspaceDependencyNames({
      importer,
      importerDirectory,
      workspacePackagesByDirectory,
    })) {
      const workspacePackage = workspacePackagesByName.get(dependencyName);

      if (!workspacePackage) {
        continue;
      }

      for (const [alias, target] of collectExportEntries(workspacePackage)) {
        addPathEntry(paths, alias, target);
      }
    }

    if (paths.size === 0) {
      continue;
    }

    const outputPath = path.join(
      rootDir,
      importerDirectory,
      generatedConfigFileName,
    );

    generatedConfigs.push({
      aliasCount: paths.size,
      content: await formatGeneratedConfig(paths, outputPath),
      outputPath,
    });
  }

  return generatedConfigs.sort((left, right) =>
    left.outputPath.localeCompare(right.outputPath),
  );
}

async function isGeneratedTsconfigPathsFile(
  filePath: string,
): Promise<boolean> {
  try {
    return (await readFile(filePath, 'utf8')).includes(generatedFileMarker);
  } catch {
    return false;
  }
}

async function collectExistingGeneratedConfigPaths(): Promise<string[]> {
  const files = await glob(`**/${generatedConfigFileName}`, {
    cwd: rootDir,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**'],
  });

  return files.map((filePath) => path.resolve(filePath)).sort();
}

async function writeGeneratedConfigs(
  generatedConfigs: GeneratedConfig[],
): Promise<boolean> {
  let didChange = false;
  const expectedOutputPaths = new Set(
    generatedConfigs.map((config) => path.resolve(config.outputPath)),
  );

  for (const existingFile of await collectExistingGeneratedConfigPaths()) {
    if (expectedOutputPaths.has(existingFile)) {
      continue;
    }

    if (await isGeneratedTsconfigPathsFile(existingFile)) {
      await rm(existingFile);
      didChange = true;
    }
  }

  for (const generatedConfig of generatedConfigs) {
    const currentContent = await readCurrentGeneratedConfig(
      generatedConfig.outputPath,
    );

    if (currentContent === generatedConfig.content) {
      continue;
    }

    await mkdir(path.dirname(generatedConfig.outputPath), { recursive: true });
    await writeFile(generatedConfig.outputPath, generatedConfig.content);
    didChange = true;
  }

  return didChange;
}

async function collectBuildConfigPaths(): Promise<string[]> {
  const files = await glob(buildConfigPattern, {
    cwd: rootDir,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.tsbuild/**'],
  });

  return files.map((filePath) => path.resolve(filePath)).sort();
}

async function collectImporterDirectories(): Promise<string[]> {
  const lockfile = await readPnpmLockfile();
  const importerDirectories = new Set<string>();

  for (const rawImporterDirectory of Object.keys(lockfile.importers!).sort()) {
    const importerDirectory =
      rawImporterDirectory === '.'
        ? '.'
        : normalizeSlashes(rawImporterDirectory.replace(/\/$/u, ''));

    if (await readImporterManifest(importerDirectory)) {
      importerDirectories.add(importerDirectory);
    }
  }

  return [...importerDirectories];
}

function isWorkspacePathInsideDirectory(
  workspacePath: string,
  directory: string,
): boolean {
  if (directory === '.') {
    return true;
  }

  return (
    workspacePath === directory || workspacePath.startsWith(`${directory}/`)
  );
}

function findOwningImporterDirectory(
  configPath: string,
  importerDirectories: string[],
): string | null {
  const configDirectory = normalizeWorkspacePath(path.dirname(configPath));
  let owner: string | null = null;

  for (const importerDirectory of importerDirectories) {
    if (!isWorkspacePathInsideDirectory(configDirectory, importerDirectory)) {
      continue;
    }

    if (!owner || importerDirectory.length > owner.length) {
      owner = importerDirectory;
    }
  }

  return owner;
}

function toTsconfigExtendsPath(configPath: string, targetPath: string): string {
  const relativeTarget = toPosixPath(
    path.relative(path.dirname(configPath), targetPath),
  );

  if (relativeTarget.startsWith('./') || relativeTarget.startsWith('../')) {
    return relativeTarget;
  }

  return `./${relativeTarget}`;
}

function parseJsonSourceFile(
  configPath: string,
  content: string,
): ts.JsonSourceFile {
  const parsedConfig = ts.parseConfigFileTextToJson(configPath, content);

  if (parsedConfig.error) {
    throw new Error(
      ts.formatDiagnostic(parsedConfig.error, formatDiagnosticsHost),
    );
  }

  return ts.parseJsonText(configPath, content);
}

function getTopLevelObjectExpression(
  sourceFile: ts.JsonSourceFile,
): ts.ObjectLiteralExpression {
  const statement = sourceFile.statements[0];

  if (
    !statement ||
    !ts.isExpressionStatement(statement) ||
    !ts.isObjectLiteralExpression(statement.expression)
  ) {
    throw new Error(`${sourceFile.fileName} must contain a top-level object.`);
  }

  return statement.expression;
}

function getPropertyNameText(name: ts.PropertyName): string | null {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }

  return null;
}

function findPropertyAssignment(
  objectExpression: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.PropertyAssignment | null {
  for (const property of objectExpression.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      getPropertyNameText(property.name) === propertyName
    ) {
      return property;
    }
  }

  return null;
}

function readExtendsValues(
  configPath: string,
  extendsProperty: ts.PropertyAssignment | null,
): string[] {
  if (!extendsProperty) {
    return [];
  }

  const { initializer } = extendsProperty;

  if (ts.isStringLiteral(initializer)) {
    return [initializer.text];
  }

  if (!ts.isArrayLiteralExpression(initializer)) {
    throw new Error(`${configPath} has an unsupported extends value.`);
  }

  return initializer.elements.map((element) => {
    if (!ts.isStringLiteral(element)) {
      throw new Error(`${configPath} has a non-string extends entry.`);
    }

    return element.text;
  });
}

function isGeneratedConfigExtendsReference(reference: string): boolean {
  return (
    path.posix.basename(normalizeSlashes(reference)) === generatedConfigFileName
  );
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function formatExtendsInitializer(values: string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(', ')}]`;
}

function applyTextEdits(content: string, edits: TextEdit[]): string {
  return [...edits]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (nextContent, edit) =>
        `${nextContent.slice(0, edit.start)}${edit.replacement}${nextContent.slice(edit.end)}`,
      content,
    );
}

function nextNonWhitespaceIndex(content: string, start: number): number {
  let index = start;

  while (index < content.length && /\s/u.test(content[index]!)) {
    index += 1;
  }

  return index;
}

function createInsertExtendsEdit(options: {
  content: string;
  objectExpression: ts.ObjectLiteralExpression;
  sourceFile: ts.JsonSourceFile;
  values: string[];
}): TextEdit {
  const propertyText = `"extends": ${formatExtendsInitializer(options.values)}`;
  const schemaProperty = findPropertyAssignment(
    options.objectExpression,
    '$schema',
  );

  if (schemaProperty) {
    const afterSchema = schemaProperty.getEnd();
    const commaIndex = nextNonWhitespaceIndex(options.content, afterSchema);
    const hasSchemaComma = options.content[commaIndex] === ',';
    const insertionPoint = hasSchemaComma ? commaIndex + 1 : afterSchema;

    return {
      end: insertionPoint,
      replacement: `${hasSchemaComma ? '' : ','}\n  ${propertyText},`,
      start: insertionPoint,
    };
  }

  const objectStart = options.objectExpression.getStart(options.sourceFile);

  return {
    end: objectStart + 1,
    replacement: `\n  ${propertyText},`,
    start: objectStart + 1,
  };
}

function createRemoveExtendsEdit(options: {
  objectExpression: ts.ObjectLiteralExpression;
  property: ts.PropertyAssignment;
  sourceFile: ts.JsonSourceFile;
}): TextEdit {
  const properties = [...options.objectExpression.properties];
  const propertyIndex = properties.indexOf(options.property);
  const nextProperty = properties[propertyIndex + 1];
  const previousProperty = properties[propertyIndex - 1];

  if (nextProperty) {
    return {
      end: nextProperty.getStart(options.sourceFile),
      replacement: '',
      start: options.property.getStart(options.sourceFile),
    };
  }

  if (previousProperty) {
    return {
      end: options.property.getEnd(),
      replacement: '',
      start: previousProperty.getEnd(),
    };
  }

  return {
    end: options.property.getEnd(),
    replacement: '',
    start: options.property.getStart(options.sourceFile),
  };
}

async function formatJsonConfigContent(
  configPath: string,
  content: string,
): Promise<string> {
  return format(content, {
    ...(await resolveConfig(configPath)),
    filepath: configPath,
  });
}

async function updateBuildConfigExtends(
  configPath: string,
  expectedGeneratedConfigPath: string | null,
): Promise<BuildConfigExtendsUpdateResult> {
  const content = await readFile(configPath, 'utf8');
  const sourceFile = parseJsonSourceFile(configPath, content);
  const objectExpression = getTopLevelObjectExpression(sourceFile);
  const extendsProperty = findPropertyAssignment(objectExpression, 'extends');
  const existingValues = readExtendsValues(configPath, extendsProperty);
  const existingGeneratedValues = existingValues.filter(
    isGeneratedConfigExtendsReference,
  );
  const nonGeneratedValues = existingValues.filter(
    (value) => !isGeneratedConfigExtendsReference(value),
  );
  const expectedGeneratedValue = expectedGeneratedConfigPath
    ? toTsconfigExtendsPath(configPath, expectedGeneratedConfigPath)
    : null;
  const nextValues = expectedGeneratedValue
    ? [expectedGeneratedValue, ...nonGeneratedValues]
    : nonGeneratedValues;

  if (areStringArraysEqual(existingValues, nextValues)) {
    return {
      changed: false,
      injectedCount: 0,
      removedCount: 0,
    };
  }

  const retainedGeneratedCount =
    expectedGeneratedValue &&
    existingGeneratedValues.includes(expectedGeneratedValue)
      ? 1
      : 0;
  const injectedCount =
    expectedGeneratedValue && retainedGeneratedCount === 0 ? 1 : 0;
  const removedCount = existingGeneratedValues.length - retainedGeneratedCount;
  const edit =
    extendsProperty && nextValues.length > 0
      ? {
          end: extendsProperty.initializer.getEnd(),
          replacement: formatExtendsInitializer(nextValues),
          start: extendsProperty.initializer.getStart(sourceFile),
        }
      : extendsProperty
        ? createRemoveExtendsEdit({
            objectExpression,
            property: extendsProperty,
            sourceFile,
          })
        : createInsertExtendsEdit({
            content,
            objectExpression,
            sourceFile,
            values: nextValues,
          });
  const nextContent = await formatJsonConfigContent(
    configPath,
    applyTextEdits(content, [edit]),
  );

  if (nextContent === content) {
    return {
      changed: false,
      injectedCount: 0,
      removedCount: 0,
    };
  }

  await writeFile(configPath, nextContent);

  return {
    changed: true,
    injectedCount,
    removedCount,
  };
}

async function maintainBuildConfigExtends(
  generatedConfigs: GeneratedConfig[],
): Promise<BuildConfigExtendsMaintenanceResult> {
  const [buildConfigPaths, importerDirectories] = await Promise.all([
    collectBuildConfigPaths(),
    collectImporterDirectories(),
  ]);
  const expectedGeneratedConfigPaths = new Set(
    generatedConfigs.map((config) => path.resolve(config.outputPath)),
  );
  let changedCount = 0;
  let injectedCount = 0;
  let removedCount = 0;

  for (const configPath of buildConfigPaths) {
    const owningImporterDirectory = findOwningImporterDirectory(
      configPath,
      importerDirectories,
    );
    const expectedGeneratedConfigPath = owningImporterDirectory
      ? path.resolve(rootDir, owningImporterDirectory, generatedConfigFileName)
      : null;
    const updateResult = await updateBuildConfigExtends(
      configPath,
      expectedGeneratedConfigPath &&
        expectedGeneratedConfigPaths.has(expectedGeneratedConfigPath)
        ? expectedGeneratedConfigPath
        : null,
    );

    if (!updateResult.changed) {
      continue;
    }

    changedCount += 1;
    injectedCount += updateResult.injectedCount;
    removedCount += updateResult.removedCount;
  }

  return {
    changed: changedCount > 0,
    changedCount,
    checkedCount: buildConfigPaths.length,
    injectedCount,
    removedCount,
  };
}

export async function runGenerateTsconfigGraphPaths(
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const generatedConfigs = await collectGeneratedConfigs();
  const generatedConfigsDidChange =
    await writeGeneratedConfigs(generatedConfigs);
  const buildConfigExtendsMaintenance =
    await maintainBuildConfigExtends(generatedConfigs);
  const didChange =
    generatedConfigsDidChange || buildConfigExtendsMaintenance.changed;
  const aliasCount = generatedConfigs.reduce(
    (total, config) => total + config.aliasCount,
    0,
  );

  if (options.ensure && didChange) {
    process.stdout.write(stalePathsMessage);
  }

  const generatedConfigsAction = generatedConfigsDidChange
    ? 'Generated'
    : 'Skipped unchanged';
  process.stdout.write(
    `${generatedConfigsAction} ${generatedConfigs.length} TypeScript graph path config files with ${aliasCount} path aliases.\n`,
  );

  const buildConfigExtendsAction = buildConfigExtendsMaintenance.changed
    ? 'Updated'
    : 'Skipped unchanged';
  process.stdout.write(
    `${buildConfigExtendsAction} ${buildConfigExtendsMaintenance.checkedCount} TypeScript build config extends lists (${buildConfigExtendsMaintenance.injectedCount} injected, ${buildConfigExtendsMaintenance.removedCount} removed).\n`,
  );

  return {
    aliasCount,
    buildConfigCount: buildConfigExtendsMaintenance.checkedCount,
    buildConfigExtendsChangedCount: buildConfigExtendsMaintenance.changedCount,
    changed: didChange,
    outputCount: generatedConfigs.length,
  };
}

function parseCliOptions(): GenerateOptions {
  const args = process.argv.slice(2);
  const unknownArgs = args.filter((arg) => arg !== '--ensure');

  if (unknownArgs.length > 0) {
    throw new Error(`Unknown option: ${unknownArgs.join(', ')}`);
  }

  return {
    ensure: args.includes('--ensure'),
  };
}

function isDirectRun(): boolean {
  const entryPoint = process.argv[1]
    ? pathToFileURL(path.resolve(process.argv[1])).href
    : '';

  return import.meta.url === entryPoint;
}

if (isDirectRun()) {
  runGenerateTsconfigGraphPaths(parseCliOptions()).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
