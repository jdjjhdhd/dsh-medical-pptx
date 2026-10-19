import { z } from 'zod';

export const SECTION_LABELS = {
  pico: '研究问题与 PICO',
  methods: '研究方法',
  results: '研究结果',
  safety: '安全性',
  limitations: '局限与证据缺口',
  conclusion: '结论与讨论',
} as const;

export const COVERAGE_LABELS = {
  abstract: '仅摘要',
  partial: '部分原文',
  full_text: '全文',
  full_text_and_supplement: '全文及补充材料',
} as const;

export const STUDY_DESIGN_LABELS = {
  randomized: '随机研究',
  cohort: '队列研究',
  case_control: '病例对照研究',
  cross_sectional: '横断面研究',
  other: '其他研究设计',
  unclear: '研究设计待确认',
} as const;

export const FACT_STATUS_LABELS = {
  reported: '原文报告',
  not_reported: '所查材料未报告',
  not_available: '当前材料不可获得',
  conflicting: '来源存在冲突，待核对',
  not_applicable: '不适用',
} as const;

const XML_UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u;
const text = (maximum: number) => z.string().trim().min(1, '不能为空').max(maximum, `最多 ${maximum} 个字符，请拆分内容；不会自动截断科学信息`).refine((value) => !XML_UNSAFE.test(value), '含不支持的控制字符').refine((value) => !value.includes('\t'), '不支持制表符，请使用普通空格或分开记录事实');
const singleLineText = (maximum: number) => text(maximum).refine((value) => !/[\r\n\u2028\u2029]/u.test(value), '必须为单行文本，请整理换行；不会自动删除或截断内容');
const id = text(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, '仅支持字母、数字、点、下划线和连字符');
const finite = z.number().finite('必须是有限数值');

const referenceSchema = z.object({
  sourceId: id,
  locator: text(240),
}).strict();

const countsSchema = z.object({
  unit: z.enum(['participants', 'events']),
  numerator: finite.int('计数必须为整数').nonnegative('计数不能为负数'),
  denominator: finite.int('分母必须为整数').positive('分母必须大于 0').optional(),
  analysisSet: text(80),
  timepoint: text(60),
}).strict().superRefine((counts, context) => {
  if (counts.unit === 'participants' && counts.denominator !== undefined && counts.numerator > counts.denominator) {
    context.addIssue({ code: 'custom', path: ['numerator'], message: '参与者人数不能超过分母；重复事件请使用 unit=events' });
  }
});

const effectSchema = z.object({
  measure: text(40),
  value: finite,
  ci: z.object({
    level: finite.gt(0, '置信水平须大于 0').lt(100, '置信水平须小于 100；用 90 或 95 表示百分比'),
    lower: finite,
    upper: finite,
  }).strict().optional(),
}).strict().superRefine((effect, context) => {
  if (effect.ci && effect.ci.lower > effect.ci.upper) {
    context.addIssue({ code: 'custom', path: ['ci', 'lower'], message: '置信区间下限不能大于上限' });
  }
});

const factSchema = z.object({
  id,
  label: text(60),
  status: z.enum(['reported', 'not_reported', 'not_available', 'conflicting', 'not_applicable']),
  value: text(300).nullable(),
  refs: z.array(referenceSchema).max(12, '每项事实最多 12 个定位引用'),
  note: text(160).optional(),
  statistics: z.object({
    counts: countsSchema.optional(),
    effect: effectSchema.optional(),
  }).strict().refine((statistics) => statistics.counts !== undefined || statistics.effect !== undefined, 'statistics 至少包含 counts 或 effect').optional(),
}).strict().superRefine((fact, context) => {
  if (fact.status === 'reported') {
    if (fact.value === null) context.addIssue({ code: 'custom', path: ['value'], message: 'reported 必须提供原文支持的 value' });
    if (fact.refs.length === 0) context.addIssue({ code: 'custom', path: ['refs'], message: 'reported 必须提供至少一个可定位的来源引用' });
  } else {
    if (fact.value !== null) context.addIssue({ code: 'custom', path: ['value'], message: '非 reported 状态的 value 必须为 null，请用 note 解释缺失或冲突' });
    if (fact.statistics) context.addIssue({ code: 'custom', path: ['statistics'], message: '非 reported 状态不能附带已确认统计数值' });
  }
  if (fact.status === 'conflicting' && fact.refs.length < 2) {
    context.addIssue({ code: 'custom', path: ['refs'], message: 'conflicting 必须提供至少两个冲突来源或定位' });
  }
});

export const medicalDeckSchema = z.object({
  schemaVersion: z.literal(1),
  demo: z.boolean().default(false),
  paper: z.object({
    title: singleLineText(140),
    citation: singleLineText(240),
    studyDesign: z.enum(['randomized', 'cohort', 'case_control', 'cross_sectional', 'other', 'unclear']),
  }).strict(),
  material: z.object({
    coverage: z.enum(['abstract', 'partial', 'full_text', 'full_text_and_supplement']),
    notes: text(400).optional(),
  }).strict(),
  sources: z.array(z.object({
    id,
    label: singleLineText(180),
    url: z.url('须为有效的 HTTPS 地址').max(2000).refine((url) => new URL(url).protocol === 'https:', '只支持 HTTPS 来源地址').optional(),
  }).strict()).min(1, '至少提供一个资料来源').max(24, '最多 24 个来源'),
  facts: z.array(factSchema).min(1, '至少提供一项事实').max(80, '最多 80 项事实'),
  slides: z.array(z.object({
    section: z.enum(['pico', 'methods', 'results', 'safety', 'limitations', 'conclusion']),
    title: singleLineText(48),
    factIds: z.array(id).min(1, '每页至少引用一项事实').max(4, '每页最多 4 项事实，请分成多页'),
    discussion: text(280).optional(),
  }).strict()).min(6, '必须覆盖六个医学汇报章节').max(28, '正文最多 28 页，自动分页及参考文献仍计入总页数限制'),
}).strict();

export type MedicalDeck = z.infer<typeof medicalDeckSchema>;
export type MedicalFact = MedicalDeck['facts'][number];
export type MedicalSlide = MedicalDeck['slides'][number];
export type MedicalSection = MedicalSlide['section'];

export class MedicalDeckValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`医学课件数据校验失败：\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'MedicalDeckValidationError';
  }
}

export function formatStatistics(fact: MedicalFact): string[] {
  const lines: string[] = [];
  const counts = fact.statistics?.counts;
  if (counts) {
    const unit = counts.unit === 'participants' ? '参与者' : '事件次数';
    const denominator = counts.denominator === undefined ? '，分母未提供' : `，分母 ${counts.denominator}`;
    lines.push(`${unit} ${counts.numerator}${denominator}；分析集：${counts.analysisSet}；时点：${counts.timepoint}`);
  }
  const effect = fact.statistics?.effect;
  if (effect) {
    const ci = effect.ci ? `，${effect.ci.level}% CI [${effect.ci.lower}, ${effect.ci.upper}]` : '，置信区间未提供';
    lines.push(`${effect.measure} ${effect.value}${ci}`);
  }
  return lines;
}

// Conservative CJK-aware line measurement keeps scientific text intact at a fixed font size.
export function estimateTextHeight(value: string, fontSize: number, width = 11.8): number {
  const lines = value.split(/\r\n|[\r\n\u2028\u2029]/u).reduce((total, paragraph) => {
    const units = [...paragraph].reduce((sum, char) => {
      const width = /[^\u0000-\u024F]|[MWmw@#%&]/u.test(char) ? 1 : /[A-Z]/u.test(char) ? 0.8 : 0.65;
      return sum + width;
    }, 0);
    return total + Math.max(1, Math.ceil((units * fontSize / 72) / (width * 0.94)));
  }, 0);
  return lines * fontSize / 72 * 1.3 + 0.04;
}

export function factHeight(fact: MedicalFact): number {
  return estimateTextHeight(fact.label, 20)
    + estimateTextHeight(fact.value ?? FACT_STATUS_LABELS[fact.status], 19)
    + formatStatistics(fact).reduce((height, line) => height + estimateTextHeight(line, 17), 0)
    + (fact.note ? estimateTextHeight(`说明：${fact.note}`, 17) : 0)
    + 0.38;
}

export type ContentPage = {
  kind: 'content';
  slide: MedicalSlide;
  facts: MedicalFact[];
  discussion?: string;
  continuation: number;
};

export function planContentPages(deck: MedicalDeck): ContentPage[] {
  const facts = new Map(deck.facts.map((fact) => [fact.id, fact]));
  const pages: ContentPage[] = [];
  for (const slide of deck.slides) {
    let current: ContentPage = { kind: 'content', slide, facts: [], continuation: 1 };
    let used = 0;
    for (const factId of slide.factIds) {
      const fact = facts.get(factId);
      if (!fact) continue;
      const height = factHeight(fact);
      if (current.facts.length > 0 && used + height > 4.58) {
        pages.push(current);
        current = { kind: 'content', slide, facts: [], continuation: current.continuation + 1 };
        used = 0;
      }
      current.facts.push(fact);
      used += height;
    }
    if (slide.discussion) {
      const discussionHeight = estimateTextHeight(`讨论（待汇报者核对）：${slide.discussion}`, 18) + 0.18;
      if (current.facts.length > 0 && used + discussionHeight > 4.58) {
        pages.push(current);
        current = { kind: 'content', slide, facts: [], continuation: current.continuation + 1 };
      }
      current.discussion = slide.discussion;
    }
    pages.push(current);
  }
  return pages;
}

export type ReferenceItem = { type: 'citation'; text: string; height: number }
  | { type: 'source'; source: MedicalDeck['sources'][number]; number: number; height: number };

export function planReferencePages(deck: MedicalDeck): ReferenceItem[][] {
  const items: ReferenceItem[] = [{ type: 'citation', text: `论文引文：${deck.paper.citation}`, height: estimateTextHeight(`论文引文：${deck.paper.citation}`, 17) + 0.24 }];
  deck.sources.forEach((source, index) => items.push({ type: 'source', source, number: index + 1, height: estimateTextHeight(`[${index + 1}] ${source.label}`, 17) + 0.24 }));
  const pages: ReferenceItem[][] = [];
  let page: ReferenceItem[] = [];
  let height = 0;
  for (const item of items) {
    if (page.length && height + item.height > 4.58) {
      pages.push(page);
      page = [];
      height = 0;
    }
    page.push(item);
    height += item.height;
  }
  if (page.length) pages.push(page);
  return pages;
}

export function validateMedicalDeck(input: unknown): { deck: MedicalDeck; warnings: string[] } {
  const parsed = medicalDeckSchema.safeParse(input);
  if (!parsed.success) {
    throw new MedicalDeckValidationError(parsed.error.issues.map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`));
  }
  const deck = parsed.data;
  const issues: string[] = [];
  const warnings: string[] = [];
  const sourceIds = new Set<string>();
  deck.sources.forEach((source, index) => {
    if (sourceIds.has(source.id)) issues.push(`sources.${index}.id: 重复来源 ID ${source.id}`);
    sourceIds.add(source.id);
  });
  const factIds = new Set<string>();
  deck.facts.forEach((fact, index) => {
    if (factIds.has(fact.id)) issues.push(`facts.${index}.id: 重复事实 ID ${fact.id}`);
    factIds.add(fact.id);
    const refs = new Set<string>();
    fact.refs.forEach((ref, refIndex) => {
      if (!sourceIds.has(ref.sourceId)) issues.push(`facts.${index}.refs.${refIndex}.sourceId: 来源 ${ref.sourceId} 不存在`);
      const key = `${ref.sourceId}\n${ref.locator}`;
      if (refs.has(key)) issues.push(`facts.${index}.refs.${refIndex}: 重复定位，冲突证据须提供不同定位`);
      refs.add(key);
    });
    if (factHeight(fact) > 4.58) issues.push(`facts.${index}: 内容无法在单页以可读字号完整显示，请把该事实拆成多个事实，不会自动截断`);
  });
  const sections = new Set<MedicalSection>();
  const usedFacts = new Set<string>();
  deck.slides.forEach((slide, index) => {
    sections.add(slide.section);
    if (slide.discussion && estimateTextHeight(`讨论（待汇报者核对）：${slide.discussion}`, 18) + 0.18 > 4.58) {
      issues.push(`slides.${index}.discussion: 讨论内容无法在单页以可读字号完整显示，请缩短或拆成多页，不会自动截断`);
    }
    const seen = new Set<string>();
    slide.factIds.forEach((factId, factIndex) => {
      if (!factIds.has(factId)) issues.push(`slides.${index}.factIds.${factIndex}: 事实 ${factId} 不存在`);
      if (seen.has(factId)) issues.push(`slides.${index}.factIds.${factIndex}: 同页重复事实 ${factId}`);
      seen.add(factId);
      usedFacts.add(factId);
    });
  });
  for (const section of Object.keys(SECTION_LABELS) as MedicalSection[]) {
    if (!sections.has(section)) issues.push(`slides: 缺少必需章节 ${section}（${SECTION_LABELS[section]}）`);
  }
  if (issues.length) throw new MedicalDeckValidationError(issues);
  const totalSlides = 1 + planContentPages(deck).length + planReferencePages(deck).length;
  if (totalSlides < 7 || totalSlides > 30) throw new MedicalDeckValidationError([`slides: 自动分页及参考文献后共 ${totalSlides} 页，须为 7–30 页，请合并或减少内容`]);
  for (const fact of deck.facts) {
    if (!usedFacts.has(fact.id)) warnings.push(`事实 ${fact.id} 未被任何幻灯片引用。`);
  }
  if (deck.demo) warnings.push('本文件含模拟数据，只用于演示格式，不能用于医学证据或临床判断。');
  if (deck.material.coverage === 'abstract' || deck.material.coverage === 'partial') {
    warnings.push(`当前材料范围：${COVERAGE_LABELS[deck.material.coverage]}。全文与补充材料中可能存在尚未获得的信息，缺失不等于研究未实施。`);
  }
  if (deck.paper.studyDesign === 'unclear') warnings.push('研究设计尚未确认，须查阅原文核对。');
  warnings.push('所有页面均标为草稿。生成器校验结构与部分数值约束，不核验事实真伪或统计结论，汇报前须逐项对照原文。');
  return { deck, warnings };
}
