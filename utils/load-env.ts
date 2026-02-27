import { existsSync, readFileSync } from 'node:fs';
import inspector from 'node:inspector';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv as viteLoadEnv } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export type Environment = 'development' | 'production' | 'debug';

export interface EnvConfig {
  enableSourcemap: boolean;
  enableMinify: boolean;
  silenceLog: boolean;
  debug: boolean;
  env: Environment;
}

/**
 * Loads `.env` files into `process.env` and applies centralized
 * CI / RELEASE adjustments.
 *
 * Priority (highest → lowest):
 *   1. Runtime `process.env` (command-line / platform-injected)
 *   2. `.env.[mode].local`  (user's personal overrides, gitignored)
 *   3. CI / RELEASE adjustments (computed by this function)
 *   4. `.env.[mode]`        (mode defaults)
 *   5. `.env`               (base defaults)
 *
 * @param envDir Directory containing `.env` files (default: project root)
 * @returns Pre-computed build configuration values.
 */
export function loadEnv(
  envDir: string = path.resolve(__dirname, '..'),
): EnvConfig {
  const mode = (process.env.NODE_ENV || 'development') as Environment;

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
  // Override mode defaults, but respect user overrides (runtime + .local).
  const isCI = Boolean(process.env.CI);
  const isRelease = process.env.RELEASE === '1';

  // CI mode: re-enable info/success logs, suppress sourcemap, enable minify
  if (isCI && !isRelease) {
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
  // If DOCS_ISLANDS_DEBUG is still unset or 'false', check inspector.
  // In non-release mode, an attached debugger enables debug logs.
  if (
    !isRelease &&
    !isUserOverride('DOCS_ISLANDS_DEBUG') &&
    process.env.DOCS_ISLANDS_DEBUG !== 'true' &&
    inspector.url() !== undefined
  ) {
    process.env.DOCS_ISLANDS_DEBUG = 'true';
  }

  return {
    enableSourcemap: process.env.DOCS_ISLANDS_SOURCEMAP === 'true',
    enableMinify: process.env.DOCS_ISLANDS_MINIFY === 'true',
    silenceLog: process.env.DOCS_ISLANDS_SILENCE_LOG === 'true',
    debug: process.env.DOCS_ISLANDS_DEBUG === 'true',
    env: mode,
  };
}
