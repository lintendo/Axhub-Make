export interface PromptCardSkill {
  id: string;
  label: string;
  description: string;
  keywords?: string;
  prompt: string;
  chromeOnly?: boolean;
  sourceUrl?: string;
  custom?: boolean;
}

export type PromptCardSkillOption = Pick<PromptCardSkill, 'id' | 'label'> &
  Partial<Omit<PromptCardSkill, 'id' | 'label'>>;

export interface PromptCardSkillTrigger {
  query: string;
  start: number;
  end: number;
}

export interface PromptCardSkillSavePayload {
  note: string;
  skillIds: string[];
}

export const PROMPT_CARD_SKILLS: readonly PromptCardSkill[] = [
  {
    id: 'explore-options',
    label: '多方案探索',
    description: '使用 explore-options 做多方案探索',
    keywords: '多方案生成 方案对比 设计决策 多方案对比',
    prompt:
      '使用本地 explore-options 技能，按多方案探索流程对齐当前批注、需求和设计决策，生成 2-3 个真实不同的可行修改方案，对比后选择最适合当前页面的一种再执行。',
  },
  {
    id: 'prototype-annotation',
    label: '原型标注',
    description: '使用 prototype-annotation 理解批注意图',
    prompt: '使用本地 prototype-annotation 技能，结合当前原型标注理解修改意图，处理批注对应区域。',
  },
  {
    id: 'impeccable',
    label: 'UI 评审',
    description: '使用 impeccable 检查界面质量',
    prompt:
      '使用本地 impeccable 技能，按 UI critique 思路审查当前页面或区域，给出关键问题和修复方向。',
  },
  {
    id: 'ui-design-image',
    label: 'UI 设计图片',
    description: '使用 ui-design-image 生成 UI 设计图片',
    keywords:
      '生图 生成图片 图片生成 设计图 UI图片 UI素材 图标 占位图 视觉参考图 imagegen image generation',
    prompt:
      '使用本地 ui-design-image 技能，结合当前批注、页面上下文和参考图片，生成 UI 设计图片、素材、图标、占位图或视觉参考图。需要把结果更新到当前画布或相关项目素材时，按当前项目规则落盘并回写。',
  },
  {
    id: 'requirements-review',
    label: '需求评审',
    description: 'axhub-prototype-context：需求/PRD 评审',
    keywords: '需求评审 PRD 原型评审 axhub-prototype-context',
    prompt: [
      '使用 axhub-prototype-context 技能处理这条批注。',
      '技能文档：https://github.com/lintendo/Axhub-Skills/blob/main/skills/axhub-prototype-context/SKILL.md',
      '打开当前原型 URL，等待页面渲染后读取 window.__AXHUB_ANNOTATION_SOURCE__，将页面视为只读上下文。',
      '评审 source.directory 中的目录/PRD、markdown 节点、批注节点，以及 source.root/source.manifest 中的源码交接线索。',
    ].join('\n'),
    chromeOnly: true,
  },
] as const;

const SKILL_TRIGGER_QUERY_PATTERN = /^[\p{Script=Han}\p{Letter}\p{Number}_-]*$/u;
const CUSTOM_SKILL_ID_PATTERN = /^custom-[a-z0-9-]+$/u;
export const PROMPT_CARD_SKILL_OPTIONS = PROMPT_CARD_SKILLS.map(
  ({ id, label, description, prompt }) => ({ id, label, description, prompt }),
);

export function mergePromptCardSkills(
  skillOptions: readonly PromptCardSkillOption[] = [],
): PromptCardSkill[] {
  const merged = new Map<string, PromptCardSkill>(
    PROMPT_CARD_SKILLS.map((skill) => [skill.id, { ...skill }] as const),
  );

  for (const option of skillOptions) {
    const id = String(option.id ?? '').trim();
    const label = String(option.label ?? '').trim();
    if (!id || !label) continue;
    const existing = merged.get(id);
    const prompt = String(option.prompt ?? existing?.prompt ?? '').trim();
    if (!prompt) continue;
    const description =
      String(option.description ?? '').trim() ||
      existing?.description ||
      prompt.replace(/\s+/gu, ' ').slice(0, 80);
    merged.set(id, {
      ...(existing ?? {}),
      id,
      label,
      description,
      prompt,
      ...(option.keywords ? { keywords: String(option.keywords).trim() } : {}),
      ...(option.sourceUrl ? { sourceUrl: String(option.sourceUrl).trim() } : {}),
      ...(option.chromeOnly === true ? { chromeOnly: true } : {}),
      ...(option.custom === true ? { custom: true } : {}),
    });
  }

  return [...merged.values()];
}

function normalizeSkillQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function findPromptCardSkillTrigger(text: string): PromptCardSkillTrigger | null {
  const value = String(text ?? '');
  const start = value.lastIndexOf('/');
  if (start < 0) return null;
  const query = value.slice(start + 1);
  if (!SKILL_TRIGGER_QUERY_PATTERN.test(query)) return null;
  const previousChar = start > 0 ? value[start - 1] : '';
  const previousWhitespaceIndex = Math.max(
    value.lastIndexOf(' ', start - 1),
    value.lastIndexOf('\n', start - 1),
    value.lastIndexOf('\t', start - 1),
  );
  const currentTokenPrefix = value.slice(previousWhitespaceIndex + 1, start);
  if (previousChar === '/') {
    return null;
  }
  if (currentTokenPrefix.includes('/')) return null;
  return {
    query,
    start,
    end: value.length,
  };
}

export function clearPromptCardSkillTrigger(text: string): string {
  const value = String(text ?? '');
  const trigger = findPromptCardSkillTrigger(value);
  if (!trigger) return value;
  return value.slice(0, trigger.start).trimEnd();
}

export function filterPromptCardSkills(
  query: string,
  enabledSkillIds?: readonly unknown[] | null,
  skills: readonly PromptCardSkill[] = PROMPT_CARD_SKILLS,
): PromptCardSkill[] {
  const normalizedQuery = normalizeSkillQuery(query);
  const enabledIds = Array.isArray(enabledSkillIds)
    ? new Set(enabledSkillIds.map((item) => String(item ?? '').trim()).filter(Boolean))
    : null;
  const availableSkills = skills.filter((skill) =>
    enabledIds ? enabledIds.has(skill.id) : !skill.chromeOnly,
  );
  if (!normalizedQuery) return [...availableSkills];

  return availableSkills.filter((skill) => {
    const searchableText =
      `${skill.id} ${skill.label} ${skill.description} ${skill.keywords ?? ''}`.toLocaleLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}

export function addPromptCardSkillSelection(
  selectedSkills: readonly PromptCardSkill[],
  skill: PromptCardSkill,
): PromptCardSkill[] {
  if (selectedSkills.some((selected) => selected.id === skill.id)) {
    return [...selectedSkills];
  }
  return [...selectedSkills, skill];
}

export function buildPromptCardSkillPrefix(selectedSkills: readonly PromptCardSkill[]): string {
  if (selectedSkills.length === 0) return '';
  return [
    '使用以下技能指令处理这条批注：',
    ...selectedSkills.flatMap((skill, index) => ['', `${index + 1}. ${skill.label}`, skill.prompt]),
  ].join('\n');
}

export function normalizePromptCardSkillIds(
  skillIds: readonly unknown[],
  skills: readonly Pick<PromptCardSkill, 'id'>[] = PROMPT_CARD_SKILLS,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const knownSkillIds = new Set(skills.map((skill) => skill.id));

  for (const skillId of skillIds) {
    const normalizedId = String(skillId ?? '').trim();
    if (
      !normalizedId ||
      seen.has(normalizedId) ||
      (!knownSkillIds.has(normalizedId) && !CUSTOM_SKILL_ID_PATTERN.test(normalizedId))
    ) {
      continue;
    }
    seen.add(normalizedId);
    result.push(normalizedId);
  }

  return result;
}

export function buildPromptCardSkillSavePayload(
  note: string,
  selectedSkills: readonly PromptCardSkill[],
): PromptCardSkillSavePayload {
  const normalizedNote = String(note ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
  return {
    note: normalizedNote,
    skillIds: normalizedNote ? selectedSkills.map((skill) => skill.id) : [],
  };
}

export function serializePromptCardSkillSelection(skillIds: readonly string[]): string {
  return JSON.stringify({ skillIds: normalizePromptCardSkillIds(skillIds) });
}

export function deserializePromptCardSkillSelection(
  payload: { skillIds?: readonly unknown[] | null } | null | undefined,
  enabledSkillIds?: readonly unknown[] | null,
  skillOptions: readonly PromptCardSkillOption[] = [],
): PromptCardSkill[] {
  const skills = mergePromptCardSkills(skillOptions);
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const enabledIds = Array.isArray(enabledSkillIds)
    ? new Set(enabledSkillIds.map((item) => String(item ?? '').trim()).filter(Boolean))
    : null;
  return normalizePromptCardSkillIds(payload?.skillIds ?? [], skills)
    .map((skillId) => skillById.get(skillId))
    .filter((skill): skill is PromptCardSkill => Boolean(skill))
    .filter((skill) => (enabledIds ? enabledIds.has(skill.id) : true));
}

export function appendImplicitAnnotationSkillToPrompt(
  prompt: string,
  annotationSession: boolean,
  enabledSkillIds?: readonly unknown[] | null,
  skillOptions: readonly PromptCardSkillOption[] = [],
): string {
  const normalizedPrompt = String(prompt ?? '').trim();
  if (!normalizedPrompt || !annotationSession) return normalizedPrompt;

  const defaultSkill = mergePromptCardSkills(skillOptions).find(
    (skill) => skill.id === 'prototype-annotation',
  );
  if (!defaultSkill) return normalizedPrompt;
  if (
    Array.isArray(enabledSkillIds) &&
    !enabledSkillIds.some((skillId) => String(skillId ?? '').trim() === defaultSkill.id)
  ) {
    return normalizedPrompt;
  }
  if (normalizedPrompt.includes(defaultSkill.prompt)) return normalizedPrompt;

  return `${normalizedPrompt}\n\n${buildPromptCardSkillPrefix([defaultSkill])}`;
}

export function mergePromptCardSkillsIntoPromptNote(
  note: string,
  selectedSkills: readonly PromptCardSkill[],
): string {
  const prefix = buildPromptCardSkillPrefix(selectedSkills);
  const normalizedNote = String(note ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!prefix) return normalizedNote;
  if (!normalizedNote) return prefix;
  return `${normalizedNote}\n${prefix}`;
}
