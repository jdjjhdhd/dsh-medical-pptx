import PptxGenJSModule from 'pptxgenjs';
import {
  COVERAGE_LABELS,
  FACT_STATUS_LABELS,
  SECTION_LABELS,
  STUDY_DESIGN_LABELS,
  estimateTextHeight,
  formatStatistics,
  planContentPages,
  planReferencePages,
  validateMedicalDeck,
  type MedicalDeck,
  type MedicalFact,
} from './schema.js';

export { validateMedicalDeck } from './schema.js';
export type { MedicalDeck } from './schema.js';

// 4.0.1 exposes an ESM constructor but declares a CommonJS default wrapper under NodeNext.
type PptxConstructor = typeof PptxGenJSModule.default;
const PptxGenJS = PptxGenJSModule as unknown as PptxConstructor;
type Slide = ReturnType<InstanceType<PptxConstructor>['addSlide']>;
const FONT = 'Microsoft YaHei';
const INK = '173457';
const BODY = '233144';
const MUTED = '5D6877';
const LEFT = 0.76;
const WIDTH = 11.8;

function addText(slide: Slide, value: string, x: number, y: number, width: number, height: number, fontSize: number, options: { bold?: boolean; color?: string; url?: string } = {}): void {
  slide.addText(value, {
    x, y, w: width, h: height,
    fontFace: FONT,
    fontSize,
    color: options.color ?? BODY,
    bold: options.bold ?? false,
    margin: 0,
    breakLine: false,
    valign: 'top',
    paraSpaceAfter: 0,
    lineSpacingMultiple: 1.15,
    lang: 'zh-CN',
    ...(options.url ? { hyperlink: { url: options.url } } : {}),
  });
}

function pageFooter(slide: Slide, deck: MedicalDeck, page: number, total: number): void {
  const mode = deck.demo ? '模拟数据 · ' : '';
  addText(slide, `${mode}文献汇报草稿 · 需核对原文 · 材料：${COVERAGE_LABELS[deck.material.coverage]}`, LEFT, 6.97, 11, 0.25, 12, { color: deck.demo ? '925A10' : MUTED });
  addText(slide, `${page} / ${total}`, 11.8, 6.97, 0.77, 0.25, 12, { color: MUTED });
}

function addHeading(slide: Slide, section: string, title: string): void {
  addText(slide, section, LEFT, 0.43, WIDTH, 0.32, 14, { color: MUTED });
  addText(slide, title, LEFT, 0.86, WIDTH, 1.14, 30, { bold: true, color: INK });
}

function sourceMarkers(fact: MedicalFact, deck: MedicalDeck): string {
  const numbers = [...new Set(fact.refs.map((ref) => deck.sources.findIndex((source) => source.id === ref.sourceId) + 1))];
  return numbers.length ? `来源 ${numbers.map((number) => `[${number}]`).join(' ')}；具体定位见演讲者备注` : '无原文定位引用；该项不得作为已确认结果';
}

function addFact(slide: Slide, fact: MedicalFact, deck: MedicalDeck, y: number): number {
  const labelHeight = estimateTextHeight(fact.label, 20);
  addText(slide, fact.label, LEFT, y, WIDTH, labelHeight, 20, { bold: true, color: INK });
  y += labelHeight;
  const value = fact.value ?? FACT_STATUS_LABELS[fact.status];
  const valueHeight = estimateTextHeight(value, 19);
  addText(slide, value, LEFT, y, WIDTH, valueHeight, 19, { color: fact.status === 'reported' ? BODY : '925A10' });
  y += valueHeight;
  for (const line of formatStatistics(fact)) {
    const height = estimateTextHeight(line, 17);
    addText(slide, line, LEFT, y, WIDTH, height, 17);
    y += height;
  }
  if (fact.note) {
    const note = `说明：${fact.note}`;
    const height = estimateTextHeight(note, 17);
    addText(slide, note, LEFT, y, WIDTH, height, 17, { color: MUTED });
    y += height;
  }
  addText(slide, sourceMarkers(fact, deck), LEFT, y, WIDTH, 0.24, 13, { color: MUTED });
  return y + 0.38;
}

function commonNotes(deck: MedicalDeck): string[] {
  return [
    `论文：${deck.paper.title}`,
    `引文：${deck.paper.citation}`,
    `研究设计：${STUDY_DESIGN_LABELS[deck.paper.studyDesign]}`,
    `已获得材料：${COVERAGE_LABELS[deck.material.coverage]}`,
    ...(deck.material.notes ? [`材料说明：${deck.material.notes}`] : []),
    '本文件为文献汇报草稿。结构和数值约束校验不代表事实核验，须人工逐项对照原文。',
    ...(deck.demo ? ['模拟数据：所有研究内容仅为插件格式演示，不对应真实研究，不得作为医学证据。'] : []),
  ];
}

function factNotes(fact: MedicalFact, deck: MedicalDeck): string[] {
  return [
    `事实 ${fact.id}：${fact.label}`,
    `状态：${fact.status}（${FACT_STATUS_LABELS[fact.status]}）`,
    ...(fact.value ? [`原文摘要：${fact.value}`] : []),
    ...formatStatistics(fact),
    ...(fact.note ? [`说明：${fact.note}`] : []),
    ...fact.refs.map((ref) => {
      const index = deck.sources.findIndex((source) => source.id === ref.sourceId);
      const source = deck.sources[index]!;
      return `来源 [${index + 1}] ${source.label}\n来源 ID：${source.id}\n原文定位：${ref.locator}${source.url ? `\nURL：${source.url}` : ''}`;
    }),
  ];
}

export async function renderMedicalDeck(input: unknown): Promise<{ buffer: Buffer; deck: MedicalDeck; warnings: string[] }> {
  const { deck, warnings } = validateMedicalDeck(input);
  const contentPages = planContentPages(deck);
  const referencePages = planReferencePages(deck);
  const total = 1 + contentPages.length + referencePages.length;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = '医学文献汇报插件';
  pptx.subject = '单篇医学论文文献汇报草稿';
  pptx.title = deck.paper.title;
  pptx.company = '';
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };

  let pageNumber = 1;
  const cover = pptx.addSlide();
  cover.background = { color: 'FFFFFF' };
  addText(cover, '医学文献汇报', LEFT, 0.58, WIDTH, 0.4, 20, { color: MUTED });
  addText(cover, deck.paper.title, LEFT, 1.47, WIDTH, 3.53, 32, { bold: true, color: INK });
  addText(cover, STUDY_DESIGN_LABELS[deck.paper.studyDesign], LEFT, 5.42, WIDTH, 0.45, 22, { color: INK });
  addText(cover, `材料范围：${COVERAGE_LABELS[deck.material.coverage]}；完整引文与来源见参考文献页`, LEFT, 6.07, WIDTH, 0.4, 17, { color: MUTED });
  cover.addNotes([...commonNotes(deck), ...warnings].join('\n\n'));
  pageFooter(cover, deck, pageNumber++, total);

  for (const page of contentPages) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    const suffix = page.continuation > 1 ? `（续 ${page.continuation}）` : '';
    addHeading(slide, SECTION_LABELS[page.slide.section], `${page.slide.title}${suffix}`);
    let y = 2.08;
    for (const fact of page.facts) y = addFact(slide, fact, deck, y);
    if (page.discussion) {
      const discussion = `讨论（待汇报者核对）：${page.discussion}`;
      addText(slide, discussion, LEFT, y + 0.06, WIDTH, estimateTextHeight(discussion, 18), 18, { color: MUTED });
    }
    const notesFacts = page.discussion
      ? page.slide.factIds.map((id) => deck.facts.find((fact) => fact.id === id)!)
      : page.facts;
    slide.addNotes([
      ...commonNotes(deck),
      `章节：${SECTION_LABELS[page.slide.section]}`,
      `页面标题：${page.slide.title}`,
      ...notesFacts.flatMap((fact) => factNotes(fact, deck)),
      ...(page.discussion ? [`汇报者讨论（须核对是否有证据支持，不是独立验证后的医学建议）：${page.discussion}`] : []),
    ].join('\n\n'));
    pageFooter(slide, deck, pageNumber++, total);
  }

  referencePages.forEach((items, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    addHeading(slide, '参考文献与资料来源', referencePages.length > 1 ? `引文与来源（${index + 1} / ${referencePages.length}）` : '引文与资料来源');
    let y = 2.08;
    const notes = commonNotes(deck);
    for (const item of items) {
      if (item.type === 'citation') {
        addText(slide, item.text, LEFT, y, WIDTH, item.height - 0.15, 17);
        notes.push(item.text);
      } else {
        addText(slide, `[${item.number}] ${item.source.label}`, LEFT, y, WIDTH, item.height - 0.15, 17, { color: INK, ...(item.source.url ? { url: item.source.url } : {}) });
        notes.push(`[${item.number}] ${item.source.label}\n来源 ID：${item.source.id}${item.source.url ? `\nURL：${item.source.url}` : '\n未提供网络地址，以已提供材料为准。'}`);
      }
      y += item.height;
    }
    slide.addNotes(notes.join('\n\n'));
    pageFooter(slide, deck, pageNumber++, total);
  });

  const output = await pptx.write({ outputType: 'nodebuffer' });
  return { buffer: Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer), deck, warnings };
}
