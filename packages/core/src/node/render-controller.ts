import { getPathnameByPagePath } from '../shared/path';
import type { UsedSnippetContainerType } from '../types/component';
import type { PageMetafile } from '../types/page';

export interface CompilationContainerType {
  code: string;
  helperCode: string;
  importsByLocalName: Map<
    string,
    {
      identifier: string;
      importedName: string;
    }
  >;
  ssrOnlyComponentNames: Set<string>;
}

export type FrameworkScopedCompilationContainerMap = Map<
  string,
  CompilationContainerType | Promise<CompilationContainerType>
>;

export type FrameworkScopedUsedSnippetContainerMap = Map<
  string,
  Map<string, UsedSnippetContainerType>
>;

export function createEmptyCompilationContainer(): CompilationContainerType {
  return {
    code: '',
    helperCode: '',
    importsByLocalName: new Map(),
    ssrOnlyComponentNames: new Set(),
  };
}

export class RenderController<TBuildMetrics = unknown> {
  readonly #markdownModuleIdToCompilationContainerMap = new Map<
    string,
    FrameworkScopedCompilationContainerMap
  >();
  readonly #markdownModuleIdToUsedSnippetContainerMap = new Map<
    string,
    FrameworkScopedUsedSnippetContainerMap
  >();
  readonly #pageToPageMetafileMap = new Map<
    string,
    PageMetafile<TBuildMetrics>
  >();
  readonly #facadeModuleIdToClientChunkMap = new Map<
    string,
    Map<string, { outputPath: string; code: string }>
  >();
  readonly #markdownModuleIdToPendingResolvedCompilationContainerMap = new Map<
    string,
    Map<string, (value: CompilationContainerType) => void>
  >();

  private getCompilationContainerMapByMarkdownModuleId(
    markdownModuleId: string,
    createIfMissing = false,
  ): FrameworkScopedCompilationContainerMap | undefined {
    let frameworkMap =
      this.#markdownModuleIdToCompilationContainerMap.get(markdownModuleId);

    if (!frameworkMap && createIfMissing) {
      frameworkMap = new Map();
      this.#markdownModuleIdToCompilationContainerMap.set(
        markdownModuleId,
        frameworkMap,
      );
    }

    return frameworkMap;
  }

  private getUsedSnippetContainerMapByMarkdownModuleId(
    markdownModuleId: string,
    createIfMissing = false,
  ): FrameworkScopedUsedSnippetContainerMap | undefined {
    let frameworkMap =
      this.#markdownModuleIdToUsedSnippetContainerMap.get(markdownModuleId);

    if (!frameworkMap && createIfMissing) {
      frameworkMap = new Map();
      this.#markdownModuleIdToUsedSnippetContainerMap.set(
        markdownModuleId,
        frameworkMap,
      );
    }

    return frameworkMap;
  }

  private getClientChunkMapByFacadeModuleId(
    facadeModuleId: string,
    createIfMissing = false,
  ): Map<string, { outputPath: string; code: string }> | undefined {
    let frameworkMap = this.#facadeModuleIdToClientChunkMap.get(facadeModuleId);

    if (!frameworkMap && createIfMissing) {
      frameworkMap = new Map();
      this.#facadeModuleIdToClientChunkMap.set(facadeModuleId, frameworkMap);
    }

    return frameworkMap;
  }

  private getPendingCompilationResolverMapByMarkdownModuleId(
    markdownModuleId: string,
    createIfMissing = false,
  ): Map<string, (value: CompilationContainerType) => void> | undefined {
    let frameworkMap =
      this.#markdownModuleIdToPendingResolvedCompilationContainerMap.get(
        markdownModuleId,
      );

    if (!frameworkMap && createIfMissing) {
      frameworkMap = new Map();
      this.#markdownModuleIdToPendingResolvedCompilationContainerMap.set(
        markdownModuleId,
        frameworkMap,
      );
    }

    return frameworkMap;
  }

  public getPendingCompilationContainerResolver(
    framework: string,
    markdownModuleId: string,
  ): ((value: CompilationContainerType) => void) | undefined {
    return this.getPendingCompilationResolverMapByMarkdownModuleId(
      markdownModuleId,
    )?.get(framework);
  }

  public deletePendingCompilationContainerResolver(
    framework: string,
    markdownModuleId: string,
  ): void {
    const frameworkMap =
      this.getPendingCompilationResolverMapByMarkdownModuleId(markdownModuleId);

    if (!frameworkMap) {
      return;
    }

    frameworkMap.delete(framework);

    if (frameworkMap.size === 0) {
      this.#markdownModuleIdToPendingResolvedCompilationContainerMap.delete(
        markdownModuleId,
      );
    }
  }

  public getCompilationContainersByMarkdownModuleId(
    markdownModuleId: string,
  ): FrameworkScopedCompilationContainerMap {
    return new Map(
      this.getCompilationContainerMapByMarkdownModuleId(markdownModuleId),
    );
  }

  public getUsedSnippetContainersByMarkdownModuleId(
    markdownModuleId: string,
  ): FrameworkScopedUsedSnippetContainerMap {
    return new Map(
      this.getUsedSnippetContainerMapByMarkdownModuleId(markdownModuleId),
    );
  }

  public setClientChunkByFacadeModuleId(
    framework: string,
    facadeModuleId: string,
    clientChunk: { outputPath: string; code: string },
  ): void {
    this.getClientChunkMapByFacadeModuleId(facadeModuleId, true)!.set(
      framework,
      clientChunk,
    );
  }

  public getClientChunkByFacadeModuleId(
    framework: string,
    facadeModuleId: string,
  ): { outputPath: string; code: string } | undefined {
    return this.getClientChunkMapByFacadeModuleId(facadeModuleId)?.get(
      framework,
    );
  }

  public deleteCompilationContainerByMarkdownModuleId(
    framework: string,
    markdownModuleId: string,
  ): void {
    const frameworkMap =
      this.getCompilationContainerMapByMarkdownModuleId(markdownModuleId);

    if (!frameworkMap) {
      return;
    }

    frameworkMap.delete(framework);

    if (frameworkMap.size === 0) {
      this.#markdownModuleIdToCompilationContainerMap.delete(markdownModuleId);
    }
  }

  public hasCompilationContainerByMarkdownModuleId(
    framework: string,
    markdownModuleId: string,
  ): boolean {
    return (
      this.getCompilationContainerMapByMarkdownModuleId(markdownModuleId)?.has(
        framework,
      ) ?? false
    );
  }

  public getCompilationContainerByMarkdownModuleId(
    framework: string,
    markdownModuleId: string,
  ): CompilationContainerType | Promise<CompilationContainerType> {
    const frameworkMap = this.getCompilationContainerMapByMarkdownModuleId(
      markdownModuleId,
      true,
    )!;

    if (!frameworkMap.has(framework)) {
      const pendingPromise = new Promise<CompilationContainerType>(
        (resolve) => {
          this.getPendingCompilationResolverMapByMarkdownModuleId(
            markdownModuleId,
            true,
          )!.set(framework, resolve);
        },
      );
      frameworkMap.set(framework, pendingPromise);
      return pendingPromise;
    }

    return frameworkMap.get(framework)!;
  }

  public async getComponentFullPathToPageIdAndImportedNameMap(
    framework: string,
  ): Promise<{
    ssrOnlyComponentFullPathToPageIdAndImportedNameMap: Map<
      string,
      Set<string>
    >;
    nonSSROnlyComponentFullPathToPageIdAndImportedNameMap: Map<
      string,
      Set<string>
    >;
  }> {
    const ssrOnlyComponentFullPathToPageIdAndImportedNameMap = new Map<
      string,
      Set<string>
    >();
    const nonSSROnlyComponentFullPathToPageIdAndImportedNameMap = new Map<
      string,
      Set<string>
    >();

    for (const [markdownModuleId, frameworkCompilationContainerMap] of this
      .#markdownModuleIdToCompilationContainerMap) {
      const compilationContainer =
        frameworkCompilationContainerMap.get(framework);

      if (!compilationContainer) {
        continue;
      }

      const compilationContainerResult =
        compilationContainer instanceof Promise
          ? await compilationContainer
          : compilationContainer;

      const { importsByLocalName, ssrOnlyComponentNames } =
        compilationContainerResult;

      for (const componentName of ssrOnlyComponentNames) {
        const importInfo = importsByLocalName.get(componentName);
        if (!importInfo) {
          continue;
        }

        const pageIds =
          ssrOnlyComponentFullPathToPageIdAndImportedNameMap.get(
            importInfo.identifier,
          ) || new Set<string>();
        pageIds.add(
          `${markdownModuleId}__SSR_ONLY_PLACEHOLDER__${componentName}`,
        );
        ssrOnlyComponentFullPathToPageIdAndImportedNameMap.set(
          importInfo.identifier,
          pageIds,
        );
      }

      for (const [localName, importInfo] of importsByLocalName.entries()) {
        if (ssrOnlyComponentNames.has(localName)) {
          continue;
        }

        const pageIds =
          nonSSROnlyComponentFullPathToPageIdAndImportedNameMap.get(
            importInfo.identifier,
          ) || new Set<string>();
        pageIds.add(
          `${markdownModuleId}__NON_SSR_ONLY_PLACEHOLDER__${localName}`,
        );
        nonSSROnlyComponentFullPathToPageIdAndImportedNameMap.set(
          importInfo.identifier,
          pageIds,
        );
      }
    }

    return {
      ssrOnlyComponentFullPathToPageIdAndImportedNameMap,
      nonSSROnlyComponentFullPathToPageIdAndImportedNameMap,
    };
  }

  public setCompilationContainer(
    framework: string,
    markdownModuleId: string,
    compilationContainer: CompilationContainerType,
  ): void {
    this.getCompilationContainerMapByMarkdownModuleId(
      markdownModuleId,
      true,
    )!.set(framework, compilationContainer);
  }

  public getMarkdownModuleIdToSpaSyncRenderMap(framework: string): Map<
    string,
    {
      outputPath: string;
      code: string;
      renderIdToSpaSyncRenderMap: Map<
        string,
        { ssrHtml?: string; ssrCssBundlePaths?: Set<string> }
      >;
    }
  > {
    const markdownModuleIdToSpaSyncRenderMap = new Map<
      string,
      {
        outputPath: string;
        code: string;
        renderIdToSpaSyncRenderMap: Map<
          string,
          { ssrHtml?: string; ssrCssBundlePaths?: Set<string> }
        >;
      }
    >();

    for (const [
      markdownModuleId,
      frameworkUsedSnippetContainerMap,
    ] of this.#markdownModuleIdToUsedSnippetContainerMap.entries()) {
      const usedSnippetContainer =
        frameworkUsedSnippetContainerMap.get(framework);

      if (!usedSnippetContainer) {
        continue;
      }

      const clientChunk = this.getClientChunkByFacadeModuleId(
        framework,
        markdownModuleId,
      );
      if (!clientChunk) {
        continue;
      }

      const renderIdToSpaSyncRenderMap = new Map<
        string,
        { ssrHtml?: string; ssrCssBundlePaths?: Set<string> }
      >();
      const { code, outputPath } = clientChunk;

      for (const [renderId, snippet] of usedSnippetContainer.entries()) {
        const hasSSRContent =
          (snippet.ssrHtml != null && snippet.ssrHtml.length > 0) ||
          (snippet.ssrCssBundlePaths != null &&
            snippet.ssrCssBundlePaths.size > 0);
        if (
          snippet.useSpaSyncRender &&
          hasSSRContent &&
          snippet.renderDirective !== 'client:only'
        ) {
          renderIdToSpaSyncRenderMap.set(renderId, {
            ssrHtml: snippet.ssrHtml,
            ssrCssBundlePaths: snippet.ssrCssBundlePaths,
          });
        }
      }

      if (renderIdToSpaSyncRenderMap.size > 0) {
        markdownModuleIdToSpaSyncRenderMap.set(markdownModuleId, {
          outputPath,
          code,
          renderIdToSpaSyncRenderMap,
        });
      }
    }

    return markdownModuleIdToSpaSyncRenderMap;
  }

  public getUsedSnippetContainerByMarkdownModuleId(
    framework: string,
    markdownModuleId: string,
  ): Map<string, UsedSnippetContainerType> | undefined {
    return this.getUsedSnippetContainerMapByMarkdownModuleId(
      markdownModuleId,
    )?.get(framework);
  }

  public setUsedSnippetContainer(
    framework: string,
    markdownModuleId: string,
    usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  ): void {
    this.getUsedSnippetContainerMapByMarkdownModuleId(
      markdownModuleId,
      true,
    )!.set(framework, usedSnippetContainer);
  }

  public setPageMetafile(
    page: string,
    metafile: PageMetafile<TBuildMetrics>,
  ): void {
    this.#pageToPageMetafileMap.set(page, metafile);
  }

  public getPageMetafileByPage(
    page: string,
  ): PageMetafile<TBuildMetrics> | undefined {
    return this.#pageToPageMetafileMap.get(page);
  }

  public getTransformedPageMetafile(
    cleanUrls: boolean,
  ): Record<string, PageMetafile<TBuildMetrics>> {
    const transformedPageMetafileMap: Record<
      string,
      PageMetafile<TBuildMetrics>
    > = {};
    for (const [page, pageMetafile] of this.#pageToPageMetafileMap.entries()) {
      transformedPageMetafileMap[getPathnameByPagePath(page, cleanUrls)] =
        pageMetafile;
    }
    return transformedPageMetafileMap;
  }
}
