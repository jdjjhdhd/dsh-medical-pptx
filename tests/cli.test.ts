import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const project = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(project, 'scripts', 'generate.mjs');
const tempBase = await realpath(tmpdir());
const temporary = await mkdtemp(path.join(tempBase, 'medical-pptx-cli-test-'));
after(async () => {
  const resolved = await realpath(temporary);
  if (path.dirname(resolved) !== tempBase || !path.basename(resolved).startsWith('medical-pptx-cli-test-')) {
    throw new Error('Refusing cleanup outside the test temporary directory.');
  }
  await rm(resolved, { recursive: true, force: true });
});

function run(args: string[], cwd = temporary) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', timeout: 30000 });
}

test('CLI exports an editable PPTX and refuses to overwrite the existing file', async () => {
  const example = run(['--example', '--output', 'study.json']);
  assert.equal(example.status, 0, example.stderr);
  const input = JSON.parse(await readFile(path.join(temporary, 'study.json'), 'utf8'));
  assert.equal(input.demo, true);
  const generate = run(['--input', 'study.json', '--output', 'study.pptx']);
  assert.equal(generate.status, 0, generate.stderr);
  const output = path.join(temporary, 'study.pptx');
  const before = await readFile(output);
  assert.equal(before.subarray(0, 2).toString(), 'PK');
  assert.ok(before.length > 10000);
  const again = run(['--input', 'study.json', '--output', 'study.pptx']);
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /已存在/);
  const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
  assert.equal(digest(await readFile(output)), digest(before));
});

test('validation reports its limited scope without producing a presentation', async () => {
  const example = run(['--example', '--output', 'validation.json']);
  assert.equal(example.status, 0, example.stderr);
  const validation = run(['--input', 'validation.json', '--validate-only']);
  assert.equal(validation.status, 0, validation.stderr);
  const report = JSON.parse(validation.stdout);
  assert.equal(report.structuralValidation, 'passed');
  assert.equal(report.medicalFactsVerified, false);
  await assert.rejects(stat(path.join(temporary, 'validation.pptx')));
});

test('CLI refuses input and output outside its working directory', async () => {
  const child = path.join(temporary, 'workspace');
  await mkdir(child);
  const outer = run(['--example', '--output', 'outside.json']);
  assert.equal(outer.status, 0, outer.stderr);
  const badInput = run(['--input', '../outside.json', '--validate-only'], child);
  assert.notEqual(badInput.status, 0);
  assert.match(badInput.stderr, /输入文件必须位于当前工作目录内/);
  const local = run(['--example', '--output', 'local.json'], child);
  assert.equal(local.status, 0, local.stderr);
  const badOutput = run(['--input', 'local.json', '--output', '../outside.pptx'], child);
  assert.notEqual(badOutput.status, 0);
  assert.match(badOutput.stderr, /输出文件必须位于当前工作目录内/);
  await assert.rejects(stat(path.join(temporary, 'outside.pptx')));
});

test('malformed input does not echo source contents into diagnostics', async () => {
  const marker = 'private-source-content-must-not-appear';
  await writeFile(path.join(temporary, 'invalid.json'), marker);
  const result = run(['--input', 'invalid.json', '--validate-only']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /不是合法的 UTF-8 JSON/);
  assert.ok(!result.stderr.includes(marker));
});
