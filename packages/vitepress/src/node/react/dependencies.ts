import { importWithError, pkgExists } from '@docs-islands/utils';
import { findNearestPackageRoot } from '@docs-islands/utils/path';
import { join } from 'pathe';
import type { Plugin, PluginOption } from 'vite';
import { REACT_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME } from './plugin-names';

const REACT_INTEGRATION_DEPENDENCIES = [
  'react',
  'react-dom',
  '@vitejs/plugin-react-swc',
] as const;

type ReactVitePluginFactory = (...args: unknown[]) => Plugin[];

interface ReactModuleLike {
  createElement: (component: unknown, props: Record<string, string>) => unknown;
  version?: string;
}

interface ReactDomModuleLike {
  version?: string;
}

interface ReactDomServerModuleLike {
  renderToString: (element: unknown) => string;
}

interface ReactRuntimeDependencies {
  React: ReactModuleLike;
  ReactDOMServer: ReactDomServerModuleLike;
  reactDomPackageVersion: string;
  reactPackageVersion: string;
}

let reactVitePluginFactoryPromise: Promise<ReactVitePluginFactory> | null =
  null;
let reactRuntimeDependenciesPromise: Promise<ReactRuntimeDependencies> | null =
  null;
let dependencyResolutionBase = join(process.cwd(), 'package.json');
const reactVitePluginFactoryPromises = new Map<
  string,
  Promise<ReactVitePluginFactory>
>();
const reactRuntimeDependenciesPromises = new Map<
  string,
  Promise<ReactRuntimeDependencies>
>();
interface ReactVitePluginProxyMetadata {
  apply?: 'build' | 'serve';
  enforce?: 'post' | 'pre';
  name: string;
}

const REACT_VITE_PLUGIN_PROXY_METADATA: ReactVitePluginProxyMetadata[] = [
  {
    apply: 'serve',
    enforce: 'pre',
    name: 'vite:react-swc:resolve-runtime',
  },
  {
    apply: 'serve',
    name: 'vite:react-swc',
  },
  {
    apply: 'build',
    name: 'vite:react-swc',
  },
  {
    name: 'vite:react-virtual-preamble',
  },
] as const;

interface VitepressGlobalConfigLike {
  root?: string;
}

const getVitepressRoot = (): string | undefined => {
  const globalConfig = (
    globalThis as { VITEPRESS_CONFIG?: VitepressGlobalConfigLike }
  ).VITEPRESS_CONFIG;

  return typeof globalConfig?.root === 'string' ? globalConfig.root : undefined;
};

export function resolveDependencyResolutionBase(searchStart: string): string {
  const packageRoot = findNearestPackageRoot(searchStart);
  return join(packageRoot ?? searchStart, 'package.json');
}

export function resolveDependencySearchStart(configRoot?: string): string {
  return getVitepressRoot() ?? configRoot ?? process.cwd();
}

export function resolveCurrentDependencyResolutionBase(
  configRoot?: string,
): string {
  return resolveDependencyResolutionBase(
    resolveDependencySearchStart(configRoot),
  );
}

export function setDependencyResolutionBase(
  nextResolutionBase: string,
): string {
  dependencyResolutionBase = nextResolutionBase;
  return dependencyResolutionBase;
}

export function ensureReactIntegrationDependenciesInstalled(
  resolutionBase: string = dependencyResolutionBase,
): void {
  const missingDependencies = REACT_INTEGRATION_DEPENDENCIES.filter(
    (dependency) => !pkgExists(dependency, resolutionBase),
  );

  if (missingDependencies.length === 0) {
    return;
  }

  throw new Error(
    `React rendering integration requires the following peer dependencies to be installed in the consumer project: ${REACT_INTEGRATION_DEPENDENCIES.join(', ')}. Missing: ${missingDependencies.join(', ')}.`,
  );
}

export async function loadReactVitePluginFactory(
  resolutionBase: string = dependencyResolutionBase,
): Promise<ReactVitePluginFactory> {
  ensureReactIntegrationDependenciesInstalled(resolutionBase);

  reactVitePluginFactoryPromise =
    reactVitePluginFactoryPromises.get(resolutionBase) ??
    importWithError<{
      default: ReactVitePluginFactory;
    }>('@vitejs/plugin-react-swc', resolutionBase).then(
      (module) => module.default,
    );

  reactVitePluginFactoryPromises.set(
    resolutionBase,
    reactVitePluginFactoryPromise,
  );

  return reactVitePluginFactoryPromise;
}

export async function loadReactVitePlugins(
  resolutionBase: string = dependencyResolutionBase,
): Promise<Plugin[]> {
  const reactVitePluginFactory =
    await loadReactVitePluginFactory(resolutionBase);

  return reactVitePluginFactory();
}

type UnknownHook = (...args: unknown[]) => unknown;
type UnknownObjectHook = UnknownHook | { handler: UnknownHook };
type UnknownIndexHtmlHook =
  | UnknownHook
  | { handler: UnknownHook }
  | { transform: UnknownHook };

function unwrapObjectHook(hook: UnknownObjectHook): UnknownHook {
  return (typeof hook === 'function' ? hook : hook.handler) as UnknownHook;
}

function unwrapIndexHtmlHook(hook: UnknownIndexHtmlHook): UnknownHook {
  return (
    typeof hook === 'function'
      ? hook
      : 'transform' in hook
        ? hook.transform
        : hook.handler
  ) as UnknownHook;
}

export function createReactVitePluginDelegates(): PluginOption[] {
  let bridgedResolutionBase: string | null = null;
  let bridgedPluginsPromise: Promise<Plugin[]> | null = null;

  const ensureBridgedPlugins = (configRoot?: string): Promise<Plugin[]> => {
    const resolutionBase = configRoot
      ? setDependencyResolutionBase(
          resolveCurrentDependencyResolutionBase(configRoot),
        )
      : dependencyResolutionBase;

    if (bridgedPluginsPromise && bridgedResolutionBase === resolutionBase) {
      return bridgedPluginsPromise;
    }

    bridgedResolutionBase = resolutionBase;
    bridgedPluginsPromise = loadReactVitePlugins(resolutionBase);

    return bridgedPluginsPromise;
  };

  return REACT_VITE_PLUGIN_PROXY_METADATA.map(
    (metadata, index) =>
      ({
        name: metadata.name,
        ...(metadata.apply ? { apply: metadata.apply } : {}),
        ...(metadata.enforce ? { enforce: metadata.enforce } : {}),
        async config(config, env) {
          const reactPlugins = await ensureBridgedPlugins(config.root);
          const reactPlugin = reactPlugins[index];
          const configHook = reactPlugin?.config;

          if (!configHook) {
            return null;
          }

          return await unwrapObjectHook(
            configHook as unknown as UnknownObjectHook,
          ).call(this, config, env);
        },
        async configResolved(resolvedConfig) {
          const reactPlugins = await ensureBridgedPlugins(resolvedConfig.root);
          const reactPlugin = reactPlugins[index];
          const configResolvedHook = reactPlugin?.configResolved;

          if (!configResolvedHook) {
            return;
          }

          await unwrapObjectHook(
            configResolvedHook as unknown as UnknownObjectHook,
          ).call(this, resolvedConfig);
        },
        async load(id, options) {
          const reactPlugins = await ensureBridgedPlugins();
          const reactPlugin = reactPlugins[index];
          const loadHook = reactPlugin?.load;

          if (!loadHook) {
            return null;
          }

          return await unwrapObjectHook(
            loadHook as unknown as UnknownObjectHook,
          ).call(this, id, options);
        },
        async resolveId(source, importer, options) {
          const reactPlugins = await ensureBridgedPlugins();
          const reactPlugin = reactPlugins[index];
          const resolveIdHook = reactPlugin?.resolveId;

          if (!resolveIdHook) {
            return null;
          }

          return await unwrapObjectHook(
            resolveIdHook as unknown as UnknownObjectHook,
          ).call(this, source, importer, options);
        },
        async transform(code, id, options) {
          const reactPlugins = await ensureBridgedPlugins();
          const reactPlugin = reactPlugins[index];
          const transformHook = reactPlugin?.transform;

          if (!transformHook) {
            return null;
          }

          return await unwrapObjectHook(
            transformHook as unknown as UnknownObjectHook,
          ).call(this, code, id, options);
        },
        async transformIndexHtml(html, ctx) {
          const reactPlugins = await ensureBridgedPlugins();
          const reactPlugin = reactPlugins[index];
          const transformIndexHtmlHook = reactPlugin?.transformIndexHtml;

          if (!transformIndexHtmlHook) {
            return html;
          }

          return await unwrapIndexHtmlHook(
            transformIndexHtmlHook as unknown as UnknownIndexHtmlHook,
          ).call(this, html, ctx);
        },
      }) as Plugin,
  );
}

export async function loadReactRuntimeDependencies(
  resolutionBase: string = dependencyResolutionBase,
): Promise<ReactRuntimeDependencies> {
  ensureReactIntegrationDependenciesInstalled(resolutionBase);

  reactRuntimeDependenciesPromise =
    reactRuntimeDependenciesPromises.get(resolutionBase) ??
    Promise.all([
      importWithError<ReactModuleLike & { default?: ReactModuleLike }>(
        'react',
        resolutionBase,
      ),
      importWithError<ReactDomModuleLike & { default?: ReactDomModuleLike }>(
        'react-dom',
        resolutionBase,
      ),
      importWithError<
        ReactDomServerModuleLike & { default?: ReactDomServerModuleLike }
      >('react-dom/server', resolutionBase),
    ]).then(([reactModule, reactDomModule, reactDomServerModule]) => {
      const React = reactModule.default ?? reactModule;
      const ReactDOMServer =
        reactDomServerModule.default ?? reactDomServerModule;
      const reactPackageVersion = reactModule.version ?? React.version;
      const reactDomPackageVersion =
        reactDomModule.version ?? reactDomModule.default?.version;

      if (
        typeof React.createElement !== 'function' ||
        typeof ReactDOMServer.renderToString !== 'function' ||
        !reactPackageVersion ||
        !reactDomPackageVersion
      ) {
        throw new Error(
          'Failed to load the React runtime dependencies for the React rendering integration.',
        );
      }

      return {
        React,
        ReactDOMServer,
        reactDomPackageVersion,
        reactPackageVersion,
      };
    });

  reactRuntimeDependenciesPromises.set(
    resolutionBase,
    reactRuntimeDependenciesPromise,
  );

  return reactRuntimeDependenciesPromise;
}

export function createReactDependencyBootstrapPlugin(options?: {
  onResolutionBaseResolved?: (resolutionBase: string) => void | Promise<void>;
}): PluginOption {
  return {
    name: REACT_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME,
    enforce: 'pre',
    async config(config) {
      const resolutionBase = setDependencyResolutionBase(
        resolveCurrentDependencyResolutionBase(config.root),
      );

      ensureReactIntegrationDependenciesInstalled(resolutionBase);
      await options?.onResolutionBaseResolved?.(resolutionBase);
    },
  };
}
