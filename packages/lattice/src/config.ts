import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type RuntimeEnvironment = 'browser' | 'node' | string;
export type PipelineStep =
  | string
  | {
      args?: string[];
      command: string;
      cwd?: string;
      env?: Record<string, string>;
      type: 'command';
    }
  | {
      name: BuiltinTaskName;
      type: 'task';
    };

export type BuiltinTaskName =
  | 'graph:check'
  | 'package-boundary:check'
  | 'paths:check'
  | 'proof:check';

export interface WorkspaceConfig {
  ignore?: string[];
  internalScopes?: string[];
  packagePatterns?: string[];
  rootDir?: string;
}

export interface PathsConfig {
  conditionPriority?: string[];
  generatedFileName?: string;
  generatedFileMarker?: string;
  ignore?: string[];
  sourceExtensions?: string[];
}

export interface ProjectKindMatcher {
  includes?: string[];
  kind: string;
  paths?: string[];
  suffixes?: string[];
}

export interface GraphForbiddenEdge {
  fromKinds: string[];
  reason: string;
  toKinds: string[];
}

export interface GraphNodeBuiltinRule {
  kinds: string[];
  reason: string;
}

export interface GraphInferredProject {
  packageName?: string;
  project: string;
  sourcePrefix: string;
}

export interface GraphConfig {
  forbiddenEdges?: GraphForbiddenEdge[];
  inferredProjects?: GraphInferredProject[];
  nodeBuiltinRules?: GraphNodeBuiltinRule[];
  productionKinds?: string[];
  projectKinds?: ProjectKindMatcher[];
  rootConfig?: string;
  solutionKinds?: string[];
}

export interface ProofAllowlistEntry {
  file: string;
  reason: string;
}

export interface ProofSidecarTarget {
  config: string;
  label?: string;
  tool: 'tsc' | 'vue-tsc' | string;
}

export interface ProofConfig {
  allowlist?: ProofAllowlistEntry[];
  rootSidecarScript?: string;
  sidecarTargets?: ProofSidecarTarget[];
  sourceFilePattern?: string;
  typecheckScriptPrefix?: string;
}

export interface PackageBoundaryTarget {
  distDir: string;
  environment?:
    | RuntimeEnvironment
    | ((relativeFilePath: string) => RuntimeEnvironment);
  ignoredExternalPackages?: string[];
  name?: string;
}

export interface PackageBoundaryConfig {
  targets?: PackageBoundaryTarget[];
}

export interface LatticeConfig {
  graph?: GraphConfig;
  packageBoundary?: PackageBoundaryConfig;
  paths?: PathsConfig;
  pipelines?: Record<string, PipelineStep[]>;
  proof?: ProofConfig;
  workspace?: WorkspaceConfig;
}

export interface ResolvedLatticeConfig extends LatticeConfig {
  configPath: string;
  rootDir: string;
}

export function defineConfig(config: LatticeConfig): LatticeConfig {
  return config;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeConfig(value: unknown): LatticeConfig {
  if (!isRecord(value)) {
    throw new Error('lattice config must export an object.');
  }

  return value as LatticeConfig;
}

export async function loadConfig(
  options: {
    configPath?: string;
    cwd?: string;
  } = {},
): Promise<ResolvedLatticeConfig> {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const configPath = path.resolve(
    cwd,
    options.configPath ?? 'lattice.config.mjs',
  );

  if (!existsSync(configPath)) {
    throw new Error(`Unable to find lattice config at ${configPath}`);
  }

  const module = (await import(
    `${pathToFileURL(configPath).href}?t=${Date.now()}`
  )) as {
    default?: unknown;
  };
  const config = normalizeConfig(module.default);
  const rootDir = path.resolve(
    path.dirname(configPath),
    config.workspace?.rootDir ?? '.',
  );

  return {
    ...config,
    configPath,
    rootDir,
  };
}
