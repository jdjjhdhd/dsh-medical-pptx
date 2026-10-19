import { build } from 'esbuild';
import { mkdir, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entries = (await readdir(new URL('../tests/', import.meta.url)))
  .filter(name => name.endsWith('.test.ts'))
  .map(name => `tests/${name}`);
if (!entries.length) throw new Error('No tests found.');
await mkdir(new URL('../.test-build/', import.meta.url), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: entries,
  outdir: '.test-build',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  logLevel: 'warning',
});
const files = entries.map(name => name.replace(/^tests\//, '.test-build/').replace(/\.ts$/, '.mjs'));
const child = spawn(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
