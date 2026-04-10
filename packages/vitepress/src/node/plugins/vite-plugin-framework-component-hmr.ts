import type { ConfigType } from '#dep-types/utils';
import type { RenderController } from '@docs-islands/core/node/render-controller';
import type { ModuleNode, Plugin } from 'vite';
import type { RenderingModuleResolution } from '../core/module-resolution';
import { resolveWsUpdatePathname } from './shared';

const NON_SSR_ONLY_PLACEHOLDER = '__NON_SSR_ONLY_PLACEHOLDER__';
const SSR_ONLY_PLACEHOLDER = '__SSR_ONLY_PLACEHOLDER__';

export function createFrameworkComponentHmrPlugin({
  fastRefreshEvent,
  framework,
  name,
  renderController,
  resolution,
  siteConfig,
  ssrOnlyEvent,
}: {
  fastRefreshEvent?: string;
  framework: string;
  name: string;
  renderController: RenderController;
  resolution: RenderingModuleResolution;
  siteConfig: ConfigType;
  ssrOnlyEvent: string;
}): Plugin {
  return {
    name,
    enforce: 'pre',
    apply: 'serve',
    handleHotUpdate: {
      order: 'pre',
      async handler(ctx) {
        const { file, server, modules } = ctx;
        const viteResolver = resolution.createRuntimeResolver({
          resolveId: server.pluginContainer.resolveId.bind(
            server.pluginContainer,
          ),
        });

        if (file.endsWith('.md')) {
          return modules;
        }

        const {
          nonSSROnlyComponentFullPathToPageIdAndImportedNameMap,
          ssrOnlyComponentFullPathToPageIdAndImportedNameMap,
        } =
          await renderController.getComponentFullPathToPageIdAndImportedNameMap(
            framework,
          );
        const pageIdToSsrOnlyUpdateComponentsMap = new Map<
          string,
          Map<string, string>
        >();
        const pageIdToFastRefreshComponentsMap = new Map<
          string,
          Map<string, string>
        >();
        const deferredModules = new Set<ModuleNode>();

        const collectModuleEntries = (
          module: ModuleNode | undefined,
          hasVisited: Set<string>,
        ) => {
          if (!module?.id || hasVisited.has(module.id)) {
            return;
          }

          hasVisited.add(module.id);

          if (
            ssrOnlyComponentFullPathToPageIdAndImportedNameMap.has(module.id)
          ) {
            const pageIdAndImportedNameSet =
              ssrOnlyComponentFullPathToPageIdAndImportedNameMap.get(
                module.id,
              ) || [];

            for (const pageIdAndImportedName of pageIdAndImportedNameSet) {
              const [pageId, importedName] =
                pageIdAndImportedName.split(SSR_ONLY_PLACEHOLDER);
              const updateComponents =
                pageIdToSsrOnlyUpdateComponentsMap.get(pageId) ||
                new Map<string, string>();
              updateComponents.set(importedName, module.id);
              pageIdToSsrOnlyUpdateComponentsMap.set(pageId, updateComponents);
            }
          }

          if (
            nonSSROnlyComponentFullPathToPageIdAndImportedNameMap.has(module.id)
          ) {
            const pageIdAndImportedNameSet =
              nonSSROnlyComponentFullPathToPageIdAndImportedNameMap.get(
                module.id,
              ) || [];

            for (const pageIdAndImportedName of pageIdAndImportedNameSet) {
              const [pageId, importedName] = pageIdAndImportedName.split(
                NON_SSR_ONLY_PLACEHOLDER,
              );
              const updateComponents =
                pageIdToFastRefreshComponentsMap.get(pageId) ||
                new Map<string, string>();
              updateComponents.set(importedName, module.id);
              pageIdToFastRefreshComponentsMap.set(pageId, updateComponents);
            }

            deferredModules.add(module);
          }

          for (const importer of module.importers) {
            collectModuleEntries(importer, hasVisited);
          }
        };

        for (const module of modules) {
          collectModuleEntries(module, new Set());
        }

        if (fastRefreshEvent && pageIdToFastRefreshComponentsMap.size > 0) {
          const updates: Record<
            string,
            {
              componentName: string;
              importedName?: string;
              sourcePath: string;
            }[]
          > = {};

          for (const [
            pageId,
            updateComponents,
          ] of pageIdToFastRefreshComponentsMap) {
            const nextUpdates = [...updateComponents.entries()].map(
              ([componentName, sourcePath]) => ({
                componentName,
                importedName: componentName,
                sourcePath,
              }),
            );
            const resolvedPathname =
              await viteResolver.resolveDocumentModuleIdToPagePath(pageId);

            if (resolvedPathname) {
              updates[
                resolveWsUpdatePathname(resolvedPathname, siteConfig.base)
              ] = nextUpdates;
            }
          }

          server.ws.send({
            type: 'custom',
            event: fastRefreshEvent,
            data: {
              updates,
            },
          });
        }

        if (pageIdToSsrOnlyUpdateComponentsMap.size === 0) {
          return modules;
        }

        const updates: Record<
          string,
          {
            componentName: string;
            importedName?: string;
            sourcePath: string;
          }[]
        > = {};

        for (const [
          pageId,
          updateComponents,
        ] of pageIdToSsrOnlyUpdateComponentsMap) {
          const nextUpdates = [...updateComponents.entries()].map(
            ([componentName, sourcePath]) => ({
              componentName,
              importedName: componentName,
              sourcePath,
            }),
          );
          const resolvedPathname =
            await viteResolver.resolveDocumentModuleIdToPagePath(pageId);

          if (resolvedPathname) {
            updates[
              resolveWsUpdatePathname(resolvedPathname, siteConfig.base)
            ] = nextUpdates;
          }
        }

        server.ws.send({
          type: 'custom',
          event: ssrOnlyEvent,
          data: {
            updates,
          },
        });

        return [...deferredModules];
      },
    },
  };
}
