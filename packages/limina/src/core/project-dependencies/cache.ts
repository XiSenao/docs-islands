import type {
  ProjectDependencyCaches,
  ProjectDependencyCollection,
  ProjectDependencyPreparation,
  ProjectSemanticContext,
  SourceEvidence,
} from './contracts';

export const PROJECT_DEPENDENCY_ADAPTER_VERSION = 'semantic-script-v1';

export function createProjectDependencyCaches(): ProjectDependencyCaches {
  return {
    pendingOwnershipEvidenceCache: new Map(),
    projectDependencyCache: new Map(),
    projectDependencyPreparationCache: new Map(),
    sourceEvidenceCache: new Map(),
  };
}

function getAstroCacheIdentity(context: ProjectSemanticContext): string | null {
  return context.astroSemanticProject?.seed.id ?? null;
}

function getSvelteCacheIdentity(context: ProjectSemanticContext) {
  const project = context.svelteSemanticProject;
  return project === undefined
    ? null
    : {
        adapterVersion: project.adapterVersion,
        generation: project.generation,
      };
}

function getVueCacheIdentity(context: ProjectSemanticContext): string | null {
  return context.vueSemanticIdentity?.id ?? null;
}

export function createProjectSemanticCacheIdentity(
  context: ProjectSemanticContext,
): string {
  return JSON.stringify({
    adapterContractVersion: PROJECT_DEPENDENCY_ADAPTER_VERSION,
    astro: getAstroCacheIdentity(context),
    authority: context.semanticAuthority,
    configPath: context.configPath,
    fileNames: context.fileNames,
    generation: context.generation,
    packageRoots: [...context.packageRootByFileName.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    ),
    resolverConfigPath: context.resolverConfigPath,
    svelte: getSvelteCacheIdentity(context),
    vue: getVueCacheIdentity(context),
  });
}

export function cloneProjectDependencyCollection(
  collection: ProjectDependencyCollection,
): ProjectDependencyCollection {
  return {
    dependencies: collection.dependencies.map((dependency) => ({
      ...dependency,
      importRecord: {
        ...dependency.importRecord,
        locator: { ...dependency.importRecord.locator },
      },
    })),
    failures: collection.failures.map((failure) => ({
      ...failure,
      importRecord:
        failure.importRecord === undefined
          ? undefined
          : {
              ...failure.importRecord,
              locator: { ...failure.importRecord.locator },
            },
    })),
    observations: collection.observations.map((observation) =>
      observation.kind === 'unmapped-generated'
        ? { ...observation }
        : {
            ...observation,
            importRecord: {
              ...observation.importRecord,
              locator: { ...observation.importRecord.locator },
            },
          },
    ),
  };
}

export function cloneProjectDependencyPreparation(
  preparation: ProjectDependencyPreparation,
): ProjectDependencyPreparation {
  return {
    failures: preparation.failures.map((failure) => ({
      ...failure,
      importRecord:
        failure.importRecord === undefined
          ? undefined
          : {
              ...failure.importRecord,
              locator: { ...failure.importRecord.locator },
            },
    })),
    observations: preparation.observations.map((observation) =>
      observation.kind === 'unmapped-generated'
        ? { ...observation }
        : {
            ...observation,
            importRecord: {
              ...observation.importRecord,
              locator: { ...observation.importRecord.locator },
            },
          },
    ),
    ready: preparation.ready,
    sourceRecords: preparation.sourceRecords.map((record) => ({
      ...record,
      locator: { ...record.locator },
    })),
  };
}

export function cloneSourceEvidence(evidence: SourceEvidence): SourceEvidence {
  return {
    diagnostics: [...evidence.diagnostics],
    filePath: evidence.filePath,
    records: evidence.records.map((record) => ({
      ...record,
      locator: { ...record.locator },
    })),
  };
}
