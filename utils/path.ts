import fs, { realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'pathe';

export function slash(p: string): string {
  return p.replaceAll('\\', '/');
}

/** Check whether `child` is inside (or equal to) `parent` using path segments. */
export function isSubpath(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

const MONOREPO_MARKERS = ['pnpm-workspace.yaml', 'pnpm-workspace.yml'];

function hasMonorepoMarker(dir: string): boolean {
  return MONOREPO_MARKERS.some((m) => fs.existsSync(join(dir, m)));
}

let monorepoRoot: string | undefined | null = null;

/**
 * Finds the nearest monorepo root by walking up from `startDir`.
 * Results are cached for the process lifetime.
 */
export function findMonorepoRoot(startDir: string): string | undefined {
  if (monorepoRoot !== null) return monorepoRoot;

  let dir = realpathSync(startDir);
  while (true) {
    if (hasMonorepoMarker(dir)) {
      monorepoRoot = dir;
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      monorepoRoot = undefined;
      return undefined;
    }
    dir = parent;
  }
}

export function getProjectRoot(): string {
  if (process.env.PROJECT_ROOT) {
    return process.env.PROJECT_ROOT;
  }

  const findPackageJson = (dir: string): string | null => {
    const packageJsonPath = join(dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return dir;
    }

    const parentDir = dirname(dir);
    if (parentDir === dir) {
      return null;
    }

    return findPackageJson(parentDir);
  };

  const rootFromPackageJson = findPackageJson(process.cwd());
  if (rootFromPackageJson) {
    return rootFromPackageJson;
  }

  return process.cwd();
}
