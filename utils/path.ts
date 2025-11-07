import fs from 'node:fs';
import { dirname, join } from 'pathe';

export function slash(p: string): string {
  return p.replaceAll('\\', '/');
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
