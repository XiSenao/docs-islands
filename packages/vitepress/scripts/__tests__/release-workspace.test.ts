/**
 * @vitest-environment node
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildChangelogSection,
  createEmptyChangelogTemplate,
  createReleasePlanFromVersionSelection,
  insertChangelogSection,
} from '../../../../scripts/release/changelog';
import { createReleaseCliOptions } from '../../../../scripts/release/cli';
import {
  ALL_RELEASE_PACKAGES_SELECTION,
  createReleasePackageSelectionChoices,
  discoverReleasePackages,
  incrementVersion,
  normalizePromptPackageSelections,
  resolvePackageSelections,
  selectPreviousGitTag,
  sortReleasePackageConfigs,
} from '../../../../scripts/release/shared';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

function runReleaseDryRun(args: string[]): string {
  return execFileSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/release.ts', ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
}

function runReleaseHelp(): string {
  return execFileSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/release.ts', '--help'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
}

function getReleasePackageByKey(key: 'logger' | 'vitepress') {
  const config = discoverReleasePackages().find((pkg) => pkg.key === key);
  if (!config) {
    throw new Error(`${key} config not found`);
  }
  return config;
}

describe('workspace release helpers', () => {
  it('discovers only registered public release packages', () => {
    const packages = discoverReleasePackages();

    expect(packages.map((pkg) => pkg.key)).toEqual(['logger', 'vitepress']);
    expect(packages.map((pkg) => pkg.packageName)).not.toContain(
      '@docs-islands/core',
    );
  });

  it('sorts release targets by internal dependency order', () => {
    const packages = discoverReleasePackages();
    const selected = resolvePackageSelections(
      ['vitepress', 'logger'],
      packages,
    );

    expect(sortReleasePackageConfigs(selected).map((pkg) => pkg.key)).toEqual([
      'logger',
      'vitepress',
    ]);
  });

  it('normalizes root release CLI options from positional and repeatable flags', () => {
    expect(
      createReleaseCliOptions(['logger'], {
        package: ['vitepress'],
        type: 'prerelease',
        preid: 'beta',
        dryRun: true,
        yes: true,
        skipBuild: true,
        skipTests: true,
        skipChangelog: true,
      }),
    ).toEqual({
      packageSelectors: ['logger', 'vitepress'],
      type: 'prerelease',
      preId: 'beta',
      dryRun: true,
      yes: true,
      skipTests: true,
      skipBuild: true,
      skipChangelog: true,
      skipPush: false,
      skipGithubRelease: false,
      registry: undefined,
      npmTag: undefined,
      fromTag: undefined,
      help: false,
    });
  });

  it('creates multiselect choices with an all-packages shortcut', () => {
    const packages = discoverReleasePackages();
    const choices = createReleasePackageSelectionChoices(packages);

    expect(choices[0]).toEqual({
      title: 'all public packages',
      value: ALL_RELEASE_PACKAGES_SELECTION,
      selected: false,
    });
    expect(choices.slice(1).map((choice) => choice.value)).toEqual([
      'logger',
      'vitepress',
    ]);
  });

  it('expands the all-packages shortcut to every public package', () => {
    const packages = discoverReleasePackages();

    expect(
      normalizePromptPackageSelections(
        [ALL_RELEASE_PACKAGES_SELECTION],
        packages,
      ),
    ).toEqual({
      packageSelectors: ['logger', 'vitepress'],
    });
  });

  it('prefers package tags and falls back to legacy global tags', () => {
    const vitepressConfig = getReleasePackageByKey('vitepress');

    expect(
      selectPreviousGitTag(vitepressConfig, [
        'v0.2.5',
        'logger/v0.2.6',
        'vitepress/v0.2.7',
      ]),
    ).toBe('vitepress/v0.2.7');

    expect(selectPreviousGitTag(vitepressConfig, ['v0.2.5', 'v0.2.4'])).toBe(
      'v0.2.5',
    );
  });

  it('creates changelog sections and preserves the Unreleased heading', () => {
    const template = createEmptyChangelogTemplate();
    const section = buildChangelogSection('1.2.3', [
      'abc1234 feat(logger): add scoped release logger',
      'def5678 fix(logger): preserve tag fallback',
    ]);
    const updated = insertChangelogSection(template, section);

    expect(updated).toContain('## [Unreleased]');
    expect(updated.indexOf('## [Unreleased]')).toBeLessThan(
      updated.indexOf('## [1.2.3] - '),
    );
    expect(updated).toContain('### Features');
    expect(updated).toContain('### Bug Fixes');
  });

  it('derives prerelease tags from the selected version strategy', () => {
    const loggerConfig = getReleasePackageByKey('logger');

    const plan = createReleasePlanFromVersionSelection(loggerConfig, {
      mode: 'prerelease',
      preId: 'beta',
    });

    expect(plan.newVersion).toBe(
      incrementVersion(loggerConfig.manifest.version!, 'prerelease', 'beta'),
    );
    expect(plan.gitTag).toBe(`logger/v${plan.newVersion}`);
    expect(plan.npmTag).toBe('beta');
  });
});

describe('workspace release dry-run CLI', () => {
  it('renders cac-powered help output', () => {
    const output = runReleaseHelp();

    expect(output).toContain('release');
    expect(output).toContain('[...packages]');
    expect(output).toContain('--package <name>');
    expect(output).toContain('--skip-github-release');
  });

  it('previews a logger patch release', () => {
    const loggerPlan = createReleasePlanFromVersionSelection(
      getReleasePackageByKey('logger'),
      {
        mode: 'patch',
      },
    );
    const output = runReleaseDryRun([
      '--package',
      'logger',
      '--type',
      'patch',
      '--dry-run',
      '--yes',
    ]);

    expect(output).toContain('@docs-islands/logger');
    expect(output).toContain(
      `version: ${loggerPlan.currentVersion} -> ${loggerPlan.newVersion}`,
    );
    expect(output).toContain(`tag: ${loggerPlan.gitTag}`);
  });

  it('previews a vitepress prerelease with a prerelease npm tag', () => {
    const vitepressPlan = createReleasePlanFromVersionSelection(
      getReleasePackageByKey('vitepress'),
      {
        mode: 'prerelease',
        preId: 'beta',
      },
    );
    const output = runReleaseDryRun([
      '--package',
      'vitepress',
      '--type',
      'prerelease',
      '--preid',
      'beta',
      '--dry-run',
      '--yes',
    ]);

    expect(output).toContain('@docs-islands/vitepress');
    expect(output).toContain(
      `version: ${vitepressPlan.currentVersion} -> ${vitepressPlan.newVersion}`,
    );
    expect(output).toContain(`tag: ${vitepressPlan.gitTag}`);
    expect(output).toContain('npm tag: beta');
  });

  it('accepts positional package selectors like tsdown-style commands', () => {
    const loggerPlan = createReleasePlanFromVersionSelection(
      getReleasePackageByKey('logger'),
      {
        mode: 'patch',
      },
    );
    const output = runReleaseDryRun([
      'logger',
      '--type',
      'patch',
      '--dry-run',
      '--yes',
    ]);

    expect(output).toContain('@docs-islands/logger');
    expect(output).toContain(`tag: ${loggerPlan.gitTag}`);
  });

  it('orders multi-package dry-runs from logger to vitepress', () => {
    const loggerPlan = createReleasePlanFromVersionSelection(
      getReleasePackageByKey('logger'),
      {
        mode: 'patch',
      },
    );
    const vitepressPlan = createReleasePlanFromVersionSelection(
      getReleasePackageByKey('vitepress'),
      {
        mode: 'patch',
      },
    );
    const output = runReleaseDryRun([
      '--package',
      'logger,vitepress',
      '--type',
      'patch',
      '--dry-run',
      '--yes',
    ]);

    const loggerIndex = output.indexOf('@docs-islands/logger');
    const vitepressIndex = output.indexOf('@docs-islands/vitepress');

    expect(loggerIndex).toBeGreaterThanOrEqual(0);
    expect(vitepressIndex).toBeGreaterThan(loggerIndex);
    expect(output).toContain(`tag: ${loggerPlan.gitTag}`);
    expect(output).toContain(`tag: ${vitepressPlan.gitTag}`);
  });
});
