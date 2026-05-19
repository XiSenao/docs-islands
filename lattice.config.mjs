import { defineConfig } from './packages/lattice/config.mjs';

const productionKinds = [
  'lib',
  'runtime-client',
  'runtime-node',
  'runtime-shared',
  'types',
];

const nonSolutionKinds = [...productionKinds, 'test', 'tools', 'unknown'];

export default defineConfig({
  workspace: {
    internalScopes: ['@docs-islands/'],
  },
  graph: {
    rootConfig: 'tsconfig.graph.json',
    productionKinds,
    projectKinds: [
      {
        kind: 'solution',
        paths: ['tsconfig.graph.json', 'tsconfig.lib.graph.json'],
        suffixes: ['/tsconfig.graph.json', '/tsconfig.lib.graph.json'],
      },
      {
        kind: 'tools',
        paths: ['scripts/tsconfig.build.json'],
        suffixes: ['/tsconfig.tools.build.json'],
      },
      {
        kind: 'runtime-shared',
        paths: ['packages/vitepress/src/shared/tsconfig.build.json'],
      },
      {
        kind: 'runtime-node',
        paths: ['packages/vitepress/src/node/tsconfig.build.json'],
      },
      {
        kind: 'runtime-client',
        paths: ['packages/vitepress/src/client/tsconfig.build.json'],
      },
      {
        kind: 'types',
        paths: [
          'packages/vitepress/src/types/tsconfig.build.json',
          'packages/vitepress/types/tsconfig.build.json',
        ],
      },
      {
        kind: 'lib',
        suffixes: ['/tsconfig.lib.build.json'],
      },
      {
        kind: 'test',
        suffixes: ['/tsconfig.test.build.json'],
      },
    ],
    inferredProjects: [
      {
        packageName: '@docs-islands/vitepress',
        project: 'packages/vitepress/src/types/tsconfig.build.json',
        sourcePrefix: 'packages/vitepress/src/types/',
      },
      {
        packageName: '@docs-islands/vitepress',
        project: 'packages/vitepress/types/tsconfig.build.json',
        sourcePrefix: 'packages/vitepress/types/',
      },
      {
        packageName: '@docs-islands/vitepress',
        project: 'packages/vitepress/src/shared/tsconfig.build.json',
        sourcePrefix: 'packages/vitepress/src/shared/',
      },
      {
        packageName: '@docs-islands/vitepress',
        project: 'packages/vitepress/src/node/tsconfig.build.json',
        sourcePrefix: 'packages/vitepress/src/node/',
      },
      {
        packageName: '@docs-islands/vitepress',
        project: 'packages/vitepress/src/client/tsconfig.build.json',
        sourcePrefix: 'packages/vitepress/src/client/',
      },
    ],
    forbiddenEdges: [
      {
        fromKinds: productionKinds,
        toKinds: ['tools', 'test'],
        reason:
          'production library/runtime graph must not depend on tools or tests',
      },
      {
        fromKinds: ['tools'],
        toKinds: ['test'],
        reason: 'tools graph must not depend on tests',
      },
      {
        fromKinds: nonSolutionKinds,
        toKinds: ['solution'],
        reason:
          'build leaves must reference build leaves, not parent graph aggregators',
      },
      {
        fromKinds: ['runtime-client'],
        toKinds: ['runtime-node'],
        reason: 'client runtime must not depend on node runtime',
      },
      {
        fromKinds: ['runtime-shared'],
        toKinds: ['runtime-node', 'runtime-client'],
        reason: 'shared runtime must stay independent of node/client runtime',
      },
    ],
    nodeBuiltinRules: [
      {
        kinds: ['runtime-client'],
        reason: 'client runtime must not import Node builtins',
      },
      {
        kinds: ['runtime-shared'],
        reason: 'shared runtime must not import Node builtins',
      },
    ],
  },
  proof: {
    ignoredTypecheckTargets: [
      'packages/vitepress/docs/tsconfig.json',
      'packages/vitepress/playground/tsconfig.json',
      'packages/vitepress/playground/tsconfig.test.json',
      'packages/vitepress/smoke/tsconfig.json',
      'packages/vitepress/smoke/tsconfig.test.json',
    ],
    sidecarTargets: [
      {
        config: 'docs/tsconfig.json',
        label: 'docs vue typecheck',
        tool: 'vue-tsc',
      },
      {
        config: 'packages/vitepress/theme/tsconfig.json',
        label: 'vitepress theme vue typecheck',
        tool: 'vue-tsc',
      },
    ],
    allowlist: [
      {
        file: 'packages/vitepress/src/shared/internal/client-runtime.d.ts',
        reason:
          'Declaration-only stub copied into dist for the injected client runtime; the matching runtime source is covered by the shared runtime graph leaf.',
      },
    ],
  },
  packageBoundary: {
    targets: [
      {
        name: '@docs-islands/logger',
        distDir: 'packages/logger/dist',
      },
      {
        name: '@docs-islands/vitepress',
        distDir: 'packages/vitepress/dist',
        ignoredExternalPackages: ['@docs-islands/utils'],
      },
    ],
  },
  pipelines: {
    typecheck: [
      {
        type: 'command',
        command: 'pnpm',
        args: ['--filter', '@docs-islands/plugin-license', 'build'],
      },
      'graph:check',
      'proof:check',
      {
        type: 'command',
        command: 'tsc',
        args: ['-b', 'tsconfig.graph.json', '--pretty', 'false'],
      },
      {
        type: 'command',
        command: 'vue-tsc',
        args: ['-p', 'docs/tsconfig.json', '--noEmit'],
      },
      {
        type: 'command',
        command: 'vue-tsc',
        args: ['-p', 'packages/vitepress/theme/tsconfig.json', '--noEmit'],
      },
    ],
    consumer: [
      {
        type: 'command',
        command: 'pnpm',
        args: ['--filter', '@docs-islands/plugin-license', 'build'],
      },
      {
        type: 'command',
        command: 'pnpm',
        args: ['--filter', '@docs-islands/vitepress', 'build'],
      },
      {
        type: 'command',
        command: 'pnpm',
        args: ['--dir', 'packages/vitepress/docs', 'typecheck'],
      },
      {
        type: 'command',
        command: 'pnpm',
        args: ['--dir', 'packages/vitepress/playground', 'typecheck'],
      },
      {
        type: 'command',
        command: 'pnpm',
        args: ['--dir', 'packages/vitepress/playground', 'typecheck:test'],
      },
      {
        type: 'command',
        command: 'pnpm',
        args: ['--dir', 'packages/vitepress/smoke', 'typecheck'],
      },
      {
        type: 'command',
        command: 'pnpm',
        args: ['--dir', 'packages/vitepress/smoke', 'typecheck:test'],
      },
    ],
    package: ['package-boundary:check'],
    publish: ['graph:check', 'proof:check', 'package-boundary:check'],
  },
});
