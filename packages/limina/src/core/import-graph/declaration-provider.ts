import type {
  AstroSemanticProject,
  CheckerProjectParseContext,
} from '#checkers';
import type {
  ImportAnalysisContext,
  ImportRecord,
  ResolvedCheckerModuleName,
} from '#core/import-analysis/runner';
import type ts from 'typescript';
import {
  formatFrameworkSemanticFailure,
  type FrameworkSemanticFailure,
} from '../framework-semantic/contracts';
import type { ImportRuntimeResolutionEvidence } from '../import-analysis/evidence';
import { isDeclarationFile } from './declaration-classifier';

export interface DeclarationProviderProjectContext
  extends Pick<
    CheckerProjectParseContext,
    'checkerPresets' | 'extensions' | 'vueSemanticIdentity'
  > {
  astroSemanticProject?: AstroSemanticProject;
  configPath: string;
  resolverConfigPath: string;
}

export type DeclarationProviderResolution =
  | {
      evidence: ImportRuntimeResolutionEvidence & {
        classification: 'resource';
      };
      kind: 'resource';
      oxcResolvedFilePath: string | null;
      typeScriptResolution: ResolvedCheckerModuleName | null;
    }
  | {
      kind: 'declaration';
      oxcResolvedFilePath: string | null;
      typeScriptResolution: ResolvedCheckerModuleName;
    }
  | {
      kind: 'source';
      ownerProjectPaths: string[];
      oxcResolvedFilePath: string | null;
      typeScriptResolution: ResolvedCheckerModuleName;
    }
  | {
      kind: 'oxc-only';
      oxcResolvedFilePath: string;
      typeScriptResolution: null;
    }
  | {
      failure: FrameworkSemanticFailure;
      kind: 'semantic-failure';
      oxcResolvedFilePath: string | null;
      reason: string;
      typeScriptResolution: null;
    }
  | {
      kind: 'unresolved';
      oxcResolvedFilePath: null;
      typeScriptResolution: null;
    };

export function isDeclarationFileFamily(filePath: string): boolean {
  return isDeclarationFile(filePath);
}

function isResourceEvidence(
  evidence: ImportRuntimeResolutionEvidence,
): evidence is ImportRuntimeResolutionEvidence & {
  classification: 'resource';
} {
  return evidence.classification === 'resource';
}

function createResourceResolution(options: {
  evidence: ImportRuntimeResolutionEvidence & { classification: 'resource' };
  oxcResolvedFilePath: string | null;
  typeScriptResolution: ResolvedCheckerModuleName | null;
}): DeclarationProviderResolution {
  return {
    evidence: options.evidence,
    kind: 'resource',
    oxcResolvedFilePath: options.oxcResolvedFilePath,
    typeScriptResolution: options.typeScriptResolution,
  };
}

function createMissingTypeScriptResolution(
  oxcResolvedFilePath: string | null,
): DeclarationProviderResolution {
  return oxcResolvedFilePath === null
    ? {
        kind: 'unresolved',
        oxcResolvedFilePath: null,
        typeScriptResolution: null,
      }
    : {
        kind: 'oxc-only',
        oxcResolvedFilePath,
        typeScriptResolution: null,
      };
}

function createTypeScriptResolution(options: {
  fileOwnerLookup: Map<string, string[]>;
  oxcResolvedFilePath: string | null;
  typeScriptResolution: ResolvedCheckerModuleName;
}): DeclarationProviderResolution {
  if (isDeclarationFileFamily(options.typeScriptResolution.resolvedFileName)) {
    return {
      kind: 'declaration',
      oxcResolvedFilePath: options.oxcResolvedFilePath,
      typeScriptResolution: options.typeScriptResolution,
    };
  }

  return {
    kind: 'source',
    ownerProjectPaths:
      options.fileOwnerLookup.get(
        options.typeScriptResolution.resolvedFileName,
      ) ?? [],
    oxcResolvedFilePath: options.oxcResolvedFilePath,
    typeScriptResolution: options.typeScriptResolution,
  };
}

function createNonResourceResolution(options: {
  fileOwnerLookup: Map<string, string[]>;
  oxcResolvedFilePath: string | null;
  semanticFailure: FrameworkSemanticFailure | undefined;
  typeScriptResolution: ResolvedCheckerModuleName | null;
}): DeclarationProviderResolution {
  if (options.semanticFailure !== undefined) {
    return {
      failure: { ...options.semanticFailure },
      kind: 'semantic-failure',
      oxcResolvedFilePath: options.oxcResolvedFilePath,
      reason: formatFrameworkSemanticFailure(options.semanticFailure),
      typeScriptResolution: null,
    };
  }
  if (options.typeScriptResolution === null) {
    return createMissingTypeScriptResolution(options.oxcResolvedFilePath);
  }
  return createTypeScriptResolution({
    fileOwnerLookup: options.fileOwnerLookup,
    oxcResolvedFilePath: options.oxcResolvedFilePath,
    typeScriptResolution: options.typeScriptResolution,
  });
}

export function resolveDeclarationProvider(options: {
  compilerOptions: ts.CompilerOptions;
  containingFile: string;
  fileOwnerLookup: Map<string, string[]>;
  importAnalysis: ImportAnalysisContext;
  importRecord: ImportRecord;
  project: DeclarationProviderProjectContext;
}): DeclarationProviderResolution {
  const {
    oxcResolvedFilePath,
    runtimeEvidence: evidence,
    semanticFailure,
    typeScriptResolution,
  } = options.importAnalysis.resolveImportEvidence(
    options.importRecord,
    options.containingFile,
    options.compilerOptions,
    options.project,
  );
  if (isResourceEvidence(evidence)) {
    return createResourceResolution({
      evidence,
      oxcResolvedFilePath,
      typeScriptResolution,
    });
  }

  return createNonResourceResolution({
    fileOwnerLookup: options.fileOwnerLookup,
    oxcResolvedFilePath,
    semanticFailure,
    typeScriptResolution,
  });
}
