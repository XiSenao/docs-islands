#!/usr/bin/env node
import { cac } from 'cac';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { runGraphCheck } from './commands/graph';
import { runPackageBoundaryCheck } from './commands/package-boundary';
import { runPaths } from './commands/paths';
import { runProofCheck } from './commands/proof';
import {
  loadConfig,
  type BuiltinTaskName,
  type PipelineStep,
  type ResolvedLatticeConfig,
} from './config';
import { CliLogger, formatErrorMessage } from './logger';

interface GlobalFlags {
  config?: string;
}

interface PackageBoundaryFlags extends GlobalFlags {
  package?: string;
}

type NormalizedPipelineStep = Exclude<PipelineStep, string>;

async function load(flags: GlobalFlags): Promise<ResolvedLatticeConfig> {
  return loadConfig({
    configPath: flags.config,
    cwd: process.cwd(),
  });
}

async function runBuiltinTask(
  config: ResolvedLatticeConfig,
  taskName: BuiltinTaskName,
): Promise<boolean> {
  switch (taskName) {
    case 'paths:check': {
      const result = await runPaths(config, { check: true });
      return !result.changed;
    }
    case 'graph:check': {
      return runGraphCheck(config);
    }
    case 'proof:check': {
      return runProofCheck(config);
    }
    case 'package-boundary:check': {
      return runPackageBoundaryCheck({ config });
    }
  }
}

function normalizePipelineStep(step: PipelineStep): NormalizedPipelineStep {
  if (typeof step !== 'string') {
    return step;
  }

  if (
    step === 'paths:check' ||
    step === 'graph:check' ||
    step === 'proof:check' ||
    step === 'package-boundary:check'
  ) {
    return {
      name: step,
      type: 'task',
    };
  }

  const [command, ...args] = step.split(/\s+/u).filter(Boolean);

  if (!command) {
    throw new Error('Pipeline command step must not be empty.');
  }

  return {
    args,
    command,
    type: 'command',
  };
}

function runCommandStep(
  config: ResolvedLatticeConfig,
  step: Extract<PipelineStep, { type: 'command' }>,
): boolean {
  const result = spawnSync(step.command, step.args ?? [], {
    cwd: step.cwd ? path.resolve(config.rootDir, step.cwd) : config.rootDir,
    env: {
      ...process.env,
      ...step.env,
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return (result.status ?? 1) === 0;
}

async function runPipeline(
  config: ResolvedLatticeConfig,
  pipelineName: string,
): Promise<boolean> {
  const steps = config.pipelines?.[pipelineName];

  if (!steps) {
    throw new Error(`Unknown lattice pipeline "${pipelineName}".`);
  }

  for (const rawStep of steps) {
    const step = normalizePipelineStep(rawStep);
    const passed =
      step.type === 'task'
        ? await runBuiltinTask(config, step.name)
        : runCommandStep(config, step);

    if (!passed) {
      return false;
    }
  }

  return true;
}

async function main(): Promise<void> {
  const cli = cac('lattice');

  cli.option('--config <path>', 'Path to lattice.config.mjs');
  cli.help();

  cli
    .command('check <pipeline>', 'Run a configured governance pipeline')
    .action(async (pipeline: string, flags: GlobalFlags) => {
      const config = await load(flags);
      const passed = await runPipeline(config, pipeline);

      if (!passed) {
        process.exitCode = 1;
      }
    });

  cli
    .command(
      'paths <action>',
      'Check or write generated TypeScript graph paths',
    )
    .action(async (action: string, flags: GlobalFlags) => {
      const config = await load(flags);
      if (action !== 'check' && action !== 'apply') {
        throw new Error(
          `Unknown paths action "${action}". Expected check or apply.`,
        );
      }
      const result = await runPaths(config, { check: action === 'check' });

      if (action === 'check' && result.changed) {
        process.exitCode = 1;
      }
    });

  cli
    .command('graph <action>', 'Check TypeScript graph architecture')
    .action(async (action: string, flags: GlobalFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown graph action "${action}". Expected check.`);
      }
      const config = await load(flags);

      if (!(await runGraphCheck(config))) {
        process.exitCode = 1;
      }
    });

  cli
    .command('proof <action>', 'Check root typecheck coverage proof')
    .action(async (action: string, flags: GlobalFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown proof action "${action}". Expected check.`);
      }
      const config = await load(flags);

      if (!(await runProofCheck(config))) {
        process.exitCode = 1;
      }
    });

  cli
    .command(
      'package-boundary <action>',
      'Audit configured published package boundaries',
    )
    .option('-p, --package <name>', 'Run a single package-boundary target')
    .action(async (action: string, flags: PackageBoundaryFlags) => {
      if (action !== 'check') {
        throw new Error(
          `Unknown package-boundary action "${action}". Expected check.`,
        );
      }
      const config = await load(flags);

      if (
        !(await runPackageBoundaryCheck({
          config,
          targetName: flags.package,
        }))
      ) {
        process.exitCode = 1;
      }
    });

  cli.parse(process.argv, { run: false });

  try {
    await cli.runMatchedCommand();
  } catch (error) {
    CliLogger.error(`lattice failed: ${formatErrorMessage(error)}`);
    process.exitCode = 1;
  }
}

await main();
