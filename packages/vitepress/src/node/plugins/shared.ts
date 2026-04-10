import type { ModuleNode, Rollup } from 'vite';

export const isMarkdownPageChunk = (
  chunk: Rollup.OutputAsset | Rollup.OutputChunk,
): chunk is Rollup.OutputChunk & { facadeModuleId: string } =>
  Boolean(
    chunk.type === 'chunk' &&
      chunk.isEntry &&
      chunk.facadeModuleId &&
      chunk.facadeModuleId.endsWith('.md'),
  );

export function resolveWsUpdatePathname(
  resolvedPathname: string,
  base: string,
): string {
  let cleanPathname = resolvedPathname;

  if (resolvedPathname.startsWith(base)) {
    cleanPathname = resolvedPathname.replace(base, '');
  }

  if (!cleanPathname.startsWith('/')) {
    cleanPathname = `/${cleanPathname}`;
  }

  return cleanPathname;
}

export function collectCssModulesInSSR(
  module: ModuleNode,
  hasVisited: Set<string>,
  srcDir: string,
): string[] | null {
  if (!module.id || hasVisited.has(module.id)) {
    return null;
  }

  hasVisited.add(module.id);
  const { importedModules, id: moduleId } = module;

  if (moduleId.includes('node_modules')) {
    return null;
  }

  if (moduleId.endsWith('.css')) {
    return [moduleId.replace(srcDir, '')];
  }

  const collectedCssModules = new Set<string>();

  for (const importedModule of importedModules) {
    const collectedCssPaths = collectCssModulesInSSR(
      importedModule,
      hasVisited,
      srcDir,
    );

    if (!collectedCssPaths) {
      continue;
    }

    for (const cssPath of collectedCssPaths) {
      collectedCssModules.add(cssPath);
    }
  }

  return [...collectedCssModules];
}
