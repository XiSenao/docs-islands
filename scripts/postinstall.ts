import { spawn } from 'node:child_process';

function runCommand(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} ${args.join(' ')} exited with signal ${signal}.`
            : `${command} ${args.join(' ')} exited with code ${code}.`,
        ),
      );
    });
  });
}

async function main(): Promise<void> {
  for (const packageDir of ['utils', 'packages/lattice']) {
    // These packages are consumed through link:*/dist during local installs.
    // Build them before refreshing pnpm's generated bin shims below.
    await runCommand('pnpm', [
      '--dir',
      packageDir,
      'exec',
      'rolldown',
      '--config',
      'rolldown.config.ts',
    ]);
  }

  // The first install can run before link:*/dist package manifests exist, so
  // pnpm cannot create their .bin shims. Re-run install without lifecycle
  // scripts after the dist builds so commands like `lattice` are linked.
  await runCommand('pnpm', [
    'install',
    '--offline',
    '--ignore-scripts',
    '--frozen-lockfile',
  ]);

  // The agents package injects local AI tool skills during install; keeping it
  // here makes postinstall ordering explicit and easy to audit.
  await runCommand('pnpm', ['--dir', 'packages/agents', 'run', 'link'], {
    env: {
      ...process.env,
      FORCE_COLOR: '1',
    },
  });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
