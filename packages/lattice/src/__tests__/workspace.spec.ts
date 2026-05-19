import { describe, expect, it } from 'vitest';
import { collectPnpmWorkspacePatterns } from '../workspace';

describe('collectPnpmWorkspacePatterns', () => {
  it('reads package globs from the pnpm workspace packages section', () => {
    expect(
      collectPnpmWorkspacePatterns(`
packages:
  - packages/*
  - 'docs'
  - "!**/dist"

catalogs:
  dev:
    typescript: 5.9.3
`),
    ).toEqual(['packages/*', 'docs', '!**/dist']);
  });
});
