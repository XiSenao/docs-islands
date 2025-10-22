import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from '../package.json' with { type: 'json' };
import logger from '../utils/logger';

const Logger = logger.getLoggerByGroup('changelog');

interface ChangelogOptions {
  version?: string;
  dryRun?: boolean;
  output?: string;
}

const ChangelogManager = {
  generateChangelog(
    version: string,
    packageRootDir: string,
    dryRun = false,
  ): void {
    const changelogPath = path.join(packageRootDir, 'CHANGELOG.md');
    const date = new Date().toISOString().split('T')[0];

    try {
      // Get commits since last tag.
      let lastTag: string;
      try {
        lastTag = execSync('git describe --tags --abbrev=0', {
          encoding: 'utf8',
          stdio: 'pipe',
          cwd: packageRootDir,
        }).trim();
      } catch {
        lastTag = '';
      }

      const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
      const commits = execSync(`git log ${range} --oneline --no-merges`, {
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: packageRootDir,
      }).trim();

      if (!commits) {
        Logger.info(
          '📝 No commits found since last release, skipping changelog',
        );
        return;
      }

      const commitLines = commits.split('\n').filter((line) => line.trim());

      // Categorize commits.
      const features = commitLines.filter((line) =>
        /^\w+\s+feat(?:ure)?/.test(line),
      );
      const fixes = commitLines.filter((line) =>
        /^\w+\s+(?:fix|bugfix)/.test(line),
      );
      const docs = commitLines.filter((line) => /^\w+\s+docs?/.test(line));
      const chores = commitLines.filter((line) =>
        /^\w+\s+(?:chore|refactor|style|test)/.test(line),
      );
      const others = commitLines.filter(
        (line) =>
          !features.includes(line) &&
          !fixes.includes(line) &&
          !docs.includes(line) &&
          !chores.includes(line),
      );

      // Generate changelog section.
      let newSection = `## [${version}] - ${date}\n\n`;

      if (features.length > 0) {
        newSection += '### Features\n\n';
        for (const commit of features) {
          const [hash, ...message] = commit.split(' ');
          newSection += `- ${message.join(' ')} ([${hash}](https://github.com/XiSenao/docs-islands/commit/${hash}))\n`;
        }
        newSection += '\n';
      }

      if (fixes.length > 0) {
        newSection += '### Bug Fixes\n\n';
        for (const commit of fixes) {
          const [hash, ...message] = commit.split(' ');
          newSection += `- ${message.join(' ')} ([${hash}](https://github.com/XiSenao/docs-islands/commit/${hash}))\n`;
        }
        newSection += '\n';
      }

      if (docs.length > 0) {
        newSection += '### Documentation\n\n';
        for (const commit of docs) {
          const [hash, ...message] = commit.split(' ');
          newSection += `- ${message.join(' ')} ([${hash}](https://github.com/XiSenao/docs-islands/commit/${hash}))\n`;
        }
        newSection += '\n';
      }

      if (chores.length > 0) {
        newSection += '### Maintenance\n\n';
        for (const commit of chores) {
          const [hash, ...message] = commit.split(' ');
          newSection += `- ${message.join(' ')} ([${hash}](https://github.com/XiSenao/docs-islands/commit/${hash}))\n`;
        }
        newSection += '\n';
      }

      if (others.length > 0) {
        newSection += '### Other Changes\n\n';
        for (const commit of others) {
          const [hash, ...message] = commit.split(' ');
          newSection += `- ${message.join(' ')} ([${hash}](https://github.com/XiSenao/docs-islands/commit/${hash}))\n`;
        }
        newSection += '\n';
      }

      // Read existing changelog or create header.
      let existingContent = '';
      existingContent = existsSync(changelogPath)
        ? readFileSync(changelogPath, 'utf8')
        : `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n`;

      // Insert new section.
      const headerEnd = existingContent.indexOf('\n## ');
      const updatedContent: string =
        headerEnd === -1
          ? existingContent + newSection
          : existingContent.slice(0, headerEnd + 1) +
            newSection +
            existingContent.slice(headerEnd + 1);

      if (dryRun) {
        Logger.info(
          `📝 Would update CHANGELOG.md with ${commitLines.length} commits`,
        );
        Logger.info('📋 Preview of new section:');
        console.log(`\n${newSection}`);
      } else {
        writeFileSync(changelogPath, updatedContent);
        Logger.success(
          `✅ Updated CHANGELOG.md with ${commitLines.length} commits`,
        );
        Logger.info(
          `📋 Please review the generated changelog at: ${changelogPath}`,
        );
      }
    } catch (error) {
      Logger.error(`❌ Failed to generate changelog: ${String(error)}`);
      throw error instanceof Error
        ? error
        : new Error('Failed to generate changelog');
    }
  },

  hasVersionInChangelog(version: string, packageRootDir: string): boolean {
    const changelogPath = path.join(packageRootDir, 'CHANGELOG.md');

    if (!existsSync(changelogPath)) {
      return false;
    }

    const content = readFileSync(changelogPath, 'utf8');
    return content.includes(`## [${version}]`);
  },
};

class ChangelogSystemManager {
  private options: ChangelogOptions;
  private readonly packageRootDir: string;

  constructor(options: ChangelogOptions = {}) {
    this.options = options;
    this.packageRootDir = fileURLToPath(new URL('..', import.meta.url));
  }

  async generateChangelog(): Promise<void> {
    try {
      Logger.info('📝 Starting changelog generation...\n');

      const version = this.options.version || this.getNextVersion();

      Logger.info(`🏷️  Generating changelog for version: ${version}`);

      ChangelogManager.generateChangelog(
        version,
        this.packageRootDir,
        this.options.dryRun,
      );

      Logger.success(`✅ Changelog generation completed!\n`);
    } catch (error) {
      Logger.error(`❌ Changelog generation failed: ${String(error)}`);
      throw error instanceof Error
        ? error
        : new Error('Changelog generation failed');
    }
  }

  private getNextVersion(): string {
    const currentVersion = packageJson.version;
    const parts = currentVersion.split('.');
    const patch = Number.parseInt(parts[2], 10) + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options: ChangelogOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--version': {
        options.version = args[++i];
        break;
      }
      case '--dry-run': {
        options.dryRun = true;
        break;
      }
      case '--output': {
        options.output = args[++i];
        break;
      }
      case '--help': {
        console.log(`
Usage: pnpm changelog [options]

Options:
  --version <version>   Specific version for changelog (default: next patch version)
  --dry-run             Preview changelog without writing to file
  --output <path>       Output file path (default: CHANGELOG.md)
  --help                Show this help

Examples:
  pnpm changelog
  pnpm changelog --version 1.2.3
  pnpm changelog --dry-run
        `);
        process.exit(0);
      }
    }
  }

  const changelogSystem = new ChangelogSystemManager(options);
  await changelogSystem.generateChangelog();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    Logger.error(`❌ Changelog generation failed: ${String(error)}`);
    // Allow process to exit with failure naturally.
    process.exitCode = 1;
  });
}

export { ChangelogManager, ChangelogSystemManager };
