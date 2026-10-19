import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { renderMedicalDeck } from '../src/deck.js';
import { MedicalDeckValidationError, estimateTextHeight, factHeight, planContentPages, validateMedicalDeck, type MedicalDeck } from '../src/schema.js';

const example = JSON.parse(await readFile(new URL('../examples/simulated-study.json', import.meta.url), 'utf8')) as MedicalDeck;
const fresh = (): MedicalDeck => structuredClone(example);

// Read actual OPC ZIP entries rather than trusting a filename extension or a Buffer prefix.
function unzip(buffer: Buffer): Map<string, string> {
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  assert.ok(end >= 0, 'PPTX must have a ZIP central directory');
  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let index = 0; index < count; index++) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedLength = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + fileNameLength);
    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50);
    const contentOffset = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const compressed = buffer.subarray(contentOffset, contentOffset + compressedLength);
    assert.ok(method === 0 || method === 8, 'PPTX entries use supported ZIP compression');
    const content = method === 8 ? inflateRawSync(compressed) : compressed;
    files.set(name, content.toString('utf8'));
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  return files;
}

test('example validates and reports its simulated abstract-only scope', () => {
  const { deck, warnings } = validateMedicalDeck(fresh());
  assert.equal(deck.demo, true);
  assert.ok(warnings.some((warning) => warning.includes('模拟')));
  assert.ok(warnings.some((warning) => warning.includes('仅摘要')));
});

test('non-demo is the default when demo is omitted', () => {
  const input: Partial<MedicalDeck> = fresh();
  delete input.demo;
  assert.equal(validateMedicalDeck(input).deck.demo, false);
});

test('rejects a reported fact with no value and identifies its field', () => {
  const input = fresh();
  input.facts[0]!.value = null;
  assert.throws(() => validateMedicalDeck(input), /facts\.0\.value.*reported/);
});

test('rejects a reported fact without a locating reference', () => {
  const input = fresh();
  input.facts[0]!.refs = [];
  assert.throws(() => validateMedicalDeck(input), /facts\.0\.refs/);
});

test('rejects unknown source IDs and unknown slide fact IDs', () => {
  const input = fresh();
  input.facts[0]!.refs[0]!.sourceId = 'missing-source';
  input.slides[0]!.factIds[0] = 'missing-fact';
  assert.throws(() => validateMedicalDeck(input), (error: unknown) => {
    assert.ok(error instanceof MedicalDeckValidationError);
    assert.ok(error.issues.some((issue) => issue.startsWith('facts.0.refs.0.sourceId:')));
    assert.ok(error.issues.some((issue) => issue.startsWith('slides.0.factIds.0:')));
    return true;
  });
});

test('rejects empty source locators instead of accepting untraceable evidence', () => {
  const input = fresh();
  input.facts[0]!.refs[0]!.locator = ' ';
  assert.throws(() => validateMedicalDeck(input), /facts\.0\.refs\.0\.locator/);
});

test('rejects values and statistics attached to missing information', () => {
  const input = fresh();
  input.facts[0]!.status = 'not_reported';
  assert.throws(() => validateMedicalDeck(input), /facts\.0\.value/);
  input.facts[0]!.value = null;
  input.facts[0]!.statistics = { effect: { measure: '风险比', value: 1 } };
  assert.throws(() => validateMedicalDeck(input), /facts\.0\.statistics/);
});

test('conflicting evidence needs two distinct locating references', () => {
  const input = fresh();
  const fact = input.facts[0]!;
  fact.status = 'conflicting';
  fact.value = null;
  assert.throws(() => validateMedicalDeck(input), /facts\.0\.refs/);
  fact.refs.push(structuredClone(fact.refs[0]!));
  assert.throws(() => validateMedicalDeck(input), /重复定位/);
  fact.refs[1]!.locator = '模拟摘要，补充的冲突定位';
  assert.equal(validateMedicalDeck(input).deck.facts[0]!.status, 'conflicting');
});

test('participants cannot be 81/80 while repeat events can exceed the denominator', () => {
  const input = fresh();
  input.facts[0]!.statistics = { counts: { unit: 'participants', numerator: 81, denominator: 80, analysisSet: '测试分析集', timepoint: '第 4 周' } };
  assert.throws(() => validateMedicalDeck(input), /facts\.0\.statistics\.counts\.numerator/);
  input.facts[0]!.statistics.counts!.unit = 'events';
  assert.equal(validateMedicalDeck(input).deck.facts[0]!.statistics!.counts!.numerator, 81);
});

test('rejects inverted confidence intervals and invalid confidence levels', () => {
  const input = fresh();
  input.facts[0]!.statistics = { effect: { measure: '模拟效应', value: 1, ci: { level: 90, lower: 2, upper: 1 } } };
  assert.throws(() => validateMedicalDeck(input), /facts\.0\.statistics\.effect\.ci\.lower/);
  input.facts[0]!.statistics.effect!.ci = { level: 100, lower: 0, upper: 2 };
  assert.throws(() => validateMedicalDeck(input), /facts\.0\.statistics\.effect\.ci\.level/);
});

test('rejects overly long scientific text with a field path and keeps input intact', () => {
  const input = fresh();
  const value = '医'.repeat(301);
  input.facts[0]!.value = value;
  assert.throws(() => validateMedicalDeck(input), /facts\.0\.value.*不会自动截断/);
  assert.equal(input.facts[0]!.value, value);
});

test('rejects a combined fact block that would overflow even when each field is within its limit', () => {
  const input = fresh();
  const fact = input.facts[0]!;
  fact.label = '医'.repeat(60);
  fact.value = '医'.repeat(300);
  fact.note = '医'.repeat(160);
  fact.statistics = { counts: { unit: 'participants', numerator: 1, denominator: 2, analysisSet: '医'.repeat(80), timepoint: '医'.repeat(60) } };
  assert.throws(() => validateMedicalDeck(input), /facts\.0: 内容无法在单页/);
});

test('rejects embedded line breaks in fixed titles, paper citations, and source labels', () => {
  const paperTitle = fresh();
  paperTitle.paper.title = '论文\n标题';
  assert.throws(() => validateMedicalDeck(paperTitle), /paper\.title.*单行/);
  const slideTitle = fresh();
  slideTitle.slides[0]!.title = '研究\r问题';
  assert.throws(() => validateMedicalDeck(slideTitle), /slides\.0\.title.*单行/);
  const citation = fresh();
  citation.paper.citation = '论文\r\n引文';
  assert.throws(() => validateMedicalDeck(citation), /paper\.citation.*单行/);
  const source = fresh();
  source.sources[0]!.label = '来源\u2028说明';
  assert.throws(() => validateMedicalDeck(source), /sources\.0\.label.*单行/);
});

test('retains normal discussion paragraphs and rejects too many lines without truncating them', () => {
  const input = fresh();
  input.slides[0]!.discussion = '第一项讨论。\n第二项讨论。';
  assert.equal(validateMedicalDeck(input).deck.slides[0]!.discussion, input.slides[0]!.discussion);
  const value = '核对\n'.repeat(80) + '结尾';
  input.slides[0]!.discussion = value;
  assert.throws(() => validateMedicalDeck(input), /slides\.0\.discussion: 讨论内容无法在单页/);
  assert.equal(input.slides[0]!.discussion, value);
});

test('measures CR, CRLF, and wide Latin letters conservatively and rejects hidden tab widths', () => {
  assert.equal(estimateTextHeight('甲\r乙', 19), estimateTextHeight('甲\n乙', 19));
  assert.equal(estimateTextHeight('甲\r\n乙', 19), estimateTextHeight('甲\n乙', 19));
  assert.ok(estimateTextHeight('W'.repeat(120), 19) > estimateTextHeight('i'.repeat(120), 19));
  const input = fresh();
  input.facts[0]!.value = '研究对象\t80 人';
  assert.throws(() => validateMedicalDeck(input), /facts\.0\.value.*制表符/);
});

test('includes automatic pagination and references in the total 30-slide limit', () => {
  const input = fresh();
  while (input.slides.length < 28) input.slides.push(structuredClone(input.slides[0]!));
  input.sources = Array.from({ length: 24 }, (_, index) => ({ id: index === 0 ? 'simulated-abstract' : `source-${index}`, label: '完整来源说明'.repeat(25) }));
  assert.throws(() => validateMedicalDeck(input), /自动分页及参考文献后共.*7–30/);
});

test('rejects missing medical sections, duplicate IDs, and unsafe source URL schemes', () => {
  const input = fresh();
  input.slides[4]!.section = 'conclusion';
  assert.throws(() => validateMedicalDeck(input), /缺少必需章节 limitations/);
  const duplicate = fresh();
  duplicate.facts[1]!.id = duplicate.facts[0]!.id;
  assert.throws(() => validateMedicalDeck(duplicate), /facts\.1\.id.*重复/);
  const unsafe = fresh();
  unsafe.sources[0]!.url = 'javascript:alert(1)';
  assert.throws(() => validateMedicalDeck(unsafe), /sources\.0\.url.*HTTPS/);
});

test('paginates multiple complete facts without reducing font size or omitting evidence', () => {
  const input = fresh();
  const additional = Array.from({ length: 3 }, (_, index) => ({ ...structuredClone(input.facts[0]!), id: `long-${index}`, value: `完整事实 ${index}：${'保留证据'.repeat(40)}` }));
  input.facts.push(...additional);
  input.slides[0]!.factIds = ['population', ...additional.map((fact) => fact.id)];
  const { deck } = validateMedicalDeck(input);
  const pages = planContentPages(deck);
  assert.ok(pages.filter((page) => page.slide.section === 'pico').length > 1);
  for (const page of pages) {
    assert.ok(page.facts.length <= 4);
    assert.ok(page.facts.reduce((height, fact) => height + factHeight(fact), 0) <= 4.58);
  }
  assert.deepEqual(pages.filter((page) => page.slide.section === 'pico').flatMap((page) => page.facts.map((fact) => fact.id)), input.slides[0]!.factIds);
});

test('keeps the original fact locators in notes when discussion moves to a continuation page', async () => {
  const input = fresh();
  const value = '模拟信息'.repeat(60);
  const locator = '模拟定位：论文第 9 页，表 2，方案甲结局';
  input.facts[0]!.value = value;
  input.facts[0]!.refs[0]!.locator = locator;
  input.slides[0]!.factIds = ['population'];
  input.slides[0]!.discussion = '追溯讨论'.repeat(50);
  const { buffer, deck } = await renderMedicalDeck(input);
  assert.ok(planContentPages(deck).some((page) => page.discussion && page.facts.length === 0));
  const entries = unzip(buffer);
  const discussionSlide = [...entries].find(([name, xml]) => /^ppt\/slides\/slide\d+\.xml$/.test(name) && xml.includes(input.slides[0]!.discussion!));
  assert.ok(discussionSlide);
  assert.ok(!discussionSlide[1].includes(value), 'do not duplicate the complete fact in visible continuation content');
  const number = /slide(\d+)\.xml$/.exec(discussionSlide[0])![1];
  const notes = entries.get(`ppt/notesSlides/notesSlide${number}.xml`)!;
  assert.ok(notes.includes(locator));
  assert.ok(notes.includes('来源 ID：simulated-abstract'));
});

test('emits an actual editable PPTX package with scope, sources, and unchanged 90% CI', async () => {
  const { buffer, deck, warnings } = await renderMedicalDeck(fresh());
  assert.ok(buffer.length > 10_000);
  assert.equal(deck.facts.find((fact) => fact.id === 'result')!.statistics!.effect!.ci!.level, 90);
  assert.ok(warnings.length > 0);
  const entries = unzip(buffer);
  assert.ok(entries.has('[Content_Types].xml'));
  assert.ok(entries.has('ppt/presentation.xml'));
  assert.ok(entries.has('ppt/_rels/presentation.xml.rels'));
  const slides = [...entries].filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  assert.ok(slides.length >= 7 && slides.length <= 30);
  for (const [name, xml] of slides) {
    assert.match(xml, /<p:sp>/, `${name} has editable native text shapes`);
    assert.match(xml, /文献汇报草稿/);
    assert.match(xml, /仅摘要/);
    assert.match(xml, /模拟数据/);
  }
  const allSlideXml = slides.map(([, xml]) => xml).join('\n');
  assert.match(allSlideXml, /90% CI \[0\.8, 1\.8\]/);
  assert.doesNotMatch(allSlideXml, /95% CI/);
  assert.match(allSlideXml, /参与者 18，分母 40/);
  assert.match(allSlideXml, /局限与证据缺口/);
  assert.match(allSlideXml, /参考文献与资料来源/);
  const notes = [...entries].filter(([name]) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));
  assert.equal(notes.length, slides.length);
  assert.ok(notes.some(([, xml]) => xml.includes('模拟摘要，第 2 段：示例结果')));
  assert.ok(notes.some(([, xml]) => xml.includes('来源 ID：simulated-abstract')));
});
