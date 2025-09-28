import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';
import packageJson from '../package.json' with { type: 'json' };
import logger from '../utils/logger';

const Logger = logger.getLoggerByGroup('release');

type PackageJson = typeof packageJson;

type ReleaseType = 'patch' | 'minor' | 'major' | 'prerelease';

interface ReleaseOptions {
  version?: string;
  type?: ReleaseType;
  preId?: string;
  dryRun?: boolean;
  skipTests?: boolean;
  skipBuild?: boolean;
  skipChangelogCheck?: boolean;
  tag?: string;
  gitTag?: string;
  npmTag?: string;
  registry?: string;
}

const SimpleVersionManager = {
  parseVersion(version: string): {
    major: number;
    minor: number;
    patch: number;
    prerelease?: string;
  } {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
    if (!match) throw new Error(`Invalid version format: ${version}`);

    return {
      major: Number.parseInt(match[1], 10),
      minor: Number.parseInt(match[2], 10),
      patch: Number.parseInt(match[3], 10),
      prerelease: match[4]
    };
  },

  incrementVersion(
    version: string,
    type: 'patch' | 'minor' | 'major' | 'prerelease',
    preId?: string
  ): string {
    const parsed = this.parseVersion(version);

    switch (type) {
      case 'patch': {
        parsed.patch++;
        parsed.prerelease = undefined;
        break;
      }
      case 'minor': {
        parsed.minor++;
        parsed.patch = 0;
        parsed.prerelease = undefined;
        break;
      }
      case 'major': {
        parsed.major++;
        parsed.minor = 0;
        parsed.patch = 0;
        parsed.prerelease = undefined;
        break;
      }
      case 'prerelease': {
        if (!parsed.prerelease) {
          parsed.patch++;
          parsed.prerelease = `${preId || 'alpha'}.0`;
        } else {
          const prereleaseMatch = parsed.prerelease.match(/^(.+)\.(\d+)$/);
          if (prereleaseMatch) {
            const prereleaseVersion = Number.parseInt(prereleaseMatch[2], 10) + 1;
            parsed.prerelease = `${prereleaseMatch[1]}.${prereleaseVersion}`;
          } else {
            parsed.prerelease = `${parsed.prerelease}.1`;
          }
        }
        break;
      }
      default: {
        throw new Error(`Invalid version type: ${type}`);
      }
    }

    return parsed.prerelease
      ? `${parsed.major}.${parsed.minor}.${parsed.patch}-${parsed.prerelease}`
      : `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  },

  isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+(?:-[\d.A-Za-z-]+)?$/.test(version);
  },

  compareVersions(a: string, b: string): number {
    const parsedA = this.parseVersion(a);
    const parsedB = this.parseVersion(b);

    if (parsedA.major !== parsedB.major) return parsedA.major - parsedB.major;
    if (parsedA.minor !== parsedB.minor) return parsedA.minor - parsedB.minor;
    if (parsedA.patch !== parsedB.patch) return parsedA.patch - parsedB.patch;

    if (!parsedA.prerelease && !parsedB.prerelease) return 0;
    if (!parsedA.prerelease) return 1;
    if (!parsedB.prerelease) return -1;

    return parsedA.prerelease.localeCompare(parsedB.prerelease);
  }
};

class ReleaseSystemManager {
  private pkg: PackageJson;
  private options: ReleaseOptions;
  private readonly packageRootDir: string;

  constructor(options: ReleaseOptions = {}) {
    this.options = options;
    this.pkg = packageJson;
    this.packageRootDir = fileURLToPath(new URL('..', import.meta.url));
  }

  async release(): Promise<void> {
    try {
      Logger.info('🚀 Starting release process...\n');

      await this.preReleaseCheck();

      if (!this.options.skipTests) {
        await this.runTests();
      }

      const newVersion = await this.manageVersion();

      await this.ensureVersionNotPublished(newVersion);

      if (!this.options.skipChangelogCheck) {
        await this.checkChangelogUpdated(newVersion);
      }

      if (!this.options.skipBuild) {
        await this.buildProject();
        await this.verifyDistPackageJsonVersion(newVersion);
      }

      if (!this.options.dryRun) {
        await this.commitAndTag(newVersion);
      }

      if (!this.options.dryRun) {
        await this.publishToNpm();
      }

      await this.postRelease(newVersion);
      Logger.success(`✅ Release ${newVersion} completed successfully!\n`);
    } catch (error) {
      Logger.error(`❌ Release failed: ${String(error)}`);
      throw error instanceof Error ? error : new Error('Release failed');
    }
  }

  private async preReleaseCheck(): Promise<void> {
    Logger.info('📋 Running pre-release checks...');

    try {
      const status = execSync('git status --porcelain', {
        encoding: 'utf8',
        cwd: this.packageRootDir
      });
      if (status.trim() && !this.options.dryRun) {
        throw new Error('Working directory is not clean. Commit or stash changes first.');
      }
    } catch {
      throw new Error('Git status check failed');
    }

    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8',
        cwd: this.packageRootDir
      }).trim();
      if (branch !== 'main' && branch !== 'master' && !this.options.dryRun) {
        Logger.warn(`⚠️  You are not on main/master branch (current: ${branch})`);
      }
    } catch {
      throw new Error('Git branch check failed');
    }

    if (this.options.dryRun) {
      Logger.info('ℹ️  Dry-run mode: skipping npm auth check');
    } else {
      try {
        execSync('npm whoami', { stdio: 'pipe', cwd: this.packageRootDir });
      } catch {
        throw new Error('Not logged in to npm. Run "npm login" first.');
      }
    }

    try {
      execSync('git fetch --tags', { stdio: 'pipe', cwd: this.packageRootDir });
      const upstream = execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', {
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: this.packageRootDir
      }).trim();
      const aheadBehind = execSync('git rev-list --left-right --count @{u}...HEAD', {
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: this.packageRootDir
      })
        .trim()
        .split('\t')
        .map(Number);
      const [behindCount, aheadCount] = aheadBehind;
      if (behindCount > 0) {
        Logger.warn(`⚠️  Your branch is behind ${upstream} by ${behindCount} commits.`);
      }
      if (aheadCount > 0) {
        Logger.warn(`⚠️  Your branch is ahead of ${upstream} by ${aheadCount} commits.`);
      }
    } catch {
      // Ignore for repos without upstream.
    }

    Logger.success('✅ Pre-release checks passed\n');
  }

  private async runTests(): Promise<void> {
    Logger.info('🧪 Running test suite...');

    try {
      execSync('pnpm test', { stdio: 'inherit', cwd: this.packageRootDir });
      Logger.success('✅ All tests passed\n');
    } catch {
      throw new Error('Tests failed');
    }
  }

  private async buildProject(): Promise<void> {
    Logger.info('📦 Building project...');
    try {
      execSync('pnpm build', { stdio: 'inherit', cwd: this.packageRootDir });
      Logger.success('✅ Build completed\n');
    } catch {
      throw new Error('Build failed');
    }
  }

  private async verifyDistPackageJsonVersion(expectedVersion: string): Promise<void> {
    const distPkgPath = path.join(this.packageRootDir, 'dist', 'package.json');
    if (!existsSync(distPkgPath)) {
      throw new Error('dist/package.json not found after build');
    }
    const content = readFileSync(distPkgPath, 'utf8');
    try {
      const parsed = JSON.parse(content) as { version?: string };
      if (parsed.version !== expectedVersion) {
        throw new Error(
          `dist/package.json version mismatch: expected ${expectedVersion}, got ${parsed.version}`
        );
      }
    } catch {
      throw new Error('Failed to parse dist/package.json');
    }
  }

  private async manageVersion(): Promise<string> {
    Logger.info('🏷️  Managing version...');
    const currentVersion = this.pkg.version;
    let newVersion: string;
    if (this.options.version) {
      newVersion = this.options.version;
      if (!SimpleVersionManager.isValidVersion(newVersion)) {
        throw new Error(`Invalid version: ${newVersion}`);
      }
    } else if (this.options.type) {
      newVersion = SimpleVersionManager.incrementVersion(
        currentVersion,
        this.options.type,
        this.options.preId
      );
    } else {
      throw new Error('Either version or type must be specified');
    }

    if (SimpleVersionManager.compareVersions(newVersion, currentVersion) <= 0) {
      throw new Error(`New version ${newVersion} must be greater than current ${currentVersion}`);
    }

    this.pkg.version = newVersion;
    if (!this.options.dryRun) {
      writeFileSync(
        path.join(this.packageRootDir, 'package.json'),
        `${JSON.stringify(this.pkg, null, 2)}\n`
      );
    }

    Logger.success(`📈 Version: ${currentVersion} → ${newVersion}\n`);
    return newVersion;
  }

  private async ensureVersionNotPublished(version: string): Promise<void> {
    const packageName = this.pkg.name;
    try {
      execSync(`npm view ${packageName}@${version} version`, {
        stdio: 'pipe',
        cwd: this.packageRootDir
      });
      throw new Error(`Version already exists on npm: ${packageName}@${version}`);
    } catch {
      try {
        execSync(`npm view ${packageName}`, { stdio: 'pipe', cwd: this.packageRootDir });
        Logger.success(`📦 Package ${packageName} exists on npm`);
      } catch {
        Logger.success(`📦 Package ${packageName} is new to npm`);
      }
    }
  }

  private async checkChangelogUpdated(version: string): Promise<void> {
    Logger.info('📋 Checking changelog update...');

    const changelogPath = path.join(this.packageRootDir, 'CHANGELOG.md');

    if (!existsSync(changelogPath)) {
      throw new Error(
        `CHANGELOG.md not found. Please run 'pnpm changelog --version ${version}' first to generate the changelog.`
      );
    }

    const content = readFileSync(changelogPath, 'utf8');
    const hasVersionEntry = content.includes(`## [${version}]`);

    if (!hasVersionEntry) {
      throw new Error(
        `CHANGELOG.md has not been updated for version ${version}. Please run 'pnpm changelog --version ${version}' first.`
      );
    }

    Logger.success(`✅ CHANGELOG.md contains entry for version ${version}\n`);
  }

  private async commitAndTag(version: string): Promise<void> {
    Logger.info('📤 Committing and tagging...');
    try {
      execSync('git add .', { stdio: 'pipe', cwd: this.packageRootDir });
      execSync(`git commit -m "release: ${version}"`, {
        stdio: 'pipe',
        cwd: this.packageRootDir
      });
      const tag = this.options.gitTag || this.options.tag || `v${version}`;
      const tagExists = (() => {
        try {
          execSync(`git rev-parse -q --verify refs/tags/${tag}`, {
            stdio: 'pipe',
            cwd: this.packageRootDir
          });
          return true;
        } catch {
          return false;
        }
      })();
      if (tagExists) {
        throw new Error(`Git tag already exists: ${tag}`);
      }
      execSync(`git tag -a ${tag} -m "Release ${version}"`, {
        stdio: 'pipe',
        cwd: this.packageRootDir
      });
      Logger.success(`✅ Committed and tagged as ${tag}\n`);
    } catch {
      throw new Error('Git operations failed');
    }
  }

  private async publishToNpm(): Promise<void> {
    Logger.info('📦 Publishing to npm...');
    try {
      const distDir = path.join(this.packageRootDir, 'dist');
      const distPkgPath = path.join(distDir, 'package.json');
      if (!existsSync(distPkgPath)) {
        throw new Error('dist/package.json not found. Did you run build?');
      }
      const publishArgs = ['npm', 'publish'];
      const resolvedNpmTag =
        this.options.npmTag ||
        (this.pkg.version.includes('-') && (this.options.preId?.split('.')[0] || 'next')) ||
        undefined;
      if (resolvedNpmTag) {
        publishArgs.push('--tag', resolvedNpmTag);
      }
      if (this.options.registry) {
        publishArgs.push('--registry', this.options.registry);
      }
      execSync(publishArgs.join(' '), { stdio: 'inherit', cwd: distDir });

      Logger.success('✅ Published to npm\n');
    } catch (error) {
      throw new Error(`Publishing to npm failed, ${error}`);
    }
  }

  private async postRelease(version: string): Promise<void> {
    Logger.info('🎉 Running post-release tasks...');
    if (!this.options.dryRun) {
      try {
        execSync('git push origin --follow-tags', { stdio: 'pipe', cwd: this.packageRootDir });
        Logger.success('✅ Pushed to remote repository');
      } catch {
        Logger.warn('⚠️  Failed to push to remote repository');
      }
    }

    try {
      execSync('which gh', { stdio: 'pipe', cwd: this.packageRootDir });
      if (!this.options.dryRun) {
        const tag = this.options.gitTag || this.options.tag || `v${version}`;
        execSync(`gh release create ${tag} --generate-notes`, {
          stdio: 'pipe',
          cwd: this.packageRootDir
        });
        Logger.success('✅ GitHub release created');
      }
    } catch {
      Logger.info('ℹ️  GitHub CLI not found, skipping GitHub release');
    }
    Logger.success('✅ Post-release tasks completed\n');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options: ReleaseOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--version': {
        options.version = args[++i];
        break;
      }
      case '--type': {
        {
          const t = args[++i] as string;
          const allowed: ReleaseType[] = ['patch', 'minor', 'major', 'prerelease'];
          if (!allowed.includes(t as ReleaseType)) {
            throw new Error(`Invalid --type value: ${t}. Expected one of ${allowed.join(', ')}`);
          }
          options.type = t as ReleaseType;
        }
        break;
      }
      case '--preid': {
        options.preId = args[++i];
        break;
      }
      case '--dry-run': {
        options.dryRun = true;
        break;
      }
      case '--skip-tests': {
        options.skipTests = true;
        break;
      }
      case '--skip-build': {
        options.skipBuild = true;
        break;
      }
      case '--skip-changelog-check': {
        options.skipChangelogCheck = true;
        break;
      }
      case '--tag': {
        options.gitTag = args[++i];
        break;
      }
      case '--git-tag': {
        options.gitTag = args[++i];
        break;
      }
      case '--npm-tag': {
        options.npmTag = args[++i];
        break;
      }
      case '--registry': {
        options.registry = args[++i];
        break;
      }
      case '--help': {
        console.log(`
Usage: pnpm release [options]

Options:
  --version <version>   Specific version to release
  --type <type>         Version increment type (patch|minor|major|prerelease)
  --preid <id>          Prerelease identifier (alpha|beta|rc)
  --dry-run             Simulate release without actual changes
  --skip-tests          Skip running tests
  --skip-build          Skip building project
  --skip-changelog-check Skip changelog update verification
  --tag <tag>           Custom git tag (deprecated, use --git-tag)
  --git-tag <tag>       Custom git tag
  --npm-tag <tag>       NPM dist-tag (default: preId for prerelease, otherwise 'latest')
  --registry <url>      Custom npm registry
  --help                Show this help

Examples:
  pnpm release --type patch
  pnpm release --version 1.2.3
  pnpm release --type prerelease --preid beta
  pnpm release --dry-run --type minor
        `);
        process.exit(0);
      }
    }
  }

  const releaseSystem = new ReleaseSystemManager(options);
  await releaseSystem.release();
}

if (normalizePath(fileURLToPath(import.meta.url)) === normalizePath(process.argv[1])) {
  main().catch(error => {
    Logger.error(`❌ Release failed: ${String(error)}`);
    // Allow process to exit with failure naturally.
    process.exitCode = 1;
  });
}

export { ReleaseSystemManager };
