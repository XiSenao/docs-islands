import { mainReleaseCli } from '../../../scripts/release/cli';

await mainReleaseCli(['--package', 'vitepress', ...process.argv.slice(2)]);
