import type { VueSourceProfile } from '#checkers';
import { getAstroParserIdentity } from './astro-compiler';
import { collectAstroImports } from './astro-imports';
import {
  collectSvelteImports,
  getSvelteParserIdentity,
} from './svelte-imports';
import type {
  FrameworkImportParserIdentity,
  FrameworkImportProvider,
} from './types';
import { collectVueImports } from './vue-imports';

const vueParserIdentity: FrameworkImportParserIdentity = {
  kind: 'vue-lightweight-source',
  mode: 'source-profile',
  version: '3',
};

function createVueProvider(): FrameworkImportProvider {
  return {
    collectionMode: 'sync',
    collectImports: (options) =>
      collectVueImports({
        ...options,
        sourceProfile: options.sourceProfile ?? 'vue-sfc',
      }),
    extension: '.vue',
    getParserIdentity: () => vueParserIdentity,
  };
}

const svelteProvider: FrameworkImportProvider = {
  collectionMode: 'async',
  collectImports: collectSvelteImports,
  extension: '.svelte',
  getParserIdentity: getSvelteParserIdentity,
};

const astroProvider: FrameworkImportProvider = {
  collectionMode: 'async',
  collectImports: collectAstroImports,
  extension: '.astro',
  getParserIdentity: getAstroParserIdentity,
};

export function createFrameworkImportProviderRegistry(): ReadonlyMap<
  string,
  FrameworkImportProvider
> {
  const providers = [astroProvider, createVueProvider(), svelteProvider];
  return new Map(providers.map((provider) => [provider.extension, provider]));
}

export function getFrameworkImportProvider(options: {
  filePath: string;
  providers: ReadonlyMap<string, FrameworkImportProvider>;
  sourceProfile?: VueSourceProfile;
}): FrameworkImportProvider | null {
  if (options.sourceProfile !== undefined) {
    return getProvider(options.providers, '.vue');
  }
  const extension = options.filePath.slice(options.filePath.lastIndexOf('.'));
  return getProvider(options.providers, extension);
}

function getProvider(
  providers: ReadonlyMap<string, FrameworkImportProvider>,
  extension: string,
): FrameworkImportProvider | null {
  return providers.get(extension) ?? null;
}

export function getTypeScriptParserIdentity(): FrameworkImportParserIdentity {
  return {
    kind: 'typescript-source',
    mode: 'oxc-with-typescript-fallback',
    version: 'builtin',
  };
}
