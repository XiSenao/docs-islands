import isInCi from 'is-in-ci';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import inspector from 'node:inspector';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv as viteLoadEnv } from 'vite';
import { z } from 'zod';
import { findMonorepoRoot, isSubpath } from './path';

let cacheEnv: EnvConfig | null = null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// const cachedEnv: EnvConfig | null = null;

const environmentSchema: z.ZodDefault<
  z.ZodEnum<{
    development: 'development';
    production: 'production';
  }>
> = z.enum(['development', 'production']).default('development');

type Environment = z.infer<typeof environmentSchema>;

const envBoolean = z
  .string()
  .optional()
  .transform((val) => val === 'true');

const processEnvSchema = z.object({
  DOCS_ISLANDS_RELEASE: z
    .string()
    .optional()
    .transform((val) => val === '1'),
  DOCS_ISLANDS_TEST: z
    .string()
    .optional()
    .transform((val) => val === '1'),
  DOCS_ISLANDS_SOURCEMAP: envBoolean,
  DOCS_ISLANDS_MINIFY: envBoolean,
  DOCS_ISLANDS_SILENCE_LOG: envBoolean,
  DOCS_ISLANDS_DEBUG: envBoolean,

  // test
  WS_ENDPOINT: z.string().optional(),
  PORT: z.string().optional(),

  // build
  DOCS_ISLANDS_BUILD_SKIP_PACKAGES: z.string().default(''),
});

export interface EnvConfig {
  config: {
    sourcemap: boolean;
    minify: boolean;
    silence: boolean;
  };
  build: {
    skipPackages: string;
  };
  test: {
    ws_endpoint: string | undefined;
    port: string | undefined;
  };
  debug: boolean;
  env: Environment;
  ci: boolean;
  release: boolean;
}

/**
 * Parses keys from an `.env` file (ignoring comments and blank lines).
 * Used to detect which variables the user explicitly overrode in `.local` files.
 */
function parseEnvKeys(filePath: string): Set<string> {
  if (!existsSync(filePath)) return new Set();
  const content = readFileSync(filePath, 'utf8');
  const keys = new Set<string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    keys.add(trimmed.slice(0, eqIndex).trim());
  }
  return keys;
}

function findNearestEnv(): string {
  let dir = realpathSync(__dirname);
  while (true) {
    if (existsSync(path.join(dir, '.env'))) break;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `No .env file found from ${__dirname} to filesystem root`,
      );
    }
    dir = parent;
  }

  const root = findMonorepoRoot(__dirname);

  if (!root) {
    throw new Error('Monorepo root directory not found');
  }

  if (!isSubpath(root, dir)) {
    console.warn(
      `[docs-islands] .env found at "${dir}" is outside the monorepo root "${root}". This may cause unexpected behavior.`,
    );
  }

  return dir;
}

/**
 * Loads `.env` files into `process.env` and applies centralized
 * CI / RELEASE adjustments.
 *
 * Priority (highest → lowest):
 * 1. Runtime `process.env` (command-line / platform-injected)
 * 2. `.env.[mode].local`  (user's personal overrides, gitignored)
 * 3. CI / RELEASE adjustments (computed by this function)
 * 4. `.env.[mode]`        (mode defaults)
 * 5. `.env`               (base defaults)
 *
 * @returns Pre-computed build configuration values.
 */
export function loadEnv(force = false): EnvConfig {
  if (!force && cacheEnv) {
    return cacheEnv;
  }

  const envDir = findNearestEnv();
  const mode = environmentSchema.parse(process.env.DOCS_ISLANDS_MODE);

  // ── Step 1: snapshot runtime env (always highest priority) ──
  const runtimeKeys = new Set(Object.keys(process.env));

  // Keys the user explicitly set in .env.[mode].local
  const localKeys = parseEnvKeys(path.resolve(envDir, `.env.${mode}.local`));

  /** Returns true if the user explicitly overrode this key. */
  const isUserOverride = (key: string) =>
    runtimeKeys.has(key) || localKeys.has(key);

  // ── Step 2: load .env files via Vite ──
  const parsed = viteLoadEnv(mode, envDir, 'DOCS_ISLANDS');
  for (const [key, value] of Object.entries(parsed)) {
    if (!runtimeKeys.has(key)) {
      process.env[key] = value;
    }
  }

  // ── Step 3: CI / RELEASE adjustments ──
  const isCI = isInCi;
  const isRelease = process.env.DOCS_ISLANDS_RELEASE === '1';
  const isLocalTest = process.env.DOCS_ISLANDS_TEST === '1';

  // CI mode: re-enable info/success logs, suppress sourcemap, enable minify
  if ((isCI || isLocalTest) && !isRelease) {
    if (!isUserOverride('DOCS_ISLANDS_SILENCE_LOG')) {
      process.env.DOCS_ISLANDS_SILENCE_LOG = 'false';
    }
    if (!isUserOverride('DOCS_ISLANDS_SOURCEMAP')) {
      process.env.DOCS_ISLANDS_SOURCEMAP = 'false';
    }
    if (!isUserOverride('DOCS_ISLANDS_MINIFY')) {
      process.env.DOCS_ISLANDS_MINIFY = 'true';
    }
  }

  // RELEASE mode: suppress debug unconditionally
  if (isRelease) {
    if (!isUserOverride('DOCS_ISLANDS_DEBUG')) {
      process.env.DOCS_ISLANDS_DEBUG = 'false';
    }
  }

  // ── Step 4: inspector-based debug fallback ──
  if (
    !isRelease &&
    !isUserOverride('DOCS_ISLANDS_DEBUG') &&
    process.env.DOCS_ISLANDS_DEBUG !== 'true' &&
    inspector.url() !== undefined
  ) {
    process.env.DOCS_ISLANDS_DEBUG = 'true';
  }

  // ── Step 5: Validate and map final configuration ──
  const finalEnv = processEnvSchema.parse(process.env);

  cacheEnv = {
    config: {
      sourcemap: finalEnv.DOCS_ISLANDS_SOURCEMAP,
      minify: finalEnv.DOCS_ISLANDS_MINIFY,
      silence: finalEnv.DOCS_ISLANDS_SILENCE_LOG,
    },
    build: {
      skipPackages: finalEnv.DOCS_ISLANDS_BUILD_SKIP_PACKAGES,
    },
    test: {
      ws_endpoint: finalEnv.WS_ENDPOINT,
      port: finalEnv.PORT,
    },
    debug: finalEnv.DOCS_ISLANDS_DEBUG,
    release: finalEnv.DOCS_ISLANDS_RELEASE,
    env: mode,
    ci: isCI,
  };

  return cacheEnv;
}

const injectKeySchema: z.ZodUnion<
  readonly [
    z.ZodLiteral<'DOCS_ISLANDS_MODE'>,
    z.ZodEnum<{
      DOCS_ISLANDS_MINIFY: 'DOCS_ISLANDS_MINIFY';
      DOCS_ISLANDS_RELEASE: 'DOCS_ISLANDS_RELEASE';
      DOCS_ISLANDS_TEST: 'DOCS_ISLANDS_TEST';
      DOCS_ISLANDS_DEBUG: 'DOCS_ISLANDS_DEBUG';
      DOCS_ISLANDS_SOURCEMAP: 'DOCS_ISLANDS_SOURCEMAP';
      DOCS_ISLANDS_SILENCE_LOG: 'DOCS_ISLANDS_SILENCE_LOG';
      WS_ENDPOINT: 'WS_ENDPOINT';
      PORT: 'PORT';
      DOCS_ISLANDS_BUILD_SKIP_PACKAGES: 'DOCS_ISLANDS_BUILD_SKIP_PACKAGES';
    }>,
  ]
> = z.union([z.literal('DOCS_ISLANDS_MODE'), processEnvSchema.keyof()]);

export type InjectableKey = z.infer<typeof injectKeySchema>;

const injectValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.undefined(),
]);

export function injectEnv(
  key: InjectableKey,
  value: string | number | boolean | null | undefined,
): void {
  const validKey = injectKeySchema.parse(key);
  const validValue = injectValueSchema.parse(value);

  if (validValue === undefined || validValue === null) {
    return;
  }

  process.env[validKey] = String(validValue);
}

export function injectEnvs(
  envs: Partial<
    Record<InjectableKey, string | number | boolean | null | undefined>
  >,
): void {
  for (const [key, value] of Object.entries(envs)) {
    injectEnv(key as InjectableKey, value);
  }
}
