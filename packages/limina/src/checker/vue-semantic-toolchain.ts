import { normalizeAbsolutePath } from '#utils/path';
import { isPlainRecord } from '#utils/values';
import { createRequire } from 'node:module';
import type ts from 'typescript';
import type {
  VolarTypeScriptRuntime,
  VueLanguageRuntime,
  VueSemanticAdapter,
  VueSemanticAdapterFamily,
  VueSemanticToolchain,
  VueSemanticToolchainPaths,
  VueSemanticVersionTuple,
} from './vue-semantic-types';

interface NumericVersion {
  major: number;
  minor: number;
  patch: number;
}

interface AdapterContract {
  family: VueSemanticAdapterFamily;
  languageCoreMajor: number;
  languageCoreMinor: number;
  maximumPatch: number;
  minimumPatch: number;
  volarMaximumPatch: number;
  volarMinimumPatch: number;
}

const adapterContracts: readonly AdapterContract[] = [
  {
    family: 'vue-tsc-2.2',
    languageCoreMajor: 2,
    languageCoreMinor: 2,
    maximumPatch: 12,
    minimumPatch: 0,
    volarMaximumPatch: 28,
    volarMinimumPatch: 11,
  },
  {
    family: 'vue-tsc-3.2',
    languageCoreMajor: 3,
    languageCoreMinor: 2,
    maximumPatch: 4,
    minimumPatch: 0,
    volarMaximumPatch: 27,
    volarMinimumPatch: 27,
  },
];

const supportedTypeScriptMinorRanges = [
  { major: 5, maximumMinor: 9, minimumMinor: 4 },
  { major: 6, maximumMinor: 0, minimumMinor: 0 },
] as const;

const languageCoreFunctions = [
  'createLanguage',
  'createParsedCommandLine',
  'createVueLanguagePlugin',
  'getAllExtensions',
] as const;

function readManifestVersion(manifestPath: string): string {
  const manifest = createRequire(manifestPath)(manifestPath) as unknown;
  if (!isPlainRecord(manifest) || typeof manifest.version !== 'string') {
    throw new TypeError(
      `Package manifest ${manifestPath} does not expose a string version.`,
    );
  }
  return manifest.version;
}

function resolvePackageManifest(
  requireFromVueTsc: NodeRequire,
  packageName: string,
): string {
  return normalizeAbsolutePath(
    requireFromVueTsc.resolve(`${packageName}/package.json`),
  );
}

function resolveToolchainPaths(configPath: string): {
  paths: VueSemanticToolchainPaths;
  requireFromVueTsc: NodeRequire;
} {
  const requireFromProject = createRequire(configPath);
  const vueTsc = normalizeAbsolutePath(
    requireFromProject.resolve('vue-tsc/package.json'),
  );
  const requireFromVueTsc = createRequire(vueTsc);
  return {
    paths: {
      languageCore: resolvePackageManifest(
        requireFromVueTsc,
        '@vue/language-core',
      ),
      typeScript: resolvePackageManifest(requireFromVueTsc, 'typescript'),
      volarTypeScript: resolvePackageManifest(
        requireFromVueTsc,
        '@volar/typescript',
      ),
      vueTsc,
    },
    requireFromVueTsc,
  };
}

function readVersionTuple(
  paths: VueSemanticToolchainPaths,
): VueSemanticVersionTuple {
  return {
    languageCore: readManifestVersion(paths.languageCore),
    typeScript: readManifestVersion(paths.typeScript),
    volarTypeScript: readManifestVersion(paths.volarTypeScript),
    vueTsc: readManifestVersion(paths.vueTsc),
  };
}

function parseNumericVersion(version: string): NumericVersion | null {
  const match = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)/u.exec(version);
  if (match?.groups === undefined) return null;
  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
  };
}

function hasMajorMinor(
  version: NumericVersion | null,
  major: number,
  minor: number,
): boolean {
  return version?.major === major && version.minor === minor;
}

function isPatchWithin(
  version: NumericVersion | null,
  minimum: number,
  maximum: number,
): boolean {
  if (version === null) return false;
  return version.patch >= minimum && version.patch <= maximum;
}

function supportsTypeScript(version: NumericVersion | null): boolean {
  if (version === null) return false;
  return supportedTypeScriptMinorRanges.some((range) =>
    [
      version.major === range.major,
      version.minor >= range.minimumMinor,
      version.minor <= range.maximumMinor,
    ].every(Boolean),
  );
}

function matchesAdapterContract(
  tuple: VueSemanticVersionTuple,
  contract: AdapterContract,
): boolean {
  const vueTsc = parseNumericVersion(tuple.vueTsc);
  const languageCore = parseNumericVersion(tuple.languageCore);
  const volarTypeScript = parseNumericVersion(tuple.volarTypeScript);
  const typeScript = parseNumericVersion(tuple.typeScript);
  return [
    hasMajorMinor(
      vueTsc,
      contract.languageCoreMajor,
      contract.languageCoreMinor,
    ),
    isPatchWithin(vueTsc, contract.minimumPatch, contract.maximumPatch),
    hasMajorMinor(
      languageCore,
      contract.languageCoreMajor,
      contract.languageCoreMinor,
    ),
    tuple.vueTsc === tuple.languageCore,
    hasMajorMinor(volarTypeScript, 2, 4),
    isPatchWithin(
      volarTypeScript,
      contract.volarMinimumPatch,
      contract.volarMaximumPatch,
    ),
    supportsTypeScript(typeScript),
  ].every(Boolean);
}

function resolveAdapterFamily(
  tuple: VueSemanticVersionTuple,
): VueSemanticAdapterFamily | null {
  const contract = adapterContracts.find((candidate) =>
    matchesAdapterContract(tuple, candidate),
  );
  return contract?.family ?? null;
}

function formatVersionTuple(tuple: VueSemanticVersionTuple): string {
  return `vue-tsc ${tuple.vueTsc}, @vue/language-core ${tuple.languageCore}, @volar/typescript ${tuple.volarTypeScript}, TypeScript ${tuple.typeScript}`;
}

export function resolveVueSemanticAdapter(
  tuple: VueSemanticVersionTuple,
): VueSemanticAdapter {
  const family = resolveAdapterFamily(tuple);
  if (family !== null) return { family, kind: 'supported' };
  return {
    kind: 'unsupported',
    reason: `Unsupported Vue semantic adapter tuple: ${formatVersionTuple(tuple)}.`,
  };
}

export function isSupportedVueSemanticVersionTuple(
  tuple: VueSemanticVersionTuple,
): boolean {
  return resolveVueSemanticAdapter(tuple).kind === 'supported';
}

function hasFunctionProperties(
  value: Record<string, unknown>,
  properties: readonly string[],
): boolean {
  return properties.every((property) => typeof value[property] === 'function');
}

function assertLanguageCoreRuntime(value: unknown): VueLanguageRuntime {
  if (
    !isPlainRecord(value) ||
    !hasFunctionProperties(value, languageCoreFunctions)
  ) {
    throw new TypeError(
      '@vue/language-core does not expose the approved semantic adapter API shape.',
    );
  }
  return value as unknown as VueLanguageRuntime;
}

function assertVolarTypeScriptRuntime(value: unknown): VolarTypeScriptRuntime {
  if (
    !isPlainRecord(value) ||
    !hasFunctionProperties(value, ['createLanguageServiceHost'])
  ) {
    throw new TypeError(
      '@volar/typescript does not expose createLanguageServiceHost.',
    );
  }
  return value as unknown as VolarTypeScriptRuntime;
}

function assertTypeScriptRuntime(value: unknown): typeof ts {
  if (
    !isPlainRecord(value) ||
    !hasFunctionProperties(value, [
      'createLanguageService',
      'parseJsonSourceFileConfigFileContent',
      'readJsonConfigFile',
    ])
  ) {
    throw new TypeError(
      'The Vue checker TypeScript package does not expose the approved compiler API shape.',
    );
  }
  return value as unknown as typeof ts;
}

export function resolveVueSemanticToolchain(
  configPath: string,
): VueSemanticToolchain {
  const resolved = resolveToolchainPaths(configPath);
  const versions = readVersionTuple(resolved.paths);
  return {
    adapter: resolveVueSemanticAdapter(versions),
    languageCore: assertLanguageCoreRuntime(
      resolved.requireFromVueTsc('@vue/language-core'),
    ),
    paths: resolved.paths,
    tsModule: assertTypeScriptRuntime(resolved.requireFromVueTsc('typescript')),
    versions,
    volarTypeScript: assertVolarTypeScriptRuntime(
      resolved.requireFromVueTsc('@volar/typescript'),
    ),
  };
}
