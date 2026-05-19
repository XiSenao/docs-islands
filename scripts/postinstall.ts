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
  // Graph paths are git-ignored and depend on pnpm's resolved workspace links,
  // so each install refreshes them from the current lockfile.
  await runCommand('lattice', ['paths', 'apply']);

  // Utils provides dist files consumed by local package-form imports after
  // install, so keep the existing postinstall build behavior centralized here.
  await runCommand('pnpm', [
    '--dir',
    'utils',
    'exec',
    'rolldown',
    '--config',
    'rolldown.config.ts',
  ]);

  // The agents package injects local AI tool skills during install; keeping it
  // here makes postinstall ordering explicit and easy to audit.
  await runCommand('node', ['packages/agents/scripts/link.js'], {
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
