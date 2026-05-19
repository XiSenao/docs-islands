#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const distCliPath = path.join(packageDir, 'dist/cli.js');

if (existsSync(distCliPath)) {
  await import(pathToFileURL(distCliPath).href);
} else {
  const sourceCliPath = path.join(packageDir, 'src/cli.ts');
  const result = spawnSync('tsx', [sourceCliPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}
