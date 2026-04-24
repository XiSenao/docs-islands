import { mainChangelogCli } from '../../../scripts/release/cli';

await mainChangelogCli(['--package', 'vitepress', ...process.argv.slice(2)]);
