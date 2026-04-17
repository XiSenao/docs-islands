import type { ComponentBundleInfo } from '#dep-types/component';
import type { OutputAsset, OutputChunk } from '#dep-types/rollup';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'pathe';

export function isOutputChunk(
  chunk: OutputChunk | OutputAsset,
): chunk is OutputChunk {
  return chunk.type === 'chunk';
}

export function isOutputAsset(
  chunk: OutputChunk | OutputAsset,
): chunk is OutputAsset {
  return chunk.type === 'asset';
}

export function resolveSafeOutputPath(
  outDir: string,
  fileName: string,
): string {
  if (typeof fileName !== 'string' || fileName.trim().length === 0) {
    throw new TypeError(
      `[framework-build] Invalid output file name: ${String(fileName)}`,
    );
  }

  if (fileName.includes('\0')) {
    throw new Error(
      '[framework-build] Output file name must not contain null bytes',
    );
  }

  if (isAbsolute(fileName)) {
    throw new Error(
      `[framework-build] Absolute output paths are not allowed: ${fileName}`,
    );
  }

  const normalizedOutDir = resolve(outDir);
  const fullOutputPath = resolve(normalizedOutDir, fileName);
  const relativePath = relative(normalizedOutDir, fullOutputPath);

  if (
    relativePath === '' ||
    relativePath === '.' ||
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    relativePath.startsWith('..\\') ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `[framework-build] Refusing to write outside output directory. outDir="${normalizedOutDir}", fileName="${fileName}"`,
    );
  }

  return fullOutputPath;
}

export function getComponentBundleKey(
  component: Pick<ComponentBundleInfo, 'componentName' | 'importReference'>,
): string {
  return `${component.componentName}::${component.importReference.identifier}::${component.importReference.importedName}`;
}

interface PreparedComponentEntryModule {
  component: ComponentBundleInfo;
  entryName: string;
  entryPath: string;
}

const createComponentEntryModuleSource = (
  importPath: string,
  importedName: string,
  componentName: string,
): string => {
  const componentNameLiteral = JSON.stringify(componentName);
  const importedNameLiteral = JSON.stringify(importedName);
  const isNamespaceImport = importedName === '*';

  return [
    `import * as ComponentModule from ${JSON.stringify(importPath)};`,
    `const primaryExportKey = ${importedNameLiteral};`,
    `const fallbackExportKey = ${componentNameLiteral};`,
    `const defaultExportKey = 'default';`,
    'const readExport = (key) => Reflect.get(ComponentModule, key);',
    `export default ${
      isNamespaceImport
        ? 'ComponentModule'
        : 'readExport(primaryExportKey) ?? readExport(defaultExportKey) ?? readExport(fallbackExportKey)'
    };`,
  ].join('\n');
};

export function createComponentEntryModules({
  cacheDir,
  components,
  namespace,
}: {
  cacheDir: string;
  components: ComponentBundleInfo[];
  namespace: string;
}): {
  entries: PreparedComponentEntryModule[];
  entryPoints: Record<string, string>;
  tempEntryDir: string;
} {
  const tempEntryDir = resolve(
    cacheDir,
    `${namespace}-component-entries-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
  );

  fs.mkdirSync(tempEntryDir, { recursive: true });

  const entries = components.map((component) => {
    const hash = createHash('sha1')
      .update(getComponentBundleKey(component))
      .digest('hex')
      .slice(0, 8);
    const entryName = component.componentName;
    /**
     * Keep generated entry modules framework-neutral so the shared framework
     * build layer does not imply TSX/JSX semantics for future adapters such as
     * Solid or Svelte.
     */
    const entryPath = resolve(tempEntryDir, `${entryName}.${hash}.mjs`);
    const importPath = relative(dirname(entryPath), component.componentPath);
    const normalizedImportPath = importPath.startsWith('.')
      ? importPath
      : `./${importPath}`;

    fs.writeFileSync(
      entryPath,
      createComponentEntryModuleSource(
        normalizedImportPath,
        component.importReference.importedName,
        component.componentName,
      ),
    );

    return {
      component,
      entryName,
      entryPath,
    };
  });

  return {
    entries,
    entryPoints: Object.fromEntries(
      entries.map((entry) => [entry.entryName, entry.entryPath]),
    ),
    tempEntryDir,
  };
}

export function isGeneratedComponentEntryModule(
  moduleId: string,
  tempEntryDir: string,
): boolean {
  return (
    moduleId === tempEntryDir ||
    moduleId.startsWith(`${tempEntryDir}/`) ||
    moduleId.startsWith(`${tempEntryDir}\\`)
  );
}
