import getLoggerInstance from '#shared/logger';
import {
  checkPackage,
  createPackageFromTarballData,
  type Problem,
} from '@arethetypeswrong/core';
import { pack } from '@publint/pack';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';

const loggerInstance = getLoggerInstance();
const Logger = loggerInstance.getLoggerByGroup('lint-package');

type CheckTarget = 'all' | 'publint' | 'attw';
type AttwProfile = 'strict' | 'node16' | 'esm-only';

const ATTW_PROFILE_IGNORED_RESOLUTIONS: Record<AttwProfile, string[]> = {
  strict: [],
  node16: [],
  'esm-only': ['node16-cjs'],
};

function parseCheckTarget(argv: string[]): CheckTarget {
  const toolIndex = argv.indexOf('--tool');
  if (toolIndex === -1) {
    return 'all';
  }

  const target = argv[toolIndex + 1];
  if (!target) {
    throw new Error(
      'Missing value for --tool. Expected one of: all, publint, attw.',
    );
  }

  if (target === 'all' || target === 'publint' || target === 'attw') {
    return target;
  }

  throw new Error(
    `Invalid --tool value "${target}". Expected one of: all, publint, attw.`,
  );
}

function parseAttwProfile(argv: string[]): AttwProfile {
  const profileIndex = argv.indexOf('--attw-profile');
  if (profileIndex === -1) {
    // This package ships pure ESM artifacts, so CJS resolution failures
    // are not actionable for release gating by default.
    return 'esm-only';
  }

  const profile = argv[profileIndex + 1];
  if (!profile) {
    throw new Error(
      'Missing value for --attw-profile. Expected one of: strict, node16, esm-only.',
    );
  }

  if (profile === 'strict' || profile === 'node16' || profile === 'esm-only') {
    return profile;
  }

  throw new Error(
    `Invalid --attw-profile value "${profile}". Expected one of: strict, node16, esm-only.`,
  );
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

async function runPublintCheck(tarball: Buffer): Promise<boolean> {
  Logger.info('Running publint...');
  const start = Date.now();

  const { messages, pkg } = await publint({
    strict: true,
    pack: { tarball: toArrayBuffer(tarball) },
  });

  if (messages.length === 0) {
    Logger.success(`publint passed (${Date.now() - start}ms)`);
    return true;
  }

  for (const message of messages) {
    const rendered = formatMessage(message, pkg) ?? message.code;
    if (message.type === 'error') {
      Logger.error(`[publint] ${rendered}`);
      continue;
    }
    if (message.type === 'warning') {
      Logger.warn(`[publint] ${rendered}`);
      continue;
    }
    Logger.info(`[publint] ${rendered}`);
  }

  Logger.error(`publint found ${messages.length} issue(s)`);
  return false;
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

async function runAttwCheck(
  tarball: Buffer,
  profile: AttwProfile,
): Promise<boolean> {
  Logger.info(`Running attw (profile: ${profile})...`);
  const start = Date.now();

  const pkg = createPackageFromTarballData(tarball);
  const result = await checkPackage(pkg);

  if (!result.types) {
    Logger.error('[attw] Package has no types');
    return false;
  }

  const ignoredResolutions = ATTW_PROFILE_IGNORED_RESOLUTIONS[profile];
  const problems = result.problems.filter((problem) => {
    if ('resolutionKind' in problem) {
      return !ignoredResolutions.includes(problem.resolutionKind);
    }
    return true;
  });

  if (problems.length === 0) {
    Logger.success(`attw passed (${Date.now() - start}ms)`);
    return true;
  }

  for (const problem of problems) {
    Logger.error(`[attw] ${formatAttwProblem(problem)}`);
  }

  Logger.error(`attw found ${problems.length} problem(s)`);
  return false;
}

async function main(): Promise<void> {
  const packageRootDir = fileURLToPath(new URL('..', import.meta.url));
  const distDir = path.join(packageRootDir, 'dist');
  const distPkgPath = path.join(distDir, 'package.json');
  let destination: string | undefined;
  let exitCode = 0;

  try {
    const args = process.argv.slice(2);
    const checkTarget = parseCheckTarget(args);
    const attwProfile =
      checkTarget === 'all' || checkTarget === 'attw'
        ? parseAttwProfile(args)
        : 'esm-only';

    if (!existsSync(distPkgPath)) {
      throw new Error('dist/package.json not found. Run `pnpm build` first.');
    }

    destination = await mkdtemp(path.join(tmpdir(), '__DOCS_ISLANDS__'));
    Logger.info('Packing dist tarball with pnpm...');
    const tarballPath = await pack(distDir, {
      destination,
      packageManager: 'pnpm',
      ignoreScripts: true,
    });
    const tarball = await readFile(tarballPath);

    let passed = true;
    if (checkTarget === 'all' || checkTarget === 'publint') {
      passed = (await runPublintCheck(tarball)) && passed;
    }
    if (checkTarget === 'all' || checkTarget === 'attw') {
      passed = (await runAttwCheck(tarball, attwProfile)) && passed;
    }

    if (passed) {
      Logger.success('Package lint passed');
    } else {
      Logger.error('Package lint failed');
      exitCode = 1;
    }
  } catch (error) {
    Logger.error(
      `Package lint failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    exitCode = 1;
  } finally {
    if (destination) {
      await rm(destination, { recursive: true, force: true }).catch(() => null);
    }
    process.exit(exitCode);
  }
}

main();
