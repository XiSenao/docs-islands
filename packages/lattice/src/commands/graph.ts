import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import type { ResolvedLatticeConfig } from '../config';
import { GraphLogger } from '../logger';
import {
  collectGraphProjectPaths,
  formatReferences,
  getRawReferencePaths,
} from '../tsconfig';
import {
  isPathInsideDirectory,
  normalizeAbsolutePath,
  toRelativePath,
} from '../utils/path';
import {
  collectImporters,
  collectWorkspacePackages,
  findPackageForSpecifier,
  type ImporterInfo,
  type WorkspacePackage,
} from '../workspace';

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

const buildConfigFilePattern = /^tsconfig(?:\..+)?\.build\.json$/u;

const requiredBuildCompilerOptions: [keyof ts.CompilerOptions, unknown][] = [
  ['composite', true],
  ['incremental', true],
  ['noEmit', false],
  ['declaration', true],
  ['emitDeclarationOnly', true],
];

const requiredBuildPathOptions: (keyof ts.CompilerOptions)[] = [
  'rootDir',
  'outDir',
  'tsBuildInfoFile',
];

const comparableTypecheckOptions: (keyof ts.CompilerOptions)[] = [
  'allowArbitraryExtensions',
  'allowImportingTsExtensions',
  'allowJs',
  'allowSyntheticDefaultImports',
  'checkJs',
  'customConditions',
  'esModuleInterop',
  'exactOptionalPropertyTypes',
  'forceConsistentCasingInFileNames',
  'isolatedDeclarations',
  'isolatedModules',
  'jsx',
  'jsxImportSource',
  'lib',
  'module',
  'moduleDetection',
  'moduleResolution',
  'noFallthroughCasesInSwitch',
  'noImplicitAny',
  'noImplicitOverride',
  'noImplicitReturns',
  'noImplicitThis',
  'noPropertyAccessFromIndexSignature',
  'noUncheckedIndexedAccess',
  'resolveJsonModule',
  'skipLibCheck',
  'strict',
  'strictBindCallApply',
  'strictFunctionTypes',
  'strictNullChecks',
  'strictPropertyInitialization',
  'target',
  'typeRoots',
  'types',
  'useDefineForClassFields',
  'verbatimModuleSyntax',
];

const nodeBuiltinSpecifiers = new Set(
  builtinModules.flatMap((specifier) =>
    specifier.startsWith('node:')
      ? [specifier, specifier.slice('node:'.length)]
      : [specifier, `node:${specifier}`],
  ),
);

function isRelativeSpecifier(specifier: string): boolean {
  return (
    specifier === '.' ||
    specifier === '..' ||
    specifier.startsWith('./') ||
    specifier.startsWith('../')
  );
}

function isBuildProjectConfig(configPath: string): boolean {
  return buildConfigFilePattern.test(path.basename(configPath));
}

function getTypecheckConfigPath(buildConfigPath: string): string {
  const directory = path.dirname(buildConfigPath);
  const fileName = path.basename(buildConfigPath);
  const typecheckFileName =
    fileName === 'tsconfig.build.json'
      ? 'tsconfig.json'
      : fileName.replace(/\.build\.json$/u, '.json');

  return path.join(directory, typecheckFileName);
}

function parseProject(
  config: ResolvedLatticeConfig,
  configPath: string,
): ProjectInfo {
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
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => config.rootDir,
        getNewLine: () => '\n',
      }),
    );
  }

  if (parsed.errors.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => config.rootDir,
        getNewLine: () => '\n',
      }),
    );
  }

  return {
    configPath: normalizeAbsolutePath(configPath),
    fileNames: parsed.fileNames
      .filter((fileName) => /\.(?:[cm]?tsx?|d\.[cm]?ts)$/u.test(fileName))
      .map(normalizeAbsolutePath),
    options: parsed.options,
    references: new Set(getRawReferencePaths(config, configPath)),
  };
}

function formatCompilerOptionValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}

function compilerOptionEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function addBuildOptionProblems(
  config: ResolvedLatticeConfig,
  project: ProjectInfo,
  problems: string[],
): void {
  if (!isBuildProjectConfig(project.configPath)) {
    return;
  }

  for (const [optionName, expected] of requiredBuildCompilerOptions) {
    const actual = project.options[optionName];

    if (actual === expected) {
      continue;
    }

    problems.push(
      [
        'Invalid build project compiler option:',
        `  project: ${toRelativePath(config.rootDir, project.configPath)}`,
        `  option: compilerOptions.${optionName}`,
        `  expected: ${formatCompilerOptionValue(expected)}`,
        `  actual: ${formatCompilerOptionValue(actual)}`,
        '  reason: tsconfig*.build.json projects are consumed by tsc -b and must emit declarations through composite incremental builds.',
      ].join('\n'),
    );
  }

  for (const optionName of requiredBuildPathOptions) {
    if (project.options[optionName]) {
      continue;
    }

    problems.push(
      [
        'Missing build project output option:',
        `  project: ${toRelativePath(config.rootDir, project.configPath)}`,
        `  option: compilerOptions.${optionName}`,
        '  reason: build graph leaves need explicit root/output state so declaration output and tsbuildinfo files do not collide.',
      ].join('\n'),
    );
  }
}

function addTypecheckParityProblems(
  config: ResolvedLatticeConfig,
  buildProject: ProjectInfo,
  problems: string[],
): void {
  if (!isBuildProjectConfig(buildProject.configPath)) {
    return;
  }

  const typecheckConfigPath = getTypecheckConfigPath(buildProject.configPath);

  if (!existsSync(typecheckConfigPath)) {
    problems.push(
      [
        'Missing typecheck companion config:',
        `  build project: ${toRelativePath(config.rootDir, buildProject.configPath)}`,
        `  expected typecheck config: ${toRelativePath(config.rootDir, typecheckConfigPath)}`,
        '  reason: every tsconfig*.build.json project should have a matching tsconfig*.json file with the same typechecking semantics.',
      ].join('\n'),
    );
    return;
  }

  const typecheckProject = parseProject(config, typecheckConfigPath);

  for (const optionName of comparableTypecheckOptions) {
    const buildValue = buildProject.options[optionName];
    const typecheckValue = typecheckProject.options[optionName];

    if (compilerOptionEquals(buildValue, typecheckValue)) {
      continue;
    }

    problems.push(
      [
        'Typecheck option mismatch between build and companion config:',
        `  build project: ${toRelativePath(config.rootDir, buildProject.configPath)}`,
        `  typecheck config: ${toRelativePath(config.rootDir, typecheckConfigPath)}`,
        `  option: compilerOptions.${optionName}`,
        `  build value: ${formatCompilerOptionValue(buildValue)}`,
        `  typecheck value: ${formatCompilerOptionValue(typecheckValue)}`,
        '  reason: tsconfig*.build.json should emit with the same typechecking semantics as its matching tsconfig*.json companion.',
      ].join('\n'),
    );
  }

  const typecheckFiles = new Set(typecheckProject.fileNames);
  const missingFiles = buildProject.fileNames.filter(
    (fileName) => !typecheckFiles.has(fileName),
  );

  if (missingFiles.length === 0) {
    return;
  }

  problems.push(
    [
      'Build project includes files missing from its companion typecheck config:',
      `  build project: ${toRelativePath(config.rootDir, buildProject.configPath)}`,
      `  typecheck config: ${toRelativePath(config.rootDir, typecheckConfigPath)}`,
      '  files:',
      ...missingFiles
        .slice(0, 10)
        .map((fileName) => `    - ${toRelativePath(config.rootDir, fileName)}`),
      ...(missingFiles.length > 10
        ? [`    ...and ${missingFiles.length - 10} more`]
        : []),
      '  reason: a build leaf must not emit declarations for files that are not covered by the matching typecheck target.',
    ].join('\n'),
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

function matcherIncludesPath(
  relativePath: string,
  values: string[] | undefined,
): boolean {
  return values?.some((value) => relativePath.includes(value)) === true;
}

function getProjectKind(
  config: ResolvedLatticeConfig,
  configPath: string,
): string {
  const relativePath = toRelativePath(config.rootDir, configPath);

  for (const matcher of config.graph?.projectKinds ?? []) {
    if (matcher.paths?.includes(relativePath)) {
      return matcher.kind;
    }

    if (matcher.suffixes?.some((suffix) => relativePath.endsWith(suffix))) {
      return matcher.kind;
    }

    if (matcherIncludesPath(relativePath, matcher.includes)) {
      return matcher.kind;
    }
  }

  return 'unknown';
}

function isProductionGraphKind(
  config: ResolvedLatticeConfig,
  kind: string,
): boolean {
  return config.graph?.productionKinds?.includes(kind) === true;
}

function getForbiddenEdgeReason(
  config: ResolvedLatticeConfig,
  fromProjectPath: string,
  toProjectPath: string,
): string | null {
  const fromKind = getProjectKind(config, fromProjectPath);
  const toKind = getProjectKind(config, toProjectPath);

  for (const rule of config.graph?.forbiddenEdges ?? []) {
    if (rule.fromKinds.includes(fromKind) && rule.toKinds.includes(toKind)) {
      return rule.reason;
    }
  }

  return null;
}

function getForbiddenNodeBuiltinReason(
  config: ResolvedLatticeConfig,
  projectPath: string,
): string | null {
  const projectKind = getProjectKind(config, projectPath);

  for (const rule of config.graph?.nodeBuiltinRules ?? []) {
    if (rule.kinds.includes(projectKind)) {
      return rule.reason;
    }
  }

  return null;
}

function projectPriority(
  config: ResolvedLatticeConfig,
  configPath: string,
): number {
  const priority = [
    'lib',
    'runtime-shared',
    'runtime-node',
    'runtime-client',
    'types',
    'tools',
    'test',
    'solution',
    'unknown',
  ];
  const index = priority.indexOf(getProjectKind(config, configPath));

  return index === -1 ? priority.length : index;
}

function chooseOwningProject(
  config: ResolvedLatticeConfig,
  projectPaths: string[],
): string {
  return [...projectPaths].sort((left, right) => {
    const priorityDelta =
      projectPriority(config, left) - projectPriority(config, right);

    return priorityDelta === 0 ? left.localeCompare(right) : priorityDelta;
  })[0]!;
}

function findPackageForFile(
  filePath: string,
  packages: WorkspacePackage[],
): WorkspacePackage | null {
  return (
    [...packages]
      .sort((left, right) => right.directory.length - left.directory.length)
      .find((workspacePackage) =>
        isPathInsideDirectory(filePath, workspacePackage.directory),
      ) ?? null
  );
}

function isWorkspacePackageFile(
  filePath: string,
  packages: WorkspacePackage[],
): boolean {
  return packages.some((workspacePackage) =>
    isPathInsideDirectory(filePath, workspacePackage.directory),
  );
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
  targetPackage: WorkspacePackage | null,
): boolean {
  if (!importer || !targetPackage) {
    return false;
  }

  return (
    importer.name === targetPackage.name ||
    importer.workspaceDependencies.has(targetPackage.name)
  );
}

function formatArtifactDependencyPolicy(
  targetPackage: WorkspacePackage,
): string {
  return targetPackage.manifest.private === true
    ? 'private workspace packages cannot be consumed from a registry, so artifact consumers should use link: and should not keep a project reference.'
    : 'artifact consumers should use link: for local dist output, or catalog:/semver to consume the published production package, and should not keep a project reference.';
}

function inferConfiguredProject(
  config: ResolvedLatticeConfig,
  resolvedFilePath: string,
  targetPackage: WorkspacePackage,
): string | null {
  const relativePath = toRelativePath(config.rootDir, resolvedFilePath);

  for (const rule of config.graph?.inferredProjects ?? []) {
    if (rule.packageName && rule.packageName !== targetPackage.name) {
      continue;
    }

    if (!relativePath.startsWith(rule.sourcePrefix)) {
      continue;
    }

    return normalizeAbsolutePath(path.join(config.rootDir, rule.project));
  }

  return null;
}

function inferPackageProject(
  config: ResolvedLatticeConfig,
  resolvedFilePath: string,
  workspacePackage: WorkspacePackage,
  projectPaths: string[],
): string | null {
  if (!isPathInsideDirectory(resolvedFilePath, workspacePackage.directory)) {
    return null;
  }

  const configured = inferConfiguredProject(
    config,
    resolvedFilePath,
    workspacePackage,
  );

  if (configured) {
    return configured;
  }

  return (
    projectPaths.find((projectPath) => {
      return (
        projectPath.startsWith(`${workspacePackage.directory}/`) &&
        projectPath.endsWith('/tsconfig.lib.build.json')
      );
    }) ?? null
  );
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
  config: ResolvedLatticeConfig;
  fileOwnerLookup: Map<string, string[]>;
  packages: WorkspacePackage[];
  projectPaths: string[];
  resolvedFilePath: string;
  specifier: string;
}): string | null {
  const ownerProjects = options.fileOwnerLookup.get(options.resolvedFilePath);

  if (ownerProjects && ownerProjects.length > 0) {
    return chooseOwningProject(options.config, ownerProjects);
  }

  const workspacePackage = findPackageForSpecifier(
    options.specifier,
    options.packages,
  );

  if (!workspacePackage) {
    return null;
  }

  return inferPackageProject(
    options.config,
    options.resolvedFilePath,
    workspacePackage,
    options.projectPaths,
  );
}

function addForbiddenReferenceProblems(
  config: ResolvedLatticeConfig,
  project: ProjectInfo,
  projectsByPath: Map<string, ProjectInfo>,
  problems: string[],
): void {
  for (const referencePath of project.references) {
    if (!projectsByPath.has(referencePath)) {
      continue;
    }

    const forbiddenReason = getForbiddenEdgeReason(
      config,
      project.configPath,
      referencePath,
    );

    if (!forbiddenReason) {
      continue;
    }

    problems.push(
      [
        'Forbidden project reference:',
        `  referencing project: ${toRelativePath(config.rootDir, project.configPath)}`,
        `  referenced project: ${toRelativePath(config.rootDir, referencePath)}`,
        `  reason: ${forbiddenReason}`,
      ].join('\n'),
    );
  }
}

function addWorkspaceReferenceDependencyProblems(
  config: ResolvedLatticeConfig,
  project: ProjectInfo,
  projectsByPath: Map<string, ProjectInfo>,
  packages: WorkspacePackage[],
  importers: ImporterInfo[],
  problems: string[],
): void {
  if (!isBuildProjectConfig(project.configPath)) {
    return;
  }

  const sourcePackage = findPackageForFile(project.configPath, packages);
  const importer = sourcePackage
    ? findImporterForFile(project.configPath, importers)
    : null;

  if (!sourcePackage) {
    return;
  }

  for (const referencePath of project.references) {
    if (!projectsByPath.has(referencePath)) {
      continue;
    }

    const targetPackage = findPackageForFile(referencePath, packages);

    if (!targetPackage || targetPackage.name === sourcePackage.name) {
      continue;
    }

    if (importer?.workspaceDependencies.has(targetPackage.name)) {
      continue;
    }

    problems.push(
      [
        'Project reference crosses workspace packages without a workspace:* dependency:',
        `  referencing project: ${toRelativePath(config.rootDir, project.configPath)}`,
        `  referenced project: ${toRelativePath(config.rootDir, referencePath)}`,
        `  referencing package: ${sourcePackage.name}`,
        `  referenced package: ${targetPackage.name}`,
        `  package manifest: ${toRelativePath(config.rootDir, path.join(sourcePackage.directory, 'package.json'))}`,
        `  reason: a cross-package tsconfig*.build.json reference is a source dependency edge, so ${sourcePackage.name} must declare ${targetPackage.name} with the workspace: protocol.`,
        `  fix: add "${targetPackage.name}": "workspace:*" to dependencies, devDependencies, peerDependencies, or optionalDependencies in the referencing package manifest. If this package intentionally consumes built artifacts, remove the project reference; ${formatArtifactDependencyPolicy(targetPackage)}`,
      ].join('\n'),
    );
  }
}

export async function runGraphCheck(
  config: ResolvedLatticeConfig,
): Promise<boolean> {
  const projectPaths = collectGraphProjectPaths(config);
  const projects = projectPaths.map((projectPath) =>
    parseProject(config, projectPath),
  );
  const projectsByPath = new Map(
    projects.map((project) => [project.configPath, project]),
  );
  const fileOwnerLookup = createFileOwnerLookup(projects);
  const packages = await collectWorkspacePackages(config);
  const importers = collectImporters(config, packages);
  const problems: string[] = [];

  for (const project of projects) {
    addBuildOptionProblems(config, project, problems);
    addTypecheckParityProblems(config, project, problems);
    addForbiddenReferenceProblems(config, project, projectsByPath, problems);
    addWorkspaceReferenceDependencyProblems(
      config,
      project,
      projectsByPath,
      packages,
      importers,
      problems,
    );

    for (const filePath of project.fileNames) {
      for (const importRecord of collectImportsFromFile(filePath)) {
        if (nodeBuiltinSpecifiers.has(importRecord.specifier)) {
          const forbiddenReason = getForbiddenNodeBuiltinReason(
            config,
            project.configPath,
          );

          if (forbiddenReason) {
            problems.push(
              [
                'Forbidden Node builtin import:',
                `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
                `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
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
        const targetPackage = findPackageForSpecifier(
          importRecord.specifier,
          packages,
        );
        const importer = targetPackage
          ? findImporterForFile(importRecord.filePath, importers)
          : null;

        if (!resolvedFilePath) {
          if (!targetPackage) {
            continue;
          }

          problems.push(
            [
              'Unresolved workspace import:',
              `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
              `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  matched workspace package: ${targetPackage.name}`,
              `  current references: ${formatReferences(config.rootDir, project.references)}`,
            ].join('\n'),
          );
          continue;
        }

        if (
          isProductionGraphKind(
            config,
            getProjectKind(config, project.configPath),
          ) &&
          isRelativeSpecifier(importRecord.specifier)
        ) {
          const sourcePackage = findPackageForFile(
            importRecord.filePath,
            packages,
          );
          const targetWorkspacePackage = findPackageForFile(
            resolvedFilePath,
            packages,
          );

          if (
            sourcePackage &&
            targetWorkspacePackage &&
            sourcePackage.name !== targetWorkspacePackage.name
          ) {
            problems.push(
              [
                'Cross-package relative import:',
                `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
                `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
                `  imported specifier: ${importRecord.specifier}`,
                `  source package: ${sourcePackage.name}`,
                `  target package: ${targetWorkspacePackage.name}`,
                `  resolved file: ${toRelativePath(config.rootDir, resolvedFilePath)}`,
                '  reason: workspace packages must depend through package exports.',
              ].join('\n'),
            );
            continue;
          }
        }

        if (
          targetPackage &&
          !shouldResolveThroughGraph(importer, targetPackage)
        ) {
          continue;
        }

        if (
          targetPackage &&
          shouldResolveThroughGraph(importer, targetPackage) &&
          !fileOwnerLookup.has(resolvedFilePath)
        ) {
          const referencedProjectPath = inferPackageProject(
            config,
            resolvedFilePath,
            targetPackage,
            projectPaths,
          );
          const hasProjectReference =
            referencedProjectPath &&
            project.references.has(referencedProjectPath);

          problems.push(
            [
              hasProjectReference
                ? 'Referenced workspace dependency resolves through package exports to a build artifact:'
                : 'Workspace source dependency resolved outside the source graph:',
              `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
              ...(referencedProjectPath
                ? [
                    `  referenced project: ${toRelativePath(config.rootDir, referencedProjectPath)}`,
                    `  project reference present: ${hasProjectReference ? 'yes' : 'no'}`,
                  ]
                : []),
              `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  resolved file: ${toRelativePath(config.rootDir, resolvedFilePath)}`,
              '  reason: workspace:* dependencies are source dependencies, but TypeScript resolved this package export to a file not owned by the source graph. tsc -b does not rewrite package exports through project references.',
              `  fix: expose source files from the dependency package exports, add a source paths config to this build config extends, or stop using workspace:* plus project references for artifact consumption; ${formatArtifactDependencyPolicy(targetPackage)}`,
              '  hint: run `lattice paths generate` to create a compatibility paths file, then manually add it to the first position of the listed tsconfig*.build.json extends array.',
            ].join('\n'),
          );
          continue;
        }

        const targetProjectPath = findTargetProject({
          config,
          fileOwnerLookup,
          packages,
          projectPaths,
          resolvedFilePath,
          specifier: importRecord.specifier,
        });

        if (!targetProjectPath) {
          if (!targetPackage) {
            continue;
          }

          if (!isWorkspacePackageFile(resolvedFilePath, packages)) {
            if (
              targetPackage &&
              shouldResolveThroughGraph(importer, targetPackage)
            ) {
              problems.push(
                [
                  'Workspace source import resolved outside the workspace graph:',
                  `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
                  `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
                  `  imported specifier: ${importRecord.specifier}`,
                  `  resolved file: ${toRelativePath(config.rootDir, resolvedFilePath)}`,
                  `  reason: workspace:* dependencies are source dependency edges and must resolve to files owned by the source graph; ${formatArtifactDependencyPolicy(targetPackage)}`,
                ].join('\n'),
              );
            }
            continue;
          }

          problems.push(
            [
              'Unable to map workspace import to a graph project:',
              `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
              `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  resolved file: ${toRelativePath(config.rootDir, resolvedFilePath)}`,
              `  current references: ${formatReferences(config.rootDir, project.references)}`,
            ].join('\n'),
          );
          continue;
        }

        if (targetProjectPath === project.configPath) {
          continue;
        }

        const forbiddenReason = getForbiddenEdgeReason(
          config,
          project.configPath,
          targetProjectPath,
        );

        if (forbiddenReason) {
          problems.push(
            [
              'Forbidden graph import:',
              `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
              `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  target project: ${toRelativePath(config.rootDir, targetProjectPath)}`,
              `  reason: ${forbiddenReason}`,
            ].join('\n'),
          );
        }

        if (!projectsByPath.has(targetProjectPath)) {
          problems.push(
            [
              'Expected graph target is not reachable from root graph config:',
              `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
              `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  expected graph project: ${toRelativePath(config.rootDir, targetProjectPath)}`,
            ].join('\n'),
          );
          continue;
        }

        if (!project.references.has(targetProjectPath)) {
          problems.push(
            [
              'Missing project reference for workspace import:',
              `  importing project: ${toRelativePath(config.rootDir, project.configPath)}`,
              `  file: ${toRelativePath(config.rootDir, importRecord.filePath)}:${importRecord.line}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  expected reference: ${toRelativePath(config.rootDir, targetProjectPath)}`,
              `  current references: ${formatReferences(config.rootDir, project.references)}`,
            ].join('\n'),
          );
        }
      }
    }
  }

  if (problems.length > 0) {
    GraphLogger.error(problems.join('\n\n'));
    return false;
  }

  GraphLogger.success(
    `Checked ${projects.length} graph projects; references are valid.`,
  );
  return true;
}
