import type { CheckerProjectConfigCache } from '#checkers';
import {
  createAstroSemanticProject,
  isBuildCapablePreset,
  normalizeExtensions,
  parseCheckerProjectConfigForContext,
} from '#checkers';
import type { ResolvedLiminaConfig } from '#config/runner';
import { uniqueCodeUnitSortedStrings as uniqueSortedStrings } from '#utils/collections';
import { normalizeAbsolutePath } from '#utils/path';
import type { WorkspaceRegionPathIndex } from '../workspace/validated-context';
import { getFrameworkFilePackageRoot } from './framework-file-root';
import { capabilityDiscoveryExtensions } from './generated/file-extensions';
import { getGeneratedLeafSolutionBuildConfigPath } from './generated/paths';
import { isInsideNodeModules } from './source-projects';
import type {
  FrameworkCapabilityDescriptor,
  GovernedSourceUnit,
  SourceProject,
} from './types';

function createBuildProjection(options: {
  declarationFileNames: readonly string[];
  config: ResolvedLiminaConfig;
  frameworkCapabilities: FrameworkCapabilityDescriptor[];
  project: SourceProject;
}): GovernedSourceUnit['buildProjection'] {
  if (!isBuildCapablePreset(options.project.checkerName)) {
    return { kind: 'framework-checker' };
  }
  if (!requiresFrameworkProjection(options)) {
    return {
      dtsConfigPath: options.project.dtsConfigPath,
      kind: 'declaration-project',
    };
  }
  return createFrameworkBuildProjection(options);
}

function createFrameworkBuildProjection(options: {
  declarationFileNames: readonly string[];
  config: ResolvedLiminaConfig;
  project: SourceProject;
}): GovernedSourceUnit['buildProjection'] {
  const buildConfigPath = getGeneratedLeafSolutionBuildConfigPath({
    checkerName: options.project.checkerName,
    packageRootDir: options.project.packageRootDir,
    rootDir: options.config.rootDir,
    sourceConfigPath: options.project.configPath,
  });
  return options.declarationFileNames.length === 0
    ? { buildConfigPath, kind: 'transparent-solution' }
    : {
        buildConfigPath,
        dtsConfigPath: options.project.dtsConfigPath,
        kind: 'wrapped-project',
      };
}

function requiresFrameworkProjection(options: {
  frameworkCapabilities: readonly FrameworkCapabilityDescriptor[];
  project: SourceProject;
}): boolean {
  return (
    options.frameworkCapabilities.length > 0 &&
    isBuildCapablePreset(options.project.context.checkerPresets[0]!)
  );
}

function createDeclarationFileNames(project: SourceProject): string[] {
  return isBuildCapablePreset(project.checkerName)
    ? [...project.fileNames]
    : [];
}

function getFrameworkFamily(
  checkerName: SourceProject['checkerName'],
): FrameworkCapabilityDescriptor['family'] | null {
  return (
    (
      {
        astro: 'astro',
        'svelte-check': 'svelte',
      } as const
    )[checkerName as 'astro' | 'svelte-check'] ?? null
  );
}

function getFrameworkExtension(
  family: FrameworkCapabilityDescriptor['family'],
): string {
  return family === 'astro' ? '.astro' : '.svelte';
}

function getFrameworkPackageRoot(options: {
  fallback: string;
  packageRoots: readonly string[];
}): string {
  return options.packageRoots[0] ?? options.fallback;
}

function createFrameworkCapabilities(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  fileNames: readonly string[];
  packageRootDir: string;
  checkerName: SourceProject['checkerName'];
  sourceConfigPath: string;
}): FrameworkCapabilityDescriptor[] {
  const family = getFrameworkFamily(options.checkerName);
  if (family === null) return [];
  const extension = getFrameworkExtension(family);
  const frameworkFiles = options.fileNames.filter((fileName) =>
    fileName.endsWith(extension),
  );
  const packageRoots = uniqueSortedStrings(
    frameworkFiles.map((fileName) =>
      getFrameworkFilePackageRoot({
        activatedRegions: options.activatedRegions,
        fallbackPackageRootDir: options.packageRootDir,
        fileName,
      }),
    ),
  );
  if (packageRoots.length > 1) {
    throw new Error(
      `Framework checker ownership spans multiple leaf package roots for ${family} at ${options.sourceConfigPath}.`,
    );
  }
  return [
    {
      family,
      packageRootDir: getFrameworkPackageRoot({
        fallback: options.packageRootDir,
        packageRoots,
      }),
      sourceConfigPath: options.sourceConfigPath,
    },
  ];
}

function createGovernedAstroSemanticProject(options: {
  capability: FrameworkCapabilityDescriptor | undefined;
  parsed: ReturnType<typeof parseCheckerProjectConfigForContext>;
  project: SourceProject;
  projectConfigCache: CheckerProjectConfigCache | undefined;
}): GovernedSourceUnit['astroSemanticProject'] {
  if (options.capability === undefined) return undefined;
  const analysisGeneration =
    options.projectConfigCache === undefined
      ? 0
      : options.projectConfigCache.generation;
  return createAstroSemanticProject({
    analysisGeneration,
    configPath: options.project.configPath,
    packageRootDir: options.capability.packageRootDir,
    projectFingerprint: options.project.configPath,
    readSnapshot: () => ({
      checkerExtensions: options.parsed.extensions,
      compilerOptions: options.project.options,
      configClosure: options.parsed.configClosure,
      fileNames: options.parsed.fileNames,
      projectReferences: [...options.project.references],
    }),
  });
}

export function createGovernedSourceUnit(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  config: ResolvedLiminaConfig;
  project: SourceProject;
  projectConfigCache?: CheckerProjectConfigCache;
}): GovernedSourceUnit {
  const discoveryExtensions = normalizeExtensions([
    ...capabilityDiscoveryExtensions,
    ...options.project.context.extensions,
  ]);
  const parsed = parseCheckerProjectConfigForContext({
    allowNoInputDiagnostics: true,
    cache: options.projectConfigCache,
    configPath: options.project.configPath,
    context: {
      checkerPresets: [...options.project.context.checkerPresets],
      extensions: discoveryExtensions,
      vueSemanticIdentity: options.project.context.vueSemanticIdentity,
    },
    projectRootDir: options.config.rootDir,
  });
  const ownedFileNames = uniqueSortedStrings(
    parsed.fileNames
      .map(normalizeAbsolutePath)
      .filter((fileName) => !isInsideNodeModules(fileName)),
  );
  const frameworkCapabilities = createFrameworkCapabilities({
    activatedRegions: options.activatedRegions,
    fileNames: ownedFileNames,
    packageRootDir: options.project.packageRootDir,
    checkerName: options.project.checkerName,
    sourceConfigPath: options.project.configPath,
  });
  const declarationFileNames = createDeclarationFileNames(options.project);
  const astroCapability = frameworkCapabilities.find(
    (capability) => capability.family === 'astro',
  );
  const astroSemanticProject = createGovernedAstroSemanticProject({
    capability: astroCapability,
    parsed,
    project: options.project,
    projectConfigCache: options.projectConfigCache,
  });

  return {
    astroSemanticProject,
    buildProjection: createBuildProjection({
      config: options.config,
      declarationFileNames,
      frameworkCapabilities,
      project: options.project,
    }),
    configPath: options.project.configPath,
    context: {
      checkerPresets: [...options.project.context.checkerPresets],
      extensions: [...parsed.extensions],
      vueSemanticIdentity: options.project.context.vueSemanticIdentity,
    },
    declarationFileNames,
    declarationReferences: options.project.references,
    frameworkCapabilities,
    ownedFileNames,
    packageRootDir: options.project.packageRootDir,
    primaryCheckerName: options.project
      .checkerName as GovernedSourceUnit['primaryCheckerName'],
  };
}
