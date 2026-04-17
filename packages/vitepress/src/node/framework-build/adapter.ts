import type { PluginOption } from 'vite';

/**
 * Framework-specific loader runtimes only need a stable view of the emitted
 * component entry chunk and the export name they should read from that chunk.
 */
export interface UIFrameworkClientLoaderEntry {
  componentName: string;
  loaderImportedName: string;
  modulePath: string;
}

/**
 * The generic framework build layer owns the "how to emit and write runtime
 * modules" part, while each framework owns the runtime source string itself.
 */
export interface CreateUIFrameworkClientLoaderModuleSourceOptions {
  base: string;
  cleanUrls: boolean;
  componentEntries: UIFrameworkClientLoaderEntry[];
}

/**
 * A framework adapter provides the minimal hooks needed by the generic
 * framework build layer so browser, SSR, and MPA builds can stay
 * framework-agnostic.
 */
export interface UIFrameworkBuildAdapter {
  readonly framework: string;
  browserBundlerPlugins: () => PluginOption[];
  ssrBundlerPlugins: () => PluginOption[];
  clientEntryModule: () => string;
  clientEntryImportName: () => string;
  /**
   * Return stable public chunk paths that should be preloaded before any page-specific
   * loader executes. This keeps framework chunk naming inside the adapter instead of
   * leaking it into the shared build orchestration layer.
   */
  buildModulePreloadPaths?: (options: {
    assetsDir: string;
  }) => Promise<string[]> | string[];
  createClientLoaderModuleSource: (
    options: CreateUIFrameworkClientLoaderModuleSourceOptions,
  ) => string;
  renderToString: (
    component: unknown,
    props: Record<string, string>,
  ) => string | Promise<string>;
}
