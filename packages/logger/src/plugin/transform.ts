import { parse as parseBabel, type ParserPlugin } from '@babel/parser';
import type { NodePath } from '@babel/traverse';
import babelTraverse from '@babel/traverse';
import * as t from '@babel/types';
import { init, parse as parseImports } from 'es-module-lexer';
import MagicString, { type SourceMap } from 'magic-string';
import { shouldSuppressLog } from '../core/config';
import type { LoggerScopeId, LogKind } from '../types';

export const LOGGER_TREE_SHAKING_PLUGIN_NAME =
  'docs-islands:logger-tree-shaking';

export const DEFAULT_LOGGER_MODULE_ID = '@docs-islands/logger';

const LOG_METHODS = new Set<LogKind>([
  'debug',
  'error',
  'info',
  'success',
  'warn',
]);
const babelParserPlugins: ParserPlugin[] = [
  'jsx',
  'typescript',
  'importAttributes',
  'decorators-legacy',
  'topLevelAwait',
];

interface StaticLoggerBinding {
  group: string;
  main: string;
}

interface StaticLogCall {
  group: string;
  kind: LogKind;
  main: string;
  message: string;
}

export type LoggerTreeShakingUnprunableReason =
  | 'aliased-create-logger'
  | 'computed-method-access'
  | 'destructured-method'
  | 'dynamic-group'
  | 'dynamic-main'
  | 'dynamic-message'
  | 'non-standalone-call'
  | 'reassigned-binding';

export interface LoggerTreeShakingDiagnostic {
  column: number;
  line: number;
  reason: LoggerTreeShakingUnprunableReason;
  snippet: string;
}

export interface LoggerTreeShakingStats {
  keptRuntimeAllowedCount: number;
  keptStaticUnprunableCount: number;
  prunedCount: number;
}

export interface LoggerTreeShakingTransformOptions {
  collectDiagnostics?: boolean;
  loggerModuleId: string;
  loggerScopeId: LoggerScopeId;
}

export interface LoggerTreeShakingTransformResult {
  code: string;
  diagnostics?: LoggerTreeShakingDiagnostic[];
  map?: SourceMap;
  stats?: LoggerTreeShakingStats;
}

// @babel/traverse only exposes a CommonJS package.
const traverse: typeof babelTraverse =
  (
    babelTraverse as typeof babelTraverse & {
      default?: typeof babelTraverse;
    }
  ).default ?? babelTraverse;

const isStaticStringLiteral = (
  node: t.Node | null | undefined,
): node is t.StringLiteral => t.isStringLiteral(node);

const normalizeLoggerModuleId = (loggerModuleId: string): string => {
  if (typeof loggerModuleId !== 'string') {
    throw new TypeError(
      'logger tree-shaking requires explicit loggerModuleId.',
    );
  }

  const normalizedLoggerModuleId = loggerModuleId.trim();

  if (normalizedLoggerModuleId.length === 0) {
    throw new Error('logger tree-shaking requires a non-empty loggerModuleId.');
  }

  return normalizedLoggerModuleId;
};

const getStaticPropertyName = (
  property: t.ObjectMember | t.MemberExpression['property'],
): string | null => {
  if (t.isIdentifier(property)) {
    return property.name;
  }

  if (t.isStringLiteral(property)) {
    return property.value;
  }

  return null;
};

const isCreateLoggerImportSpecifier = (
  specifier: t.ImportDeclaration['specifiers'][number],
): specifier is t.ImportSpecifier => {
  if (!t.isImportSpecifier(specifier)) {
    return false;
  }

  return (
    getStaticPropertyName(specifier.imported) === 'createLogger' &&
    t.isIdentifier(specifier.local) &&
    specifier.local.name === 'createLogger'
  );
};

const hasPublicCreateLoggerImport = async (
  code: string,
  loggerModuleId: string,
): Promise<boolean> => {
  if (!code.includes('createLogger') || !code.includes(loggerModuleId)) {
    return false;
  }

  await init;

  try {
    const [imports] = parseImports(code);

    return imports.some((importSpecifier) => {
      if (
        !importSpecifier.n ||
        importSpecifier.n !== loggerModuleId ||
        importSpecifier.d !== -1
      ) {
        return false;
      }

      return code
        .slice(importSpecifier.ss, importSpecifier.se)
        .includes('createLogger');
    });
  } catch {
    return false;
  }
};

const readStaticMainFromCreateLoggerCall = (
  callExpression: t.CallExpression,
  path: NodePath,
  createLoggerImportSpecifiers: WeakSet<t.ImportSpecifier>,
): string | null => {
  if (!t.isIdentifier(callExpression.callee)) {
    return null;
  }

  const binding = path.scope.getBinding(callExpression.callee.name);

  if (
    !binding?.path.isImportSpecifier() ||
    !createLoggerImportSpecifiers.has(binding.path.node)
  ) {
    return null;
  }

  const [options] = callExpression.arguments;

  if (!t.isObjectExpression(options)) {
    return null;
  }

  for (const property of options.properties) {
    if (!t.isObjectProperty(property) || property.computed) {
      continue;
    }

    if (
      getStaticPropertyName(property.key) === 'main' &&
      isStaticStringLiteral(property.value)
    ) {
      return property.value.value;
    }
  }

  return null;
};

const readStaticLoggerBinding = (
  init: t.Expression | null | undefined,
  path: NodePath,
  createLoggerImportSpecifiers: WeakSet<t.ImportSpecifier>,
): StaticLoggerBinding | null => {
  if (!t.isCallExpression(init)) {
    return null;
  }

  const callee = init.callee;

  if (
    !t.isMemberExpression(callee) ||
    callee.computed ||
    !t.isIdentifier(callee.property) ||
    callee.property.name !== 'getLoggerByGroup'
  ) {
    return null;
  }

  const [groupArgument] = init.arguments;

  if (
    !isStaticStringLiteral(groupArgument) ||
    !t.isCallExpression(callee.object)
  ) {
    return null;
  }

  const main = readStaticMainFromCreateLoggerCall(
    callee.object,
    path,
    createLoggerImportSpecifiers,
  );

  if (!main) {
    return null;
  }

  return {
    group: groupArgument.value,
    main,
  };
};

interface LogCallShape {
  kind: LogKind;
  objectName: string;
}

const detectLogCallShape = (expression: t.Expression): LogCallShape | null => {
  if (!t.isCallExpression(expression)) {
    return null;
  }

  const callee = expression.callee;

  if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.object)) {
    return null;
  }

  let methodName: string | null = null;

  if (callee.computed) {
    if (t.isStringLiteral(callee.property)) {
      methodName = callee.property.value;
    }
  } else if (t.isIdentifier(callee.property)) {
    methodName = callee.property.name;
  }

  if (!methodName || !LOG_METHODS.has(methodName as LogKind)) {
    return null;
  }

  return {
    kind: methodName as LogKind,
    objectName: callee.object.name,
  };
};

const classifyLoggerBindingFailure = (
  init: t.Expression | null | undefined,
): LoggerTreeShakingUnprunableReason => {
  if (!t.isCallExpression(init)) {
    return 'destructured-method';
  }

  const callee = init.callee;

  if (
    !t.isMemberExpression(callee) ||
    callee.computed ||
    !t.isIdentifier(callee.property) ||
    callee.property.name !== 'getLoggerByGroup'
  ) {
    return 'destructured-method';
  }

  const [groupArgument] = init.arguments;

  if (!isStaticStringLiteral(groupArgument)) {
    return 'dynamic-group';
  }

  if (!t.isCallExpression(callee.object)) {
    return 'destructured-method';
  }

  const createCall = callee.object;

  if (
    !t.isIdentifier(createCall.callee) ||
    createCall.callee.name !== 'createLogger'
  ) {
    return 'aliased-create-logger';
  }

  const [createOptions] = createCall.arguments;

  if (!t.isObjectExpression(createOptions)) {
    return 'dynamic-main';
  }

  for (const property of createOptions.properties) {
    if (
      t.isObjectProperty(property) &&
      !property.computed &&
      getStaticPropertyName(property.key) === 'main'
    ) {
      if (!isStaticStringLiteral(property.value)) {
        return 'dynamic-main';
      }
      // Main is literal, but the binding still wasn't recognized — so the
      // createLogger identifier resolves to a binding outside the public
      // import set. The most likely cause is an import alias.
      return 'aliased-create-logger';
    }
  }

  return 'dynamic-main';
};

type LogCallClassification =
  | { call: StaticLogCall; type: 'static' }
  | { reason: LoggerTreeShakingUnprunableReason; type: 'unprunable' };

const classifyLogCall = (
  expression: t.Expression,
  path: NodePath<t.ExpressionStatement>,
  staticLoggerBindings: WeakMap<t.Identifier, StaticLoggerBinding>,
): LogCallClassification | null => {
  const shape = detectLogCallShape(expression);

  if (!shape) {
    return null;
  }

  const callee = (expression as t.CallExpression).callee as t.MemberExpression;

  if (callee.computed) {
    return { reason: 'computed-method-access', type: 'unprunable' };
  }

  const binding = path.scope.getBinding(shape.objectName);

  if (!binding) {
    // Identifier not declared in scope (e.g., a global). Not a candidate.
    return null;
  }

  if (binding.constantViolations.length > 0) {
    return { reason: 'reassigned-binding', type: 'unprunable' };
  }

  if (!binding.path.isVariableDeclarator()) {
    return { reason: 'reassigned-binding', type: 'unprunable' };
  }

  const declarationParent = binding.path.parentPath;

  if (
    declarationParent?.isVariableDeclaration() &&
    declarationParent.node.kind !== 'const'
  ) {
    return { reason: 'reassigned-binding', type: 'unprunable' };
  }

  const declarationId = binding.path.node.id;

  if (!t.isIdentifier(declarationId)) {
    return { reason: 'destructured-method', type: 'unprunable' };
  }

  const loggerBinding = staticLoggerBindings.get(declarationId);

  if (!loggerBinding) {
    return {
      reason: classifyLoggerBindingFailure(binding.path.node.init),
      type: 'unprunable',
    };
  }

  const [messageArgument] = (expression as t.CallExpression).arguments;

  if (!isStaticStringLiteral(messageArgument)) {
    return { reason: 'dynamic-message', type: 'unprunable' };
  }

  return {
    call: {
      ...loggerBinding,
      kind: shape.kind,
      message: messageArgument.value,
    },
    type: 'static',
  };
};

const extractDiagnosticSnippet = (code: string, node: t.Node): string => {
  if (typeof node.start !== 'number' || typeof node.end !== 'number') {
    return '';
  }

  const slice = code.slice(node.start, node.end);
  const firstLine = slice.split('\n')[0];

  return firstLine.trim();
};

export async function transformLoggerTreeShaking(
  code: string,
  id: string,
  options: LoggerTreeShakingTransformOptions,
): Promise<LoggerTreeShakingTransformResult | null> {
  const loggerModuleId = normalizeLoggerModuleId(options.loggerModuleId);
  const collectDiagnostics = options.collectDiagnostics === true;

  if (!(await hasPublicCreateLoggerImport(code, loggerModuleId))) {
    return null;
  }

  let ast: t.File;
  try {
    ast = parseBabel(code, {
      allowReturnOutsideFunction: true,
      plugins: babelParserPlugins,
      sourceType: 'module',
    });
  } catch {
    return null;
  }
  const createLoggerImportSpecifiers = new WeakSet<t.ImportSpecifier>();
  const staticLoggerBindings = new WeakMap<t.Identifier, StaticLoggerBinding>();

  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source.value !== loggerModuleId) {
        return;
      }

      for (const specifier of path.node.specifiers) {
        if (isCreateLoggerImportSpecifier(specifier)) {
          createLoggerImportSpecifiers.add(specifier);
        }
      }
    },
  });

  traverse(ast, {
    VariableDeclarator(path) {
      if (
        !t.isIdentifier(path.node.id) ||
        !path.parentPath.isVariableDeclaration() ||
        path.parentPath.node.kind !== 'const'
      ) {
        return;
      }

      const loggerBinding = readStaticLoggerBinding(
        path.node.init,
        path,
        createLoggerImportSpecifiers,
      );

      if (loggerBinding) {
        staticLoggerBindings.set(path.node.id, loggerBinding);
      }
    },
  });

  const transformedCode = new MagicString(code);
  const diagnostics: LoggerTreeShakingDiagnostic[] = [];
  const stats: LoggerTreeShakingStats = {
    keptRuntimeAllowedCount: 0,
    keptStaticUnprunableCount: 0,
    prunedCount: 0,
  };
  const reportUnprunable = (
    reason: LoggerTreeShakingUnprunableReason,
    node: t.Node,
  ): void => {
    stats.keptStaticUnprunableCount += 1;
    if (!collectDiagnostics) {
      return;
    }
    const loc = node.loc?.start;
    diagnostics.push({
      column: loc?.column ?? 0,
      line: loc?.line ?? 0,
      reason,
      snippet: extractDiagnosticSnippet(code, node),
    });
  };

  traverse(ast, {
    ExpressionStatement(path) {
      const classification = classifyLogCall(
        path.node.expression,
        path,
        staticLoggerBindings,
      );

      if (!classification) {
        return;
      }

      if (classification.type === 'unprunable') {
        reportUnprunable(classification.reason, path.node);
        return;
      }

      const staticLogCall = classification.call;

      if (
        !shouldSuppressLog(
          staticLogCall.kind,
          {
            group: staticLogCall.group,
            main: staticLogCall.main,
            message: staticLogCall.message,
          },
          options.loggerScopeId,
        )
      ) {
        stats.keptRuntimeAllowedCount += 1;
        return;
      }

      if (
        typeof path.node.start !== 'number' ||
        typeof path.node.end !== 'number'
      ) {
        return;
      }

      transformedCode.remove(path.node.start, path.node.end);
      stats.prunedCount += 1;
    },
    CallExpression(path) {
      if (path.parentPath.isExpressionStatement()) {
        return;
      }

      const shape = detectLogCallShape(path.node);

      if (!shape) {
        return;
      }

      const binding = path.scope.getBinding(shape.objectName);

      if (!binding) {
        return;
      }

      const declarationId = binding.path.isVariableDeclarator()
        ? binding.path.node.id
        : null;

      if (!declarationId || !t.isIdentifier(declarationId)) {
        return;
      }

      if (!staticLoggerBindings.has(declarationId)) {
        return;
      }

      reportUnprunable('non-standalone-call', path.node);
    },
  });

  if (stats.prunedCount === 0 && !collectDiagnostics) {
    return null;
  }

  const hasCodeChange = stats.prunedCount > 0;

  return {
    code: hasCodeChange ? transformedCode.toString() : code,
    diagnostics: collectDiagnostics ? diagnostics : undefined,
    map: hasCodeChange
      ? transformedCode.generateMap({
          hires: true,
          includeContent: true,
          source: id,
        })
      : undefined,
    stats,
  };
}
