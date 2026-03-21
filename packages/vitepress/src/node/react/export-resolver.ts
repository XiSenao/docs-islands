import { parse, type ParserPlugin } from '@babel/parser';
import type {
  ArrayPattern,
  AssignmentPattern,
  ExportAllDeclaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  ExportSpecifier,
  Identifier,
  ImportDeclaration,
  ImportSpecifier,
  LVal,
  ObjectPattern,
  Program,
  RestElement,
  Statement,
  StringLiteral,
  VariableDeclaration,
} from '@babel/types';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';

export interface ResolvedImportReference {
  identifier: string;
  importedName: string;
}

export interface ResolvedImportReferenceResult {
  identifier: string;
  importedName: string;
  warnings: string[];
}

export interface ImportReferenceResolverContext {
  resolveId: (id: string, importer?: string) => Promise<{ id: string } | null>;
}

interface ImportedBinding {
  importedName: string;
  source: string;
}

interface ModuleExportInfo {
  hasDefaultExport: boolean;
  defaultReExport: ImportedBinding | null;
  localExports: Set<string>;
  namedReExports: Map<string, ImportedBinding>;
  starReExports: string[];
  sideEffectImports: string[];
}

interface ResolveExportResult {
  found: boolean;
  reference: ResolvedImportReference;
  warnings: string[];
}

const babelParserPlugins: ParserPlugin[] = [
  'jsx',
  'typescript',
  'importAttributes',
  'decorators-legacy',
  'topLevelAwait',
];

const stripQueryAndHash = (id: string): string => {
  const queryIndex = id.search(/[#?]/);
  return queryIndex >= 0 ? id.slice(0, queryIndex) : id;
};

const getFilePathFromId = (id: string): string | null => {
  const cleanId = stripQueryAndHash(id);
  if (!cleanId || cleanId.startsWith('\0')) {
    return null;
  }

  if (cleanId.startsWith('file://')) {
    return fileURLToPath(cleanId);
  }

  return cleanId;
};

const getLiteralName = (node: Identifier | StringLiteral): string =>
  node.type === 'Identifier' ? node.name : node.value;

const isIdentifierOrStringLiteral = (
  node: unknown,
): node is Identifier | StringLiteral =>
  Boolean(
    node &&
      typeof node === 'object' &&
      'type' in node &&
      (node.type === 'Identifier' || node.type === 'StringLiteral'),
  );

const addPatternBindingNames = (pattern: LVal, names: Set<string>): void => {
  if (pattern.type === 'Identifier') {
    names.add(pattern.name);
    return;
  }

  if (pattern.type === 'AssignmentPattern') {
    addPatternBindingNames((pattern as AssignmentPattern).left, names);
    return;
  }

  if (pattern.type === 'ObjectPattern') {
    for (const property of (pattern as ObjectPattern).properties) {
      if (property.type === 'ObjectProperty') {
        addPatternBindingNames(property.value as LVal, names);
      } else if (property.type === 'RestElement') {
        addPatternBindingNames(property.argument as LVal, names);
      }
    }
    return;
  }

  if (pattern.type === 'ArrayPattern') {
    for (const element of (pattern as ArrayPattern).elements) {
      if (element) {
        addPatternBindingNames(element as LVal, names);
      }
    }
    return;
  }

  if (pattern.type === 'RestElement') {
    addPatternBindingNames((pattern as RestElement).argument as LVal, names);
  }
};

const getDeclarationExportNames = (statement: Statement): Set<string> => {
  const exportNames = new Set<string>();

  switch (statement.type) {
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSDeclareFunction':
    case 'TSEnumDeclaration':
    case 'TSModuleDeclaration': {
      if (statement.id?.type === 'Identifier') {
        exportNames.add(statement.id.name);
      }
      return exportNames;
    }
    case 'VariableDeclaration': {
      for (const declaration of (statement as VariableDeclaration)
        .declarations) {
        if (declaration.id.type !== 'VoidPattern') {
          addPatternBindingNames(declaration.id, exportNames);
        }
      }
      return exportNames;
    }
    default: {
      return exportNames;
    }
  }
};

const collectModuleExportInfo = (program: Program): ModuleExportInfo => {
  const importedBindings = new Map<string, ImportedBinding>();
  const moduleExportInfo: ModuleExportInfo = {
    hasDefaultExport: false,
    defaultReExport: null,
    localExports: new Set<string>(),
    namedReExports: new Map<string, ImportedBinding>(),
    starReExports: [],
    sideEffectImports: [],
  };

  for (const statement of program.body) {
    if (
      statement.type === 'ImportDeclaration' &&
      (statement as ImportDeclaration).importKind !== 'type'
    ) {
      const source = statement.source.value;
      if (statement.specifiers.length === 0) {
        moduleExportInfo.sideEffectImports.push(source);
        continue;
      }
      for (const specifier of statement.specifiers) {
        switch (specifier.type) {
          case 'ImportSpecifier': {
            if ((specifier as ImportSpecifier).importKind === 'type') {
              continue;
            }
            importedBindings.set(specifier.local.name, {
              importedName: getLiteralName(specifier.imported),
              source,
            });
            break;
          }
          case 'ImportDefaultSpecifier': {
            importedBindings.set(specifier.local.name, {
              importedName: 'default',
              source,
            });
            break;
          }
          case 'ImportNamespaceSpecifier': {
            importedBindings.set(specifier.local.name, {
              importedName: '*',
              source,
            });
            break;
          }
        }
      }
    }
  }

  for (const statement of program.body) {
    if (
      statement.type === 'ExportNamedDeclaration' &&
      statement.exportKind !== 'type'
    ) {
      collectExportNamedDeclaration(
        statement,
        importedBindings,
        moduleExportInfo,
      );
      continue;
    }

    if (statement.type === 'ExportAllDeclaration') {
      collectExportAllDeclaration(statement, moduleExportInfo);
      continue;
    }

    if (statement.type === 'ExportDefaultDeclaration') {
      collectExportDefaultDeclaration(
        statement,
        importedBindings,
        moduleExportInfo,
      );
    }
  }

  return moduleExportInfo;
};

const collectExportNamedDeclaration = (
  declaration: ExportNamedDeclaration,
  importedBindings: Map<string, ImportedBinding>,
  moduleExportInfo: ModuleExportInfo,
): void => {
  if (declaration.declaration) {
    const exportNames = getDeclarationExportNames(declaration.declaration);
    for (const exportName of exportNames) {
      moduleExportInfo.localExports.add(exportName);
    }
  }

  const source = declaration.source?.value;
  for (const specifier of declaration.specifiers) {
    if (specifier.type !== 'ExportSpecifier') {
      continue;
    }

    const exportSpecifier = specifier as ExportSpecifier;
    const exportedName = getLiteralName(exportSpecifier.exported);
    const localName = getLiteralName(exportSpecifier.local);

    if (source) {
      moduleExportInfo.namedReExports.set(exportedName, {
        importedName: localName,
        source,
      });
      continue;
    }

    const importedBinding = importedBindings.get(localName);
    if (importedBinding) {
      moduleExportInfo.namedReExports.set(exportedName, importedBinding);
      continue;
    }

    moduleExportInfo.localExports.add(exportedName);
  }
};

const collectExportAllDeclaration = (
  declaration: ExportAllDeclaration,
  moduleExportInfo: ModuleExportInfo,
): void => {
  const source = declaration.source.value;
  const exported = 'exported' in declaration ? declaration.exported : undefined;
  if (isIdentifierOrStringLiteral(exported)) {
    moduleExportInfo.namedReExports.set(getLiteralName(exported), {
      importedName: '*',
      source,
    });
    return;
  }
  moduleExportInfo.starReExports.push(source);
};

const collectExportDefaultDeclaration = (
  declaration: ExportDefaultDeclaration,
  importedBindings: Map<string, ImportedBinding>,
  moduleExportInfo: ModuleExportInfo,
): void => {
  if (
    declaration.declaration.type === 'Identifier' &&
    importedBindings.has(declaration.declaration.name)
  ) {
    moduleExportInfo.defaultReExport = importedBindings.get(
      declaration.declaration.name,
    )!;
    return;
  }
  moduleExportInfo.hasDefaultExport = true;
};

const loadModuleExportInfo = async (
  identifier: string,
  moduleExportInfoCache: Map<string, Promise<ModuleExportInfo | null>>,
): Promise<ModuleExportInfo | null> => {
  if (!moduleExportInfoCache.has(identifier)) {
    moduleExportInfoCache.set(
      identifier,
      (async () => {
        const filePath = getFilePathFromId(identifier);
        if (!filePath) {
          return null;
        }

        let sourceCode: string;
        try {
          sourceCode = await fs.readFile(filePath, 'utf8');
        } catch {
          return null;
        }

        try {
          const ast = parse(sourceCode, {
            sourceType: 'module',
            plugins: babelParserPlugins,
          });
          return collectModuleExportInfo(ast.program);
        } catch {
          return null;
        }
      })(),
    );
  }

  return moduleExportInfoCache.get(identifier)!;
};

const formatSideEffectWarning = (
  moduleId: string,
  sideEffectImports: string[],
): string => {
  const imports = sideEffectImports.map((s) => `"${s}"`).join(', ');
  return `Module "${moduleId}" contains side-effect import(s) [${imports}] but is traversed as a re-export intermediary. The runtime import targets the final export owner directly, so these side effects may not execute.`;
};

const resolveExportReference = async (
  ctx: ImportReferenceResolverContext,
  reference: ResolvedImportReference,
  moduleExportInfoCache: Map<string, Promise<ModuleExportInfo | null>>,
  visited: Set<string>,
): Promise<ResolveExportResult> => {
  if (reference.importedName === '*') {
    return {
      found: true,
      reference,
      warnings: [],
    };
  }

  const visitKey = `${reference.identifier}::${reference.importedName}`;
  if (visited.has(visitKey)) {
    return {
      found: true,
      reference,
      warnings: [],
    };
  }
  visited.add(visitKey);

  const moduleExportInfo = await loadModuleExportInfo(
    reference.identifier,
    moduleExportInfoCache,
  );
  if (!moduleExportInfo) {
    return {
      found: true,
      reference,
      warnings: [],
    };
  }

  const directReExport = moduleExportInfo.namedReExports.get(
    reference.importedName,
  );
  if (directReExport) {
    const resolvedId = await ctx.resolveId(
      directReExport.source,
      reference.identifier,
    );
    if (!resolvedId) {
      return {
        found: true,
        reference,
        warnings: [],
      };
    }

    const childResult = await resolveExportReference(
      ctx,
      {
        identifier: normalizePath(resolvedId.id),
        importedName: directReExport.importedName,
      },
      moduleExportInfoCache,
      visited,
    );

    const warnings = [...childResult.warnings];
    if (
      childResult.found &&
      childResult.reference.identifier !== reference.identifier &&
      moduleExportInfo.sideEffectImports.length > 0
    ) {
      warnings.unshift(
        formatSideEffectWarning(
          reference.identifier,
          moduleExportInfo.sideEffectImports,
        ),
      );
    }

    return {
      found: childResult.found,
      reference: childResult.reference,
      warnings,
    };
  }

  if (reference.importedName === 'default') {
    if (moduleExportInfo.defaultReExport) {
      const resolvedId = await ctx.resolveId(
        moduleExportInfo.defaultReExport.source,
        reference.identifier,
      );
      if (!resolvedId) {
        return {
          found: true,
          reference,
          warnings: [],
        };
      }

      const childResult = await resolveExportReference(
        ctx,
        {
          identifier: normalizePath(resolvedId.id),
          importedName: moduleExportInfo.defaultReExport.importedName,
        },
        moduleExportInfoCache,
        visited,
      );

      const warnings = [...childResult.warnings];
      if (
        childResult.found &&
        childResult.reference.identifier !== reference.identifier &&
        moduleExportInfo.sideEffectImports.length > 0
      ) {
        warnings.unshift(
          formatSideEffectWarning(
            reference.identifier,
            moduleExportInfo.sideEffectImports,
          ),
        );
      }

      return {
        found: childResult.found,
        reference: childResult.reference,
        warnings,
      };
    }

    return {
      found: moduleExportInfo.hasDefaultExport,
      reference,
      warnings: [],
    };
  }

  if (moduleExportInfo.localExports.has(reference.importedName)) {
    return {
      found: true,
      reference,
      warnings: [],
    };
  }

  const starMatches: {
    reference: ResolvedImportReference;
    warnings: string[];
  }[] = [];
  for (const starReExport of moduleExportInfo.starReExports) {
    const resolvedId = await ctx.resolveId(starReExport, reference.identifier);
    if (!resolvedId) {
      continue;
    }

    const resolvedStarReference = await resolveExportReference(
      ctx,
      {
        identifier: normalizePath(resolvedId.id),
        importedName: reference.importedName,
      },
      moduleExportInfoCache,
      new Set(visited),
    );

    if (resolvedStarReference.found) {
      starMatches.push({
        reference: resolvedStarReference.reference,
        warnings: resolvedStarReference.warnings,
      });
    }
  }

  if (starMatches.length === 0) {
    return {
      found: false,
      reference,
      warnings: [],
    };
  }

  const uniqueMatches = new Map<
    string,
    { reference: ResolvedImportReference; warnings: string[] }
  >();
  for (const match of starMatches) {
    uniqueMatches.set(
      `${match.reference.identifier}::${match.reference.importedName}`,
      match,
    );
  }

  if (uniqueMatches.size === 1) {
    const match = [...uniqueMatches.values()][0];
    const warnings = [...match.warnings];
    if (
      match.reference.identifier !== reference.identifier &&
      moduleExportInfo.sideEffectImports.length > 0
    ) {
      warnings.unshift(
        formatSideEffectWarning(
          reference.identifier,
          moduleExportInfo.sideEffectImports,
        ),
      );
    }

    return {
      found: true,
      reference: match.reference,
      warnings,
    };
  }

  return {
    found: true,
    reference,
    warnings: [],
  };
};

export function createImportReferenceResolver(
  ctx: ImportReferenceResolverContext,
): {
  resolveImportReference: (
    moduleId: string,
    importedName: string,
    importer?: string,
  ) => Promise<ResolvedImportReferenceResult | null>;
} {
  const resolvedIdCache = new Map<string, Promise<{ id: string } | null>>();
  const moduleExportInfoCache = new Map<
    string,
    Promise<ModuleExportInfo | null>
  >();
  const resolvedExportReferenceCache = new Map<string, ResolveExportResult>();
  const cachedCtx: ImportReferenceResolverContext = {
    resolveId(id, importer) {
      const cacheKey = `${importer ?? ''}::${id}`;
      if (!resolvedIdCache.has(cacheKey)) {
        resolvedIdCache.set(cacheKey, ctx.resolveId(id, importer));
      }
      return resolvedIdCache.get(cacheKey)!;
    },
  };

  const resolveExportReferenceWithCache = async (
    reference: ResolvedImportReference,
  ): Promise<ResolveExportResult> => {
    const cacheKey = `${reference.identifier}::${reference.importedName}`;
    const cachedResult = resolvedExportReferenceCache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    const resolvedResult = await resolveExportReference(
      cachedCtx,
      reference,
      moduleExportInfoCache,
      new Set(),
    );
    resolvedExportReferenceCache.set(cacheKey, resolvedResult);
    return resolvedResult;
  };

  return {
    async resolveImportReference(moduleId, importedName, importer) {
      const resolvedId = await cachedCtx.resolveId(moduleId, importer);
      if (!resolvedId) {
        return null;
      }

      const resolvedReference = {
        identifier: normalizePath(resolvedId.id),
        importedName,
      };

      /**
       * Re-export/barrel modules are only traversal nodes.
       * The runtime import injected later must target the final export owner,
       * otherwise we may accidentally execute side effects from an intermediate
       * re-export module during component registration.
       */
      const finalReference =
        await resolveExportReferenceWithCache(resolvedReference);

      if (finalReference.found) {
        return {
          identifier: finalReference.reference.identifier,
          importedName: finalReference.reference.importedName,
          warnings: finalReference.warnings,
        };
      }

      return {
        ...resolvedReference,
        warnings: [],
      };
    },
  };
}
