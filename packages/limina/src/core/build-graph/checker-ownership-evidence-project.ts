import {
  type CheckerProjectConfigCache,
  type CheckerProjectParseContext,
  getBuildCheckerSupportedExtensions,
  parseCheckerProjectConfigForContext,
} from '#checkers';
import type { CheckerName } from '#config/runner';
import type { AutoScopeProject } from './auto-checker-types';
import type { TypeConfigOwnershipState } from './checker-ownership-types';
import { capabilityDiscoveryExtensions } from './generated/file-extensions';

export interface EvidenceProject {
  checkerName: CheckerName;
  project: {
    checkerPresets: CheckerProjectParseContext['checkerPresets'];
    configPath: string;
    extensions: string[];
    fileNames: string[];
    options: AutoScopeProject['options'];
    resolverConfigPath: string;
    vueSemanticIdentity?: CheckerProjectParseContext['vueSemanticIdentity'];
  };
}

const evidenceCheckerByOwner = {
  astro: 'tsc',
  'svelte-check': 'tsc',
  tsc: 'tsc',
  tsgo: 'tsgo',
  'vue-tsc': 'tsc',
} as const satisfies Record<CheckerName, CheckerName>;

function getEvidenceChecker(state: TypeConfigOwnershipState): CheckerName {
  if (state.authoritativeOwner !== undefined) return 'tsc';
  if (state.localOwner.kind === 'pending') return 'tsc';
  return evidenceCheckerByOwner[state.localOwner.checker];
}

function isResolvedVue(state: TypeConfigOwnershipState): boolean {
  return (
    state.localOwner.kind === 'resolved' &&
    state.localOwner.checker === 'vue-tsc'
  );
}

function createDefaultParseContext(
  checkerName: CheckerName,
): CheckerProjectParseContext {
  if (checkerName === 'tsc' || checkerName === 'tsgo') {
    return {
      checkerPresets: [checkerName],
      extensions: capabilityDiscoveryExtensions,
    };
  }
  return { checkerPresets: [checkerName], extensions: [] };
}

function createParseContext(
  checkerName: CheckerName,
  project: AutoScopeProject,
  state: TypeConfigOwnershipState,
): CheckerProjectParseContext {
  if (state.authoritativeOwner !== undefined) {
    return {
      checkerPresets: ['tsc'],
      extensions: [...project.context.extensions],
      vueSemanticIdentity: project.context.vueSemanticIdentity,
    };
  }
  if (isResolvedVue(state)) {
    return {
      checkerPresets: ['tsc'],
      extensions: capabilityDiscoveryExtensions,
      vueSemanticIdentity: project.context.vueSemanticIdentity,
    };
  }
  return createDefaultParseContext(checkerName);
}

function getSemanticExtensions(
  checkerName: CheckerName,
  parsed: ReturnType<typeof parseCheckerProjectConfigForContext>,
): string[] {
  if (checkerName === 'vue-tsc') return parsed.extensions;
  return getBuildCheckerSupportedExtensions(checkerName);
}

export function createEvidenceProject(options: {
  project: AutoScopeProject;
  projectConfigCache?: CheckerProjectConfigCache;
  rootDir: string;
  state: TypeConfigOwnershipState;
}): EvidenceProject {
  const checkerName = getEvidenceChecker(options.state);
  const context = createParseContext(
    checkerName,
    options.project,
    options.state,
  );
  const parsed = parseCheckerProjectConfigForContext({
    allowNoInputDiagnostics: true,
    cache: options.projectConfigCache,
    configPath: options.project.configPath,
    context,
    projectRootDir: options.rootDir,
  });
  return {
    checkerName,
    project: {
      checkerPresets: [checkerName],
      configPath: options.project.configPath,
      extensions: [...getSemanticExtensions(checkerName, parsed)],
      fileNames: [...parsed.fileNames],
      options: parsed.options,
      resolverConfigPath: options.project.configPath,
      vueSemanticIdentity:
        context.vueSemanticIdentity ?? parsed.vueSemanticIdentity,
    },
  };
}
