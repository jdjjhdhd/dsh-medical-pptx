import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

interface SkillRegistration {
  name: string;
  description: string;
  content: string;
  source: 'bundled';
  provider: string;
  path: string;
  resourceBase: { kind: 'directory'; path: string };
}

interface HostContext {
  skills: { register(skill: SkillRegistration): () => void };
}

export const name = 'medical-pptx';
export const inject = ['skills'];

export function apply(ctx: HostContext): void {
  const skillPath = fileURLToPath(new URL('../skills/medical-pptx/SKILL.md', import.meta.url));
  const source = readFileSync(skillPath, 'utf8').replace(/^\uFEFF/, '');
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
  if (!frontmatter.test(source)) {
    throw new Error('医学文献汇报技能缺少有效的元信息，请重新安装完整插件包。');
  }
  ctx.skills.register({
    name: 'medical-pptx',
    description: '将单篇医学原创研究整理为文献汇报 PPT：提取 PICO、结果与分母，核对引用和材料范围，生成可编辑 PPTX 草稿。',
    source: 'bundled',
    provider: 'dsh-medical-pptx',
    path: skillPath,
    resourceBase: { kind: 'directory', path: dirname(skillPath) },
    content: source.replace(frontmatter, '').trim(),
  });
}
