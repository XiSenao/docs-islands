import type {
  AstroLanguage,
  AstroLanguagePlugin,
  AstroSemanticToolchain,
  AstroSourceScript,
  AstroUri,
  AstroVirtualCode,
  VueProjectSemanticIdentity,
} from '#checkers';
import {
  createAstroMaterializedIdentity,
  createAstroSemanticProject,
  materializeAstroSemanticProject,
} from '#checkers';
import {
  createImportAnalysisContext,
  type ImportRecord,
  type ImportResolveContextFields,
} from '#core/import-analysis/runner';
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { AstroSemanticContextManager } from '../core/astro-semantic/context';
import {
  loadAstroCompiler,
  resolveAstroParser,
} from '../core/import-analysis/astro-compiler';
import { collectPositionedAstroImports } from '../core/import-analysis/astro-positioned-imports';
import { selectCanonicalImportFilePath } from '../core/import-analysis/canonical-resolution';
import { LiminaDependencyError } from '../dependency-contract';
import { createFixturePathResolver } from './helpers/path';

interface FakeToolchainState {
  createLanguageService: number;
  createProgram: number;
  extraServiceScripts: boolean;
  hostError: Error | null;
  hostResolution: number;
  mismatch: boolean;
  resolvedBySpecifier: Map<string, string>;
  resolvedBySourceAndSpecifier: Map<string, string>;
  serviceScriptError: Error | null;
  toolchainResolution: number;
}

const cleanupTasks: (() => Promise<void>)[] = [];
const requireFromTest = createRequire(import.meta.url);
const liminaPackageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

afterEach(async () => {
  await Promise.all(cleanupTasks.splice(0).map((cleanup) => cleanup()));
});

async function createFixture(): Promise<{
  path: (...segments: string[]) => string;
  rootDir: string;
}> {
  const rootDir = await realpath(
    await mkdtemp(path.join(tmpdir(), 'limina-astro-semantic-')),
  );
  cleanupTasks.push(() => rm(rootDir, { force: true, recursive: true }));
  const fixturePath = createFixturePathResolver(rootDir);
  await writeText(
    fixturePath('tsconfig.json'),
    JSON.stringify({ compilerOptions: { moduleResolution: 'Bundler' } }),
  );
  return { path: fixturePath, rootDir };
}

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text);
}

async function linkInstalledPackage(options: {
  installedName: string;
  packageName: string;
  rootDir: string;
}): Promise<void> {
  const segments = options.packageName.split('/');
  const packageBaseName = segments.pop()!;
  const nodeModulesDir = path.join(
    options.rootDir,
    'node_modules',
    ...segments,
  );
  await mkdir(nodeModulesDir, { recursive: true });
  await symlink(
    path.join(
      liminaPackageRoot,
      'node_modules',
      ...options.installedName.split('/'),
    ),
    path.join(nodeModulesDir, packageBaseName),
    'junction',
  );
}

async function linkRealAstroToolchain(rootDir: string): Promise<void> {
  await writeText(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({
      dependencies: {
        '@astrojs/check': '0.9.10',
        astro: '7.2.0',
        typescript: '6.0.3',
      },
      name: 'real-astro-semantic-fixture',
      private: true,
    })}\n`,
  );
  await Promise.all([
    linkInstalledPackage({
      installedName: '@astrojs/check',
      packageName: '@astrojs/check',
      rootDir,
    }),
    linkInstalledPackage({
      installedName: 'astro-v7-current',
      packageName: 'astro',
      rootDir,
    }),
    linkInstalledPackage({
      installedName: 'typescript',
      packageName: 'typescript',
      rootDir,
    }),
  ]);
}

function maskAstroSource(source: string): string {
  const masked = source.replaceAll('---', '   ');
  return `${masked}\nimport './synthetic-helper';\n`;
}

function createFakeLanguage(options: {
  mismatch: boolean;
  plugin: AstroLanguagePlugin;
  registry: Map<AstroUri, AstroSourceScript>;
  sync: (
    id: AstroUri,
    includeFsFiles: boolean,
    shouldRegister: boolean,
  ) => void;
}): AstroLanguage {
  const generatedBySource = new Map<AstroSourceScript, AstroVirtualCode>();
  const language: AstroLanguage = {
    maps: {
      get(_code, source) {
        return {
          *toGeneratedRange(start, end) {
            if (!options.mismatch && generatedBySource.has(source)) {
              yield [start, end, {}, {}] as const;
            }
          },
        };
      },
    },
    plugins: [options.plugin],
    scripts: {
      delete(id) {
        options.registry.delete(id);
      },
      get(id, includeFsFiles = true, shouldRegister = true) {
        if (!options.registry.has(id)) {
          options.sync(id, includeFsFiles, shouldRegister);
        }
        return options.registry.get(id);
      },
      set(id, snapshot) {
        const source = snapshot.getText(0, snapshot.getLength());
        const code = {
          id: 'tsx',
          snapshot: ts.ScriptSnapshot.fromString(maskAstroSource(source)),
        };
        const sourceScript: AstroSourceScript = {
          generated: {
            languagePlugin: options.plugin,
            root: code,
          },
          snapshot,
        };
        generatedBySource.set(sourceScript, code);
        options.registry.set(id, sourceScript);
        return sourceScript;
      },
    },
  };
  return language;
}

function getUnavailableScriptSnapshot(): ts.IScriptSnapshot | undefined {
  return undefined;
}

function createFakeToolchain(
  state: FakeToolchainState,
): AstroSemanticToolchain {
  const plugin: AstroLanguagePlugin = {
    getLanguageId: () => 'astro',
    typescript: {
      extraFileExtensions: [
        {
          extension: 'astro',
          isMixedContent: true,
          scriptKind: ts.ScriptKind.Deferred,
        },
      ],
      getServiceScript(root) {
        if (state.serviceScriptError !== null) {
          throw state.serviceScriptError;
        }
        return {
          code: root,
          extension: '.tsx',
          scriptKind: ts.ScriptKind.TSX,
        };
      },
      getExtraServiceScripts: (fileName, root) =>
        state.extraServiceScripts
          ? [
              {
                code: root,
                extension: '.mts',
                fileName: `${fileName}.extra.mts`,
                scriptKind: ts.ScriptKind.TS,
              },
            ]
          : [],
    },
  };
  const instrumentedTypeScript = {
    ...ts,
    createLanguageService() {
      state.createLanguageService += 1;
      throw new Error('Language Service creation is forbidden.');
    },
    createProgram() {
      state.createProgram += 1;
      throw new Error('Program creation is forbidden.');
    },
  } as unknown as typeof ts;
  return {
    adapter: { family: 'astro-7-check-0.9', kind: 'supported' },
    astroCore: {
      addAstroTypes() {},
      getAstroLanguagePlugin: () => plugin,
    },
    astroInstall: {
      directory: '/virtual/astro',
      version: new semver.SemVer('7.2.0'),
    },
    languageCore: {
      createLanguage(plugins, registry, sync) {
        return createFakeLanguage({
          mismatch: state.mismatch,
          plugin: plugins[0]!,
          registry,
          sync,
        });
      },
      *forEachEmbeddedCode(root) {
        yield root;
      },
    },
    paths: {
      astro: '/store/astro/package.json',
      check: '/store/check/package.json',
      compiler: '/store/compiler/package.json',
      languageCore: '/store/language-core/package.json',
      languageServer: '/store/language-server/package.json',
      leafTypeScript: '/leaf/typescript/package.json',
      typeScript: '/store/typescript/package.json',
      volarKit: '/store/kit/package.json',
      volarTypeScript: '/store/volar-typescript/package.json',
      vscodeUri: '/store/vscode-uri/package.json',
    },
    sveltePlugin: { getLanguagePlugin: () => plugin },
    tsModule: instrumentedTypeScript,
    versions: {
      astro: '7.2.0',
      check: '0.9.10',
      compiler: '2.13.1',
      languageCore: '2.4.28',
      languageServer: '2.16.13',
      leafTypeScript: '6.0.3',
      typeScript: '6.0.3',
      volarKit: '2.4.28',
      volarTypeScript: '2.4.28',
    },
    volarTypeScript: {
      createLanguageServiceHost(_tsModule, _sys, _language, _asUri, host) {
        return {
          languageServiceHost: {
            ...ts.sys,
            getCompilationSettings: host.getCompilationSettings,
            getCurrentDirectory: host.getCurrentDirectory,
            getDefaultLibFileName: ts.getDefaultLibFilePath,
            getProjectReferences: host.getProjectReferences,
            getProjectVersion: host.getProjectVersion,
            getScriptFileNames: host.getScriptFileNames,
            getScriptSnapshot: getUnavailableScriptSnapshot,
            getScriptVersion: () => '0',
            useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
            resolveModuleNameLiterals(literals, containingFile) {
              state.hostResolution += 1;
              if (state.hostError !== null) throw state.hostError;
              return literals.map((literal) => {
                const resolvedFileName =
                  state.resolvedBySourceAndSpecifier.get(
                    `${containingFile}\0${literal.text}`,
                  ) ?? state.resolvedBySpecifier.get(literal.text);
                return {
                  resolvedModule:
                    resolvedFileName === undefined
                      ? undefined
                      : {
                          extension: ts.Extension.Ts,
                          isExternalLibraryImport: false,
                          resolvedFileName,
                        },
                };
              });
            },
          },
        };
      },
    },
    vscodeUri: {
      URI: {
        file(fileName) {
          return {
            fsPath: fileName,
            path: fileName,
            toString: () => `file://${fileName}`,
          };
        },
      },
    },
    vuePlugin: { getLanguagePlugin: () => plugin },
  };
}

function createState(): FakeToolchainState {
  return {
    createLanguageService: 0,
    createProgram: 0,
    extraServiceScripts: false,
    hostError: null,
    hostResolution: 0,
    mismatch: false,
    resolvedBySpecifier: new Map(),
    resolvedBySourceAndSpecifier: new Map(),
    serviceScriptError: null,
    toolchainResolution: 0,
  };
}

function createRecord(
  filePath: string,
  source: string,
  specifier: string,
  occurrence = 0,
): ImportRecord {
  const token = `'${specifier}'`;
  let sourceStart = -1;
  for (let index = 0; index <= occurrence; index += 1) {
    sourceStart = source.indexOf(token, sourceStart + 1);
  }
  return {
    domain: 'astro-frontmatter',
    filePath,
    kind: 'static',
    line: 2,
    locator: {
      occurrence,
      sourceEnd: sourceStart + specifier.length + 2,
      sourceStart,
    },
    specifier,
  };
}

function createTestAstroSemanticProject(options: {
  analysisGeneration: number;
  checkerExtensions?: readonly string[];
  compilerOptions: ts.CompilerOptions;
  configPath: string;
  fileNames: readonly string[];
  onReadSnapshot?: () => void;
  packageRootDir: string;
}) {
  return createAstroSemanticProject({
    analysisGeneration: options.analysisGeneration,
    configPath: options.configPath,
    packageRootDir: options.packageRootDir,
    projectFingerprint: options.configPath,
    readSnapshot: () => {
      options.onReadSnapshot?.();
      return {
        checkerExtensions: options.checkerExtensions ?? [],
        compilerOptions: options.compilerOptions,
        configClosure: [
          {
            contentHash: 'fixture-config',
            filePath: options.configPath,
          },
        ],
        fileNames: options.fileNames,
        projectReferences: undefined,
      };
    },
  });
}

it('keeps config closure out of the seed and includes it only in materialized identity', () => {
  let snapshotReads = 0;
  const createProject = (contentHash: string) =>
    createAstroSemanticProject({
      analysisGeneration: 1,
      configPath: '/workspace/tsconfig.json',
      packageRootDir: '/workspace',
      projectFingerprint: 'project-fingerprint',
      readSnapshot: () => {
        snapshotReads += 1;
        return {
          checkerExtensions: ['.astro'],
          compilerOptions: { strict: true },
          configClosure: [
            { contentHash, filePath: '/workspace/tsconfig.json' },
          ],
          fileNames: ['/workspace/src/Page.astro'],
          projectReferences: undefined,
        };
      },
    });
  const firstProject = createProject('first');
  const secondProject = createProject('second');

  expect(snapshotReads).toBe(0);
  expect(firstProject.seed).not.toHaveProperty('configClosure');
  expect(firstProject.seed.id).toBe(secondProject.seed.id);

  const toolchain = createFakeToolchain(createState());
  const first = materializeAstroSemanticProject(firstProject);
  const second = materializeAstroSemanticProject(secondProject);

  expect(snapshotReads).toBe(2);
  expect(first.snapshot.configClosure).toEqual([
    { contentHash: 'first', filePath: '/workspace/tsconfig.json' },
  ]);
  expect(
    createAstroMaterializedIdentity({ project: first, toolchain }),
  ).not.toBe(createAstroMaterializedIdentity({ project: second, toolchain }));
});

async function createHarness(
  options: {
    mismatch?: boolean;
    toolchainError?: Error;
  } = {},
) {
  const fixture = await createFixture();
  const state = createState();
  state.mismatch = options.mismatch === true;
  const toolchain = createFakeToolchain(state);
  const metrics: { count?: number; kind?: string; name: string }[] = [];
  const manager = new AstroSemanticContextManager({
    metrics: { record: (measurement) => metrics.push(measurement) },
    resolveToolchain: () => {
      state.toolchainResolution += 1;
      if (options.toolchainError !== undefined) {
        throw options.toolchainError;
      }
      return toolchain;
    },
  });
  cleanupTasks.push(async () => manager.dispose());
  const context = createImportAnalysisContext({
    astroSemanticContexts: manager,
    metrics: { record: (measurement) => metrics.push(measurement) },
    projectRootDir: fixture.rootDir,
  });
  return { context, fixture, metrics, state };
}

describe('Astro bounded semantic resolution', () => {
  it.each([
    ['@astrojs/compiler-v2', '2.0.0'],
    ['@astrojs/compiler-v3', '3.0.1'],
    ['@astrojs/compiler', '4.0.0'],
  ])(
    'strictly aligns %s ImportRecord offsets with the LS-owned semantic compiler',
    async (compilerPackage, expectedVersion) => {
      const fixture = await createFixture();
      await linkRealAstroToolchain(fixture.rootDir);
      const source = [
        '---',
        'import Component from "./Component.astro";',
        '---',
        '<Component />',
        '<script>',
        '  import "./client.ts";',
        '</script>',
        '',
      ].join('\n');
      const sourceFile = fixture.path('src', 'Page.astro');
      const componentFile = fixture.path('src', 'Component.astro');
      const clientFile = fixture.path('src', 'client.ts');
      await Promise.all([
        writeText(sourceFile, source),
        writeText(componentFile, '<h1>Component</h1>\n'),
        writeText(clientFile, 'export {};\n'),
      ]);
      const parser = resolveAstroParser({
        packageRootDir: liminaPackageRoot,
        resolveCompilerEntry: () => requireFromTest.resolve(compilerPackage),
      });
      const compiler = await loadAstroCompiler({
        packageRootDir: liminaPackageRoot,
        resolvedPath: parser.resolvedPath,
      });
      const parsed = await compiler.parse(source, { position: true });
      const records = collectPositionedAstroImports({
        filePath: sourceFile,
        packageRootDir: fixture.rootDir,
        root: parsed.ast,
        sourceText: source,
      });
      const manager = new AstroSemanticContextManager();
      cleanupTasks.push(async () => manager.dispose());
      const context = createImportAnalysisContext({
        astroSemanticContexts: manager,
      });
      const compilerOptions = {
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      };
      const project = createTestAstroSemanticProject({
        analysisGeneration: 1,
        compilerOptions,
        configPath: fixture.path('tsconfig.json'),
        fileNames: [sourceFile, componentFile, clientFile],
        packageRootDir: fixture.rootDir,
      });

      expect(parser.version).toBe(expectedVersion);
      expect(records.map((record) => record.domain)).toEqual([
        'astro-frontmatter',
        'astro-client-script',
      ]);
      expect(
        records.map((record) =>
          context.resolveImportEvidence(record, sourceFile, compilerOptions, {
            astroSemanticProject: project,
            checkerPresets: ['tsc'],
            configPath: project.seed.configPath,
            extensions: ['.astro'],
            resolverConfigPath: project.seed.configPath,
          }),
        ),
      ).toMatchObject([
        {
          semanticEvidence: { framework: 'astro' },
          typeScriptResolution: { resolvedFileName: componentFile },
        },
        {
          semanticEvidence: { framework: 'astro' },
          typeScriptResolution: { resolvedFileName: clientFile },
        },
      ]);
    },
  );

  it.each([
    ['./target.astro', 'checker-source'],
    ['./target.svelte', 'checker-source'],
    ['./target.vue', 'checker-source'],
    ['./target.tsx', 'typescript'],
  ] as const)(
    'confirms %s through Astro authority and preserves target ownership',
    async (specifier, resolvedBy) => {
      const harness = await createHarness();
      const source = `---\nimport target from '${specifier}';\n---\n`;
      const sourceFile = harness.fixture.path('src', 'entry.astro');
      const targetFile = harness.fixture.path('src', specifier.slice(2));
      await Promise.all([
        writeText(sourceFile, source),
        writeText(targetFile, 'export default {};\n'),
      ]);
      harness.state.resolvedBySpecifier.set(specifier, targetFile);
      const compilerOptions = {
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      };
      const project = createTestAstroSemanticProject({
        analysisGeneration: 3,
        checkerExtensions: ['.vue'],
        compilerOptions,
        configPath: harness.fixture.path('tsconfig.json'),
        fileNames: [sourceFile, targetFile],
        packageRootDir: harness.fixture.rootDir,
      });
      const evidence = harness.context.resolveImportEvidence(
        createRecord(sourceFile, source, specifier),
        sourceFile,
        compilerOptions,
        {
          astroSemanticProject: project,
          checkerPresets: ['tsc'],
          configPath: project.seed.configPath,
          extensions: ['.astro', '.svelte', '.vue'],
          resolverConfigPath: project.seed.configPath,
        },
      );
      expect(evidence.semanticFailure).toBeUndefined();
      expect(evidence.semanticEvidence?.framework).toBe('astro');
      expect(evidence.typeScriptResolution).toMatchObject({
        resolvedBy,
        resolvedFileName: targetFile,
      });
    },
  );

  it('keeps Astro authority for an Astro record even when a Vue profile claims the same source file', async () => {
    const harness = await createHarness();
    const source = "---\nimport './target.vue';\n---\n";
    const sourceFile = harness.fixture.path('src', 'entry.astro');
    const targetFile = harness.fixture.path('src', 'target.vue');
    await Promise.all([
      writeText(sourceFile, source),
      writeText(targetFile, '<template />\n'),
    ]);
    harness.state.resolvedBySpecifier.set('./target.vue', targetFile);
    const compilerOptions = {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    };
    const project = createTestAstroSemanticProject({
      analysisGeneration: 4,
      checkerExtensions: ['.vue'],
      compilerOptions,
      configPath: harness.fixture.path('tsconfig.json'),
      fileNames: [sourceFile, targetFile],
      packageRootDir: harness.fixture.rootDir,
    });
    const vueSemanticIdentity = {
      id: 'must-not-run-vue-semantics',
      profilesByFileName: new Map([[sourceFile, {}]]),
    } as unknown as VueProjectSemanticIdentity;

    const evidence = harness.context.resolveImportEvidence(
      createRecord(sourceFile, source, './target.vue'),
      sourceFile,
      compilerOptions,
      {
        astroSemanticProject: project,
        checkerPresets: ['vue-tsc'],
        configPath: project.seed.configPath,
        extensions: ['.astro', '.vue'],
        resolverConfigPath: project.seed.configPath,
        vueSemanticIdentity,
      },
    );

    expect(evidence.semanticFailure).toBeUndefined();
    expect(evidence.semanticEvidence?.framework).toBe('astro');
    expect(evidence.typeScriptResolution?.resolvedFileName).toBe(targetFile);
  });

  it('preserves the stable owner/version identity of toolchain failures', async () => {
    const toolchainError = new LiminaDependencyError({
      failureKind: 'missing',
      message: 'Missing Astro semantic toolchain dependency: typescript',
      ownership: 'checker-toolchain',
      packageName: 'typescript',
      scope: JSON.stringify({ name: '@astrojs/check', version: '0.9.10' }),
    });
    const harness = await createHarness({ toolchainError });
    const source = "---\nimport './target.ts';\n---\n";
    const sourceFile = harness.fixture.path('src', 'entry.astro');
    await writeText(sourceFile, source);
    const project = createTestAstroSemanticProject({
      analysisGeneration: 9,
      compilerOptions: {},
      configPath: harness.fixture.path('tsconfig.json'),
      fileNames: [sourceFile],
      packageRootDir: harness.fixture.rootDir,
    });
    const evidence = harness.context.resolveImportEvidence(
      createRecord(sourceFile, source, './target.ts'),
      sourceFile,
      {},
      {
        astroSemanticProject: project,
        checkerPresets: ['tsc'],
        configPath: project.seed.configPath,
        extensions: ['.astro'],
      },
    );

    expect(evidence.semanticFailure).toMatchObject({
      framework: 'astro',
      scopeIdentity: toolchainError.issueIdentity,
      stage: 'toolchain-resolution',
    });
    expect(evidence.semanticFailure?.scopeIdentity).not.toContain(
      harness.fixture.rootDir,
    );
  });

  it('uses pre-semantic eligibility and never materializes resource-only input', async () => {
    const harness = await createHarness();
    const source = "---\nimport './theme.css?inline';\n---\n";
    const sourceFile = harness.fixture.path('src', 'entry.astro');
    await writeText(sourceFile, source);
    let snapshotReads = 0;
    const project = createTestAstroSemanticProject({
      analysisGeneration: 1,
      compilerOptions: {},
      configPath: harness.fixture.path('tsconfig.json'),
      fileNames: [sourceFile],
      onReadSnapshot: () => {
        snapshotReads += 1;
      },
      packageRootDir: harness.fixture.rootDir,
    });
    const evidence = harness.context.resolveImportEvidence(
      createRecord(sourceFile, source, './theme.css?inline'),
      sourceFile,
      {},
      {
        astroSemanticProject: project,
        checkerPresets: ['tsc'],
        configPath: project.seed.configPath,
        extensions: ['.astro'],
      },
    );
    expect(evidence.eligibility.kind).toBe('skip');
    expect(evidence.runtimeEvidence.classification).toBe('resource');
    expect(harness.state.toolchainResolution).toBe(0);
    expect(harness.state.hostResolution).toBe(0);
    expect(snapshotReads).toBe(0);
    expect(
      harness.metrics.some(
        (measurement) => measurement.name === 'astro-context-materialize',
      ),
    ).toBe(false);
  });

  it('ignores synthetic imports, caches by full locator, and creates no LS or Program', async () => {
    const harness = await createHarness();
    const source = "---\nimport './target.ts';\n---\n";
    const sourceFile = harness.fixture.path('src', 'entry.astro');
    const targetFile = harness.fixture.path('src', 'target.ts');
    await Promise.all([
      writeText(sourceFile, source),
      writeText(targetFile, 'export {};\n'),
    ]);
    harness.state.resolvedBySpecifier.set('./target.ts', targetFile);
    const compilerOptions = {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    };
    const project = createTestAstroSemanticProject({
      analysisGeneration: 5,
      compilerOptions,
      configPath: harness.fixture.path('tsconfig.json'),
      fileNames: [sourceFile, targetFile],
      packageRootDir: harness.fixture.rootDir,
    });
    const record = createRecord(sourceFile, source, './target.ts');
    const resolveContext: ImportResolveContextFields = {
      astroSemanticProject: project,
      checkerPresets: ['tsc'],
      configPath: project.seed.configPath,
      extensions: ['.astro'],
    };
    const first = harness.context.resolveImportEvidence(
      record,
      sourceFile,
      compilerOptions,
      resolveContext,
    );
    const second = harness.context.resolveImportEvidence(
      record,
      sourceFile,
      compilerOptions,
      resolveContext,
    );
    expect(first.semanticFailure).toBeUndefined();
    expect(second.typeScriptResolution).toEqual(first.typeScriptResolution);
    expect(harness.state.hostResolution).toBe(1);
    expect(harness.state.createLanguageService).toBe(0);
    expect(harness.state.createProgram).toBe(0);
    expect(
      harness.metrics.find(
        (measurement) => measurement.name === 'astro-candidate-count',
      )?.count,
    ).toBe(1);
    expect(
      harness.metrics.find(
        (measurement) => measurement.name === 'astro-semantic-host-resolution',
      )?.count,
    ).toBe(1);
  });

  it('treats an unresolved semantic target as module-not-found instead of a tooling failure', async () => {
    const harness = await createHarness();
    const source = "---\nimport './missing.ts';\n---\n";
    const sourceFile = harness.fixture.path('src', 'entry.astro');
    await writeText(sourceFile, source);
    const project = createTestAstroSemanticProject({
      analysisGeneration: 6,
      compilerOptions: {},
      configPath: harness.fixture.path('tsconfig.json'),
      fileNames: [sourceFile],
      packageRootDir: harness.fixture.rootDir,
    });
    const evidence = harness.context.resolveImportEvidence(
      createRecord(sourceFile, source, './missing.ts'),
      sourceFile,
      {},
      {
        astroSemanticProject: project,
        checkerPresets: ['tsc'],
        configPath: project.seed.configPath,
        extensions: ['.astro'],
      },
    );

    expect(evidence.semanticFailure).toBeUndefined();
    expect(evidence.semanticEvidence?.target).toBeNull();
    expect(evidence.typeScriptResolution).toBeNull();
    expect(harness.state.hostResolution).toBe(1);
  });

  it('does not replace an unresolved Astro semantic target with Oxc evidence', async () => {
    const harness = await createHarness();
    const source = "---\nimport './target.ts';\n---\n";
    const sourceFile = harness.fixture.path('src', 'entry.astro');
    const targetFile = harness.fixture.path('src', 'target.ts');
    await Promise.all([
      writeText(sourceFile, source),
      writeText(targetFile, 'export {};\n'),
    ]);
    const project = createTestAstroSemanticProject({
      analysisGeneration: 6,
      compilerOptions: {},
      configPath: harness.fixture.path('tsconfig.json'),
      fileNames: [sourceFile, targetFile],
      packageRootDir: harness.fixture.rootDir,
    });
    const evidence = harness.context.resolveImportEvidence(
      createRecord(sourceFile, source, './target.ts'),
      sourceFile,
      {},
      {
        astroSemanticProject: project,
        checkerPresets: ['tsc'],
        configPath: project.seed.configPath,
        extensions: ['.astro'],
      },
    );

    expect(evidence.oxcResolvedFilePath).toBe(targetFile);
    expect(evidence.semanticEvidence?.target).toBeNull();
    expect(
      selectCanonicalImportFilePath({ evidence, includeResource: false }),
    ).toBeNull();
  });

  it('uses the Astro semantic target when Oxc resolves a competing file', async () => {
    const harness = await createHarness();
    const source = "---\nimport './target.ts';\n---\n";
    const sourceFile = harness.fixture.path('src', 'entry.astro');
    const oxcTarget = harness.fixture.path('src', 'target.ts');
    const semanticTarget = harness.fixture.path('src', 'semantic.ts');
    await Promise.all([
      writeText(sourceFile, source),
      writeText(oxcTarget, 'export {};\n'),
      writeText(semanticTarget, 'export {};\n'),
    ]);
    harness.state.resolvedBySpecifier.set('./target.ts', semanticTarget);
    const project = createTestAstroSemanticProject({
      analysisGeneration: 6,
      compilerOptions: {},
      configPath: harness.fixture.path('tsconfig.json'),
      fileNames: [sourceFile, oxcTarget, semanticTarget],
      packageRootDir: harness.fixture.rootDir,
    });
    const evidence = harness.context.resolveImportEvidence(
      createRecord(sourceFile, source, './target.ts'),
      sourceFile,
      {},
      {
        astroSemanticProject: project,
        checkerPresets: ['tsc'],
        configPath: project.seed.configPath,
        extensions: ['.astro'],
      },
    );

    expect(evidence.oxcResolvedFilePath).toBe(oxcTarget);
    expect(evidence.typeScriptResolution?.resolvedFileName).toBe(
      semanticTarget,
    );
    expect(
      selectCanonicalImportFilePath({ evidence, includeResource: false }),
    ).toBe(semanticTarget);
  });

  it.each([
    ['service-script-materialization', 'serviceScriptError'],
    ['module-resolution', 'hostError'],
  ] as const)(
    'fails closed at %s when the semantic adapter throws',
    async (stage, failureField) => {
      const harness = await createHarness();
      harness.state[failureField] = new Error(`${stage} fixture failure`);
      const source = "---\nimport './target.ts';\n---\n";
      const sourceFile = harness.fixture.path('src', 'entry.astro');
      const targetFile = harness.fixture.path('src', 'target.ts');
      await Promise.all([
        writeText(sourceFile, source),
        writeText(targetFile, 'export {};\n'),
      ]);
      const project = createTestAstroSemanticProject({
        analysisGeneration: 9,
        compilerOptions: {},
        configPath: harness.fixture.path('tsconfig.json'),
        fileNames: [sourceFile, targetFile],
        packageRootDir: harness.fixture.rootDir,
      });
      const evidence = harness.context.resolveImportEvidence(
        createRecord(sourceFile, source, './target.ts'),
        sourceFile,
        {},
        {
          astroSemanticProject: project,
          checkerPresets: ['tsc'],
          configPath: project.seed.configPath,
          extensions: ['.astro'],
        },
      );

      expect(evidence.oxcResolvedFilePath).toBe(targetFile);
      expect(evidence.semanticFailure).toMatchObject({
        framework: 'astro',
        stage,
      });
      expect(
        selectCanonicalImportFilePath({ evidence, includeResource: false }),
      ).toBeNull();
    },
  );

  it('fails closed when primary and extra service scripts disagree', async () => {
    const harness = await createHarness();
    harness.state.extraServiceScripts = true;
    const source = "---\nimport './target.ts';\n---\n";
    const sourceFile = harness.fixture.path('src', 'entry.astro');
    const primaryTarget = harness.fixture.path('src', 'primary.ts');
    const extraTarget = harness.fixture.path('src', 'extra.ts');
    await Promise.all([
      writeText(sourceFile, source),
      writeText(primaryTarget, 'export {};\n'),
      writeText(extraTarget, 'export {};\n'),
    ]);
    harness.state.resolvedBySourceAndSpecifier.set(
      `${sourceFile}\0./target.ts`,
      primaryTarget,
    );
    harness.state.resolvedBySourceAndSpecifier.set(
      `${sourceFile}.extra.mts\0./target.ts`,
      extraTarget,
    );
    const project = createTestAstroSemanticProject({
      analysisGeneration: 7,
      compilerOptions: {},
      configPath: harness.fixture.path('tsconfig.json'),
      fileNames: [sourceFile, primaryTarget, extraTarget],
      packageRootDir: harness.fixture.rootDir,
    });
    const evidence = harness.context.resolveImportEvidence(
      createRecord(sourceFile, source, './target.ts'),
      sourceFile,
      {},
      {
        astroSemanticProject: project,
        checkerPresets: ['tsc'],
        configPath: project.seed.configPath,
        extensions: ['.astro'],
      },
    );

    expect(evidence.semanticFailure).toMatchObject({
      framework: 'astro',
      stage: 'source-map-mismatch',
    });
    expect(harness.state.hostResolution).toBe(2);
    expect(
      harness.metrics.some(
        (measurement) =>
          measurement.name === 'astro-semantic-failure' &&
          measurement.kind === 'source-map-mismatch',
      ),
    ).toBe(true);
  });

  it('reuses one materialized context across distinct records and invalidates it by generation', async () => {
    const harness = await createHarness();
    const source = [
      '---',
      "import './first.ts';",
      "import './second.ts';",
      '---',
      '',
    ].join('\n');
    const sourceFile = harness.fixture.path('src', 'entry.astro');
    const firstTarget = harness.fixture.path('src', 'first.ts');
    const secondTarget = harness.fixture.path('src', 'second.ts');
    await Promise.all([
      writeText(sourceFile, source),
      writeText(firstTarget, 'export {};\n'),
      writeText(secondTarget, 'export {};\n'),
    ]);
    harness.state.resolvedBySpecifier.set('./first.ts', firstTarget);
    harness.state.resolvedBySpecifier.set('./second.ts', secondTarget);
    let snapshotReads = 0;
    const createProject = (analysisGeneration: number) =>
      createTestAstroSemanticProject({
        analysisGeneration,
        compilerOptions: {},
        configPath: harness.fixture.path('tsconfig.json'),
        fileNames: [sourceFile, firstTarget, secondTarget],
        onReadSnapshot: () => {
          snapshotReads += 1;
        },
        packageRootDir: harness.fixture.rootDir,
      });
    const firstGeneration = createProject(10);
    const contextFor = (
      project: typeof firstGeneration,
    ): ImportResolveContextFields => ({
      astroSemanticProject: project,
      checkerPresets: ['tsc'],
      configPath: project.seed.configPath,
      extensions: ['.astro'],
    });
    harness.context.resolveImportEvidence(
      createRecord(sourceFile, source, './first.ts'),
      sourceFile,
      {},
      contextFor(firstGeneration),
    );
    harness.context.resolveImportEvidence(
      createRecord(sourceFile, source, './second.ts'),
      sourceFile,
      {},
      contextFor(firstGeneration),
    );
    const secondGeneration = createProject(11);
    harness.context.resolveImportEvidence(
      createRecord(sourceFile, source, './first.ts'),
      sourceFile,
      {},
      contextFor(secondGeneration),
    );

    expect(snapshotReads).toBe(2);
    expect(harness.state.hostResolution).toBe(3);
    expect(
      harness.metrics.filter(
        (measurement) => measurement.name === 'astro-context-materialize',
      ),
    ).toHaveLength(2);
    expect(
      harness.metrics.filter(
        (measurement) => measurement.name === 'astro-context-reuse',
      ),
    ).toHaveLength(1);
    expect(
      harness.metrics.filter(
        (measurement) => measurement.name === 'astro-context-dispose',
      ),
    ).toHaveLength(1);
  });

  it('keys repeated specifiers by occurrence and full locator', async () => {
    const harness = await createHarness();
    const source = [
      '---',
      "import './target.ts';",
      "export { value } from './target.ts';",
      '---',
      '',
    ].join('\n');
    const sourceFile = harness.fixture.path('src', 'entry.astro');
    const targetFile = harness.fixture.path('src', 'target.ts');
    await Promise.all([
      writeText(sourceFile, source),
      writeText(targetFile, 'export const value = 1;\n'),
    ]);
    harness.state.resolvedBySpecifier.set('./target.ts', targetFile);
    const project = createTestAstroSemanticProject({
      analysisGeneration: 12,
      compilerOptions: {},
      configPath: harness.fixture.path('tsconfig.json'),
      fileNames: [sourceFile, targetFile],
      packageRootDir: harness.fixture.rootDir,
    });
    const resolveContext: ImportResolveContextFields = {
      astroSemanticProject: project,
      checkerPresets: ['tsc'],
      configPath: project.seed.configPath,
      extensions: ['.astro'],
    };

    for (const occurrence of [0, 1]) {
      harness.context.resolveImportEvidence(
        createRecord(sourceFile, source, './target.ts', occurrence),
        sourceFile,
        {},
        resolveContext,
      );
    }

    expect(harness.state.hostResolution).toBe(2);
    expect(
      harness.metrics.filter(
        (measurement) => measurement.name === 'astro-semantic-cache-miss',
      ),
    ).toHaveLength(2);
  });

  it('reports source-map-mismatch only when the real ImportRecord is unprovable', async () => {
    const harness = await createHarness({ mismatch: true });
    const source = "---\nimport './target.ts';\n---\n";
    const sourceFile = harness.fixture.path('src', 'entry.astro');
    await writeText(sourceFile, source);
    const project = createTestAstroSemanticProject({
      analysisGeneration: 8,
      compilerOptions: {},
      configPath: harness.fixture.path('tsconfig.json'),
      fileNames: [sourceFile],
      packageRootDir: harness.fixture.rootDir,
    });
    const evidence = harness.context.resolveImportEvidence(
      createRecord(sourceFile, source, './target.ts'),
      sourceFile,
      {},
      {
        astroSemanticProject: project,
        checkerPresets: ['tsc'],
        configPath: project.seed.configPath,
        extensions: ['.astro'],
      },
    );
    expect(evidence.semanticFailure).toMatchObject({
      framework: 'astro',
      stage: 'source-map-mismatch',
    });
    expect(harness.state.hostResolution).toBe(0);
    expect(evidence.semanticFailure?.scopeIdentity).not.toContain(
      harness.fixture.rootDir,
    );
  });
});
