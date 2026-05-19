import { existsSync } from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';
import ts from 'typescript';
import type { ResolvedLatticeConfig } from '../config';
import { ProofLogger } from '../logger';
import {
  collectGraphProjectPaths,
  createFormatHost,
  parseProjectFileNames,
  resolveProjectConfigPath,
} from '../tsconfig';
import { normalizeAbsolutePath, toRelativePath } from '../utils/path';
import { readJsonFile, type PackageManifest } from '../workspace';

type TypecheckTool = 'tsc' | 'vue-tsc' | string;

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

interface ParsedConfig {
  fileNames: string[];
  options: ts.CompilerOptions;
}

const buildConfigPattern = '**/tsconfig*.build.json';

const ignoredSemanticCompilerOptions = new Set([
  'baseUrl',
  'build',
  'composite',
  'configFilePath',
  'declaration',
  'declarationDir',
  'declarationMap',
  'emitBOM',
  'emitDeclarationOnly',
  'incremental',
  'inlineSourceMap',
  'inlineSources',
  'mapRoot',
  'newLine',
  'noEmit',
  'noEmitOnError',
  'out',
  'outDir',
  'outFile',
  'paths',
  'pathsBasePath',
  'preserveConstEnums',
  'project',
  'removeComments',
  'rootDir',
  'showConfig',
  'sourceMap',
  'sourceRoot',
  'tsBuildInfoFile',
]);

function sourceFilePattern(config: ResolvedLatticeConfig): RegExp {
  return new RegExp(
    config.proof?.sourceFilePattern ??
      String.raw`\.(?:[cm]?tsx?|d\.[cm]?ts|json)$`,
    'u',
  );
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

async function collectWorkspacePackageManifestPaths(
  config: ResolvedLatticeConfig,
): Promise<string[]> {
  const manifestPaths = await glob('**/package.json', {
    cwd: config.rootDir,
    absolute: true,
    ignore: [
      '**/.git/**',
      '**/.tsbuild/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
    ],
  });
  const rootManifestPath = path.join(config.rootDir, 'package.json');

  return manifestPaths
    .map(normalizeAbsolutePath)
    .filter(
      (manifestPath) =>
        manifestPath !== normalizeAbsolutePath(rootManifestPath),
    )
    .sort();
}

async function collectBuildConfigPaths(
  config: ResolvedLatticeConfig,
): Promise<string[]> {
  const paths = await glob(buildConfigPattern, {
    cwd: config.rootDir,
    absolute: true,
    ignore: [
      '**/.git/**',
      '**/.tsbuild/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
    ],
  });

  return paths.map(normalizeAbsolutePath).sort();
}

async function collectWorkspaceTypecheckTargets(
  config: ResolvedLatticeConfig,
): Promise<TypecheckTarget[]> {
  const targets: TypecheckTarget[] = [];
  const scriptPrefix = config.proof?.typecheckScriptPrefix ?? 'typecheck';

  for (const manifestPath of await collectWorkspacePackageManifestPaths(
    config,
  )) {
    const manifest = readJsonFile<PackageManifest>(manifestPath);

    for (const [scriptName, command] of Object.entries(
      manifest.scripts ?? {},
    )) {
      if (!scriptName.startsWith(scriptPrefix)) {
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

function collectConfiguredSidecarTargets(
  config: ResolvedLatticeConfig,
): TypecheckTarget[] {
  return (config.proof?.sidecarTargets ?? []).map((target) => ({
    configPath: normalizeAbsolutePath(path.join(config.rootDir, target.config)),
    manifestPath: normalizeAbsolutePath(
      path.join(config.rootDir, 'lattice.config.mjs'),
    ),
    scriptName: target.label ?? 'configured-sidecar',
    tool: target.tool,
  }));
}

function collectRootSidecarTargets(
  config: ResolvedLatticeConfig,
): TypecheckTarget[] {
  const scriptName = config.proof?.rootSidecarScript;

  if (!scriptName) {
    return [];
  }

  const manifestPath = normalizeAbsolutePath(
    path.join(config.rootDir, 'package.json'),
  );
  const manifest = readJsonFile<PackageManifest>(manifestPath);
  const command = manifest.scripts?.[scriptName];

  if (!command) {
    return [];
  }

  return collectTypecheckTargetsFromCommand({
    command,
    manifestPath,
    scriptName,
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
  config: ResolvedLatticeConfig;
  graphProjectPaths: string[];
  includeAllowlist?: boolean;
  sidecarTargets: TypecheckTarget[];
}): Map<string, CoverageSource[]> {
  const coverageByFile = new Map<string, CoverageSource[]>();
  const pattern = sourceFilePattern(options.config);

  for (const graphProjectPath of options.graphProjectPaths) {
    for (const filePath of parseProjectFileNames(
      options.config,
      graphProjectPath,
      pattern,
    )) {
      addCoverage(coverageByFile, filePath, {
        label: toRelativePath(options.config.rootDir, graphProjectPath),
        type: 'graph',
      });
    }
  }

  for (const sidecarTarget of options.sidecarTargets) {
    for (const filePath of parseProjectFileNames(
      options.config,
      sidecarTarget.configPath,
      pattern,
    )) {
      addCoverage(coverageByFile, filePath, {
        label: `${toRelativePath(options.config.rootDir, sidecarTarget.configPath)} via ${sidecarTarget.tool}`,
        type: 'sidecar',
      });
    }
  }

  if (options.includeAllowlist !== false) {
    for (const entry of options.config.proof?.allowlist ?? []) {
      addCoverage(
        coverageByFile,
        normalizeAbsolutePath(path.join(options.config.rootDir, entry.file)),
        {
          label: entry.reason,
          type: 'allowlist',
        },
      );
    }
  }

  return coverageByFile;
}

function getStrictLocalConfigPath(buildConfigPath: string): string {
  return normalizeAbsolutePath(
    path.join(
      path.dirname(buildConfigPath),
      path.basename(buildConfigPath).replace(/\.build\.json$/u, '.json'),
    ),
  );
}

function parseConfig(
  config: ResolvedLatticeConfig,
  configPath: string,
): ParsedConfig {
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
      ts.formatDiagnosticsWithColorAndContext(
        diagnostics,
        createFormatHost(config.rootDir),
      ),
    );
  }

  if (parsed.errors.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(
        parsed.errors,
        createFormatHost(config.rootDir),
      ),
    );
  }

  return {
    fileNames: parsed.fileNames.map(normalizeAbsolutePath).sort(),
    options: parsed.options,
  };
}

function formatJsonValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function normalizeCompilerOptionValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  }

  return value;
}

function addBuildConfigSemanticProblems(options: {
  buildConfigPath: string;
  buildConfig: ParsedConfig;
  config: ResolvedLatticeConfig;
  localConfigPath: string;
  localConfig: ParsedConfig;
  problems: string[];
}): void {
  const buildFileNames = new Set(options.buildConfig.fileNames);
  const localFileNames = new Set(options.localConfig.fileNames);
  const onlyInBuild = options.buildConfig.fileNames.filter(
    (fileName) => !localFileNames.has(fileName),
  );
  const onlyInLocal = options.localConfig.fileNames.filter(
    (fileName) => !buildFileNames.has(fileName),
  );

  if (onlyInBuild.length > 0 || onlyInLocal.length > 0) {
    options.problems.push(
      [
        'Build config file set does not match its strict same-name local tsconfig:',
        `  config: ${toRelativePath(options.config.rootDir, options.buildConfigPath)}`,
        `  local: ${toRelativePath(options.config.rootDir, options.localConfigPath)}`,
        ...(onlyInBuild.length > 0
          ? [
              '  only in build config:',
              ...onlyInBuild
                .slice(0, 10)
                .map(
                  (fileName) =>
                    `    - ${toRelativePath(options.config.rootDir, fileName)}`,
                ),
              onlyInBuild.length > 10
                ? `    ... ${onlyInBuild.length - 10} more`
                : '',
            ]
          : []),
        ...(onlyInLocal.length > 0
          ? [
              '  only in local config:',
              ...onlyInLocal
                .slice(0, 10)
                .map(
                  (fileName) =>
                    `    - ${toRelativePath(options.config.rootDir, fileName)}`,
                ),
              onlyInLocal.length > 10
                ? `    ... ${onlyInLocal.length - 10} more`
                : '',
            ]
          : []),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  const optionNames = new Set([
    ...Object.keys(options.localConfig.options),
    ...Object.keys(options.buildConfig.options),
  ]);

  for (const optionName of [...optionNames].sort()) {
    if (ignoredSemanticCompilerOptions.has(optionName)) {
      continue;
    }

    const localValue = normalizeCompilerOptionValue(
      (options.localConfig.options as Record<string, unknown>)[optionName],
    );
    const buildValue = normalizeCompilerOptionValue(
      (options.buildConfig.options as Record<string, unknown>)[optionName],
    );

    if (formatJsonValue(localValue) === formatJsonValue(buildValue)) {
      continue;
    }

    options.problems.push(
      [
        'Build config overrides a typecheck compiler option from its strict same-name local tsconfig:',
        `  config: ${toRelativePath(options.config.rootDir, options.buildConfigPath)}`,
        `  local: ${toRelativePath(options.config.rootDir, options.localConfigPath)}`,
        `  option: compilerOptions.${optionName}`,
        `  local: ${formatJsonValue(localValue)}`,
        `  build: ${formatJsonValue(buildValue)}`,
      ].join('\n'),
    );
  }
}

function addBuildConfigProblems(options: {
  config: ResolvedLatticeConfig;
  graphProjectPaths: Set<string>;
  problems: string[];
  buildConfigPaths: string[];
}): void {
  for (const configPath of options.buildConfigPaths) {
    if (!options.graphProjectPaths.has(configPath)) {
      options.problems.push(
        [
          'Build config is not reachable from root graph config:',
          `  config: ${toRelativePath(options.config.rootDir, configPath)}`,
        ].join('\n'),
      );
    }

    const localConfigPath = getStrictLocalConfigPath(configPath);

    if (!existsSync(localConfigPath)) {
      options.problems.push(
        [
          'Build config is missing its strict same-name local tsconfig:',
          `  config: ${toRelativePath(options.config.rootDir, configPath)}`,
          `  expected: ${toRelativePath(options.config.rootDir, localConfigPath)}`,
        ].join('\n'),
      );
      continue;
    }

    const buildConfig = parseConfig(options.config, configPath);
    const localConfig = parseConfig(options.config, localConfigPath);

    if (buildConfig.options.composite !== true) {
      options.problems.push(
        [
          'Build config is not valid for tsc -b:',
          `  config: ${toRelativePath(options.config.rootDir, configPath)}`,
          '  reason: final compilerOptions.composite must be true.',
        ].join('\n'),
      );
    }

    if (buildConfig.options.noEmit === true) {
      options.problems.push(
        [
          'Build config is not valid for tsc -b:',
          `  config: ${toRelativePath(options.config.rootDir, configPath)}`,
          '  reason: final compilerOptions.noEmit must not be true.',
        ].join('\n'),
      );
    }

    addBuildConfigSemanticProblems({
      buildConfig,
      buildConfigPath: configPath,
      config: options.config,
      localConfig,
      localConfigPath,
      problems: options.problems,
    });
  }
}

function collectConfigFileOwners(
  config: ResolvedLatticeConfig,
  configPaths: string[],
): ConfigFileOwners {
  const ownersByFile: ConfigFileOwners = new Map();
  const pattern = sourceFilePattern(config);

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) {
      continue;
    }

    for (const filePath of parseProjectFileNames(config, configPath, pattern)) {
      const owners = ownersByFile.get(filePath) ?? [];

      owners.push(configPath);
      ownersByFile.set(filePath, owners);
    }
  }

  return ownersByFile;
}

function addDuplicateGraphCoverageProblems(options: {
  config: ResolvedLatticeConfig;
  ownersByFile: ConfigFileOwners;
  problems: string[];
}): void {
  for (const [filePath, owners] of [...options.ownersByFile.entries()].sort(
    ([left], [right]) =>
      toRelativePath(options.config.rootDir, left).localeCompare(
        toRelativePath(options.config.rootDir, right),
      ),
  )) {
    const uniqueOwners = [...new Set(owners)];

    if (uniqueOwners.length <= 1) {
      continue;
    }

    options.problems.push(
      [
        'Duplicate root graph coverage:',
        `  file: ${toRelativePath(options.config.rootDir, filePath)}`,
        '  covered by:',
        ...uniqueOwners
          .sort((left, right) =>
            toRelativePath(options.config.rootDir, left).localeCompare(
              toRelativePath(options.config.rootDir, right),
            ),
          )
          .map(
            (configPath) =>
              `    - ${toRelativePath(options.config.rootDir, configPath)}`,
          ),
        '  reason: a root graph file must have a single build owner; move the file to one build leaf or narrow include/exclude patterns.',
      ].join('\n'),
    );
  }
}

function collectTypecheckTargetOwners(
  config: ResolvedLatticeConfig,
  targets: TypecheckTarget[],
): TypecheckTargetOwners {
  const ownersByFile: TypecheckTargetOwners = new Map();
  const pattern = sourceFilePattern(config);

  for (const target of targets) {
    if (!existsSync(target.configPath)) {
      continue;
    }

    for (const filePath of parseProjectFileNames(
      config,
      target.configPath,
      pattern,
    )) {
      const owners = ownersByFile.get(filePath) ?? [];

      owners.push(target);
      ownersByFile.set(filePath, owners);
    }
  }

  return ownersByFile;
}

function formatTypecheckTarget(
  config: ResolvedLatticeConfig,
  target: TypecheckTarget,
): string {
  return [
    toRelativePath(config.rootDir, target.configPath),
    `via ${toRelativePath(config.rootDir, target.manifestPath)}#${target.scriptName}`,
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
  config: ResolvedLatticeConfig;
  ownersByFile: TypecheckTargetOwners;
  problems: string[];
}): void {
  for (const [filePath, owners] of [...options.ownersByFile.entries()].sort(
    ([left], [right]) =>
      toRelativePath(options.config.rootDir, left).localeCompare(
        toRelativePath(options.config.rootDir, right),
      ),
  )) {
    const uniqueOwners = uniqueTypecheckTargets(owners);

    const ownersByTool = new Map<string, TypecheckTarget[]>();

    for (const owner of uniqueOwners) {
      ownersByTool.set(owner.tool, [
        ...(ownersByTool.get(owner.tool) ?? []),
        owner,
      ]);
    }

    for (const duplicateOwners of ownersByTool.values()) {
      if (duplicateOwners.length <= 1) {
        continue;
      }

      options.problems.push(
        [
          'Duplicate workspace typecheck coverage:',
          `  file: ${toRelativePath(options.config.rootDir, filePath)}`,
          '  covered by:',
          ...duplicateOwners
            .sort((left, right) =>
              formatTypecheckTarget(options.config, left).localeCompare(
                formatTypecheckTarget(options.config, right),
              ),
            )
            .map(
              (target) =>
                `    - ${formatTypecheckTarget(options.config, target)}`,
            ),
          '  reason: a workspace typecheck file must have a single local owner per tool; move the file to one config or narrow include/exclude patterns.',
        ].join('\n'),
      );
    }
  }
}

function addAllowlistProblems(options: {
  baseCoverageByFile: Map<string, CoverageSource[]>;
  config: ResolvedLatticeConfig;
  ownersByFile: TypecheckTargetOwners;
  problems: string[];
}): void {
  for (const entry of options.config.proof?.allowlist ?? []) {
    const filePath = normalizeAbsolutePath(
      path.join(options.config.rootDir, entry.file),
    );

    if (!existsSync(filePath)) {
      options.problems.push(
        [
          'Typecheck proof allowlist references a missing file:',
          `  file: ${toRelativePath(options.config.rootDir, filePath)}`,
        ].join('\n'),
      );
    }

    if (!options.ownersByFile.has(filePath)) {
      options.problems.push(
        [
          'Typecheck proof allowlist file is not used by any workspace typecheck target:',
          `  file: ${toRelativePath(options.config.rootDir, filePath)}`,
        ].join('\n'),
      );
    }

    if (options.baseCoverageByFile.has(filePath)) {
      options.problems.push(
        [
          'Typecheck proof allowlist file is already covered without the allowlist:',
          `  file: ${toRelativePath(options.config.rootDir, filePath)}`,
        ].join('\n'),
      );
    }
  }
}

function addTypecheckCoverageProblems(options: {
  config: ResolvedLatticeConfig;
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
  const pattern = sourceFilePattern(options.config);

  for (const target of options.targets) {
    if (!existsSync(target.configPath)) {
      options.problems.push(
        [
          'Typecheck script references a missing tsconfig:',
          `  package: ${toRelativePath(options.config.rootDir, target.manifestPath)}`,
          `  script: ${target.scriptName}`,
          `  config: ${toRelativePath(options.config.rootDir, target.configPath)}`,
        ].join('\n'),
      );
      continue;
    }

    const files = parseProjectFileNames(
      options.config,
      target.configPath,
      pattern,
    );
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
        `  package: ${toRelativePath(options.config.rootDir, target.manifestPath)}`,
        `  script: ${target.scriptName}`,
        `  tool: ${target.tool}`,
        `  config: ${toRelativePath(options.config.rootDir, target.configPath)}`,
        '  uncovered files:',
        ...uncoveredFiles
          .slice(0, 20)
          .map(
            (filePath) =>
              `    - ${toRelativePath(options.config.rootDir, filePath)}`,
          ),
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

export async function runProofCheck(
  config: ResolvedLatticeConfig,
): Promise<boolean> {
  const problems: string[] = [];
  const graphProjectPaths = collectGraphProjectPaths(config);
  const graphProjectPathSet = new Set(graphProjectPaths);
  const buildConfigPaths = await collectBuildConfigPaths(config);

  addBuildConfigProblems({
    buildConfigPaths,
    config,
    graphProjectPaths: graphProjectPathSet,
    problems,
  });

  if (problems.length > 0) {
    ProofLogger.error(problems.join('\n\n'));
    return false;
  }

  const rootSidecarTargets = [
    ...collectRootSidecarTargets(config),
    ...collectConfiguredSidecarTargets(config),
  ];
  const baseCoverageByFile = collectCoverage({
    config,
    graphProjectPaths,
    includeAllowlist: false,
    sidecarTargets: rootSidecarTargets,
  });
  const coverageByFile = collectCoverage({
    config,
    graphProjectPaths,
    sidecarTargets: rootSidecarTargets,
  });
  const graphFileOwners = collectConfigFileOwners(config, graphProjectPaths);
  const packageTypecheckTargets =
    await collectWorkspaceTypecheckTargets(config);
  const packageTypecheckOwners = collectTypecheckTargetOwners(
    config,
    packageTypecheckTargets,
  );

  addDuplicateGraphCoverageProblems({
    config,
    ownersByFile: graphFileOwners,
    problems,
  });
  addDuplicateTypecheckCoverageProblems({
    config,
    ownersByFile: packageTypecheckOwners,
    problems,
  });
  addAllowlistProblems({
    baseCoverageByFile,
    config,
    ownersByFile: packageTypecheckOwners,
    problems,
  });
  const coverageResult = addTypecheckCoverageProblems({
    config,
    coverageByFile,
    problems,
    targets: packageTypecheckTargets,
  });

  if (problems.length > 0) {
    ProofLogger.error(problems.join('\n\n'));
    return false;
  }

  const graphFileCount = [...coverageByFile.values()].filter((sources) =>
    sources.some((source) => source.type === 'graph'),
  ).length;
  const sidecarFileCount = [...coverageByFile.values()].filter((sources) =>
    sources.some((source) => source.type === 'sidecar'),
  ).length;

  ProofLogger.success(
    [
      `Checked ${graphProjectPaths.length} graph projects and ${buildConfigPaths.length} build configs.`,
      `Root graph covers ${graphFileCount} files; root sidecars cover ${sidecarFileCount} files.`,
      `Checked ${coverageResult.targetCount} workspace typecheck targets; ${coverageResult.outsideGraphEntryCount} target-file entries (${coverageResult.outsideGraphFileCount} unique files) are covered by sidecars or explicit allowlist.`,
    ].join('\n'),
  );

  if ((config.proof?.allowlist ?? []).length > 0) {
    ProofLogger.info(
      `Explicit typecheck proof allowlist: ${(config.proof?.allowlist ?? [])
        .map((entry) => entry.file)
        .join(', ')}`,
    );
  }

  return true;
}
