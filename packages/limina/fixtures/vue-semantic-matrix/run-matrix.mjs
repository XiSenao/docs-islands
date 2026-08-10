import { spawnSync } from 'node:child_process';
import { accessSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cases = [
  {
    expectedVersions: {
      languageCore: '2.2.0',
      typeScript: '5.4.5',
      volarTypeScript: '2.4.11',
      vueTsc: '2.2.0',
    },
    name: 'vue-2.2.0-ts-5.4.5',
  },
  {
    expectedVersions: {
      languageCore: '2.2.10',
      typeScript: '5.9.3',
      volarTypeScript: '2.4.11',
      vueTsc: '2.2.10',
    },
    name: 'vue-2.2.10-ts-5.9.3',
  },
  {
    expectedVersions: {
      languageCore: '2.2.12',
      typeScript: '5.9.3',
      volarTypeScript: '2.4.28',
      vueTsc: '2.2.12',
    },
    name: 'vue-2.2.12-ts-5.9.3',
  },
  {
    expectedVersions: {
      languageCore: '3.2.0',
      typeScript: '5.4.5',
      volarTypeScript: '2.4.27',
      vueTsc: '3.2.0',
    },
    name: 'vue-3.2.0-ts-5.4.5',
  },
  {
    expectedVersions: {
      languageCore: '3.2.4',
      typeScript: '6.0.3',
      volarTypeScript: '2.4.27',
      vueTsc: '3.2.4',
    },
    name: 'vue-3.2.4-ts-6.0.3',
  },
];
const liminaCli = fileURLToPath(
  new URL('../../dist/bin/limina.js', import.meta.url),
);

function readManifestVersion(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof manifest.version === 'string') return manifest.version;
  throw new TypeError(`${manifestPath} does not expose a string version.`);
}

function resolveInstalledVersions(caseDirectory) {
  const requireFromCase = createRequire(
    path.join(caseDirectory, 'package.json'),
  );
  const vueTscManifest = requireFromCase.resolve('vue-tsc/package.json');
  const requireFromVueTsc = createRequire(vueTscManifest);
  return {
    languageCore: readManifestVersion(
      requireFromVueTsc.resolve('@vue/language-core/package.json'),
    ),
    typeScript: readManifestVersion(
      requireFromVueTsc.resolve('typescript/package.json'),
    ),
    volarTypeScript: readManifestVersion(
      requireFromVueTsc.resolve('@volar/typescript/package.json'),
    ),
    vueTsc: readManifestVersion(vueTscManifest),
  };
}

function assertExpectedVersions(testCase, actualVersions) {
  for (const [packageName, expectedVersion] of Object.entries(
    testCase.expectedVersions,
  )) {
    const actualVersion = actualVersions[packageName];
    if (actualVersion === expectedVersion) continue;
    throw new Error(
      `[vue-semantic-matrix] ${testCase.name} expected ${packageName} ${expectedVersion}, received ${actualVersion}.`,
    );
  }
}

try {
  accessSync(liminaCli);
} catch {
  throw new Error(
    `[vue-semantic-matrix] Built Limina CLI is missing at ${liminaCli}. Run the Limina build before the semantic matrix.`,
  );
}

for (const testCase of cases) {
  const caseDirectory = fileURLToPath(
    new URL(`cases/${testCase.name}/`, import.meta.url),
  );
  const installedVersions = resolveInstalledVersions(caseDirectory);
  assertExpectedVersions(testCase, installedVersions);
  console.log(
    `[vue-semantic-matrix] ${testCase.name} ${JSON.stringify(installedVersions)}`,
  );
  const result = spawnSync(process.execPath, [liminaCli, 'check'], {
    cwd: caseDirectory,
    stdio: 'inherit',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status === 0) continue;
  process.exitCode = result.status ?? 1;
  break;
}
