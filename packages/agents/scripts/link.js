import { createLogger } from '@docs-islands/logger';
import { createElapsedLogOptions } from '@docs-islands/logger/internal';
import { execSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = createLogger({
  main: '@docs-islands/agents',
}).getLoggerByGroup('task.link');
const scriptStartedAt = Date.now();
const elapsedSince = (startTimeMs) =>
  createElapsedLogOptions(startTimeMs, Date.now());

function findProjectRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return join(__dirname, '..', '..', '..');
  }
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    const ensureStartedAt = Date.now();
    mkdirSync(dir, { recursive: true });
    logger.success(`Created: ${dir}`, elapsedSince(ensureStartedAt));
  }
}

function createSkillSymlink(source, target) {
  if (existsSync(target)) {
    const stats = lstatSync(target);
    if (stats.isSymbolicLink()) {
      const current = readlinkSync(target);
      const expected = relative(dirname(target), source);
      if (current === expected || current === source) return 'exists';
      rmSync(target);
    } else {
      return 'skipped';
    }
  }
  try {
    const rel = relative(dirname(target), source);
    symlinkSync(
      process.platform === 'win32' ? source : rel,
      target,
      process.platform === 'win32' ? 'junction' : undefined,
    );
    return 'created';
  } catch {
    return 'error';
  }
}

function getSkillDirs(basePath) {
  if (!existsSync(basePath)) return [];
  return readdirSync(basePath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function linkSkillsForTool(projectRoot, skillsBase, toolDir, toolName) {
  const linkStartedAt = Date.now();
  const targetDir = join(projectRoot, toolDir, 'skills');
  const generalSkills = join(skillsBase, 'general');
  const specificSkills = join(skillsBase, toolDir.replace(/^\./, ''));

  ensureDir(targetDir);
  let created = 0,
    existed = 0;

  for (const skill of getSkillDirs(generalSkills)) {
    const r = createSkillSymlink(
      join(generalSkills, skill),
      join(targetDir, skill),
      skill,
    );
    if (r === 'created') created++;
    if (r === 'exists') existed++;
  }
  for (const skill of getSkillDirs(specificSkills)) {
    const r = createSkillSymlink(
      join(specificSkills, skill),
      join(targetDir, skill),
      skill,
    );
    if (r === 'created') created++;
    if (r === 'exists') existed++;
  }
  logger.success(
    `${toolName}: ${created} created, ${existed} exist`,
    elapsedSince(linkStartedAt),
  );
}

function main() {
  const mainStartedAt = Date.now();
  logger.info('Setting up AI tool symlinks');
  const projectRoot = findProjectRoot();
  const skillsBase = join(__dirname, '..', 'skills');

  if (!existsSync(join(skillsBase, 'general'))) {
    logger.warn('Skills not organized, skipping');
    return;
  }

  [
    { dir: '.claude', name: 'Claude Code' },
    { dir: '.cursor', name: 'Cursor' },
    { dir: '.agent', name: 'Codex' },
    { dir: '.github', name: 'GitHub Copilot' },
  ].forEach(({ dir, name }) => {
    ensureDir(join(projectRoot, dir));
    linkSkillsForTool(projectRoot, skillsBase, dir, name);
  });
  logger.success('Done', elapsedSince(mainStartedAt));
}

try {
  main();
} catch (error) {
  logger.error(
    `Link setup failed: ${error instanceof Error ? error.message : String(error)}`,
    elapsedSince(scriptStartedAt),
  );
  process.exitCode = 1;
}
