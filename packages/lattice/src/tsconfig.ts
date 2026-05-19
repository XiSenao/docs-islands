import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ResolvedLatticeConfig } from './config';
import { normalizeAbsolutePath, toRelativePath } from './utils/path';

export type JsonObject = Record<string, unknown>;

export function createFormatHost(rootDir: string): ts.FormatDiagnosticsHost {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => rootDir,
    getNewLine: () => '\n',
  };
}

export function readJsonConfig(
  config: ResolvedLatticeConfig,
  configPath: string,
): JsonObject {
  const result = ts.readConfigFile(configPath, ts.sys.readFile);

  if (result.error) {
    throw new Error(
      ts.formatDiagnostic(result.error, createFormatHost(config.rootDir)),
    );
  }

  return result.config as JsonObject;
}

export function resolveProjectConfigPath(
  baseDirectory: string,
  value?: string,
): string {
  const candidate = value
    ? path.resolve(baseDirectory, value)
    : path.join(baseDirectory, 'tsconfig.json');

  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    return normalizeAbsolutePath(path.join(candidate, 'tsconfig.json'));
  }

  return normalizeAbsolutePath(candidate);
}

export function resolveReferencePath(
  configPath: string,
  referencePath: string,
): string {
  const absoluteReferencePath = path.resolve(
    path.dirname(configPath),
    referencePath,
  );

  if (path.extname(absoluteReferencePath) === '.json') {
    return normalizeAbsolutePath(absoluteReferencePath);
  }

  return normalizeAbsolutePath(
    path.join(absoluteReferencePath, 'tsconfig.json'),
  );
}

export function getRawReferencePaths(
  config: ResolvedLatticeConfig,
  configPath: string,
): string[] {
  const configObject = readJsonConfig(config, configPath);
  const references = configObject.references;

  if (!Array.isArray(references)) {
    return [];
  }

  return references.flatMap((reference) => {
    if (
      !reference ||
      typeof reference !== 'object' ||
      Array.isArray(reference) ||
      typeof (reference as { path?: unknown }).path !== 'string'
    ) {
      return [];
    }

    return [
      resolveReferencePath(configPath, (reference as { path: string }).path),
    ];
  });
}

export function collectGraphProjectPaths(
  config: ResolvedLatticeConfig,
): string[] {
  const rootGraphConfigPath = path.join(
    config.rootDir,
    config.graph?.rootConfig ?? 'tsconfig.graph.json',
  );
  const seen = new Set<string>();
  const orderedProjects: string[] = [];
  const queue = getRawReferencePaths(config, rootGraphConfigPath);

  for (const projectPath of queue) {
    seen.add(projectPath);
  }

  for (const projectPath of queue) {
    if (!projectPath || !existsSync(projectPath)) {
      continue;
    }

    orderedProjects.push(projectPath);

    for (const referencePath of getRawReferencePaths(config, projectPath)) {
      if (seen.has(referencePath)) {
        continue;
      }

      seen.add(referencePath);
      queue.push(referencePath);
    }
  }

  return orderedProjects;
}

export function parseProjectFileNames(
  config: ResolvedLatticeConfig,
  configPath: string,
  pattern = /\.(?:[cm]?tsx?|d\.[cm]?ts|json)$/u,
): string[] {
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

  return parsed.fileNames
    .filter((fileName) => pattern.test(fileName))
    .map(normalizeAbsolutePath);
}

export function formatReferences(
  rootDir: string,
  references: Set<string>,
): string {
  if (references.size === 0) {
    return '(none)';
  }

  return [...references]
    .sort()
    .map((value) => toRelativePath(rootDir, value))
    .join(', ');
}
