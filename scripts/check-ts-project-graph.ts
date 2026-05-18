import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { parse } from 'yaml';

type JsonObject = Record<string, unknown>;

interface ProjectInfo {
  configPath: string;
  fileNames: string[];
  options: ts.CompilerOptions;
  references: Set<string>;
}

interface ImportRecord {
  filePath: string;
  line: number;
  specifier: string;
}

interface PackageInfo {
  directory: string;
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

interface ImporterInfo {
  directory: string;
  name?: string;
  workspaceDependencies: Set<string>;
}

type ProjectKind =
  | 'lib'
  | 'runtime-client'
  | 'runtime-node'
  | 'runtime-shared'
  | 'solution'
  | 'source'
  | 'test'
  | 'tools'
  | 'types'
  | 'unknown';

const rootDir = process.cwd();
const rootGraphConfigPath = path.join(rootDir, 'tsconfig.graph.json');
const internalPackageScope = '@docs-islands/';
const nodeBuiltinSpecifierPrefix = 'node:';
const tsLikeFilePattern = /\.(?:[cm]?tsx?|d\.[cm]?ts)$/u;
const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => rootDir,
  getNewLine: () => '\n',
};

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function toRelativePath(absolutePath: string): string {
  return toPosixPath(path.relative(rootDir, absolutePath));
}

function normalizeAbsolutePath(value: string): string {
  return toPosixPath(path.resolve(value));
}

function readJsonConfig(configPath: string): JsonObject {
  const result = ts.readConfigFile(configPath, ts.sys.readFile);

  if (result.error) {
    throw new Error(ts.formatDiagnostic(result.error, formatHost));
  }

  return result.config as JsonObject;
}

function resolveReferencePath(
  configPath: string,
  referencePath: string,
): string {
  const absoluteReferencePath = path.resolve(
    path.dirname(configPath),
    referencePath,
  );

  if (path.extname(absoluteReferencePath) === '.json') {
    return normalizeAbsolutePath(absoluteReferencePath);
  }

  return normalizeAbsolutePath(
    path.join(absoluteReferencePath, 'tsconfig.json'),
  );
}

function getRawReferencePaths(configPath: string): string[] {
  const config = readJsonConfig(configPath);
  const references = config.references;

  if (!Array.isArray(references)) {
    return [];
  }

  return references.flatMap((reference) => {
    if (
      !reference ||
      typeof reference !== 'object' ||
      Array.isArray(reference) ||
      typeof (reference as { path?: unknown }).path !== 'string'
    ) {
      return [];
    }

    return [
      resolveReferencePath(configPath, (reference as { path: string }).path),
    ];
  });
}

function parseProject(configPath: string): ProjectInfo {
  const diagnostics: ts.Diagnostic[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    },
  );

  if (!parsed) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost),
    );
  }

  if (parsed.errors.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(parsed.errors, formatHost),
    );
  }

  return {
    configPath: normalizeAbsolutePath(configPath),
    fileNames: parsed.fileNames
      .filter((fileName) => tsLikeFilePattern.test(fileName))
      .map(normalizeAbsolutePath),
    options: parsed.options,
    references: new Set(getRawReferencePaths(configPath)),
  };
}

function collectGraphProjectPaths(): string[] {
  const seen = new Set<string>();
  const orderedProjects: string[] = [];
  const queue = getRawReferencePaths(rootGraphConfigPath);

  for (const projectPath of queue) {
    seen.add(projectPath);
  }

  for (const projectPath of queue) {
    if (!projectPath || !existsSync(projectPath)) {
      continue;
    }

    orderedProjects.push(projectPath);

    for (const referencePath of getRawReferencePaths(projectPath)) {
      if (seen.has(referencePath)) {
        continue;
      }

      seen.add(referencePath);
      queue.push(referencePath);
    }
  }

  return orderedProjects;
}

function collectWorkspacePackages(): PackageInfo[] {
  const packageJsonPaths = ts.sys.readDirectory(
    rootDir,
    ['.json'],
    ['node_modules', 'dist'],
    ['**/package.json'],
  );
  const packages: PackageInfo[] = [];

  for (const packageJsonPath of packageJsonPaths) {
    const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      name?: string;
    };

    if (!manifest.name?.startsWith(internalPackageScope)) {
      continue;
    }

    packages.push({
      directory: normalizeAbsolutePath(path.dirname(packageJsonPath)),
      name: manifest.name,
    });
  }

  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

function readPnpmLockfile(): Lockfile {
  const lockfilePath = path.join(rootDir, 'pnpm-lock.yaml');
  const lockfile = parse(readFileSync(lockfilePath, 'utf8')) as Lockfile;

  if (!lockfile.importers || typeof lockfile.importers !== 'object') {
    throw new Error('pnpm-lock.yaml does not contain importers.');
  }

  return lockfile;
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

function getSourceFileKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }

  if (filePath.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }

  return ts.ScriptKind.TS;
}

function stringLiteralValue(node: ts.Node | undefined): string | null {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

function collectImportsFromFile(filePath: string): ImportRecord[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getSourceFileKind(filePath),
  );
  const imports: ImportRecord[] = [];
  const addImport = (specifier: string, node: ts.Node): void => {
    const location = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );

    imports.push({
      filePath,
      line: location.line + 1,
      specifier,
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = stringLiteralValue(node.moduleSpecifier);

      if (specifier) {
        addImport(specifier, node);
      }
    } else if (ts.isImportTypeNode(node)) {
      const specifier = ts.isLiteralTypeNode(node.argument)
        ? stringLiteralValue(node.argument.literal)
        : null;

      if (specifier) {
        addImport(specifier, node);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const specifier = stringLiteralValue(node.arguments[0]);

      if (specifier) {
        addImport(specifier, node);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return imports;
}

function resolveInternalImport(
  specifier: string,
  containingFile: string,
  options: ts.CompilerOptions,
): string | null {
  const resolved = ts.resolveModuleName(
    specifier,
    containingFile,
    options,
    ts.sys,
  ).resolvedModule;

  return resolved?.resolvedFileName
    ? normalizeAbsolutePath(resolved.resolvedFileName)
    : null;
}

function getProjectKind(configPath: string): ProjectKind {
  const normalized = toRelativePath(configPath);

  if (
    normalized === 'tsconfig.graph.json' ||
    normalized === 'tsconfig.graph.lib.json' ||
    normalized.endsWith('/tsconfig.graph.lib.json')
  ) {
    return 'solution';
  }

  if (normalized === 'scripts/tsconfig.build.json') {
    return 'tools';
  }

  if (
    normalized.endsWith('/tsconfig.graph.json') &&
    !normalized.includes('/src/')
  ) {
    return 'solution';
  }

  if (normalized === 'packages/vitepress/src/shared/tsconfig.build.json') {
    return 'runtime-shared';
  }

  if (normalized === 'packages/vitepress/src/node/tsconfig.build.json') {
    return 'runtime-node';
  }

  if (normalized === 'packages/vitepress/src/client/tsconfig.build.json') {
    return 'runtime-client';
  }

  if (normalized.endsWith('/tsconfig.lib.build.json')) {
    return 'lib';
  }

  if (normalized.endsWith('/tsconfig.tools.build.json')) {
    return 'tools';
  }

  if (normalized.endsWith('/tsconfig.test.build.json')) {
    return 'test';
  }

  if (normalized.endsWith('/tsconfig.source.build.json')) {
    return 'source';
  }

  return 'unknown';
}

function isProductionGraphKind(kind: ProjectKind): boolean {
  return (
    kind === 'lib' ||
    kind === 'runtime-client' ||
    kind === 'runtime-node' ||
    kind === 'runtime-shared' ||
    kind === 'types'
  );
}

function isRuntimeKind(kind: ProjectKind): boolean {
  return (
    kind === 'runtime-client' ||
    kind === 'runtime-node' ||
    kind === 'runtime-shared'
  );
}

function getForbiddenEdgeReason(
  fromProjectPath: string,
  toProjectPath: string,
): string | null {
  const fromKind = getProjectKind(fromProjectPath);
  const toKind = getProjectKind(toProjectPath);

  if (
    (isProductionGraphKind(fromKind) || isRuntimeKind(fromKind)) &&
    (toKind === 'tools' || toKind === 'test')
  ) {
    return 'production library/runtime graph must not depend on tools or tests';
  }

  if (fromKind === 'tools' && toKind === 'test') {
    return 'tools graph must not depend on tests';
  }

  if (fromKind !== 'solution' && toKind === 'solution') {
    return 'build leaves must reference build leaves, not parent graph aggregators';
  }

  if (fromKind === 'runtime-client' && toKind === 'runtime-node') {
    return 'client runtime must not depend on node runtime';
  }

  if (
    fromKind === 'runtime-shared' &&
    (toKind === 'runtime-node' || toKind === 'runtime-client')
  ) {
    return 'shared runtime must stay independent of node/client runtime';
  }

  return null;
}

function getForbiddenNodeBuiltinReason(projectPath: string): string | null {
  const projectKind = getProjectKind(projectPath);

  if (projectKind === 'runtime-client') {
    return 'client runtime must not import Node builtins';
  }

  if (projectKind === 'runtime-shared') {
    return 'shared runtime must not import Node builtins';
  }

  return null;
}

function projectPriority(configPath: string): number {
  switch (getProjectKind(configPath)) {
    case 'lib':
      return 0;
    case 'runtime-shared':
      return 1;
    case 'runtime-node':
      return 2;
    case 'runtime-client':
      return 3;
    case 'types':
      return 4;
    case 'tools':
      return 10;
    case 'test':
      return 20;
    case 'source':
      return 30;
    case 'solution':
      return 40;
    case 'unknown':
      return 50;
  }

  return 50;
}

function chooseOwningProject(projectPaths: string[]): string {
  return [...projectPaths].sort((left, right) => {
    const priorityDelta = projectPriority(left) - projectPriority(right);

    return priorityDelta === 0 ? left.localeCompare(right) : priorityDelta;
  })[0]!;
}

function findPackageForSpecifier(
  specifier: string,
  packages: PackageInfo[],
): PackageInfo | null {
  const [scope, name] = specifier.split('/');
  const packageName = scope && name ? `${scope}/${name}` : specifier;

  return (
    packages.find(
      (workspacePackage) => workspacePackage.name === packageName,
    ) ?? null
  );
}

function readPackageName(directoryPath: string): string | undefined {
  const packageJsonPath = path.join(directoryPath, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return undefined;
  }

  return (
    JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: string }
  ).name;
}

function isPathInsideDirectory(
  filePath: string,
  directoryPath: string,
): boolean {
  const normalizedFilePath = normalizeAbsolutePath(filePath);
  const normalizedDirectoryPath = normalizeAbsolutePath(directoryPath);

  return (
    normalizedFilePath === normalizedDirectoryPath ||
    normalizedFilePath.startsWith(`${normalizedDirectoryPath}/`)
  );
}

function isWorkspacePackageFile(
  filePath: string,
  packages: PackageInfo[],
): boolean {
  return packages.some((workspacePackage) =>
    isPathInsideDirectory(filePath, workspacePackage.directory),
  );
}

function collectImporters(packages: PackageInfo[]): ImporterInfo[] {
  const lockfile = readPnpmLockfile();
  const packagesByDirectory = new Map(
    packages.map((workspacePackage) => [
      workspacePackage.directory,
      workspacePackage,
    ]),
  );
  const importers: ImporterInfo[] = [];

  for (const [rawImporterDirectory, importer] of Object.entries(
    lockfile.importers!,
  )) {
    const importerDirectory =
      rawImporterDirectory === '.'
        ? rootDir
        : normalizeAbsolutePath(path.join(rootDir, rawImporterDirectory));
    const workspaceDependencies = new Set<string>();

    for (const dependencies of getDependencySections(importer)) {
      for (const [dependencyName, dependency] of Object.entries(dependencies)) {
        if (
          !dependencyName.startsWith(internalPackageScope) ||
          !isWorkspaceLockfileDependency(dependency)
        ) {
          continue;
        }

        const linkedPackageDirectory = normalizeAbsolutePath(
          path.resolve(
            importerDirectory,
            dependency.version!.slice('link:'.length),
          ),
        );
        const linkedPackage = packagesByDirectory.get(linkedPackageDirectory);

        if (linkedPackage?.name === dependencyName) {
          workspaceDependencies.add(dependencyName);
        }
      }
    }

    importers.push({
      directory: importerDirectory,
      name: readPackageName(importerDirectory),
      workspaceDependencies,
    });
  }

  return importers.sort((left, right) => {
    return right.directory.length - left.directory.length;
  });
}

function findImporterForFile(
  filePath: string,
  importers: ImporterInfo[],
): ImporterInfo | null {
  return (
    importers.find((importer) =>
      isPathInsideDirectory(filePath, importer.directory),
    ) ?? null
  );
}

function shouldResolveThroughGraph(
  importer: ImporterInfo | null,
  targetPackage: PackageInfo | null,
): boolean {
  if (!importer || !targetPackage) {
    return false;
  }

  return (
    importer.name === targetPackage.name ||
    importer.workspaceDependencies.has(targetPackage.name)
  );
}

function inferVitePressProject(resolvedFilePath: string): string | null {
  const relativePath = toRelativePath(resolvedFilePath);

  if (relativePath.startsWith('packages/vitepress/src/types/')) {
    return normalizeAbsolutePath(
      path.join(rootDir, 'packages/vitepress/src/shared/tsconfig.build.json'),
    );
  }

  if (relativePath.startsWith('packages/vitepress/types/')) {
    return null;
  }

  if (relativePath.startsWith('packages/vitepress/src/shared/')) {
    return normalizeAbsolutePath(
      path.join(rootDir, 'packages/vitepress/src/shared/tsconfig.build.json'),
    );
  }

  if (relativePath.startsWith('packages/vitepress/src/node/')) {
    return normalizeAbsolutePath(
      path.join(rootDir, 'packages/vitepress/src/node/tsconfig.build.json'),
    );
  }

  if (relativePath.startsWith('packages/vitepress/src/client/')) {
    return normalizeAbsolutePath(
      path.join(rootDir, 'packages/vitepress/src/client/tsconfig.build.json'),
    );
  }

  return null;
}

function inferPackageProject(
  resolvedFilePath: string,
  workspacePackage: PackageInfo,
  projectPaths: string[],
): string | null {
  if (!isPathInsideDirectory(resolvedFilePath, workspacePackage.directory)) {
    return null;
  }

  if (workspacePackage.name === '@docs-islands/vitepress') {
    return inferVitePressProject(resolvedFilePath);
  }

  const packageRelativeProject = projectPaths.find((projectPath) => {
    return (
      projectPath.startsWith(`${workspacePackage.directory}/`) &&
      projectPath.endsWith('/tsconfig.lib.build.json')
    );
  });

  return packageRelativeProject ?? null;
}

function createFileOwnerLookup(projects: ProjectInfo[]): Map<string, string[]> {
  const ownerLookup = new Map<string, string[]>();

  for (const project of projects) {
    for (const fileName of project.fileNames) {
      const owners = ownerLookup.get(fileName) ?? [];

      owners.push(project.configPath);
      ownerLookup.set(fileName, owners);
    }
  }

  return ownerLookup;
}

function findTargetProject(options: {
  fileOwnerLookup: Map<string, string[]>;
  packages: PackageInfo[];
  projectPaths: string[];
  resolvedFilePath: string;
  specifier: string;
}): string | null {
  const ownerProjects = options.fileOwnerLookup.get(options.resolvedFilePath);

  if (ownerProjects && ownerProjects.length > 0) {
    return chooseOwningProject(ownerProjects);
  }

  if (!options.specifier.startsWith(internalPackageScope)) {
    return null;
  }

  const workspacePackage = findPackageForSpecifier(
    options.specifier,
    options.packages,
  );

  if (!workspacePackage) {
    return null;
  }

  return inferPackageProject(
    options.resolvedFilePath,
    workspacePackage,
    options.projectPaths,
  );
}

function formatReferences(references: Set<string>): string {
  if (references.size === 0) {
    return '(none)';
  }

  return [...references].sort().map(toRelativePath).join(', ');
}

function addForbiddenReferenceProblems(
  project: ProjectInfo,
  projectsByPath: Map<string, ProjectInfo>,
  problems: string[],
): void {
  for (const referencePath of project.references) {
    if (!projectsByPath.has(referencePath)) {
      continue;
    }

    const forbiddenReason = getForbiddenEdgeReason(
      project.configPath,
      referencePath,
    );

    if (!forbiddenReason) {
      continue;
    }

    problems.push(
      [
        'Forbidden project reference:',
        `  referencing project: ${toRelativePath(project.configPath)}`,
        `  referenced project: ${toRelativePath(referencePath)}`,
        `  reason: ${forbiddenReason}`,
      ].join('\n'),
    );
  }
}

function main(): void {
  const projectPaths = collectGraphProjectPaths();
  const projects = projectPaths.map(parseProject);
  const projectsByPath = new Map(
    projects.map((project) => [project.configPath, project]),
  );
  const fileOwnerLookup = createFileOwnerLookup(projects);
  const packages = collectWorkspacePackages();
  const importers = collectImporters(packages);
  const problems: string[] = [];

  for (const project of projects) {
    addForbiddenReferenceProblems(project, projectsByPath, problems);

    for (const filePath of project.fileNames) {
      for (const importRecord of collectImportsFromFile(filePath)) {
        if (importRecord.specifier.startsWith(nodeBuiltinSpecifierPrefix)) {
          const forbiddenReason = getForbiddenNodeBuiltinReason(
            project.configPath,
          );

          if (forbiddenReason) {
            problems.push(
              [
                'Forbidden Node builtin import:',
                `  importing project: ${toRelativePath(project.configPath)}`,
                `  file: ${toRelativePath(importRecord.filePath)}:${importRecord.line}`,
                `  imported specifier: ${importRecord.specifier}`,
                `  reason: ${forbiddenReason}`,
              ].join('\n'),
            );
          }

          continue;
        }

        const resolvedFilePath = resolveInternalImport(
          importRecord.specifier,
          filePath,
          project.options,
        );
        const targetPackage = importRecord.specifier.startsWith(
          internalPackageScope,
        )
          ? findPackageForSpecifier(importRecord.specifier, packages)
          : null;
        const importer = targetPackage
          ? findImporterForFile(importRecord.filePath, importers)
          : null;

        if (!resolvedFilePath) {
          if (!importRecord.specifier.startsWith(internalPackageScope)) {
            continue;
          }

          problems.push(
            [
              'Unresolved internal import:',
              `  importing project: ${toRelativePath(project.configPath)}`,
              `  file: ${toRelativePath(importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  current references: ${formatReferences(project.references)}`,
            ].join('\n'),
          );
          continue;
        }

        if (
          targetPackage &&
          !shouldResolveThroughGraph(importer, targetPackage)
        ) {
          continue;
        }

        const targetProjectPath = findTargetProject({
          fileOwnerLookup,
          packages,
          projectPaths,
          resolvedFilePath,
          specifier: importRecord.specifier,
        });

        if (!targetProjectPath) {
          if (!importRecord.specifier.startsWith(internalPackageScope)) {
            continue;
          }

          if (!isWorkspacePackageFile(resolvedFilePath, packages)) {
            if (
              targetPackage &&
              shouldResolveThroughGraph(importer, targetPackage)
            ) {
              problems.push(
                [
                  'Workspace internal import resolved outside the workspace graph:',
                  `  importing project: ${toRelativePath(project.configPath)}`,
                  `  file: ${toRelativePath(importRecord.filePath)}:${importRecord.line}`,
                  `  imported specifier: ${importRecord.specifier}`,
                  `  resolved file: ${toRelativePath(resolvedFilePath)}`,
                  '  reason: generated TypeScript graph paths may be stale; run `pnpm tsconfig:graph:paths`.',
                ].join('\n'),
              );
            }
            continue;
          }

          problems.push(
            [
              'Unable to map internal import to a graph project:',
              `  importing project: ${toRelativePath(project.configPath)}`,
              `  file: ${toRelativePath(importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  resolved file: ${toRelativePath(resolvedFilePath)}`,
              `  current references: ${formatReferences(project.references)}`,
            ].join('\n'),
          );
          continue;
        }

        if (targetProjectPath === project.configPath) {
          continue;
        }

        const forbiddenReason = getForbiddenEdgeReason(
          project.configPath,
          targetProjectPath,
        );

        if (forbiddenReason) {
          problems.push(
            [
              'Forbidden graph import:',
              `  importing project: ${toRelativePath(project.configPath)}`,
              `  file: ${toRelativePath(importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  target project: ${toRelativePath(targetProjectPath)}`,
              `  reason: ${forbiddenReason}`,
            ].join('\n'),
          );
        }

        if (!projectsByPath.has(targetProjectPath)) {
          problems.push(
            [
              'Expected graph target is not reachable from tsconfig.graph.json:',
              `  importing project: ${toRelativePath(project.configPath)}`,
              `  file: ${toRelativePath(importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  expected graph project: ${toRelativePath(targetProjectPath)}`,
            ].join('\n'),
          );
          continue;
        }

        if (!project.references.has(targetProjectPath)) {
          problems.push(
            [
              'Missing project reference for internal import:',
              `  importing project: ${toRelativePath(project.configPath)}`,
              `  file: ${toRelativePath(importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  expected reference: ${toRelativePath(targetProjectPath)}`,
              `  current references: ${formatReferences(project.references)}`,
            ].join('\n'),
          );
        }
      }
    }
  }

  if (problems.length > 0) {
    process.stderr.write(`${problems.join('\n\n')}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `Checked ${projects.length} graph projects; references are valid.\n`,
  );
}

try {
  main();
} catch (error: unknown) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
