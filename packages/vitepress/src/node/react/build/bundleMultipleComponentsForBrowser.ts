import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type {
  BundleAssetMetric,
  BundleModuleMetric,
  ComponentBuildMetric,
  PageBuildMetrics,
  RuntimeBundleMetric,
  SpaSyncComponentSideEffectMetric,
} from '#dep-types/page';
import type { RollupOutput } from '#dep-types/rollup';
import type { ConfigType } from '#dep-types/utils';
import { RENDER_STRATEGY_CONSTANTS } from '#shared/constants';
import getLoggerInstance, { LightGeneralLogger } from '#shared/logger';
import { isNodeLikeBuiltin } from '@docs-islands/utils/builtin';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { basename, dirname, extname, join, relative } from 'pathe';
import type { InlineConfig } from 'vite';
import { build } from 'vite';
import { GET_CLEAN_PATHNAME_RUNTIME } from '../../../shared/runtime';
import type { FrameworkAdapter } from '../../core/framework-adapter';
import { reactAdapter } from '../adapter';
import { isOutputAsset, isOutputChunk, resolveSafeOutputPath } from './shared';

const loggerInstance = getLoggerInstance();
const Logger = loggerInstance.getLoggerByGroup(
  'bundle-multiple-components-for-browser',
);

type BuildOutputMetric = BundleAssetMetric & {
  dynamicImports?: string[];
  imports?: string[];
  modules?: BundleModuleMetric[];
};

const getBundleAssetBytes = (source: string | Uint8Array): number =>
  typeof source === 'string' ? Buffer.byteLength(source) : source.byteLength;

const getBundleAssetType = (fileName: string): BuildOutputMetric['type'] => {
  if (fileName.endsWith('.css')) {
    return 'css';
  }

  if (fileName.endsWith('.js') || fileName.endsWith('.mjs')) {
    return 'js';
  }

  return 'asset';
};

const sortBundleMetrics = <T>(
  metrics: Iterable<T>,
  compare: (left: T, right: T) => number,
): T[] => {
  const sortedMetrics = [...metrics];

  // Keep a copied-array sort so emitted package output stays ES2020-compatible.
  // eslint-disable-next-line unicorn/no-array-sort
  return sortedMetrics.sort(compare);
};

const sortBundleAssetMetrics = (
  metrics: Iterable<BundleAssetMetric>,
): BundleAssetMetric[] =>
  sortBundleMetrics(metrics, (left, right) =>
    left.file.localeCompare(right.file),
  );

const sortBundleModuleMetrics = (
  metrics: Iterable<BundleModuleMetric>,
): BundleModuleMetric[] =>
  sortBundleMetrics(metrics, (left, right) => {
    if (right.bytes !== left.bytes) {
      return right.bytes - left.bytes;
    }

    if (left.file !== right.file) {
      return left.file.localeCompare(right.file);
    }

    return left.id.localeCompare(right.id);
  });

const writeDebugSourceAsset = ({
  assetsDir,
  moduleId,
  outDir,
  sourceAssetCache,
}: {
  assetsDir: string;
  moduleId: string;
  outDir: string;
  sourceAssetCache: Map<string, string | undefined>;
}): string | undefined => {
  if (sourceAssetCache.has(moduleId)) {
    return sourceAssetCache.get(moduleId);
  }

  if (!fs.existsSync(moduleId) || !fs.statSync(moduleId).isFile()) {
    sourceAssetCache.set(moduleId, undefined);
    return undefined;
  }

  const extension = extname(moduleId) || '.txt';
  const safeBaseName = basename(moduleId, extension).replaceAll(
    /[^\w.-]/g,
    '_',
  );
  const hash = createHash('sha1').update(moduleId).digest('hex').slice(0, 8);
  const relativeFileName = join(
    assetsDir,
    'debug-sources',
    `${safeBaseName}.${hash}${extension}`,
  );
  const publicFileName = join('/', relativeFileName);

  try {
    const source = fs.readFileSync(moduleId, 'utf8');
    const targetPath = resolveSafeOutputPath(outDir, relativeFileName);

    if (!fs.existsSync(dirname(targetPath))) {
      fs.mkdirSync(dirname(targetPath), { recursive: true });
    }

    fs.writeFileSync(targetPath, source);
    sourceAssetCache.set(moduleId, publicFileName);
    return publicFileName;
  } catch {
    sourceAssetCache.set(moduleId, undefined);
    return undefined;
  }
};

function collectReferencedJsFiles(
  entryFile: string,
  outputMetricMap: Map<string, BuildOutputMetric>,
  seen = new Set<string>(),
): Set<string> {
  if (seen.has(entryFile)) {
    return seen;
  }

  const currentMetric = outputMetricMap.get(entryFile);
  if (!currentMetric || currentMetric.type !== 'js') {
    return seen;
  }

  seen.add(entryFile);

  for (const importFile of currentMetric.imports ?? []) {
    collectReferencedJsFiles(importFile, outputMetricMap, seen);
  }

  for (const importFile of currentMetric.dynamicImports ?? []) {
    collectReferencedJsFiles(importFile, outputMetricMap, seen);
  }

  return seen;
}

function createRuntimeBundleMetric(
  entryFile: string,
  outputMetricMap: Map<string, BuildOutputMetric>,
): RuntimeBundleMetric | null {
  const files = sortBundleAssetMetrics(
    [...collectReferencedJsFiles(entryFile, outputMetricMap)]
      .map((file) => outputMetricMap.get(file))
      .filter((metric): metric is BuildOutputMetric => Boolean(metric))
      .map(({ bytes, file, type }) => ({ bytes, file, type })),
  );

  if (files.length === 0) {
    return null;
  }

  return {
    entryFile,
    files,
    totalBytes: files.reduce((sum, metric) => sum + metric.bytes, 0),
  };
}

function createSpaSyncBuildEffects(
  usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  outputMetricMap: Map<string, BuildOutputMetric>,
): PageBuildMetrics['spaSyncEffects'] {
  const componentEffectMap = new Map<
    string,
    SpaSyncComponentSideEffectMetric
  >();

  for (const [renderId, usedSnippet] of usedSnippetContainer.entries()) {
    if (
      !usedSnippet.useSpaSyncRender ||
      usedSnippet.renderDirective === 'client:only'
    ) {
      continue;
    }

    const existing =
      componentEffectMap.get(usedSnippet.renderComponent) ??
      ({
        blockingCssBytes: 0,
        blockingCssCount: 0,
        blockingCssFiles: [],
        componentName: usedSnippet.renderComponent,
        embeddedHtmlPatches: [],
        embeddedHtmlBytes: 0,
        renderDirectives: [],
        renderIds: [],
        requiresCssLoadingRuntime: false,
      } satisfies SpaSyncComponentSideEffectMetric);

    existing.renderIds.push(renderId);

    if (!existing.renderDirectives.includes(usedSnippet.renderDirective)) {
      existing.renderDirectives.push(usedSnippet.renderDirective);
      existing.renderDirectives.sort();
    }

    if (usedSnippet.ssrHtml) {
      existing.embeddedHtmlPatches.push({
        bytes: getBundleAssetBytes(usedSnippet.ssrHtml),
        html: usedSnippet.ssrHtml,
        renderId,
      });
      existing.embeddedHtmlBytes += getBundleAssetBytes(usedSnippet.ssrHtml);
    }

    if (usedSnippet.ssrCssBundlePaths?.size) {
      existing.requiresCssLoadingRuntime = true;

      for (const cssFile of usedSnippet.ssrCssBundlePaths) {
        const metric = outputMetricMap.get(cssFile);

        if (!metric || metric.type !== 'css') {
          continue;
        }

        if (
          existing.blockingCssFiles.some((item) => item.file === metric.file)
        ) {
          continue;
        }

        existing.blockingCssFiles.push({
          bytes: metric.bytes,
          file: metric.file,
          type: metric.type,
        });
        existing.blockingCssBytes += metric.bytes;
      }
    }

    existing.blockingCssFiles = sortBundleAssetMetrics(
      existing.blockingCssFiles,
    );
    existing.blockingCssCount = existing.blockingCssFiles.length;
    existing.embeddedHtmlPatches = sortBundleMetrics(
      existing.embeddedHtmlPatches,
      (left, right) => left.renderId.localeCompare(right.renderId),
    );
    componentEffectMap.set(usedSnippet.renderComponent, existing);
  }

  if (componentEffectMap.size === 0) {
    return null;
  }

  const components = sortBundleMetrics(
    componentEffectMap.values(),
    (left, right) => left.componentName.localeCompare(right.componentName),
  );

  return {
    components,
    enabledComponentCount: components.length,
    enabledRenderCount: components.reduce(
      (sum, component) => sum + component.renderIds.length,
      0,
    ),
    totalBlockingCssBytes: components.reduce(
      (sum, component) => sum + component.blockingCssBytes,
      0,
    ),
    totalBlockingCssCount: components.reduce(
      (sum, component) => sum + component.blockingCssCount,
      0,
    ),
    totalEmbeddedHtmlBytes: components.reduce(
      (sum, component) => sum + component.embeddedHtmlBytes,
      0,
    ),
    usesCssLoadingRuntime: components.some(
      (component) => component.requiresCssLoadingRuntime,
    ),
  };
}

function createUnifiedLoaderEntryCode(
  base: string,
  cleanUrls: boolean,
  componentEntries: {
    componentName: string;
    modulePath: string;
    importReference: { importedName: string; identifier: string };
  }[],
): string {
  const getCleanPathnameRuntime = GET_CLEAN_PATHNAME_RUNTIME.toString();
  const loaderEntries = componentEntries.map((entry) => ({
    componentName: entry.componentName,
    modulePath: entry.modulePath,
    importedName: entry.importReference.importedName,
  }));

  return `
const getPageId = ${getCleanPathnameRuntime};

const componentEntries = ${JSON.stringify(loaderEntries, null, 2)};

const resolveComponentExport = (module, importedName) => {
  if (importedName === 'default') {
    return module.default;
  }
  if (importedName === '*') {
    return module;
  }
  return module[importedName];
};

(async function() {
  const pageId = getPageId(${JSON.stringify(base)}, ${JSON.stringify(cleanUrls)});

  const componentManager = window["${RENDER_STRATEGY_CONSTANTS.componentManager}"];
  if (!componentManager) {
    throw new Error('ReactComponentManager is not initialized');
  }

  await componentManager.subscribeRuntimeReady();
  const injectComponent = window["${RENDER_STRATEGY_CONSTANTS.injectComponent}"];
  if (!injectComponent) {
    throw new Error('ReactComponentRegistry is not initialized');
  }

  if (!injectComponent[pageId]) {
    injectComponent[pageId] = {};
  }

  /**
   * Before dynamically importing React components,
   * you must inject the React runtime globally, otherwise component parsing will fail.
   */
  await componentManager.loadReact();

  const loadResults = await Promise.allSettled(
    componentEntries.map(async ({ componentName: name, modulePath, importedName }) => {
      try {
        const module = await import(/* @vite-ignore */ modulePath);
        const Component = resolveComponentExport(module, importedName);
        if (!Component) {
          return { name, success: false };
        }

        if (!injectComponent[pageId][name]) {
          injectComponent[pageId][name] = {};
        }

        /**
         * In production environment, unlike development,
         * we don't need to inject path and importedName fields for HMR.
         */
        injectComponent[pageId][name].component = Component;
        componentManager.notifyComponentLoaded(pageId, name);
        return { name, success: true };
      } catch (error) {
        ${
          LightGeneralLogger(
            'error',
            `'Failed to load component ' + name + ': ' + (error instanceof Error ? error.message : String(error))`,
            'react-client-render',
          ).formatText
        }
        return { name, success: false };
      }
    })
  );

  const successCount = loadResults.filter(result =>
    result.status === 'fulfilled' && result.value.success
  ).length;

  ${
    LightGeneralLogger(
      'success',
      `Loaded \${successCount} / \${componentEntries.length} React components for page: \${pageId}`,
      'react-client-render',
    ).formatText
  }
})();
  `.trim();
}

async function bundleRuntimeModuleWithVite(
  config: Pick<
    ConfigType,
    'root' | 'outDir' | 'assetsDir' | 'cacheDir' | 'base'
  >,
  runtimeModule: {
    entryFileBaseName: string;
    source: string;
  },
): Promise<{
  entryFile: string;
  metric: RuntimeBundleMetric | null;
}> {
  const tempEntryDir = join(
    config.cacheDir,
    `${runtimeModule.entryFileBaseName}-entry-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
  );
  const tempEntryPath = join(
    tempEntryDir,
    `${runtimeModule.entryFileBaseName}-entry.mjs`,
  );

  fs.mkdirSync(tempEntryDir, { recursive: true });
  fs.writeFileSync(tempEntryPath, runtimeModule.source);

  try {
    const result = (await build({
      root: config.root,
      base: config.base,
      cacheDir: join(config.cacheDir, 'vite-runtime-modules'),
      configFile: false,
      publicDir: false,
      logLevel: 'warn',
      build: {
        outDir: config.outDir,
        emptyOutDir: false,
        write: false,
        target: 'es2020',
        minify: true,
        rollupOptions: {
          input: tempEntryPath,
          preserveEntrySignatures: 'allow-extension',
          output: {
            format: 'esm',
            assetFileNames: `${config.assetsDir}/${runtimeModule.entryFileBaseName}.[hash].[ext]`,
            entryFileNames: `${config.assetsDir}/${runtimeModule.entryFileBaseName}.[hash].js`,
            chunkFileNames: `${config.assetsDir}/chunks/${runtimeModule.entryFileBaseName}.[hash].js`,
          },
        },
      },
    })) as RollupOutput | RollupOutput[];

    const output = Array.isArray(result) ? result[0] : result;
    if (!output?.output || output.output.length === 0) {
      throw new Error(
        `Expected ${runtimeModule.entryFileBaseName} bundle output`,
      );
    }

    let runtimeScriptRelativePath = '';
    const outputMetricMap = new Map<string, BuildOutputMetric>();

    for (const chunk of output.output) {
      const fullOutputPath = resolveSafeOutputPath(
        config.outDir,
        chunk.fileName,
      );
      if (!fs.existsSync(dirname(fullOutputPath))) {
        fs.mkdirSync(dirname(fullOutputPath), { recursive: true });
      }

      if (isOutputChunk(chunk)) {
        fs.writeFileSync(fullOutputPath, chunk.code);
        const relativePath = join('/', chunk.fileName);
        outputMetricMap.set(relativePath, {
          bytes: Buffer.byteLength(chunk.code),
          dynamicImports: chunk.dynamicImports.map((file) => join('/', file)),
          file: relativePath,
          imports: chunk.imports.map((file) => join('/', file)),
          type: 'js',
        });
        if (chunk.isEntry) {
          runtimeScriptRelativePath = relativePath;
        }
      } else if (isOutputAsset(chunk)) {
        fs.writeFileSync(fullOutputPath, chunk.source);
        const relativePath = join('/', chunk.fileName);
        outputMetricMap.set(relativePath, {
          bytes: getBundleAssetBytes(chunk.source),
          file: relativePath,
          type: getBundleAssetType(chunk.fileName),
        });
      }
    }

    if (!runtimeScriptRelativePath) {
      throw new Error(
        `Failed to locate ${runtimeModule.entryFileBaseName} entry output`,
      );
    }

    return {
      entryFile: runtimeScriptRelativePath,
      metric: createRuntimeBundleMetric(
        runtimeScriptRelativePath,
        outputMetricMap,
      ),
    };
  } finally {
    fs.rmSync(tempEntryDir, { recursive: true, force: true });
  }
}

export async function bundleMultipleComponentsForBrowser(
  config: ConfigType,
  components: ComponentBundleInfo[],
  usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  adapter: FrameworkAdapter = reactAdapter,
): Promise<{
  buildMetrics: PageBuildMetrics;
  loaderScript: string;
  modulePreloads: string[];
  cssBundlePaths: string[];
  ssrInjectScript: string;
}> {
  const { base, srcDir, assetsDir, outDir, wrapBaseUrl, cleanUrls } = config;
  if (components.length === 0) {
    return {
      buildMetrics: {
        components: [],
        framework: 'react',
        loader: null,
        spaSyncEffects: null,
        ssrInject: null,
        totalEstimatedComponentBytes: 0,
      },
      loaderScript: '',
      modulePreloads: [],
      cssBundlePaths: [],
      ssrInjectScript: '',
    };
  }

  const entryPoints: Record<string, string> = {};
  const componentMapping = new Map<string, ComponentBundleInfo>();

  for (const comp of components) {
    const entryKey = comp.componentName;
    entryPoints[entryKey] = comp.componentPath;
    componentMapping.set(comp.componentPath, comp);
  }

  try {
    const sourceAssetCache = new Map<string, string | undefined>();
    const viteConfig: InlineConfig = {
      root: srcDir,
      base,
      build: {
        ssr: false,
        rollupOptions: {
          input: entryPoints,
          preserveEntrySignatures: 'allow-extension',
          external: (id) => {
            /**
             * Components using only the `ssr:only` directive will also go through the client-side build process,
             * so node modules need to be externalized.
             */
            if (isNodeLikeBuiltin(id)) {
              return true;
            }
            return false;
          },
          output: {
            format: 'esm',
            assetFileNames: `${assetsDir}/[name].[hash].[ext]`,
            entryFileNames: `${assetsDir}/[name].[hash].js`,
            chunkFileNames: `${assetsDir}/chunks/[name].[hash].js`,
          },
        },
        write: false,
        target: 'es2020',
        minify: true,
        manifest: true,
        assetsInlineLimit: 4096,
        cssCodeSplit: true,
      },
      plugins: adapter.browserBundlerPlugins(),
      logLevel: 'warn',
    };

    const output = await build(viteConfig);
    if (!output || !('output' in output) || !Array.isArray(output.output)) {
      throw new Error('Expected a array output bundle');
    }

    const componentEntries: {
      componentPath: string;
      componentName: string;
      cssBundlePath: string[];
      assetsBundlePath: string[];
      modulePath: string;
      importReference: { importedName: string; identifier: string };
      pendingRenderIds: Set<string>;
      renderDirectives: ComponentBundleInfo['renderDirectives'];
    }[] = [];
    const modulePreloads: string[] = [];
    const cssBundlePaths: string[] = [];
    const preRenderComponentNameToCssBundlePathsMap = new Map<
      string,
      Set<string>
    >();
    const outputMetricMap = new Map<string, BuildOutputMetric>();

    for (const chunk of output.output) {
      if (isOutputChunk(chunk) && chunk.isEntry && chunk.facadeModuleId) {
        const fullEntryPointPath = chunk.facadeModuleId;
        const clientComponentInfo = componentMapping.get(fullEntryPointPath);

        if (!clientComponentInfo) continue;

        const componentModuleRelativePath = join('/', chunk.fileName);

        const importedCss = [...(chunk.viteMetadata?.importedCss ?? [])];
        const publicCssBundlePaths = importedCss.map((css) => join('/', css));

        /**
         * If the rendering component in the current page is NOT only rendered with client:only strategy,
         * it means that the rendering component needs server-side pre-rendering or other strategies.
         */
        if (
          !clientComponentInfo.renderDirectives.has('client:only') ||
          clientComponentInfo.renderDirectives.size > 1
        ) {
          preRenderComponentNameToCssBundlePathsMap.set(
            clientComponentInfo.componentName,
            new Set(publicCssBundlePaths),
          );
        }

        /**
         * If the component is ssr:only and the only directive is ssr:only,
         * At this time, we don't need to inject client code.
         */
        if (
          clientComponentInfo.renderDirectives.has('ssr:only') &&
          clientComponentInfo.renderDirectives.size === 1
        ) {
          continue;
        }

        const importedAssets = [...(chunk.viteMetadata?.importedAssets ?? [])];
        const publicAssetsBundlePaths = importedAssets.map((asset) =>
          join('/', asset),
        );

        componentEntries.push({
          componentPath: clientComponentInfo.componentPath,
          componentName: clientComponentInfo.componentName,
          cssBundlePath: publicCssBundlePaths,
          assetsBundlePath: publicAssetsBundlePaths,
          modulePath: componentModuleRelativePath,
          importReference: clientComponentInfo.importReference,
          pendingRenderIds: clientComponentInfo.pendingRenderIds,
          renderDirectives: clientComponentInfo.renderDirectives,
        });
      }

      if (isOutputChunk(chunk)) {
        const fullOutputPath = resolveSafeOutputPath(outDir, chunk.fileName);
        const code = chunk.code;
        if (!fs.existsSync(dirname(fullOutputPath))) {
          fs.mkdirSync(dirname(fullOutputPath), { recursive: true });
        }
        fs.writeFileSync(fullOutputPath, code);
        const relativeOutputPath = join('/', chunk.fileName);
        outputMetricMap.set(relativeOutputPath, {
          bytes: Buffer.byteLength(code),
          dynamicImports: chunk.dynamicImports.map((file) => join('/', file)),
          file: relativeOutputPath,
          imports: chunk.imports.map((file) => join('/', file)),
          modules: Object.entries(chunk.modules ?? {})
            .map(([id, moduleInfo]) => ({
              bytes:
                typeof moduleInfo.renderedLength === 'number'
                  ? moduleInfo.renderedLength
                  : 0,
              file: relativeOutputPath,
              id,
              sourceAssetFile: writeDebugSourceAsset({
                assetsDir,
                moduleId: id,
                outDir,
                sourceAssetCache,
              }),
              sourcePath: fs.existsSync(id) ? id : undefined,
            }))
            .filter((metric) => metric.bytes > 0),
          type: 'js',
        });
        modulePreloads.push(relativeOutputPath);
      }

      if (isOutputAsset(chunk)) {
        const fullOutputPath = resolveSafeOutputPath(outDir, chunk.fileName);
        const code = chunk.source;
        if (!fs.existsSync(dirname(fullOutputPath))) {
          fs.mkdirSync(dirname(fullOutputPath), { recursive: true });
        }
        fs.writeFileSync(fullOutputPath, code);
        const relativeOutputPath = join('/', chunk.fileName);
        outputMetricMap.set(relativeOutputPath, {
          bytes: getBundleAssetBytes(code),
          file: relativeOutputPath,
          type: getBundleAssetType(chunk.fileName),
        });
        if (chunk.fileName.endsWith('.css')) {
          cssBundlePaths.push(relativeOutputPath);
        }
      }
    }

    const componentBuildMetrics: ComponentBuildMetric[] = componentEntries.map(
      (entry) => {
        const files = new Map<string, BundleAssetMetric>();
        const modules = new Map<string, BundleModuleMetric>();

        for (const jsFile of collectReferencedJsFiles(
          entry.modulePath,
          outputMetricMap,
        )) {
          const metric = outputMetricMap.get(jsFile);
          if (metric) {
            files.set(metric.file, {
              bytes: metric.bytes,
              file: metric.file,
              type: metric.type,
            });

            for (const moduleMetric of metric.modules ?? []) {
              modules.set(
                `${moduleMetric.file}::${moduleMetric.id}`,
                moduleMetric,
              );
            }
          }
        }

        for (const file of [
          ...entry.cssBundlePath,
          ...entry.assetsBundlePath,
        ]) {
          const metric = outputMetricMap.get(file);
          if (metric) {
            files.set(metric.file, {
              bytes: metric.bytes,
              file: metric.file,
              type: metric.type,
            });
          }
        }

        const metricFiles = sortBundleAssetMetrics(files.values());
        const estimatedJsBytes = metricFiles
          .filter((file) => file.type === 'js')
          .reduce((sum, file) => sum + file.bytes, 0);
        const estimatedCssBytes = metricFiles
          .filter((file) => file.type === 'css')
          .reduce((sum, file) => sum + file.bytes, 0);
        const estimatedAssetBytes = metricFiles
          .filter((file) => file.type === 'asset')
          .reduce((sum, file) => sum + file.bytes, 0);

        return {
          componentName: entry.componentName,
          entryFile: entry.modulePath,
          estimatedAssetBytes,
          estimatedCssBytes,
          estimatedJsBytes,
          estimatedTotalBytes:
            estimatedJsBytes + estimatedCssBytes + estimatedAssetBytes,
          files: metricFiles,
          framework: 'react',
          modules: sortBundleModuleMetrics(modules.values()),
          renderDirectives: sortBundleMetrics(
            entry.renderDirectives,
            (left, right) => left.localeCompare(right),
          ),
          sourcePath: relative(srcDir, entry.componentPath),
        };
      },
    );

    const ssrInjectCodeSnippet: string[] = [];
    for (const [renderId, usedSnippet] of usedSnippetContainer.entries()) {
      if (usedSnippet.ssrHtml && !usedSnippet.useSpaSyncRender) {
        if (ssrInjectCodeSnippet.length === 0) {
          ssrInjectCodeSnippet.push(
            'export const __SSR_INJECT_CODE__ = () => {',
          );
        }
        ssrInjectCodeSnippet.push(`
          const __SSR_DOM_${usedSnippet.renderId}__ = document.querySelector('[${RENDER_STRATEGY_CONSTANTS.renderId}="${renderId}"]');
          if (__SSR_DOM_${usedSnippet.renderId}__) {
            __SSR_DOM_${usedSnippet.renderId}__.innerHTML = \`${usedSnippet.ssrHtml}\`;
          }
          `);
      } else if (usedSnippet.useSpaSyncRender) {
        /**
         * When rendering using the spa:sync-render instruction,
         * if not rendered with the client:only strategy,
         * the page rendering in route switching scenarios needs to wait
         * until the corresponding rendering component's styles are loaded before rendering.
         */
        if (
          preRenderComponentNameToCssBundlePathsMap.has(
            usedSnippet.renderComponent,
          )
        ) {
          usedSnippet.ssrCssBundlePaths =
            preRenderComponentNameToCssBundlePathsMap.get(
              usedSnippet.renderComponent,
            );
        }
      }
    }
    const spaSyncEffects = createSpaSyncBuildEffects(
      usedSnippetContainer,
      outputMetricMap,
    );

    if (ssrInjectCodeSnippet.length > 0) {
      ssrInjectCodeSnippet.push('};');
    }

    const unifiedLoaderCode = createUnifiedLoaderEntryCode(
      base,
      cleanUrls,
      componentEntries.map((entry) => ({
        ...entry,
        modulePath: wrapBaseUrl(entry.modulePath),
      })),
    );
    const loaderBuildResult = await bundleRuntimeModuleWithVite(config, {
      entryFileBaseName: 'unified-loader',
      source: unifiedLoaderCode,
    });

    let ssrInjectScriptRelativePath = '';
    let ssrInjectMetric: RuntimeBundleMetric | null = null;
    if (ssrInjectCodeSnippet.length > 0) {
      const ssrInjectBuildResult = await bundleRuntimeModuleWithVite(config, {
        entryFileBaseName: 'ssr-inject-code',
        source: ssrInjectCodeSnippet.join('\n'),
      });
      ssrInjectScriptRelativePath = ssrInjectBuildResult.entryFile;
      ssrInjectMetric = ssrInjectBuildResult.metric;
    }

    Logger.success(`Bundle multiple components for browser completed`);

    return {
      buildMetrics: {
        components: componentBuildMetrics,
        framework: 'react',
        loader: loaderBuildResult.metric,
        spaSyncEffects,
        ssrInject: ssrInjectMetric,
        totalEstimatedComponentBytes: componentBuildMetrics.reduce(
          (sum, metric) => sum + metric.estimatedTotalBytes,
          0,
        ),
      },
      loaderScript: loaderBuildResult.entryFile,
      modulePreloads,
      cssBundlePaths,
      ssrInjectScript: ssrInjectScriptRelativePath,
    };
  } catch (error) {
    Logger.error(`Failed to bundle multiple components: ${error}`);
    throw error;
  }
}
