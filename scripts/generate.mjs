#!/usr/bin/env node
import { readFile, realpath, stat, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { renderMedicalDeck, validateMedicalDeck } from '../lib/deck.js';

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--example' || arg === '--validate-only' || arg === '--help') {
      options[arg.slice(2)] = true;
    } else if (arg === '--input' || arg === '--output') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} 后需要文件路径。`);
      options[arg.slice(2)] = value;
    } else {
      throw new Error(`不支持的参数：${arg}`);
    }
  }
  return options;
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function checkedInput(root, input) {
  if (!input || path.extname(input).toLowerCase() !== '.json') throw new Error('请用 --input 指定工作区内的课件 JSON 文件。');
  const resolved = await realpath(path.resolve(root, input));
  if (!inside(root, resolved)) throw new Error('输入文件必须位于当前工作目录内。请先在论文工作区运行生成器。');
  if ((await stat(resolved)).size > 2 * 1024 * 1024) throw new Error('课件 JSON 超过 2 MiB，请精简为汇报所需证据。');
  return resolved;
}

async function checkedOutput(root, output, extension) {
  if (!output || path.extname(output).toLowerCase() !== extension) throw new Error(`请用 --output 指定工作区内的 ${extension} 文件。`);
  const candidate = path.resolve(root, output);
  const parent = await realpath(path.dirname(candidate));
  const resolved = path.join(parent, path.basename(candidate));
  if (!inside(root, resolved)) throw new Error('输出文件必须位于当前工作目录内，不能通过链接指向工作区之外。');
  return resolved;
}

async function writeNewFile(filename, content) {
  let handle;
  let created = false;
  try {
    handle = await open(filename, 'wx');
    created = true;
    await handle.writeFile(content);
    await handle.close();
    handle = undefined;
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    if (created) await unlink(filename).catch(() => {});
    if (error?.code === 'EEXIST') throw new Error('目标文件已存在；请使用新的文件名，已有文件没有被覆盖。');
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !process.argv.slice(2).length) {
    console.log('医学文献汇报 PPTX 生成器\n  --example [--output simulated-study.json]\n  --input deck.json --validate-only\n  --input deck.json --output report.pptx\n在论文工作区运行；所有输入和输出均限制在当前工作目录内。');
    return;
  }
  const root = await realpath(process.cwd());
  if (options.example) {
    if (options.input || options['validate-only']) throw new Error('--example 不能与 --input 或 --validate-only 同时使用。');
    const example = await readFile(new URL('../examples/simulated-study.json', import.meta.url), 'utf8');
    if (!options.output) process.stdout.write(example);
    else {
      const output = await checkedOutput(root, options.output, '.json');
      await writeNewFile(output, example);
      console.log(JSON.stringify({ example: output, simulated: true }, null, 2));
    }
    return;
  }
  const inputPath = await checkedInput(root, options.input);
  let input;
  try { input = JSON.parse((await readFile(inputPath, 'utf8')).replace(/^\uFEFF/, '')); }
  catch { throw new Error('输入文件不是合法的 UTF-8 JSON，请检查格式。'); }
  if (options['validate-only']) {
    if (options.output) throw new Error('--validate-only 不接受 --output，不会写出文件。');
    const { deck, warnings } = validateMedicalDeck(input);
    console.log(JSON.stringify({ structuralValidation: 'passed', logicalSlides: deck.slides.length, warnings, medicalFactsVerified: false }, null, 2));
    return;
  }
  const output = await checkedOutput(root, options.output, '.pptx');
  const { buffer, deck, warnings } = await renderMedicalDeck(input);
  await writeNewFile(output, buffer);
  console.log(JSON.stringify({ output, bytes: buffer.length, logicalSlides: deck.slides.length, draft: true, warnings, medicalFactsVerified: false }, null, 2));
}

main().catch(error => {
  console.error(`医学课件生成失败：${error instanceof Error ? error.message : '未知错误'}`);
  process.exitCode = 1;
});
