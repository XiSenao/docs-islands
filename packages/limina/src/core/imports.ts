import type { CheckerProjectParseContext } from '#checkers';
import type { ResolvedLiminaConfig } from '#config/runner';
import {
  createImportAnalysisContext,
  type ImportAnalysisContext,
  type ImportAnalysisMetricsRecorder,
  type ImportRecord,
} from '#core/import-analysis/runner';
import type { ProjectInfo } from '#core/import-graph/context';
import { normalizeAbsolutePath } from '#utils/path';
import type { AstroSemanticContextManager } from './astro-semantic/context';
import { selectCanonicalImportFilePath } from './import-analysis/canonical-resolution';
import type { VueSemanticContextManager } from './vue-semantic/context';

export interface ResolveImportOptions {
  containingFile: string;
  project: ProjectInfo;
  specifier: string;
}

export interface ResolvedImportRecord {
  importRecord: ImportRecord;
  resolvedFilePath: string | null;
}

interface ImportCoreOptions {
  astroSemanticContexts?: AstroSemanticContextManager;
  metrics?: ImportAnalysisMetricsRecorder;
  vueSemanticContexts?: VueSemanticContextManager;
}

export class ImportCore {
  readonly #config: ResolvedLiminaConfig;
  #context: ImportAnalysisContext;

  constructor(config: ResolvedLiminaConfig, options: ImportCoreOptions = {}) {
    this.#config = config;
    this.#context = this.#createContext(options);
  }

  get context(): ImportAnalysisContext {
    return this.#context;
  }

  #createContext(options: ImportCoreOptions): ImportAnalysisContext {
    return createImportAnalysisContext({
      astroSemanticContexts: options.astroSemanticContexts,
      metrics: options.metrics,
      projectRootDir: this.#config.rootDir,
      vueSemanticContexts: options.vueSemanticContexts,
    });
  }

  getImports(filePath: string): ImportRecord[] {
    return this.#context
      .collectImportsFromFile(
        normalizeAbsolutePath(filePath),
        this.#config.rootDir,
      )
      .map((record) => ({ ...record }));
  }

  resolveImport(options: ResolveImportOptions): string | null {
    return this.#context.resolveInternalImport(
      options.specifier,
      options.containingFile,
      options.project.options,
      createProjectResolveContext(options.project),
    );
  }

  getResolvedImports(
    filePath: string,
    project: ProjectInfo,
  ): ResolvedImportRecord[] {
    return this.getImports(filePath).map((importRecord) => {
      const evidence = this.#context.resolveImportEvidence(
        importRecord,
        importRecord.filePath,
        project.options,
        createProjectResolveContext(project),
      );
      return {
        importRecord,
        resolvedFilePath: selectCanonicalImportFilePath({
          evidence,
          includeResource: true,
        }),
      };
    });
  }
}

function createProjectResolveContext(
  project: ProjectInfo,
): CheckerProjectParseContext & {
  astroSemanticProject?: ProjectInfo['astroSemanticProject'];
  configPath: string;
  resolverConfigPath: string;
} {
  return {
    astroSemanticProject: project.astroSemanticProject,
    checkerPresets: project.checkerPresets,
    configPath: project.configPath,
    extensions: project.extensions,
    resolverConfigPath: project.resolverConfigPath,
    vueSemanticIdentity: project.vueSemanticIdentity,
  };
}
