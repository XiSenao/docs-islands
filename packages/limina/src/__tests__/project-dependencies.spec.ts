import type {
  CanonicalImportResolutionEvidence,
  ImportAnalysisContext,
  ImportRecord,
} from '#core/import-analysis/runner';
import { createImportAnalysisContext } from '#core/import-analysis/runner';
import {
  collectProjectDependencies,
  projectDependencyCreatesSourceEdge,
  type ProjectSemanticContext,
} from '#core/project-dependencies/runner';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSvelteSourceMappingFailure,
  prepareSvelteSemanticDependencies,
  selectSvelteSourceMapping,
} from '../core/svelte-semantic/dependency';
import { createSvelteSemanticProject } from '../core/svelte-semantic/project';
import type { SvelteSemanticToolchain } from '../core/svelte-semantic/toolchain';

const temporaryRoots: string[] = [];

function createRecord(filePath: string, specifier: string): ImportRecord {
  return {
    domain: filePath.endsWith('.vue') ? 'vue-script' : 'typescript',
    filePath,
    kind: 'static',
    line: 1,
    locator: { occurrence: 0, sourceEnd: 14, sourceStart: 7 },
    specifier,
  };
}

function createSemanticContext(options: {
  family: ProjectSemanticContext['semanticAuthority']['family'];
  fileName: string;
  rootDir: string;
}): ProjectSemanticContext {
  return {
    compilerOptions: {
      module: 99,
      moduleResolution: 100,
      target: 99,
    },
    configPath: path.join(options.rootDir, 'tsconfig.json'),
    extensions: options.family === 'vue' ? ['.vue'] : [],
    fileNames: [options.fileName],
    generation: 1,
    packageRootByFileName: new Map([[options.fileName, options.rootDir]]),
    packageRootDir: options.rootDir,
    references: [],
    resolverConfigPath: path.join(options.rootDir, 'tsconfig.json'),
    semanticAuthority: {
      family: options.family,
      kind: 'locked',
      source: 'explicit',
    },
  };
}

function createEvidence(options: {
  failure?: CanonicalImportResolutionEvidence['semanticFailure'];
  record: ImportRecord;
  resolvedBy?: 'checker-source' | 'typescript';
  target?: string;
}): CanonicalImportResolutionEvidence {
  const target = options.target;
  const resolvedBy = options.resolvedBy ?? 'checker-source';
  return {
    eligibility: {
      kind: 'not-applicable',
      reason: 'locked semantic test context',
    },
    oxcResolvedFilePath: null,
    runtimeEvidence:
      target === undefined
        ? { classification: 'ordinary-module', runtime: { kind: 'missing' } }
        : {
            classification:
              resolvedBy === 'checker-source'
                ? 'checker-source'
                : 'ordinary-module',
            runtime: {
              authority: 'filesystem',
              filePath: target,
              kind: 'file',
            },
          },
    semanticEvidence:
      target === undefined
        ? undefined
        : {
            framework: 'vue',
            identityId: 'vue-test',
            provenance: 'strict-source-map',
            resolutionMode: 'import',
            semanticSpecifier: './target.js',
            sourceRecord: options.record,
            sourceSpecifier: options.record.specifier,
            target: {
              isExternalLibraryImport: false,
              resolvedBy,
              resolvedFileName: target,
            },
          },
    semanticFailure: options.failure,
    typeScriptResolution:
      target === undefined
        ? null
        : {
            isExternalLibraryImport: false,
            resolvedBy,
            resolvedFileName: target,
          },
  };
}

function withOverrides(options: {
  evidence: CanonicalImportResolutionEvidence;
  record: ImportRecord;
}): {
  context: ImportAnalysisContext;
  resolveOxcImport: ReturnType<typeof vi.fn>;
} {
  const base = createImportAnalysisContext();
  const resolveOxcImport = vi.fn(base.resolveOxcImport);
  return {
    context: {
      ...base,
      collectImportsFromFile: vi.fn(() => [options.record]),
      prepareCheckerSemanticDependencies: vi.fn(({ sourceRecords }) => ({
        kind: 'supported' as const,
        sourceRecords: [...sourceRecords],
        unmapped: [],
      })),
      resolveCheckerImportEvidence: vi.fn(() => options.evidence),
      resolveOxcImport,
    },
    resolveOxcImport,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((rootDir) => rm(rootDir, { force: true, recursive: true })),
  );
});

describe('project dependency authority', () => {
  it('uses TypeScript AST plus checker resolution for direct-source dependencies', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'limina-project-deps-'));
    temporaryRoots.push(rootDir);
    const sourceFile = path.join(rootDir, 'index.ts');
    const targetFile = path.join(rootDir, 'target.ts');
    await mkdir(rootDir, { recursive: true });
    await writeFile(sourceFile, "import './target';\n", 'utf8');
    await writeFile(targetFile, 'export const target = true;\n', 'utf8');
    const base = createImportAnalysisContext();
    const resolveOxcImport = vi.fn(base.resolveOxcImport);

    const collection = collectProjectDependencies({
      context: createSemanticContext({
        family: 'typescript',
        fileName: sourceFile,
        rootDir,
      }),
      importAnalysis: { ...base, resolveOxcImport },
    });

    expect(collection.failures).toEqual([]);
    expect(collection.dependencies).toMatchObject([
      {
        provenance: 'direct-source',
        resolvedFilePath: targetFile,
        sourceSpecifier: './target',
        targetKind: 'source',
      },
    ]);
    expect(resolveOxcImport).not.toHaveBeenCalled();
  });

  it('fails a locked framework semantic error closed without Oxc rescue', () => {
    const rootDir = '/virtual/locked-vue';
    const sourceFile = path.join(rootDir, 'App.vue');
    const record = createRecord(sourceFile, './target');
    const failure = {
      framework: 'vue' as const,
      reason: 'ambiguous strict reverse mapping',
      scopeIdentity: 'vue-test',
      stage: 'source-map-ambiguity' as const,
    };
    const analysis = withOverrides({
      evidence: createEvidence({ failure, record }),
      record,
    });

    const collection = collectProjectDependencies({
      context: createSemanticContext({
        family: 'vue',
        fileName: sourceFile,
        rootDir,
      }),
      importAnalysis: analysis.context,
    });

    expect(collection.dependencies).toEqual([]);
    expect(collection.failures).toMatchObject([
      {
        framework: 'vue',
        reason: failure.reason,
        stage: 'source-map-ambiguity',
      },
    ]);
    expect(analysis.resolveOxcImport).not.toHaveBeenCalled();
  });

  it('preserves mapped source and semantic specifier provenance', () => {
    const rootDir = '/virtual/mapped-vue';
    const sourceFile = path.join(rootDir, 'App.vue');
    const targetFile = path.join(rootDir, 'target.ts');
    const record = createRecord(sourceFile, './target.ts');
    const analysis = withOverrides({
      evidence: createEvidence({ record, target: targetFile }),
      record,
    });

    const collection = collectProjectDependencies({
      context: createSemanticContext({
        family: 'vue',
        fileName: sourceFile,
        rootDir,
      }),
      importAnalysis: analysis.context,
    });

    expect(collection.dependencies).toMatchObject([
      {
        framework: 'vue',
        provenance: 'mapped-source',
        semanticSpecifier: './target.js',
        sourceSpecifier: './target.ts',
      },
    ]);
    expect(analysis.resolveOxcImport).not.toHaveBeenCalled();
  });

  it('keeps checker-resolved JSON as a resource observation instead of a source edge', () => {
    const rootDir = '/virtual/astro-json';
    const sourceFile = path.join(rootDir, 'Page.astro');
    const targetFile = path.join(rootDir, 'data.json');
    const record = {
      ...createRecord(sourceFile, './data.json'),
      domain: 'astro-frontmatter' as const,
    };
    const analysis = withOverrides({
      evidence: createEvidence({
        record,
        resolvedBy: 'typescript',
        target: targetFile,
      }),
      record,
    });

    const collection = collectProjectDependencies({
      context: createSemanticContext({
        family: 'astro',
        fileName: sourceFile,
        rootDir,
      }),
      importAnalysis: analysis.context,
    });

    expect(collection.dependencies).toEqual([]);
    expect(collection.failures).toEqual([]);
    expect(collection.observations).toEqual([
      { importRecord: record, kind: 'resource' },
    ]);
    expect(analysis.resolveOxcImport).not.toHaveBeenCalled();
  });

  it('never admits an unmapped generated dependency as a source edge', () => {
    expect(
      projectDependencyCreatesSourceEdge({
        generatedFilePath: '/workspace/App.svelte.tsx',
        kind: 'unmapped-generated',
        semanticSpecifier: '/workspace/owned.ts',
      }),
    ).toBe(false);
  });

  it('turns duplicate reverse mappings into source-map-ambiguity', () => {
    const record = createRecord('/workspace/App.svelte', './target');
    const selection = selectSvelteSourceMapping({
      range: {
        end: record.locator.sourceEnd,
        start: record.locator.sourceStart,
      },
      sourceRecords: [record, { ...record }],
    });

    expect(selection).toEqual({ kind: 'ambiguous' });
    expect(getSvelteSourceMappingFailure(selection)).toMatchObject({
      kind: 'unsupported',
      stage: 'source-map-ambiguity',
    });
  });

  it('uses the bounded Svelte transform without executing user preprocess', () => {
    const preprocess = vi.fn(() => {
      throw new Error('user preprocess must not run');
    });
    const transform = vi.fn(() => ({
      code: '',
      map: {
        mappings: '',
        names: [],
        sources: ['/workspace/App.svelte'],
        sourcesContent: ['<h1>App</h1>'],
        version: 3,
      },
    })) as unknown as SvelteSemanticToolchain['transform'];
    const toolchain: SvelteSemanticToolchain = {
      compiler: {
        parse: () => ({}),
        preprocess,
      } as SvelteSemanticToolchain['compiler'],
      compilerPath: '/workspace/node_modules/svelte/compiler/index.js',
      compilerVersion: '4.2.20',
      transform,
    };
    const project = createSvelteSemanticProject({
      configPath: '/workspace/tsconfig.json',
      extensions: ['.svelte'],
      fileNames: ['/workspace/App.svelte'],
      generation: 1,
      options: {},
      packageRootDir: '/workspace',
    });

    expect(
      prepareSvelteSemanticDependencies({
        filePath: '/workspace/App.svelte',
        project,
        sourceText: '<h1>App</h1>',
        toolchain,
      }),
    ).toMatchObject({ kind: 'supported' });
    expect(transform).toHaveBeenCalledOnce();
    expect(preprocess).not.toHaveBeenCalled();
  });
});
