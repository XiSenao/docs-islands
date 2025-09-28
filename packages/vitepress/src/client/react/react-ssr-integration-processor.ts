import { generate } from '@babel/generator';
import { parse } from '@babel/parser';
import type { NodePath } from '@babel/traverse';
import babelTraverse from '@babel/traverse';
import * as t from '@babel/types';
import {
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS
} from '@docs-islands/vitepress-shared/constants';
import logger from '@docs-islands/vitepress-utils/logger';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type ExtractedValue = JsonValue;
export type ExtractedProps = Record<string, ExtractedValue>;

type ReactSSRIntegrationCallback = (props: ExtractedProps) => {
  ssrHtml?: string;
  ssrCssBundlePaths?: Set<string>;
  clientRuntimeFileName: string;
};

interface TransformationRecord {
  path: NodePath<t.CallExpression>;
  ssrHtml?: string;
  ssrCssBundlePaths?: Set<string>;
  clientRuntimeFileName: string;
}

interface ProcessResult {
  code: string;
  transformCount: number;
}

interface TransformStatsEntry {
  line: number;
  column: number;
}

interface TransformWithStatsResult extends ProcessResult {
  stats: {
    totalTransformations: number;
    transformedNodes: TransformStatsEntry[];
  };
}

function formatErrorMessage(error: Error | string | number | boolean | null | undefined): string {
  if (error instanceof Error) return error.message;
  try {
    return String(error);
  } catch {
    return 'Unknown error';
  }
}

// @babel/traverse only exposes a CommonJS package and does not use the 'exports.traverse' method to expose named interfaces.
// Therefore, it is impossible to use named imports for the CommonJS package like @babel/generator.
const traverse: typeof babelTraverse =
  // @ts-expect-error No type checking is needed here.
  babelTraverse?.default ?? babelTraverse;

/**
 * This is an optimization specifically for the rendering pipeline triggered by route changes in VitePress projects.
 * By default, a dynamic rendering approach is used. On route change, embedding the React server-rendered output is triggered only after Vue rendering completes.
 * Concurrently, a preloading strategy accelerates loading the React server-rendered output.
 *
 * The default behavior may cause blank gaps under weak networks, for sensitive users, or with very large components, degrading UX.
 * Because route transitions in VitePress are controlled and use client-side rendering for partial updates,
 * we need a faster way to trigger React output rendering in these scenarios.
 * The most optimal method is to embed the React server-rendered output directly into Vue's SPA output at build time,
 * aligning its lifecycle with Vue's rendering lifecycle.
 *
 * However, note that because the SPA script is a runtime, the build phase can only precompile
 * render containers after first capturing the compiled props information. In development,
 * props are evaluated dynamically at runtime, so their values are not known in advance.
 * Consequently, the React render container cannot be trusted.
 *
 * This feature is subject to the following restrictions:
 *
 * 1. The component's props must include the `__RENDER_ID__` property, which serves as the unique ID for the React component (auto-generated and transparent to the user).
 * 2. The component's props must include the `__RENDER_DIRECTIVE__` property, which specifies the rendering strategy for the React component (a user-specified rendering directive).
 * 3. The component's props must include the `__RENDER_COMPONENT__` property, which identifies the name of the React component (the user-specified component to be rendered).
 * 4. The component's props must include the `__SPA_SYNC_RENDER__` property, which defines the rendering strategy during route changes (defaults to dynamically rendering the server template on route change).
 *
 * Therefore, the precompiled template for the rendering container must contain the following:
 *
 *    i('div', {
 *      __render_id__: "...",
 *      __render_directive__: "...",
 *      __render_component__: "...",
 *      __spa_sync_render__: "true",
 *      ...props
 *    }, null)
 *
 */
class ReactSSRIntegrationProcessor {
  private readonly sourceCode: string;
  private readonly callback: ReactSSRIntegrationCallback;
  private transformations: TransformationRecord[] = [];

  constructor(sourceCode: string, callback: ReactSSRIntegrationCallback) {
    this.sourceCode = sourceCode;
    this.callback = callback;
  }

  process(): ProcessResult {
    this.transformations = [];

    try {
      const ast = this.parseCode();

      this.traverseAndTransform(ast);

      // If nothing is transformed, preserve original code formatting verbatim.
      if (this.transformations.length === 0) {
        return {
          code: this.sourceCode,
          transformCount: 0
        };
      }

      const result = generate(ast, {
        retainLines: true,
        compact: false
      });

      return {
        code: result.code,
        transformCount: this.transformations.length
      };
    } catch (error) {
      logger
        .getLoggerByGroup('ReactSSRIntegrationProcessor')
        .error(`AST processing failed: ${formatErrorMessage(error)}`);
      return {
        code: this.sourceCode,
        transformCount: 0
      };
    }
  }

  private parseCode(): t.File {
    return parse(this.sourceCode, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'objectRestSpread',
        'functionBind',
        'decorators-legacy',
        'classProperties',
        'asyncGenerators',
        'functionSent',
        'dynamicImport'
      ]
    });
  }

  private traverseAndTransform(ast: t.Node): void {
    const extraInjectCssPaths = new Set<string>();
    let extraClientRuntimeFileName: string | null = null;
    traverse(ast, {
      CallExpression: (path: NodePath<t.CallExpression>) => {
        try {
          if (this.isTargetFunctionCall(path.node)) {
            const transformation = this.processTargetNode(path);
            if (transformation) {
              const { path, ssrHtml, ssrCssBundlePaths, clientRuntimeFileName } = transformation;
              this.transformations.push({
                path,
                ssrHtml,
                ssrCssBundlePaths,
                clientRuntimeFileName
              });
              if (!extraClientRuntimeFileName) {
                extraClientRuntimeFileName = clientRuntimeFileName;
              }
              if (ssrHtml) {
                this.applyTransformation(path, ssrHtml);
              }
              if (ssrCssBundlePaths?.size) {
                for (const path of ssrCssBundlePaths) {
                  extraInjectCssPaths.add(path);
                }
              }
            }
          }
        } catch (error) {
          logger
            .getLoggerByGroup('ReactSSRIntegrationProcessor')
            .error(`Transform error, catch error: ${formatErrorMessage(error)}`);
        }
      }
    });

    if (extraInjectCssPaths.size > 0 && extraClientRuntimeFileName) {
      this.applyCssInjectionTransformation(ast, extraInjectCssPaths, extraClientRuntimeFileName);
    }
  }

  private isTargetFunctionCall(node: t.Node): boolean {
    if (!t.isCallExpression(node)) {
      return false;
    }

    if (!node.arguments || node.arguments.length < 2) {
      return false;
    }

    const elementArg = node.arguments[0];
    const propsArg = node.arguments[1];

    if (!t.isStringLiteral(elementArg) || elementArg.value.toLowerCase() !== 'div') {
      return false;
    }

    if (!t.isObjectExpression(propsArg)) {
      return false;
    }

    return this.hasTargetIdentifier(propsArg);
  }

  private hasTargetIdentifier(objectExpression: t.ObjectExpression): boolean {
    const canonicalRequiredKeys = new Set<string>(RENDER_STRATEGY_ATTRS);
    const foundCanonicalKeys = new Set<string>();
    // Use the client:only directive to skip spa:sync-render mode.
    let useClientOnlyDirective = false;

    for (const prop of objectExpression.properties) {
      if (!t.isObjectProperty(prop)) continue;

      const keyName = t.isStringLiteral(prop.key)
        ? prop.key.value
        : t.isIdentifier(prop.key)
          ? prop.key.name
          : null;

      if (!keyName) continue;

      const canonicalKey = keyName.toLowerCase();
      if (canonicalRequiredKeys.has(canonicalKey) && !foundCanonicalKeys.has(canonicalKey)) {
        if (
          canonicalKey === RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase() &&
          t.isStringLiteral(prop.value) &&
          prop.value.value === 'client:only'
        ) {
          useClientOnlyDirective = true;
        }
        foundCanonicalKeys.add(canonicalKey);
      }
    }

    return !useClientOnlyDirective && foundCanonicalKeys.size === canonicalRequiredKeys.size;
  }

  private processTargetNode(path: NodePath<t.CallExpression>): TransformationRecord | null {
    try {
      const props = this.extractProps(path.node.arguments[1]);

      if (props[RENDER_STRATEGY_CONSTANTS.renderWithSpaSync.toLowerCase()] !== 'true') {
        return null;
      }

      const injectSSRPrerenderedContent = this.callback(props);

      if (typeof injectSSRPrerenderedContent.ssrHtml !== 'string') {
        throw new TypeError(
          '[ReactSSRIntegrationProcessor] Failed to inject pre-rendered content, callback return value is not a string.'
        );
      }

      return {
        path,
        ssrHtml: injectSSRPrerenderedContent.ssrHtml,
        ssrCssBundlePaths: injectSSRPrerenderedContent.ssrCssBundlePaths,
        clientRuntimeFileName: injectSSRPrerenderedContent.clientRuntimeFileName
      };
    } catch (error) {
      throw new Error(
        `[ReactSSRIntegrationProcessor] Failed to inject pre-rendered content, catch error: ${formatErrorMessage(
          error
        )}`
      );
    }
  }

  private extractProps(propsNode: t.Node): ExtractedProps {
    const props: ExtractedProps = {};

    if (!t.isObjectExpression(propsNode)) {
      return props;
    }

    for (const prop of propsNode.properties) {
      if (t.isObjectProperty(prop)) {
        const key = this.extractPropertyKey(prop);
        const value = this.extractPropertyValue(prop.value as t.Expression);

        if (key !== null) {
          props[key] = value;
        }
      }
    }

    return props;
  }

  private extractPropertyKey(prop: t.ObjectProperty): string | null {
    if (t.isStringLiteral(prop.key)) {
      return prop.key.value.toLowerCase();
    }
    if (t.isIdentifier(prop.key)) {
      return prop.key.name.toLowerCase();
    }
    if (t.isNumericLiteral(prop.key)) {
      return prop.key.value.toString();
    }
    return null;
  }

  private extractPropertyValue(valueNode: t.Expression): ExtractedValue {
    if (t.isStringLiteral(valueNode)) {
      return valueNode.value;
    }
    if (t.isNumericLiteral(valueNode)) {
      return valueNode.value;
    }
    if (t.isBooleanLiteral(valueNode)) {
      return valueNode.value;
    }
    if (t.isNullLiteral(valueNode)) {
      return null;
    }
    if (t.isIdentifier(valueNode)) {
      return `{{${valueNode.name}}}`;
    }
    if (t.isMemberExpression(valueNode)) {
      return `{{${generate(valueNode).code}}}`;
    }
    if (t.isArrayExpression(valueNode)) {
      const arr = valueNode.elements.map(el => {
        if (!el) return null;
        if (el.type === 'SpreadElement') {
          return `{{${generate(el).code}}}`;
        }
        return this.extractPropertyValue(el);
      });
      return arr as JsonValue;
    }
    if (t.isObjectExpression(valueNode)) {
      const obj: Record<string, ExtractedValue> = {};
      for (const prop of valueNode.properties) {
        if (t.isObjectProperty(prop)) {
          const key = this.extractPropertyKey(prop);
          if (key) {
            obj[key] = this.extractPropertyValue(prop.value as t.Expression);
          }
        }
      }
      return obj;
    }

    return `{{${generate(valueNode).code}}}`;
  }

  private applyTransformation(path: NodePath<t.CallExpression>, ssrHtml: string): void {
    const callExpression = path.node;
    const propsArg = callExpression.arguments[1];

    // Inject the server-rendered output into the innerHTML property and clear the children property.
    if (t.isObjectExpression(propsArg)) {
      const innerHTMLProp = t.objectProperty(t.identifier('innerHTML'), t.stringLiteral(ssrHtml));

      propsArg.properties.push(innerHTMLProp);
      callExpression.arguments[2] = t.nullLiteral();
    } else {
      const newProps = t.objectExpression([
        ...(t.isNullLiteral(propsArg) ? [] : [t.spreadElement(propsArg as t.Expression)]),
        t.objectProperty(t.identifier('innerHTML'), t.stringLiteral(ssrHtml))
      ]);

      callExpression.arguments[1] = newProps;
      callExpression.arguments[2] = t.nullLiteral();
    }
  }

  private applyCssInjectionTransformation(
    ast: t.Node,
    ssrCssBundlePaths: Set<string>,
    clientRuntimeFileName: string
  ): void {
    if (!ssrCssBundlePaths || ssrCssBundlePaths.size === 0) {
      return;
    }

    // Input validation.
    if (!ast) {
      logger
        .getLoggerByGroup('applyCssInjectionTransformation')
        .warn('Invalid AST provided, skipping CSS injection');
      return;
    }

    const cssPathsArray = [...ssrCssBundlePaths];
    const Logger = logger.getLoggerByGroup('applyCssInjectionTransformation');

    // Validate CSS paths.
    const validCssPaths = cssPathsArray.filter(path => {
      if (typeof path !== 'string' || path.trim().length === 0) {
        Logger.warn(`Invalid CSS path detected: ${path}, skipping`);
        return false;
      }
      return true;
    });

    if (validCssPaths.length === 0) {
      Logger.warn('No valid CSS paths found, skipping injection');
      return;
    }

    if (validCssPaths.length !== cssPathsArray.length) {
      Logger.warn(`Filtered out ${cssPathsArray.length - validCssPaths.length} invalid CSS paths`);
    }

    try {
      // Find the Program node to inject the import statement.
      let programNode: t.Program | null = null;

      traverse(ast, {
        Program(path) {
          programNode = path.node;
          path.stop();
        }
      });

      if (!programNode || !t.isProgram(programNode)) {
        Logger.warn('No valid Program node found in AST, skipping CSS injection');
        return;
      }

      const validProgramNode = programNode as t.Program;

      // 1) Handle import statement injection.
      if (!this.hasExistingCSSRuntimeImport(validProgramNode)) {
        const importDeclaration = this.createCSSRuntimeImport(clientRuntimeFileName);
        const insertIndex = this.findImportInsertPosition(validProgramNode);

        validProgramNode.body.splice(insertIndex, 0, importDeclaration);
        Logger.success('CSS loading runtime import statement injected');
      }

      // 2) Handle await call injection.
      if (!this.hasExistingCSSRuntimeCall(validProgramNode)) {
        const awaitStatement = this.createCSSRuntimeCall(validCssPaths);
        const insertPosition = this.findAwaitInsertPosition(validProgramNode);

        validProgramNode.body.splice(insertPosition, 0, awaitStatement);
        Logger.success(`CSS loading runtime call injected for ${validCssPaths.length} CSS files`);

        Logger.debug(`Injected CSS paths: ${JSON.stringify(validCssPaths)}`);
      } else {
        Logger.info('CSS loading runtime call already exists, skipping injection');
      }
    } catch (error) {
      Logger.error(`Failed to inject CSS loading transformation: ${formatErrorMessage(error)}`);
    }
  }

  private hasExistingCSSRuntimeImport(programNode: t.Program): boolean {
    return programNode.body.some(
      node =>
        t.isImportDeclaration(node) &&
        node.source.value.includes('runtime') &&
        node.specifiers.some(
          spec => t.isImportSpecifier(spec) && spec.local.name === '__CSS_LOADING_RUNTIME__'
        )
    );
  }

  private hasExistingCSSRuntimeCall(programNode: t.Program): boolean {
    return programNode.body.some(
      node =>
        t.isExpressionStatement(node) &&
        t.isAwaitExpression(node.expression) &&
        t.isCallExpression(node.expression.argument) &&
        t.isIdentifier(node.expression.argument.callee) &&
        node.expression.argument.callee.name === '__CSS_LOADING_RUNTIME__'
    );
  }

  private createCSSRuntimeImport(clientRuntimeFileName: string): t.ImportDeclaration {
    return t.importDeclaration(
      [
        t.importSpecifier(
          t.identifier('__CSS_LOADING_RUNTIME__'),
          t.identifier('__CSS_LOADING_RUNTIME__')
        )
      ],
      t.stringLiteral(`./chunks/${clientRuntimeFileName}`)
    );
  }

  private createCSSRuntimeCall(cssPathsArray: string[]): t.ExpressionStatement {
    const cssPathsArrayExpression = t.arrayExpression(
      cssPathsArray.map(path => t.stringLiteral(path))
    );

    const awaitExpression = t.awaitExpression(
      t.callExpression(t.identifier('__CSS_LOADING_RUNTIME__'), [cssPathsArrayExpression])
    );

    return t.expressionStatement(awaitExpression);
  }

  private findImportInsertPosition(programNode: t.Program): number {
    const lastImportIndex = programNode.body.findLastIndex(node => t.isImportDeclaration(node));
    return lastImportIndex >= 0 ? lastImportIndex + 1 : 0;
  }

  private findAwaitInsertPosition(programNode: t.Program): number {
    const firstNonImportIndex = programNode.body.findIndex(
      node => !t.isImportDeclaration(node) && !t.isDirectiveLiteral(node)
    );
    return firstNonImportIndex >= 0 ? firstNonImportIndex : programNode.body.length;
  }

  getTransformationStats(): {
    totalTransformations: number;
    transformedNodes: TransformStatsEntry[];
  } {
    return {
      totalTransformations: this.transformations.length,
      transformedNodes: this.transformations.map(t => ({
        line: t.path.node.loc?.start.line ?? 0,
        column: t.path.node.loc?.start.column ?? 0
      }))
    };
  }
}

export function transformReactSSRIntegrationCode(
  sourceCode: string,
  callback: ReactSSRIntegrationCallback
): TransformWithStatsResult {
  const processor = new ReactSSRIntegrationProcessor(sourceCode, callback);
  const result = processor.process();
  const stats = processor.getTransformationStats();

  return {
    ...result,
    stats
  };
}
