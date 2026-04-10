import { DIRNAME_VAR_NAME } from '#shared/constants';
import reactPlugin from '@vitejs/plugin-react-swc';
import { join } from 'pathe';
import React, { version as reactPackageVersion } from 'react';
import { version as reactDomPackageVersion } from 'react-dom';
import ReactDOMServer from 'react-dom/server';
import type { Plugin, PluginOption } from 'vite';
import { DIRNAME_VARIABLE_INJECTION_PLUGIN_NAME } from '../plugins/plugin-names';
import { createDirnameVarInjectionPlugin } from '../plugins/vite-plugin-dirname-var-injection';
import type { UIFrameworkBundlerAdapter } from '../ui-bundler/adapter';
import { createReactClientLoaderModuleSource } from './client-loader-module-source';
import { REACT_FRAMEWORK } from './framework';
import { REACT_RUNTIME_EXTERNALIZATION_PLUGIN_NAME } from './plugin-names';

/**
 * The generic UI bundler already covers browser, SSR, and MPA build hooks.
 * React only needs one extra hook so browser bundles can externalize the
 * shared runtime to `window.React` / `window.ReactDOM`.
 */
export interface ReactBuildAdapter extends UIFrameworkBundlerAdapter {
  // externalize runtime (map framework runtime to window in browser build)
  externalizeRuntimePlugin: () => Plugin;
}

export class ReactAdapter implements ReactBuildAdapter {
  public readonly framework: typeof REACT_FRAMEWORK = REACT_FRAMEWORK;

  browserBundlerPlugins(): Plugin[] {
    const plugins: PluginOption[] = [
      reactPlugin(),
      this.externalizeRuntimePlugin(),
    ];
    return plugins.filter((plugin): plugin is Plugin => Boolean(plugin));
  }

  ssrBundlerPlugins(): Plugin[] {
    const plugins: PluginOption[] = [
      reactPlugin(),
      createDirnameVarInjectionPlugin({
        name: DIRNAME_VARIABLE_INJECTION_PLUGIN_NAME,
        variableName: DIRNAME_VAR_NAME,
      }),
    ];
    return plugins.filter((plugin): plugin is Plugin => Boolean(plugin));
  }

  clientEntryModule(): string {
    return '@docs-islands/vitepress/react/client';
  }

  buildModulePreloadPaths({ assetsDir }: { assetsDir: string }): string[] {
    return [
      join('/', assetsDir, `chunks/react@${reactPackageVersion}.js`),
      join('/', assetsDir, `chunks/client@${reactDomPackageVersion}.js`),
    ];
  }

  createClientLoaderModuleSource(
    ...args: Parameters<
      UIFrameworkBundlerAdapter['createClientLoaderModuleSource']
    >
  ): string {
    return createReactClientLoaderModuleSource(...args);
  }

  renderToString(component: unknown, props: Record<string, string>): string {
    const Component = component as React.ComponentType<Record<string, string>>;
    return ReactDOMServer.renderToString(React.createElement(Component, props));
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
