import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type JsonObject = Record<string, unknown>;
type TypecheckTool = 'tsc' | 'vue-tsc';

interface PackageManifest {
  scripts?: Record<string, string>;
}

interface TypecheckTarget {
  configPath: string;
  manifestPath: string;
  scriptName: string;
  tool: TypecheckTool;
}

interface CoverageSource {
  label: string;
  type: 'allowlist' | 'graph' | 'sidecar';
}

type ConfigFileOwners = Map<string, string[]>;
type TypecheckTargetOwners = Map<string, TypecheckTarget[]>;

const rootDir = process.cwd();
const rootManifestPath = path.join(rootDir, 'package.json');
const rootGraphConfigPath = path.join(rootDir, 'tsconfig.graph.json');
const generatedPathsFileName = 'tsconfig.graph.paths.generated.json';
const graphBaseFileName = 'tsconfig.graph.base.json';
const sourceFilePattern = /\.(?:[cm]?tsx?|d\.[cm]?ts|json)$/u;
const packageJsonPattern = '**/package.json';
const buildConfigPattern = '**/tsconfig*.build.json';
const ignoredDirectories = [
  '.git',
  '.tsbuild',
  'coverage',
  'dist',
  'node_modules',
];
const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => rootDir,
  getNewLine: () => '\n',
};

const localOnlyFiles = new Map<string, string>([
  [
    normalizeAbsolutePath(
      path.join(
        rootDir,
        'packages/vitepress/src/shared/internal/client-runtime.d.ts',
      ),
    ),
    'Declaration-only stub copied into dist for the injected client runtime; the matching runtime source is covered by the shared runtime graph leaf.',
  ],
]);

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function normalizeAbsolutePath(value: string): string {
  return toPosixPath(path.resolve(value));
}

function toRelativePath(absolutePath: string): string {
  const relativePath = toPosixPath(
    path.relative(rootDir, path.resolve(absolutePath)),
  );

  return relativePath.length === 0 ? '.' : relativePath;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function readJsonConfig(configPath: string): JsonObject {
  const result = ts.readConfigFile(configPath, ts.sys.readFile);

  if (result.error) {
    throw new Error(ts.formatDiagnostic(result.error, formatHost));
  }

  return result.config as JsonObject;
}

function resolveProjectConfigPath(
  baseDirectory: string,
  value?: string,
): string {
  const candidate = value
    ? path.resolve(baseDirectory, value)
    : path.join(baseDirectory, 'tsconfig.json');

  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    return normalizeAbsolutePath(path.join(candidate, 'tsconfig.json'));
  }

  return normalizeAbsolutePath(candidate);
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

function parseProjectFileNames(configPath: string): string[] {
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

  return parsed.fileNames
    .filter((fileName) => sourceFilePattern.test(fileName))
    .map(normalizeAbsolutePath);
}

function collectWorkspacePackageManifestPaths(): string[] {
  return ts.sys
    .readDirectory(rootDir, ['.json'], ignoredDirectories, [packageJsonPattern])
    .map(normalizeAbsolutePath)
    .filter(
      (manifestPath) =>
        manifestPath !== normalizeAbsolutePath(rootManifestPath),
    )
    .sort();
}

function collectBuildConfigPaths(): string[] {
  return ts.sys
    .readDirectory(rootDir, ['.json'], ignoredDirectories, [buildConfigPattern])
    .map(normalizeAbsolutePath)
    .sort();
}

function splitShellWords(value: string): string[] {
  const words: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    words.push(match[1] ?? match[2] ?? match[3] ?? '');
  }

  return words;
}

function getProjectArgument(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];

    if (argument === '-p' || argument === '--project') {
      return args[index + 1];
    }

    if (argument?.startsWith('--project=')) {
      return argument.slice('--project='.length);
    }
  }

  return undefined;
}

function isBuildModeCommand(args: string[]): boolean {
  return args.some(
    (argument) =>
      argument === '-b' ||
      argument === '--build' ||
      argument.startsWith('--build='),
  );
}

function collectTypecheckTargetsFromCommand(options: {
  command: string;
  manifestPath: string;
  scriptName: string;
}): TypecheckTarget[] {
  const manifestDirectory = path.dirname(options.manifestPath);
  const targets: TypecheckTarget[] = [];
  const toolPattern =
    /(?:^|[\s;&|])(?:(?:pnpm|npm|yarn)\s+(?:exec\s+)?)?(vue-tsc|tsc)(?=\s|$)([^;&|]*)/gu;
  let match: RegExpExecArray | null;

  while ((match = toolPattern.exec(options.command))) {
    const tool = match[1] as TypecheckTool;
    const args = splitShellWords(match[2] ?? '');

    if (isBuildModeCommand(args)) {
      continue;
    }

    targets.push({
      configPath: resolveProjectConfigPath(
        manifestDirectory,
        getProjectArgument(args),
      ),
      manifestPath: options.manifestPath,
      scriptName: options.scriptName,
      tool,
    });
  }

  return targets;
}

function collectWorkspaceTypecheckTargets(): TypecheckTarget[] {
  const targets: TypecheckTarget[] = [];

  for (const manifestPath of collectWorkspacePackageManifestPaths()) {
    const manifest = readJsonFile<PackageManifest>(manifestPath);

    for (const [scriptName, command] of Object.entries(
      manifest.scripts ?? {},
    )) {
      if (!scriptName.startsWith('typecheck')) {
        continue;
      }

      targets.push(
        ...collectTypecheckTargetsFromCommand({
          command,
          manifestPath,
          scriptName,
        }),
      );
    }
  }

  return targets.sort((left, right) => {
    const manifestDelta = left.manifestPath.localeCompare(right.manifestPath);
    const scriptDelta =
      manifestDelta === 0
        ? left.scriptName.localeCompare(right.scriptName)
        : manifestDelta;

    return scriptDelta === 0
      ? left.configPath.localeCompare(right.configPath)
      : scriptDelta;
  });
}

function collectRootSidecarTargets(): TypecheckTarget[] {
  const manifest = readJsonFile<PackageManifest>(rootManifestPath);
  const command = manifest.scripts?.typecheck;

  if (!command) {
    return [];
  }

  return collectTypecheckTargetsFromCommand({
    command,
    manifestPath: normalizeAbsolutePath(rootManifestPath),
    scriptName: 'typecheck',
  }).filter((target) => target.tool !== 'tsc');
}

function addCoverage(
  coverageByFile: Map<string, CoverageSource[]>,
  filePath: string,
  source: CoverageSource,
): void {
  const sources = coverageByFile.get(filePath) ?? [];

  sources.push(source);
  coverageByFile.set(filePath, sources);
}

function collectCoverage(options: {
  graphProjectPaths: string[];
  includeAllowlist?: boolean;
  sidecarTargets: TypecheckTarget[];
}): Map<string, CoverageSource[]> {
  const coverageByFile = new Map<string, CoverageSource[]>();

  for (const graphProjectPath of options.graphProjectPaths) {
    for (const filePath of parseProjectFileNames(graphProjectPath)) {
      addCoverage(coverageByFile, filePath, {
        label: toRelativePath(graphProjectPath),
        type: 'graph',
      });
    }
  }

  for (const sidecarTarget of options.sidecarTargets) {
    for (const filePath of parseProjectFileNames(sidecarTarget.configPath)) {
      addCoverage(coverageByFile, filePath, {
        label: `${toRelativePath(sidecarTarget.configPath)} via root ${sidecarTarget.tool}`,
        type: 'sidecar',
      });
    }
  }

  if (options.includeAllowlist !== false) {
    for (const [filePath, reason] of localOnlyFiles) {
      addCoverage(coverageByFile, filePath, {
        label: reason,
        type: 'allowlist',
      });
    }
  }

  return coverageByFile;
}

function getExtendsValues(configPath: string): string[] {
  const config = readJsonConfig(configPath);
  const extendsValue = config.extends;

  if (typeof extendsValue === 'string') {
    return [extendsValue];
  }

  if (Array.isArray(extendsValue)) {
    return extendsValue.filter(
      (value): value is string => typeof value === 'string',
    );
  }

  return [];
}

function isRootScriptBuildConfig(configPath: string): boolean {
  return toRelativePath(configPath) === 'scripts/tsconfig.build.json';
}

function addBuildConfigProblems(options: {
  graphProjectPaths: Set<string>;
  problems: string[];
}): void {
  for (const configPath of collectBuildConfigPaths()) {
    const extendsValues = getExtendsValues(configPath);
    const hasGeneratedPaths = extendsValues.some(
      (value) =>
        path.posix.basename(toPosixPath(value)) === generatedPathsFileName,
    );
    const hasGraphBase = extendsValues.some(
      (value) => path.posix.basename(toPosixPath(value)) === graphBaseFileName,
    );
    const hasLocalConfig =
      isRootScriptBuildConfig(configPath) ||
      extendsValues.some((value) => {
        const basename = path.posix.basename(toPosixPath(value));

        return (
          basename === 'tsconfig.json' || basename === 'tsconfig.test.json'
        );
      });

    if (!options.graphProjectPaths.has(configPath)) {
      options.problems.push(
        [
          'Build config is not reachable from tsconfig.graph.json:',
          `  config: ${toRelativePath(configPath)}`,
        ].join('\n'),
      );
    }

    if (!hasGeneratedPaths) {
      options.problems.push(
        [
          'Build config does not extend generated graph paths:',
          `  config: ${toRelativePath(configPath)}`,
        ].join('\n'),
      );
    }

    if (!hasGraphBase) {
      options.problems.push(
        [
          'Build config does not extend tsconfig.graph.base.json:',
          `  config: ${toRelativePath(configPath)}`,
        ].join('\n'),
      );
    }

    if (!hasLocalConfig) {
      options.problems.push(
        [
          'Build config does not inherit a local/editor tsconfig:',
          `  config: ${toRelativePath(configPath)}`,
        ].join('\n'),
      );
    }
  }
}

function addTypecheckCoverageProblems(options: {
  coverageByFile: Map<string, CoverageSource[]>;
  problems: string[];
  targets: TypecheckTarget[];
}): {
  outsideGraphEntryCount: number;
  outsideGraphFileCount: number;
  targetCount: number;
} {
  let outsideGraphCount = 0;
  const outsideGraphFiles = new Set<string>();

  for (const target of options.targets) {
    if (!existsSync(target.configPath)) {
      options.problems.push(
        [
          'Typecheck script references a missing tsconfig:',
          `  package: ${toRelativePath(target.manifestPath)}`,
          `  script: ${target.scriptName}`,
          `  config: ${toRelativePath(target.configPath)}`,
        ].join('\n'),
      );
      continue;
    }

    const files = parseProjectFileNames(target.configPath);
    const uncoveredFiles = files.filter(
      (filePath) => !options.coverageByFile.has(filePath),
    );
    const coveredOutsideGraph = files.filter((filePath) => {
      const sources = options.coverageByFile.get(filePath) ?? [];

      return (
        sources.length > 0 && !sources.some((source) => source.type === 'graph')
      );
    });

    outsideGraphCount += coveredOutsideGraph.length;
    for (const filePath of coveredOutsideGraph) {
      outsideGraphFiles.add(filePath);
    }

    if (uncoveredFiles.length === 0) {
      continue;
    }

    options.problems.push(
      [
        'Package typecheck config is not covered by root typecheck proof:',
        `  package: ${toRelativePath(target.manifestPath)}`,
        `  script: ${target.scriptName}`,
        `  tool: ${target.tool}`,
        `  config: ${toRelativePath(target.configPath)}`,
        '  uncovered files:',
        ...uncoveredFiles
          .slice(0, 20)
          .map((filePath) => `    - ${toRelativePath(filePath)}`),
        uncoveredFiles.length > 20
          ? `    ... ${uncoveredFiles.length - 20} more`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return {
    outsideGraphEntryCount: outsideGraphCount,
    outsideGraphFileCount: outsideGraphFiles.size,
    targetCount: options.targets.length,
  };
}

function collectConfigFileOwners(configPaths: string[]): ConfigFileOwners {
  const ownersByFile: ConfigFileOwners = new Map();

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) {
      continue;
    }

    for (const filePath of parseProjectFileNames(configPath)) {
      const owners = ownersByFile.get(filePath) ?? [];

      owners.push(configPath);
      ownersByFile.set(filePath, owners);
    }
  }

  return ownersByFile;
}

function addDuplicateGraphCoverageProblems(options: {
  ownersByFile: ConfigFileOwners;
  problems: string[];
}): void {
  for (const [filePath, owners] of [...options.ownersByFile.entries()].sort(
    ([left], [right]) =>
      toRelativePath(left).localeCompare(toRelativePath(right)),
  )) {
    const uniqueOwners = [...new Set(owners)];

    if (uniqueOwners.length <= 1) {
      continue;
    }

    options.problems.push(
      [
        'Duplicate root graph coverage:',
        `  file: ${toRelativePath(filePath)}`,
        '  covered by:',
        ...uniqueOwners
          .sort((left, right) =>
            toRelativePath(left).localeCompare(toRelativePath(right)),
          )
          .map((configPath) => `    - ${toRelativePath(configPath)}`),
        '  reason: a root graph file must have a single build owner; move the file to one build leaf or narrow include/exclude patterns.',
      ].join('\n'),
    );
  }
}

function collectTypecheckTargetOwners(
  targets: TypecheckTarget[],
): TypecheckTargetOwners {
  const ownersByFile: TypecheckTargetOwners = new Map();

  for (const target of targets) {
    if (!existsSync(target.configPath)) {
      continue;
    }

    for (const filePath of parseProjectFileNames(target.configPath)) {
      const owners = ownersByFile.get(filePath) ?? [];

      owners.push(target);
      ownersByFile.set(filePath, owners);
    }
  }

  return ownersByFile;
}

function formatTypecheckTarget(target: TypecheckTarget): string {
  return [
    toRelativePath(target.configPath),
    `via ${toRelativePath(target.manifestPath)}#${target.scriptName}`,
    target.tool,
  ].join(' ');
}

function uniqueTypecheckTargets(targets: TypecheckTarget[]): TypecheckTarget[] {
  const seen = new Set<string>();
  const uniqueTargets: TypecheckTarget[] = [];

  for (const target of targets) {
    const key = `${target.configPath}\0${target.tool}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueTargets.push(target);
  }

  return uniqueTargets;
}

function addDuplicateTypecheckCoverageProblems(options: {
  ownersByFile: TypecheckTargetOwners;
  problems: string[];
}): void {
  for (const [filePath, owners] of [...options.ownersByFile.entries()].sort(
    ([left], [right]) =>
      toRelativePath(left).localeCompare(toRelativePath(right)),
  )) {
    const uniqueOwners = uniqueTypecheckTargets(owners);

    if (uniqueOwners.length <= 1) {
      continue;
    }

    options.problems.push(
      [
        'Duplicate workspace typecheck coverage:',
        `  file: ${toRelativePath(filePath)}`,
        '  covered by:',
        ...uniqueOwners
          .sort((left, right) =>
            formatTypecheckTarget(left).localeCompare(
              formatTypecheckTarget(right),
            ),
          )
          .map((target) => `    - ${formatTypecheckTarget(target)}`),
        '  reason: a workspace typecheck file must have a single local owner; move the file to one config or narrow include/exclude patterns.',
      ].join('\n'),
    );
  }
}

function addAllowlistProblems(options: {
  baseCoverageByFile: Map<string, CoverageSource[]>;
  ownersByFile: TypecheckTargetOwners;
  problems: string[];
}): void {
  for (const filePath of localOnlyFiles.keys()) {
    if (!existsSync(filePath)) {
      options.problems.push(
        [
          'Typecheck proof allowlist references a missing file:',
          `  file: ${toRelativePath(filePath)}`,
        ].join('\n'),
      );
    }

    if (!options.ownersByFile.has(filePath)) {
      options.problems.push(
        [
          'Typecheck proof allowlist file is not used by any workspace typecheck target:',
          `  file: ${toRelativePath(filePath)}`,
        ].join('\n'),
      );
    }

    if (options.baseCoverageByFile.has(filePath)) {
      options.problems.push(
        [
          'Typecheck proof allowlist file is already covered without the allowlist:',
          `  file: ${toRelativePath(filePath)}`,
        ].join('\n'),
      );
    }
  }
}

function main(): void {
  const problems: string[] = [];
  const graphProjectPaths = collectGraphProjectPaths();
  const graphProjectPathSet = new Set(graphProjectPaths);
  const rootSidecarTargets = collectRootSidecarTargets();
  const baseCoverageByFile = collectCoverage({
    graphProjectPaths,
    includeAllowlist: false,
    sidecarTargets: rootSidecarTargets,
  });
  const coverageByFile = collectCoverage({
    graphProjectPaths,
    sidecarTargets: rootSidecarTargets,
  });
  const graphFileOwners = collectConfigFileOwners(graphProjectPaths);
  const packageTypecheckTargets = collectWorkspaceTypecheckTargets();
  const packageTypecheckOwners = collectTypecheckTargetOwners(
    packageTypecheckTargets,
  );

  addBuildConfigProblems({
    graphProjectPaths: graphProjectPathSet,
    problems,
  });
  addDuplicateGraphCoverageProblems({
    ownersByFile: graphFileOwners,
    problems,
  });
  addDuplicateTypecheckCoverageProblems({
    ownersByFile: packageTypecheckOwners,
    problems,
  });
  addAllowlistProblems({
    baseCoverageByFile,
    ownersByFile: packageTypecheckOwners,
    problems,
  });
  const coverageResult = addTypecheckCoverageProblems({
    coverageByFile,
    problems,
    targets: packageTypecheckTargets,
  });

  if (problems.length > 0) {
    process.stderr.write(`${problems.join('\n\n')}\n`);
    process.exit(1);
  }

  const graphFileCount = [...coverageByFile.values()].filter((sources) =>
    sources.some((source) => source.type === 'graph'),
  ).length;
  const sidecarFileCount = [...coverageByFile.values()].filter((sources) =>
    sources.some((source) => source.type === 'sidecar'),
  ).length;

  process.stdout.write(
    [
      `Checked ${graphProjectPaths.length} graph projects and ${collectBuildConfigPaths().length} build configs.`,
      `Root graph covers ${graphFileCount} files; root sidecars cover ${sidecarFileCount} files.`,
      `Checked ${coverageResult.targetCount} workspace typecheck targets; ${coverageResult.outsideGraphEntryCount} target-file entries (${coverageResult.outsideGraphFileCount} unique files) are covered by sidecars or explicit allowlist.`,
    ].join('\n') + '\n',
  );

  if (localOnlyFiles.size > 0) {
    process.stdout.write(
      `Explicit typecheck proof allowlist: ${[...localOnlyFiles.keys()]
        .map(toRelativePath)
        .join(', ')}\n`,
    );
  }
}

try {
  main();
} catch (error: unknown) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
