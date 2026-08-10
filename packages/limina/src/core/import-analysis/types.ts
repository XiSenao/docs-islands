import type {
  CheckerProjectParseContext,
  ResolvedCheckerModuleName,
  VueSourceProfile,
} from '#checkers';
import type { ResolverFactory } from 'oxc-resolver';
import type ts from 'typescript';
import type { VueSemanticContextManager } from '../vue-semantic/context';
import type { SemanticDependencyEvidence } from '../vue-semantic/dependency';
import type { ImportRecord } from './records';

export interface ModuleResolutionPair {
  oxc: string | null;
  semanticEvidence?: SemanticDependencyEvidence;
  semanticFailure?: string;
  typescript: ResolvedCheckerModuleName | null;
}

export interface ImportResolveContextFields
  extends Pick<
    CheckerProjectParseContext,
    'checkerPresets' | 'extensions' | 'vueSemanticIdentity'
  > {
  configPath?: string;
  resolverConfigPath?: string;
}

export type ImportResolveContextInput = ImportResolveContextFields | string[];

export type ImportResolutionArguments = [
  specifier: string,
  containingFile: string,
  options: ts.CompilerOptions,
  contextOrExtensions?: ImportResolveContextInput,
];

export type ImportRecordResolutionArguments = [
  importRecord: ImportRecord,
  containingFile: string,
  options: ts.CompilerOptions,
  contextOrExtensions?: ImportResolveContextInput,
];

export type StandaloneInternalImportArguments = [
  specifier: string,
  containingFile: string,
  options: ts.CompilerOptions,
  contextOrExtensions?: ImportResolveContextInput,
  analysisContext?: ImportAnalysisContext,
];

export interface ImportAnalysisContext {
  clearOxcResolverCaches?: () => void;
  collectImportsFromFile: (
    filePath: string,
    packageRootDir: string,
    sourceProfile?: VueSourceProfile,
  ) => ImportRecord[];
  prewarmImportsFromFile?: (
    filePath: string,
    packageRootDir: string,
    sourceProfile?: VueSourceProfile,
  ) => Promise<void>;
  resolveInternalImport: (...args: ImportResolutionArguments) => string | null;
  resolveOxcImport: (...args: ImportResolutionArguments) => string | null;
  resolveModulePair: (
    ...args: ImportResolutionArguments
  ) => ModuleResolutionPair;
  resolveModulePairForImport: (
    ...args: ImportRecordResolutionArguments
  ) => ModuleResolutionPair;
  resolveTypeScriptImport: (
    ...args: ImportResolutionArguments
  ) => ResolvedCheckerModuleName | null;
}

export interface CreateImportAnalysisContextOptions {
  metrics?: ImportAnalysisMetricsRecorder;
  projectRootDir?: string;
  vueSemanticContexts?: VueSemanticContextManager;
}

export interface ImportAnalysisMetricsRecorder {
  record(measurement: {
    readonly count?: number;
    readonly kind?: string;
    readonly name:
      | 'import-resolution-cache-hit'
      | 'import-resolution-cache-miss'
      | 'internal-import-resolution'
      | 'module-resolution-index-hit'
      | 'module-resolution-index-miss'
      | 'module-resolution-request'
      | 'oxc-resolution'
      | 'oxc-resolver-factory-create'
      | 'oxc-resolver-factory-hit'
      | 'provider-cache-hit'
      | 'provider-cache-miss'
      | 'source-parse'
      | 'source-read'
      | 'typescript-module-resolution-cache-hit'
      | 'typescript-module-resolution-cache-miss'
      | 'typescript-resolution';
    readonly provider?: string;
  }): void;
}

export interface OxcResolverProfileIdentity {
  readonly conditionNames: readonly string[];
  readonly configPath: string;
  readonly extensions: readonly string[];
  readonly id: string;
  readonly packageJsonExportsAndImports: boolean;
  readonly preserveSymlinks: boolean;
}

export type ResolvedImportContext = CheckerProjectParseContext & {
  configPath?: string;
  resolverConfigPath?: string;
};

export interface LazyModuleResolutionRecord {
  hasInternalImportResult: boolean;
  hasOxcResult: boolean;
  hasTypeScriptResult: boolean;
  internalImportResult: string | null;
  oxcResult: string | null;
  typeScriptResult: ResolvedCheckerModuleName | null;
}

export interface NormalizedModuleResolutionRequest {
  compilerOptions: ts.CompilerOptions;
  containingFile: string;
  context: ResolvedImportContext;
  record: LazyModuleResolutionRecord;
  specifier: string;
}

export interface ImportAnalysisCaches {
  importsCache: Map<string, ImportRecord[]>;
  importsPromiseCache: Map<string, Promise<ImportRecord[]>>;
  moduleResolutionIndex: Map<string, LazyModuleResolutionRecord>;
  moduleResolverIdentityCache: Map<string, number>;
  nextModuleResolverIdentity: number;
  resolverCache: Map<string, ResolverFactory>;
  sourceTextCache: Map<string, string>;
  typeScriptModuleResolutionCache: Map<string, ts.ModuleResolutionCache>;
}

export interface FrameworkImportCollectionOptions {
  filePath: string;
  packageRootDir: string;
  sourceText: string;
  sourceProfile?: VueSourceProfile;
}

export interface FrameworkImportParserIdentity {
  kind: string;
  mode: string;
  version: string;
}

export interface FrameworkImportProvider {
  collectionMode: 'async' | 'sync';
  collectImports(
    options: FrameworkImportCollectionOptions,
  ): ImportRecord[] | Promise<ImportRecord[]>;
  extension: string;
  getParserIdentity(options: {
    packageRootDir: string;
  }): FrameworkImportParserIdentity;
}
