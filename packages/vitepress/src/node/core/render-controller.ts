import type {
  PageMetafile,
  UsedSnippetContainerType,
} from '@docs-islands/vitepress-types';

export interface CompilationContainerType {
  // Runtime code for client component loading.
  code: string;
  // Runtime code for client component registration.
  helperCode: string;
  // Component loading reference information.
  importsByLocalName: Map<
    string,
    {
      identifier: string;
      importedName: string;
    }
  >;
  // A collection of component names for components that only use the `ssr:only` directive on the current page.
  ssrOnlyComponentNames: Set<string>;
}

export class RenderController {
  readonly #markdownModuleIdToCompilationContainerMap = new Map<
    string,
    CompilationContainerType | Promise<CompilationContainerType>
  >();
  readonly #markdownModuleIdToUsedSnippetContainerMap = new Map<
    string,
    Map<string, UsedSnippetContainerType>
  >();
  readonly #pageToPageMetafileMap = new Map<string, PageMetafile>();
  readonly #facadeModuleIdToClientChunkMap = new Map<
    string,
    { outputPath: string; code: string }
  >();

  public markdownModuleIdToPendingResolvedCompilationContainerMap: Map<
    string,
    (value: CompilationContainerType) => void
  > = new Map<string, (value: CompilationContainerType) => void>();

  public setClientChunkByFacadeModuleId(
    facadeModuleId: string,
    clientChunk: { outputPath: string; code: string },
  ): void {
    this.#facadeModuleIdToClientChunkMap.set(facadeModuleId, clientChunk);
  }

  public getClientChunkByFacadeModuleId(
    facadeModuleId: string,
  ): { outputPath: string; code: string } | undefined {
    return this.#facadeModuleIdToClientChunkMap.get(facadeModuleId);
  }

  public deleteCompilationContainerByMarkdownModuleId(
    markdownModuleId: string,
  ): void {
    this.#markdownModuleIdToCompilationContainerMap.delete(markdownModuleId);
  }

  public hasCompilationContainerByMarkdownModuleId(
    markdownModuleId: string,
  ): boolean {
    return this.#markdownModuleIdToCompilationContainerMap.has(
      markdownModuleId,
    );
  }

  public getCompilationContainerByMarkdownModuleId(
    markdownModuleId: string,
  ): CompilationContainerType | Promise<CompilationContainerType> {
    if (
      !this.#markdownModuleIdToCompilationContainerMap.has(markdownModuleId)
    ) {
      const pendingPromise = new Promise<CompilationContainerType>(
        (resolve) => {
          this.markdownModuleIdToPendingResolvedCompilationContainerMap.set(
            markdownModuleId,
            resolve,
          );
        },
      );
      this.#markdownModuleIdToCompilationContainerMap.set(
        markdownModuleId,
        pendingPromise,
      );
      return pendingPromise;
    }

    return this.#markdownModuleIdToCompilationContainerMap.get(
      markdownModuleId,
    )!;
  }

  public async getComponentFullPathToPageIdAndImportedNameMap(): Promise<{
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
    for (const [markdownModuleId, compilationContainer] of this
      .#markdownModuleIdToCompilationContainerMap) {
      const compilationContainerResult: CompilationContainerType =
        compilationContainer instanceof Promise
          ? await compilationContainer
          : compilationContainer;

      const { ssrOnlyComponentNames, importsByLocalName } =
        compilationContainerResult;
      if (ssrOnlyComponentNames) {
        for (const componentName of ssrOnlyComponentNames) {
          const importInfo = importsByLocalName?.get(componentName);
          if (importInfo) {
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
        }
      }

      if (importsByLocalName) {
        for (const [localName, importInfo] of importsByLocalName.entries()) {
          if (ssrOnlyComponentNames?.has(localName)) {
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
    }

    return {
      ssrOnlyComponentFullPathToPageIdAndImportedNameMap,
      nonSSROnlyComponentFullPathToPageIdAndImportedNameMap,
    };
  }

  public setCompilationContainer(
    markdownModuleId: string,
    compilationContainer: CompilationContainerType,
  ): void {
    this.#markdownModuleIdToCompilationContainerMap.set(
      markdownModuleId,
      compilationContainer,
    );
  }

  public getMarkdownModuleIdToSpaSyncRenderMap(): Map<
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
      usedSnippetContainer,
    ] of this.#markdownModuleIdToUsedSnippetContainerMap.entries()) {
      const clientChunk = this.getClientChunkByFacadeModuleId(markdownModuleId);
      if (clientChunk) {
        const renderIdToSpaSyncRenderMap = new Map<
          string,
          { ssrHtml?: string; ssrCssBundlePaths?: Set<string> }
        >();
        const { outputPath, code } = clientChunk;
        for (const [renderId, snippet] of usedSnippetContainer.entries()) {
          if (
            snippet.useSpaSyncRender &&
            ((snippet.ssrHtml || snippet.ssrCssBundlePaths?.size) ?? 0) &&
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
    }

    return markdownModuleIdToSpaSyncRenderMap;
  }

  public getUsedSnippetContainerByMarkdownModuleId(
    markdownModuleId: string,
  ): Map<string, UsedSnippetContainerType> | undefined {
    return this.#markdownModuleIdToUsedSnippetContainerMap.get(
      markdownModuleId,
    );
  }

  public setUsedSnippetContainer(
    markdownModuleId: string,
    usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  ): void {
    this.#markdownModuleIdToUsedSnippetContainerMap.set(
      markdownModuleId,
      usedSnippetContainer,
    );
  }

  public setPageMetafile(page: string, metafile: PageMetafile): void {
    this.#pageToPageMetafileMap.set(page, metafile);
  }

  public getPageMetafileByPage(page: string): PageMetafile | undefined {
    return this.#pageToPageMetafileMap.get(page);
  }

  public getTransformedPageMetafile(): Record<string, PageMetafile> {
    const transformedPageMetafileMap: Record<string, PageMetafile> = {};
    for (const [page, pageMetafile] of this.#pageToPageMetafileMap.entries()) {
      transformedPageMetafileMap[`/${page.replace(/\.md$/, '')}`] =
        pageMetafile;
    }
    return transformedPageMetafileMap;
  }
}
