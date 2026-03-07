import Logger from '@docs-islands/utils/logger';
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
const logger = new Logger('@docs-islands/agents').getLoggerByGroup('link');

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
    mkdirSync(dir, { recursive: true });
    logger.success(`Created: ${dir}`);
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
  logger.success(`${toolName}: ${created} created, ${existed} exist`);
}

function main() {
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
  logger.success('Done');
}

main();
