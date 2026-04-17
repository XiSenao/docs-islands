import type { UsedSnippetContainerType } from '#dep-types/component';
import { RENDER_STRATEGY_CONSTANTS } from '#shared/constants';
import { VITEPRESS_LOG_GROUPS } from '#shared/log-groups';
import getLoggerInstance from '#shared/logger';
import { createImportReferenceResolver } from '@docs-islands/core/node/import-reference-resolver';
import {
  type CompilationContainerType,
  createEmptyCompilationContainer,
} from '@docs-islands/core/node/render-controller';
import coreTransformComponentTags, {
  type ImportNameSpecifier,
  travelImports,
} from '@docs-islands/core/node/transform';
import { type ImportSpecifier, init, parse } from 'es-module-lexer';
import type { SourceMap } from 'magic-string';
import { join } from 'pathe';
import { GET_CLEAN_PATHNAME_RUNTIME } from '../../../shared/runtime';
import type {
  RenderingFrameworkParsedScriptResult,
  RenderingFrameworkParser,
  RenderingFrameworkParserScriptContext,
  RenderingFrameworkTransformResult,
} from '../../core/framework-parser';
import type { ReactIntegrationPluginContext } from './context';
import { REACT_FRAMEWORK } from './framework';

const loggerInstance = getLoggerInstance();

interface ReactParsedScriptResult extends RenderingFrameworkParsedScriptResult {
  metadata: {
    inlineComponentReferenceMap: Map<
      string,
      { localName: string; path: string; importedName: string }
    >;
  };
}

function transformComponentTags(
  code: string,
  maybeReactComponentNames: string[],
  id: string,
): {
  code: string;
  renderIdToRenderDirectiveMap: Map<string, string[]>;
  map: SourceMap | null;
} {
  return coreTransformComponentTags(code, maybeReactComponentNames, id, {
    renderId: RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
    renderDirective: RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
    renderComponent: RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
    renderWithSpaSync:
      RENDER_STRATEGY_CONSTANTS.renderWithSpaSync.toLowerCase(),
  });
}

function createEmptyReactTransformResult(
  code: string,
  map: SourceMap | null = null,
): RenderingFrameworkTransformResult {
  return {
    code,
    compilationContainer: createEmptyCompilationContainer(),
    map,
    usedSnippetContainer: new Map(),
  };
}

export function createReactFrameworkParser(
  context: ReactIntegrationPluginContext,
): RenderingFrameworkParser {
  const { renderController, siteConfig } = context;

  return {
    framework: REACT_FRAMEWORK,
    lang: REACT_FRAMEWORK,
    renderController,
    async parseScript({
      id,
      moduleResolver,
      normalizedId,
      script,
    }: RenderingFrameworkParserScriptContext): Promise<ReactParsedScriptResult> {
      await init;
      const importReferenceResolver =
        createImportReferenceResolver(moduleResolver);
      const maybeComponentReferenceMap = new Map<
        string,
        { identifier: string; importedName: string }
      >();
      const inlineComponentReferenceMap = new Map<
        string,
        { localName: string; path: string; importedName: string }
      >();

      let imports: readonly ImportSpecifier[];
      try {
        [imports] = parse(script.content);
      } catch (parseError) {
        loggerInstance
          .getLoggerByGroup(VITEPRESS_LOG_GROUPS.parserReact)
          .error(
            `Failed to parse JavaScript in ${id}: ${
              parseError instanceof Error
                ? parseError.message
                : String(parseError)
            }`,
          );

        return {
          componentReferences: maybeComponentReferenceMap,
          metadata: {
            inlineComponentReferenceMap,
          },
        };
      }

      for (const _importSpecifier of imports) {
        const importSpecifier = _importSpecifier || {};
        const {
          ss: expStart,
          se: expEnd,
          n: rawIdentifier = '',
        } = importSpecifier;

        const exp = script.content.slice(expStart, expEnd);

        let importSets: ImportNameSpecifier[];
        try {
          importSets = travelImports(exp) || [];
        } catch (importParseError) {
          loggerInstance
            .getLoggerByGroup(VITEPRESS_LOG_GROUPS.parserReact)
            .warn(
              `Failed to parse import statement in ${id}: ${
                importParseError instanceof Error
                  ? importParseError.message
                  : String(importParseError)
              }`,
            );
          continue;
        }

        for (const importSet of importSets) {
          const { importedName, localName } = importSet;

          if (!/^[A-Z][\dA-Za-z]*$/.test(localName)) {
            continue;
          }

          const finalImportReference =
            await importReferenceResolver.resolveImportReference(
              rawIdentifier,
              importedName,
              normalizedId,
            );

          if (!finalImportReference) {
            loggerInstance
              .getLoggerByGroup(VITEPRESS_LOG_GROUPS.parserReact)
              .error(
                `Failed to resolve final import reference ${rawIdentifier}#${importedName} in ${id}, skipping component registration`,
              );
            continue;
          }

          for (const warning of finalImportReference.warnings) {
            loggerInstance
              .getLoggerByGroup(VITEPRESS_LOG_GROUPS.parserReact)
              .warn(warning);
          }

          maybeComponentReferenceMap.set(localName, {
            identifier: finalImportReference.identifier,
            importedName: finalImportReference.importedName,
          });
          inlineComponentReferenceMap.set(localName, {
            localName,
            path: join(
              '/',
              finalImportReference.identifier.replace(siteConfig.srcDir, ''),
            ),
            importedName: finalImportReference.importedName,
          });
        }
      }

      return {
        componentReferences: maybeComponentReferenceMap,
        metadata: {
          inlineComponentReferenceMap,
        },
      };
    },
    async transformMarkdown({
      code,
      id,
      parsedScript,
    }): Promise<RenderingFrameworkTransformResult> {
      const reactParsedScript = parsedScript as ReactParsedScriptResult;
      const compilationContainer: CompilationContainerType =
        createEmptyCompilationContainer();
      const maybeComponentReferenceMap = reactParsedScript.componentReferences;

      if (maybeComponentReferenceMap.size === 0) {
        return createEmptyReactTransformResult(code);
      }

      const maybeReactComponentNames = [...maybeComponentReferenceMap.keys()];
      const determinedComponentReferenceNameSets = new Set<string>();
      const {
        code: transformedCode,
        renderIdToRenderDirectiveMap,
        map,
      } = transformComponentTags(code, maybeReactComponentNames, id);
      const transformedRenderIdToRenderDirectiveMap = new Map<
        string,
        UsedSnippetContainerType
      >();
      const nonSSROnlyComponentNames = new Set<string>();
      const ssrOnlyComponentNames = new Set<string>();

      for (const [
        renderId,
        renderDirectiveAttributes,
      ] of renderIdToRenderDirectiveMap.entries()) {
        const [
          ,
          renderDirectiveSnips,
          renderComponentSnips,
          useSpaSyncRenderSnips,
        ] = renderDirectiveAttributes;
        const renderDirective = renderDirectiveSnips
          .split('=')[1]
          .slice(1, -1) as UsedSnippetContainerType['renderDirective'];
        const renderComponent = renderComponentSnips.split('=')[1].slice(1, -1);
        const useSpaSyncRender = useSpaSyncRenderSnips
          .split('=')[1]
          .slice(1, -1);

        if (renderDirective === 'ssr:only') {
          ssrOnlyComponentNames.add(renderComponent);
        } else {
          nonSSROnlyComponentNames.add(renderComponent);
        }

        determinedComponentReferenceNameSets.add(renderComponent);
        transformedRenderIdToRenderDirectiveMap.set(renderId, {
          props: new Map(),
          renderId,
          renderDirective,
          renderComponent,
          useSpaSyncRender: useSpaSyncRender === 'true',
        });
      }

      if (determinedComponentReferenceNameSets.size === 0) {
        return createEmptyReactTransformResult(transformedCode, map);
      }

      for (const componentName of ssrOnlyComponentNames) {
        if (nonSSROnlyComponentNames.has(componentName)) {
          ssrOnlyComponentNames.delete(componentName);
        }
      }

      const componentReferenceImportSnippets: string[] = [];
      const determinedComponentReferenceMap = new Map<
        string,
        { identifier: string; importedName: string }
      >();

      for (const [componentName, importInfo] of maybeComponentReferenceMap) {
        const { identifier, importedName } = importInfo;

        if (!determinedComponentReferenceNameSets.has(componentName)) {
          continue;
        }

        determinedComponentReferenceMap.set(componentName, {
          identifier,
          importedName,
        });

        if (ssrOnlyComponentNames.has(componentName)) {
          continue;
        }

        switch (importedName) {
          case '*': {
            componentReferenceImportSnippets.push(
              `import * as ${componentName} from '${identifier}';`,
            );
            break;
          }
          case 'default': {
            componentReferenceImportSnippets.push(
              `import ${componentName} from '${identifier}';`,
            );
            break;
          }
          case componentName: {
            componentReferenceImportSnippets.push(
              `import { ${componentName} } from '${identifier}';`,
            );
            break;
          }
          default: {
            componentReferenceImportSnippets.push(
              `import { ${importedName} as ${componentName} } from '${identifier}';`,
            );
            break;
          }
        }
      }

      compilationContainer.code = componentReferenceImportSnippets.join('\n');

      const helperCode = `
        // This snippet is emitted via function.toString(), so pass base/cleanUrls
        // explicitly instead of relying on define replacements inside the string body.
        const __PAGE_ID__ = (${GET_CLEAN_PATHNAME_RUNTIME.toString()})(${JSON.stringify(siteConfig.base)}, ${JSON.stringify(siteConfig.cleanUrls)});
        if (!window['${RENDER_STRATEGY_CONSTANTS.injectComponent}'][__PAGE_ID__]) {
          window['${RENDER_STRATEGY_CONSTANTS.injectComponent}'][__PAGE_ID__] = {};
        }
        const ${RENDER_STRATEGY_CONSTANTS.reactInlineComponentReference} = window['${RENDER_STRATEGY_CONSTANTS.injectComponent}'][__PAGE_ID__];
      `;
      const inlineComponentReferenceCode = [
        ...reactParsedScript.metadata.inlineComponentReferenceMap.values(),
      ]
        .map((inlineComponentReference) => {
          if (
            determinedComponentReferenceNameSets.has(
              inlineComponentReference.localName,
            )
          ) {
            if (ssrOnlyComponentNames.has(inlineComponentReference.localName)) {
              return `
                ${RENDER_STRATEGY_CONSTANTS.reactInlineComponentReference}[${JSON.stringify(inlineComponentReference.localName)}] = {
                  component: null,
                  path: ${JSON.stringify(inlineComponentReference.path)},
                  importedName: ${JSON.stringify(inlineComponentReference.importedName)}
                }
              `;
            }

            return `
              ${RENDER_STRATEGY_CONSTANTS.reactInlineComponentReference}[${JSON.stringify(inlineComponentReference.localName)}] = {
                component: ${inlineComponentReference.localName},
                path: ${JSON.stringify(inlineComponentReference.path)},
                importedName: ${JSON.stringify(inlineComponentReference.importedName)}
              }
            `;
          }

          return '';
        })
        .join('\n');

      compilationContainer.helperCode = `
        ${helperCode}

        ${inlineComponentReferenceCode}
      `;
      compilationContainer.importsByLocalName = determinedComponentReferenceMap;
      compilationContainer.ssrOnlyComponentNames = ssrOnlyComponentNames;

      return {
        code: transformedCode,
        compilationContainer,
        map,
        usedSnippetContainer: transformedRenderIdToRenderDirectiveMap,
      };
    },
  };
}
