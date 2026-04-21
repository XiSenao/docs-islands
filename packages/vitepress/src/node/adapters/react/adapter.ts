import { DIRNAME_VAR_NAME } from '@docs-islands/core/shared/constants/runtime';
import { join } from 'pathe';
import type { Plugin, PluginOption } from 'vite';
import { REACT_FRAMEWORK } from '../../constants/adapters/react/framework';
import { REACT_RUNTIME_EXTERNALIZATION_PLUGIN_NAME } from '../../constants/adapters/react/plugin-names';
import { DIRNAME_VARIABLE_INJECTION_PLUGIN_NAME } from '../../constants/plugins/plugin-names';
import { resolveCurrentDependencyResolutionBase } from '../../core/dependency-resolution';
import type { UIFrameworkBuildAdapter } from '../../framework-build/adapter';
import { createDirnameVarInjectionPlugin } from '../../plugins/vite-plugin-dirname-var-injection';
import { createReactClientLoaderModuleSource } from './client-loader-module-source';
import {
  loadReactRuntimeDependencies,
  loadReactVitePluginFactory,
} from './dependencies';

/**
 * The generic framework build layer already covers browser, SSR, and MPA build
 * hooks.
 * React only needs one extra hook so browser bundles can externalize the
 * shared runtime to `window.React` / `window.ReactDOM`.
 */
export interface ReactBuildAdapter extends UIFrameworkBuildAdapter {
  // externalize runtime (map framework runtime to window in browser build)
  externalizeRuntimePlugin: () => Plugin;
}

export class ReactAdapter implements ReactBuildAdapter {
  public readonly framework: typeof REACT_FRAMEWORK = REACT_FRAMEWORK;

  browserBundlerPlugins(): PluginOption[] {
    const resolutionBase = resolveCurrentDependencyResolutionBase();
    const plugins: PluginOption[] = [
      loadReactVitePluginFactory(resolutionBase).then((reactPlugin) =>
        reactPlugin(),
      ),
      this.externalizeRuntimePlugin(),
    ];
    return plugins.filter(Boolean);
  }

  ssrBundlerPlugins(): PluginOption[] {
    const resolutionBase = resolveCurrentDependencyResolutionBase();
    const plugins: PluginOption[] = [
      loadReactVitePluginFactory(resolutionBase).then((reactPlugin) =>
        reactPlugin(),
      ),
      createDirnameVarInjectionPlugin({
        name: DIRNAME_VARIABLE_INJECTION_PLUGIN_NAME,
        variableName: DIRNAME_VAR_NAME,
      }),
    ];
    return plugins.filter(Boolean);
  }

  clientEntryModule(): string {
    return '@docs-islands/vitepress/adapters/react/client';
  }

  clientEntryImportName(): string {
    return 'reactClient';
  }

  async buildModulePreloadPaths({
    assetsDir,
  }: {
    assetsDir: string;
  }): Promise<string[]> {
    const resolutionBase = resolveCurrentDependencyResolutionBase();
    const { reactDomPackageVersion, reactPackageVersion } =
      await loadReactRuntimeDependencies(resolutionBase);

    return [
      join('/', assetsDir, `chunks/react@${reactPackageVersion}.js`),
      join('/', assetsDir, `chunks/client@${reactDomPackageVersion}.js`),
    ];
  }

  createClientLoaderModuleSource(
    ...args: Parameters<
      UIFrameworkBuildAdapter['createClientLoaderModuleSource']
    >
  ): string {
    return createReactClientLoaderModuleSource(...args);
  }

  async renderToString(
    component: unknown,
    props: Record<string, string>,
  ): Promise<string> {
    const resolutionBase = resolveCurrentDependencyResolutionBase();
    const { React, ReactDOMServer } =
      await loadReactRuntimeDependencies(resolutionBase);

    return ReactDOMServer.renderToString(React.createElement(component, props));
  }

  externalizeRuntimePlugin(): Plugin {
    return {
      name: REACT_RUNTIME_EXTERNALIZATION_PLUGIN_NAME,
      enforce: 'pre',
      resolveId(id) {
        if (['react', 'react-dom'].includes(id)) {
          return `\0${id}.cjs`;
        }
        return null;
      },
      load(id) {
        if (id === '\0react.cjs') {
          return `module.exports = window.React;`;
        }
        if (id === '\0react-dom.cjs') {
          return `module.exports = window.ReactDOM;`;
        }
        return null;
      },
    };
  }
}

export const reactAdapter: ReactAdapter = new ReactAdapter();
