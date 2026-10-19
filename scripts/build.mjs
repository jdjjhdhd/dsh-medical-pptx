import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../lib/', import.meta.url), { recursive: true });
const common = { absWorkingDir: root, bundle: true, sourcemap: false, logLevel: 'warning' };
await build({
  ...common,
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  platform: 'node',
  target: 'node22',
  format: 'esm',
});
await build({
  ...common,
  entryPoints: ['src/deck.ts'],
  outfile: 'lib/deck.js',
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['pptxgenjs'],
});
const client = await build({
  ...common,
  entryPoints: ['src/client/index.tsx'],
  write: false,
  platform: 'browser',
  target: 'chrome120',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-store'],
});
const registration = 'window.__ModuleLoader__.load({id:"dsh-medical-pptx",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n';
await writeFile(new URL('../lib/client.js', import.meta.url), registration + client.outputFiles[0].text + '\nreturn module.exports;}});\n');
console.log('Built Host, medical deck renderer, and client plugin.');
