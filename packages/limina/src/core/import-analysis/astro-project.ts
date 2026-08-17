import { createAstroSemanticProject } from '#checkers';
import type { ProjectInfo } from '#core/import-graph/context';

export function withAstroSemanticProject(options: {
  filePath: string;
  packageRootDir: string;
  project: ProjectInfo;
}): ProjectInfo {
  if (!options.filePath.toLowerCase().endsWith('.astro')) {
    return options.project;
  }
  return {
    ...options.project,
    astroSemanticProject: createAstroSemanticProject({
      analysisGeneration: options.project.analysisGeneration,
      configPath: options.project.configPath,
      packageRootDir: options.packageRootDir,
      projectFingerprint: options.project.resolverConfigPath,
      readSnapshot: () => ({
        checkerExtensions: options.project.extensions,
        compilerOptions: options.project.options,
        configClosure: options.project.configClosure,
        fileNames: options.project.fileNames,
        projectReferences: [...options.project.references],
      }),
    }),
  };
}
