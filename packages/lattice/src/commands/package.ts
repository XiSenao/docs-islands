import {
  checkPackage,
  createPackageFromTarballData,
  type Problem,
} from '@arethetypeswrong/core';
import { createElapsedTimer } from '@docs-islands/logger/helper';
import { pack } from '@publint/pack';
import { init, parse } from 'es-module-lexer';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';
import type {
  PackageAttwProfile,
  PackageCheckTarget,
  PackageCheckTool,
  PackageCheckToolSelection,
  ResolvedLatticeConfig,
  RuntimeEnvironment,
} from '../config';
import { PackageLogger } from '../logger';
import { toRelativePath } from '../utils/path';
import { getPackageRootSpecifier } from '../workspace';

interface DistPackageJson {
  dependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
  name: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface PublishedPackageBoundaryTarget {
  distDir: string;
  environment?:
    | RuntimeEnvironment
    | ((relativeFilePath: string) => RuntimeEnvironment);
  ignoredExternalPackages?: string[];
}

export interface PublishedPackageBoundaryViolation {
  environment: RuntimeEnvironment;
  filePath: string;
  message: string;
  specifier: string;
}

interface PackedDistTarball {
  cleanup: () => Promise<void>;
  tarball: Buffer;
}

interface SelfSpecifierMatchers {
  exact: Set<string>;
  prefixes: string[];
}

export interface RunPackageCheckOptions {
  attwProfile?: PackageAttwProfile;
  config: ResolvedLatticeConfig;
  targetName?: string;
  tool?: PackageCheckToolSelection;
}

const DEFAULT_PACKAGE_CHECKS: PackageCheckTool[] = [
  'publint',
  'attw',
  'boundary',
];
const PACKAGE_CHECK_TOOLS = new Set<PackageCheckTool>(DEFAULT_PACKAGE_CHECKS);
const ATTW_PROFILE_IGNORED_RESOLUTIONS: Record<PackageAttwProfile, string[]> = {
  strict: [],
  node16: [],
  'esm-only': ['node16-cjs'],
};
const nodeBuiltinSpecifiers = new Set(
  builtinModules.flatMap((specifier) =>
    specifier.startsWith('node:')
      ? [specifier, specifier.slice('node:'.length)]
      : [specifier, `node:${specifier}`],
  ),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPackageCheckTool(value: string): value is PackageCheckTool {
  return PACKAGE_CHECK_TOOLS.has(value as PackageCheckTool);
}

function isRelativeOrAbsoluteSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('file:') ||
    specifier.startsWith('http:') ||
    specifier.startsWith('https:') ||
    specifier.startsWith('data:')
  );
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function collectSelfSpecifierMatchers(
  packageName: string,
  exportsField: DistPackageJson['exports'],
): SelfSpecifierMatchers {
  const exact = new Set<string>([packageName]);
  const prefixes: string[] = [];

  if (!isRecord(exportsField)) {
    return {
      exact,
      prefixes,
    };
  }

  for (const exportKey of Object.keys(exportsField)) {
    if (exportKey === '.') {
      exact.add(packageName);
      continue;
    }

    if (!exportKey.startsWith('./')) {
      continue;
    }

    const normalizedSubpath = exportKey.slice('./'.length);

    if (normalizedSubpath.length === 0) {
      continue;
    }

    const wildcardIndex = normalizedSubpath.indexOf('*');

    if (wildcardIndex !== -1) {
      prefixes.push(
        `${packageName}/${normalizedSubpath.slice(0, wildcardIndex)}`,
      );
      continue;
    }

    exact.add(`${packageName}/${normalizedSubpath}`);
  }

  return {
    exact,
    prefixes,
  };
}

function isAllowedSelfSpecifier(
  specifier: string,
  matchers: SelfSpecifierMatchers,
): boolean {
  return (
    matchers.exact.has(specifier) ||
    matchers.prefixes.some((prefix) => specifier.startsWith(prefix))
  );
}

function normalizePublishedModulePath(relativeFilePath: string): string {
  return relativeFilePath.replaceAll('\\', '/');
}

function classifyRuntimeEnvironment(
  target: PublishedPackageBoundaryTarget,
  relativeFilePath: string,
): RuntimeEnvironment {
  if (typeof target.environment === 'function') {
    return target.environment(relativeFilePath);
  }

  if (target.environment) {
    return target.environment;
  }

  const normalizedPath = normalizePublishedModulePath(relativeFilePath);

  return normalizedPath.startsWith('node/') ||
    normalizedPath.startsWith('plugin/')
    ? 'node'
    : 'browser';
}

async function collectPublishedModuleFiles(
  directoryPath: string,
): Promise<string[]> {
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectPublishedModuleFiles(absolutePath)));
      continue;
    }

    if (/\.[cm]?js$/u.test(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

function validatePublishedSpecifier(options: {
  allowedExternalPackages: Set<string>;
  environment: RuntimeEnvironment;
  packageName: string;
  selfSpecifiers: SelfSpecifierMatchers;
  specifier: string;
}): string | null {
  const {
    allowedExternalPackages,
    environment,
    packageName,
    selfSpecifiers,
    specifier,
  } = options;

  if (isRelativeOrAbsoluteSpecifier(specifier)) {
    return null;
  }

  if (nodeBuiltinSpecifiers.has(specifier)) {
    if (environment === 'node') {
      return null;
    }

    return `browser/runtime output must not import Node builtin "${specifier}"`;
  }

  const packageRoot = getPackageRootSpecifier(specifier);

  if (packageRoot === packageName) {
    if (isAllowedSelfSpecifier(specifier, selfSpecifiers)) {
      return null;
    }

    return `self import "${specifier}" is not exposed by dist/package.json exports`;
  }

  if (allowedExternalPackages.has(packageRoot)) {
    return null;
  }

  return `"${specifier}" resolves to package "${packageRoot}" which is not listed in dependencies, peerDependencies, optionalDependencies, or self exports`;
}

function formatAttwProblem(problem: Problem): string {
  const resolutionKind =
    'resolutionKind' in problem
      ? ` [resolution: ${problem.resolutionKind}]`
      : '';
  const entrypoint =
    'entrypoint' in problem ? ` [entrypoint: ${problem.entrypoint}]` : '';

  switch (problem.kind) {
    case 'NoResolution': {
      return `No resolution${resolutionKind}${entrypoint}`;
    }
    case 'UntypedResolution': {
      return `Untyped resolution${resolutionKind}${entrypoint}`;
    }
    case 'FalseESM': {
      return `False ESM: ${problem.typesFileName} -> ${problem.implementationFileName}`;
    }
    case 'FalseCJS': {
      return `False CJS: ${problem.typesFileName} -> ${problem.implementationFileName}`;
    }
    case 'CJSResolvesToESM': {
      return `CJS resolves to ESM${resolutionKind}${entrypoint}`;
    }
    case 'FallbackCondition': {
      return `Fallback condition used${resolutionKind}${entrypoint}`;
    }
    case 'NamedExports': {
      return problem.isMissingAllNamed
        ? `Named exports missing: all named exports [types: ${problem.typesFileName}] [implementation: ${problem.implementationFileName}]`
        : `Named exports missing: ${problem.missing.join(', ') || '(none)'} [types: ${problem.typesFileName}] [implementation: ${problem.implementationFileName}]`;
    }
    case 'FalseExportDefault': {
      return `False export default [types: ${problem.typesFileName}] [implementation: ${problem.implementationFileName}]`;
    }
    case 'MissingExportEquals': {
      return `Missing export equals [types: ${problem.typesFileName}] [implementation: ${problem.implementationFileName}]`;
    }
    case 'InternalResolutionError': {
      return `Internal resolution error in ${problem.fileName} [option: ${problem.resolutionOption}] [module: ${problem.moduleSpecifier}]`;
    }
    case 'UnexpectedModuleSyntax': {
      return `Unexpected module syntax in ${problem.fileName}`;
    }
    case 'CJSOnlyExportsDefault': {
      return `CJS only exports default in ${problem.fileName}`;
    }
    default: {
      return `Unknown ATTW problem: ${JSON.stringify(problem)}`;
    }
  }
}

function normalizeTargetChecks(target: PackageCheckTarget): PackageCheckTool[] {
  const checks = target.checks ?? DEFAULT_PACKAGE_CHECKS;
  const normalizedChecks: PackageCheckTool[] = [];

  for (const check of checks) {
    if (!isPackageCheckTool(check)) {
      throw new Error(
        `Invalid package check "${check}". Expected one of: publint, attw, boundary.`,
      );
    }

    if (!normalizedChecks.includes(check)) {
      normalizedChecks.push(check);
    }
  }

  return normalizedChecks;
}

function selectTargetChecks(
  target: PackageCheckTarget,
  requestedTool: PackageCheckToolSelection | undefined,
): PackageCheckTool[] {
  const configuredChecks = normalizeTargetChecks(target);

  if (!requestedTool || requestedTool === 'all') {
    return configuredChecks;
  }

  return configuredChecks.includes(requestedTool) ? [requestedTool] : [];
}

async function packDistTarball(distDir: string): Promise<PackedDistTarball> {
  const destination = await mkdtemp(path.join(tmpdir(), '__LATTICE_PACKAGE__'));
  const tarballPath = await pack(distDir, {
    destination,
    ignoreScripts: true,
    packageManager: 'pnpm',
  });
  const tarball = await readFile(tarballPath);

  return {
    cleanup: async () => {
      await rm(destination, {
        force: true,
        recursive: true,
      }).catch(() => null);
    },
    tarball,
  };
}

async function runPublintCheck(options: {
  label: string;
  strict: boolean;
  tarball: Buffer;
}): Promise<boolean> {
  PackageLogger.info(`publint started: ${options.label}`);
  const publintElapsed = createElapsedTimer();
  const { messages, pkg } = await publint({
    pack: { tarball: toArrayBuffer(options.tarball) },
    strict: options.strict,
  });

  if (messages.length === 0) {
    PackageLogger.success(`publint passed: ${options.label}`, publintElapsed());
    return true;
  }

  for (const message of messages) {
    const rendered = formatMessage(message, pkg) ?? message.code;

    if (message.type === 'error') {
      PackageLogger.error(`[${options.label}] [publint] ${rendered}`);
      continue;
    }
    if (message.type === 'warning') {
      PackageLogger.warn(`[${options.label}] [publint] ${rendered}`);
      continue;
    }

    PackageLogger.info(`[${options.label}] [publint] ${rendered}`);
  }

  PackageLogger.error(
    `publint found ${messages.length} issue(s): ${options.label}`,
    publintElapsed(),
  );
  return false;
}

async function runAttwCheck(options: {
  label: string;
  profile: PackageAttwProfile;
  tarball: Buffer;
}): Promise<boolean> {
  PackageLogger.info(
    `attw started: ${options.label} (profile: ${options.profile})`,
  );
  const attwElapsed = createElapsedTimer();
  const pkg = createPackageFromTarballData(options.tarball);
  const result = await checkPackage(pkg);

  if (!result.types) {
    PackageLogger.error(`[${options.label}] [attw] package has no types`);
    PackageLogger.error(`attw failed: ${options.label}`, attwElapsed());
    return false;
  }

  const ignoredResolutions = ATTW_PROFILE_IGNORED_RESOLUTIONS[options.profile];
  const problems = result.problems.filter((problem) => {
    if ('resolutionKind' in problem) {
      return !ignoredResolutions.includes(problem.resolutionKind);
    }
    return true;
  });

  if (problems.length === 0) {
    PackageLogger.success(`attw passed: ${options.label}`, attwElapsed());
    return true;
  }

  for (const problem of problems) {
    PackageLogger.error(
      `[${options.label}] [attw] ${formatAttwProblem(problem)}`,
    );
  }

  PackageLogger.error(
    `attw found ${problems.length} problem(s): ${options.label}`,
    attwElapsed(),
  );
  return false;
}

async function runBoundaryCheck(
  target: PublishedPackageBoundaryTarget,
  label: string,
): Promise<boolean> {
  PackageLogger.info(`package boundary started: ${label}`);
  const boundaryElapsed = createElapsedTimer();
  const violations = await auditPublishedPackageBoundaries(target);

  if (violations.length === 0) {
    PackageLogger.success(
      `package boundary passed: ${label}`,
      boundaryElapsed(),
    );
    return true;
  }

  for (const violation of violations) {
    PackageLogger.error(
      `[${label}] [boundary] ${violation.filePath} (${violation.environment}) imports "${violation.specifier}": ${violation.message}`,
    );
  }

  PackageLogger.error(
    `package boundary found ${violations.length} issue(s): ${label}`,
    boundaryElapsed(),
  );
  return false;
}

async function runPackageCheckTarget(options: {
  attwProfile?: PackageAttwProfile;
  checks: PackageCheckTool[];
  config: ResolvedLatticeConfig;
  rawTarget: PackageCheckTarget;
}): Promise<boolean> {
  const target = {
    ...options.rawTarget,
    distDir: path.resolve(options.config.rootDir, options.rawTarget.distDir),
  };
  const label =
    options.rawTarget.name ??
    toRelativePath(options.config.rootDir, target.distDir);
  const distPkgPath = path.join(target.distDir, 'package.json');

  if (!existsSync(distPkgPath)) {
    throw new Error(
      `dist/package.json not found for ${label}. Run the package build first.`,
    );
  }

  let packedDist: PackedDistTarball | undefined;

  try {
    if (options.checks.includes('publint') || options.checks.includes('attw')) {
      PackageLogger.info(`dist tarball packing started: ${label}`);
      const packElapsed = createElapsedTimer();
      packedDist = await packDistTarball(target.distDir);
      PackageLogger.success(`dist tarball packed: ${label}`, packElapsed());
    }

    let passed = true;

    if (options.checks.includes('publint')) {
      passed =
        (await runPublintCheck({
          label,
          strict: target.publint?.strict ?? true,
          tarball: packedDist!.tarball,
        })) && passed;
    }

    if (options.checks.includes('attw')) {
      passed =
        (await runAttwCheck({
          label,
          profile: options.attwProfile ?? target.attw?.profile ?? 'esm-only',
          tarball: packedDist!.tarball,
        })) && passed;
    }

    if (options.checks.includes('boundary')) {
      passed =
        (await runBoundaryCheck(
          {
            ...target.boundary,
            distDir: target.distDir,
          },
          label,
        )) && passed;
    }

    if (passed) {
      PackageLogger.success(`package checks passed: ${label}`);
    } else {
      PackageLogger.error(`package checks failed: ${label}`);
    }

    return passed;
  } finally {
    if (packedDist) {
      await packedDist.cleanup();
    }
  }
}

export async function auditPublishedPackageBoundaries(
  target: PublishedPackageBoundaryTarget,
): Promise<PublishedPackageBoundaryViolation[]> {
  const manifestPath = path.join(target.distDir, 'package.json');
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  ) as DistPackageJson;
  const allowedExternalPackages = new Set<string>([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...(target.ignoredExternalPackages ?? []),
  ]);
  const selfSpecifiers = collectSelfSpecifierMatchers(
    manifest.name,
    manifest.exports,
  );
  const publishedFiles = await collectPublishedModuleFiles(target.distDir);
  const violations: PublishedPackageBoundaryViolation[] = [];

  await init;

  for (const filePath of publishedFiles) {
    const relativeFilePath = path.relative(target.distDir, filePath);
    const environment = classifyRuntimeEnvironment(target, relativeFilePath);
    const source = await readFile(filePath, 'utf8');
    const [importSpecifiers] = parse(source);

    for (const importSpecifier of importSpecifiers) {
      if (!importSpecifier.n) {
        continue;
      }

      const message = validatePublishedSpecifier({
        allowedExternalPackages,
        environment,
        packageName: manifest.name,
        selfSpecifiers,
        specifier: importSpecifier.n,
      });

      if (!message) {
        continue;
      }

      violations.push({
        environment,
        filePath: relativeFilePath,
        message,
        specifier: importSpecifier.n,
      });
    }
  }

  return violations.toSorted((left, right) => {
    if (left.filePath === right.filePath) {
      return left.specifier.localeCompare(right.specifier);
    }

    return left.filePath.localeCompare(right.filePath);
  });
}

export async function runPackageCheck(
  options: RunPackageCheckOptions,
): Promise<boolean> {
  const targets = (options.config.packageChecks?.targets ?? []).filter(
    (target) => !options.targetName || target.name === options.targetName,
  );

  if (targets.length === 0) {
    throw new Error(
      options.targetName
        ? `No package check target named "${options.targetName}" is configured.`
        : 'No package check targets are configured.',
    );
  }

  let passed = true;
  let ranCheck = false;

  for (const rawTarget of targets) {
    const checks = selectTargetChecks(rawTarget, options.tool);

    if (checks.length === 0) {
      continue;
    }

    ranCheck = true;
    passed =
      (await runPackageCheckTarget({
        attwProfile: options.attwProfile,
        checks,
        config: options.config,
        rawTarget,
      })) && passed;
  }

  if (!ranCheck) {
    throw new Error(
      options.tool && options.tool !== 'all'
        ? `No package check targets have "${options.tool}" enabled.`
        : 'No package checks are enabled.',
    );
  }

  return passed;
}
