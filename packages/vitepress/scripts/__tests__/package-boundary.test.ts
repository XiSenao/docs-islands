/**
 * @vitest-environment node
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditPublishedPackageBoundaries } from '../package-boundary';

const temporaryDirectories: string[] = [];

const createTempDirectory = (prefix: string): string => {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directoryPath);
  return directoryPath;
};

const writeTextFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });
  fs.writeFileSync(filePath, content, 'utf8');
};

afterEach(() => {
  for (const directoryPath of temporaryDirectories.splice(0)) {
    fs.rmSync(directoryPath, {
      recursive: true,
      force: true,
    });
  }
});

describe('auditPublishedPackageBoundaries', () => {
  it('allows self exports, declared dependency roots, relative imports, and Node builtins in node output', async () => {
    const distDir = createTempDirectory('vitepress-boundary-valid-');

    writeTextFile(
      path.join(distDir, 'package.json'),
      JSON.stringify(
        {
          name: '@docs-islands/vitepress',
          exports: {
            '.': './node/index.js',
            './internal/logger': './shared/logger.js',
            './types/*': './types/*',
          },
          dependencies: {
            vite: '^5.0.0',
          },
          peerDependencies: {
            react: '^18.0.0',
          },
        },
        null,
        2,
      ),
    );
    writeTextFile(
      path.join(distDir, 'node', 'index.js'),
      `import path from 'node:path';
import { defineConfig } from 'vite';
import runtimeLogger from '@docs-islands/vitepress/internal/logger';

export { path, defineConfig, runtimeLogger };
`,
    );
    writeTextFile(
      path.join(distDir, 'shared', 'logger.js'),
      `import React from 'react';
import './dep.js';

export default React;
`,
    );
    writeTextFile(
      path.join(distDir, 'shared', 'dep.js'),
      'export const ok = 1;\n',
    );

    await expect(auditPublishedPackageBoundaries(distDir)).resolves.toEqual([]);
  });

  it('reports browser Node builtins, undeclared workspace packages, and unexported self imports', async () => {
    const distDir = createTempDirectory('vitepress-boundary-invalid-');

    writeTextFile(
      path.join(distDir, 'package.json'),
      JSON.stringify(
        {
          name: '@docs-islands/vitepress',
          exports: {
            '.': './node/index.js',
            './internal/logger': './shared/logger.js',
          },
          dependencies: {
            vite: '^5.0.0',
          },
        },
        null,
        2,
      ),
    );
    writeTextFile(
      path.join(distDir, 'shared', 'runtime.js'),
      `import path from 'node:path';
import { formatDebugMessage } from '@docs-islands/utils/logger';
import secret from '@docs-islands/vitepress/private/runtime';

export { path, formatDebugMessage, secret };
`,
    );

    const violations = await auditPublishedPackageBoundaries(distDir);

    expect(violations).toHaveLength(3);
    expect(violations.map((violation) => violation.specifier)).toEqual([
      '@docs-islands/utils/logger',
      '@docs-islands/vitepress/private/runtime',
      'node:path',
    ]);
  });
});
