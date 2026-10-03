export interface PromptCardSkill {
  id: string;
  label: string;
  description: string;
  keywords?: string;
  prompt: string;
  chromeOnly?: boolean;
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

const IMPECCABLE_README_URL = 'https://github.com/pbakaus/impeccable#readme';

function buildImpeccablePrompt(command: string, instruction: string): string {
  return [
    `请用 Impeccable 的「${command}」能力来处理当前批注。`,
    `官方技能说明：${IMPECCABLE_README_URL}`,
    '如果当前环境还没有安装 Impeccable，请先运行：',
    'npx impeccable install',
    '如果已经安装，直接继续即可。',
    `执行时使用官方命令：/impeccable ${command}`,
    '开始前请先阅读当前项目的 DESIGN.md，所有视觉决策都以它为准。',
    instruction,
  ].join('\n');
}

export const PROMPT_CARD_SKILLS: readonly PromptCardSkill[] = [
  {
    id: 'explore-options',
    label: '多方案探索',
    description: '同时生成几种不同方案，比较后再选一套',
    keywords: '多方案生成 方案对比 设计决策 多方案对比',
    prompt:
      '请先围绕当前批注和页面目标，提出 2-3 个方向明显不同的方案，简要说明各自取舍，选出最适合的一套后再开始修改。',
  },
  {
    id: 'prototype-annotation',
    label: '原型标注',
    description: '结合当前原型批注，准确理解要改哪里、为什么改',
    prompt: '请先结合当前原型和批注，确认要改的区域、存在的问题和想达到的效果，再处理批注对应的内容。',
  },
  {
    id: 'impeccable-polish',
    label: '优化',
    description: '整体打磨视觉细节，让界面更精致，但不改变页面结构和业务含义',
    prompt: buildImpeccablePrompt(
      'polish',
      '请把当前批注指向的区域打磨得更精致、统一、好用，也可以顺手处理紧邻的必要细节；不要改变页面结构或业务含义，也不要重做整页。',
    ),
  },
  {
    id: 'impeccable-layout',
    label: '布局',
    description: '调整空间、对齐、尺寸和响应式结构，解决拥挤、错位或比例失衡',
    prompt: buildImpeccablePrompt(
      'layout',
      '请重点调整当前区域的空间关系：位置、间距、对齐、尺寸和响应式表现；只改与批注相关的范围，不改变业务含义。',
    ),
  },
  {
    id: 'impeccable-typeset',
    label: '排版',
    description: '调整字体、字号、行高、字重和文字层级，让内容更易读',
    prompt: buildImpeccablePrompt(
      'typeset',
      '请让当前区域的文字更好读：调整字体、字号、行高、字重和信息层级；不要改变文案含义。',
    ),
  },
  {
    id: 'impeccable-distill',
    label: '精简',
    description: '去掉多余装饰、重复信息和视觉噪音，让界面更清爽',
    prompt: buildImpeccablePrompt(
      'distill',
      '请删掉当前区域里多余的装饰、重复信息和视觉噪音，让重点更突出；保留业务信息和必要状态。',
    ),
  },
  {
    id: 'impeccable-clarify',
    label: '文案',
    description: '改写按钮、提示和说明，让用户更快理解并知道下一步',
    prompt: buildImpeccablePrompt(
      'clarify',
      '请把当前区域的按钮、提示和说明写得更清楚、更具体，让用户知道下一步怎么做；不要改变业务含义。',
    ),
  },
  {
    id: 'impeccable-animate',
    label: '动效',
    description: '补充加载、悬停、切换和反馈动画，让交互更有回应',
    prompt: buildImpeccablePrompt(
      'animate',
      '请为当前区域补上必要的加载、切换和操作反馈，让交互更自然；动效要克制，并尊重用户的减少动效设置。',
    ),
  },
  {
    id: 'impeccable-adapt',
    label: '适配',
    description: '检查桌面、平板、手机和不同输入方式下的显示与操作',
    prompt: buildImpeccablePrompt(
      'adapt',
      '请检查当前区域在桌面、平板、手机、横竖屏以及不同输入方式下是否好用，并修正明显问题。',
    ),
  },
  {
    id: 'impeccable-harden',
    label: '健壮',
    description: '补齐加载、空数据、错误、焦点、键盘和无障碍状态，避免边界情况失控',
    prompt: buildImpeccablePrompt(
      'harden',
      '请补齐当前区域在加载、空数据、错误、焦点、键盘操作和无障碍使用时的状态，避免用户遇到没有反馈或无法继续的情况。',
    ),
  },
  {
    id: 'impeccable-onboard',
    label: '引导',
    description: '优化首次使用、空状态和关键步骤，告诉用户接下来该做什么',
    prompt: buildImpeccablePrompt(
      'onboard',
      '请让第一次使用和关键操作更容易理解，尤其是空状态和下一步提示；用户应该能明确知道接下来该做什么。',
    ),
  },
  {
    id: 'impeccable-colorize',
    label: '色彩',
    description: '调整色彩层级、对比度和状态色，同时保持品牌一致',
    prompt: buildImpeccablePrompt(
      'colorize',
      '请调整当前区域的颜色层级、对比度和状态颜色，让信息更容易分辨，同时保持现有品牌风格。',
    ),
  },
  {
    id: 'impeccable',
    label: 'UI 评审',
    description: '只找问题并给出优先级和建议，不直接进行大范围修改',
    prompt: buildImpeccablePrompt(
      'critique',
      '请只做评审，不要直接大范围修改。请列出问题、优先级、影响和具体修复建议。',
    ),
  },
  {
    id: 'ui-design-image',
    label: 'UI 设计图片',
    description: '生成界面图片、图标、占位图或视觉参考素材',
    keywords:
      '生图 生成图片 图片生成 设计图 UI图片 UI素材 图标 占位图 视觉参考图 imagegen image generation',
    prompt:
      '请根据当前批注、页面上下文和参考图片，生成合适的界面图片、素材、图标、占位图或视觉参考图；如果结果需要放回当前画布或项目素材，请按项目规则保存并回写。',
  },
  {
    id: 'requirements-review',
    label: '需求评审',
    description: '检查 PRD、目录、原型和批注是否一致',
    keywords: '需求评审 PRD 原型评审 axhub-prototype-context',
    prompt: [
      '请使用 axhub-prototype-context 技能来评审这条批注。',
      '技能文档：https://github.com/lintendo/Axhub-Skills/blob/main/skills/axhub-prototype-context/SKILL.md',
      '打开当前原型 URL，等页面加载完成后读取 window.__AXHUB_ANNOTATION_SOURCE__，只把页面当作评审上下文，不要直接修改它。',
      '重点检查目录和 PRD、Markdown 节点、批注节点是否一致，同时参考源码交接线索，指出需求与原型之间的缺口。',
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
      ...(option.chromeOnly === true ? { chromeOnly: true } : {}),
      ...(option.custom === true ? { custom: true } : {}),
    });
  }

  return [...merged.values()];
}

function normalizeSkillQuery(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, '');
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

  const exactMatches = availableSkills.filter(
    (skill) =>
      normalizeSkillQuery(skill.id) === normalizedQuery ||
      normalizeSkillQuery(skill.label) === normalizedQuery,
  );
  if (exactMatches.length > 0) return exactMatches;

  return availableSkills.filter((skill) => {
    const searchableText = normalizeSkillQuery(
      `${skill.id} ${skill.label} ${skill.description} ${skill.keywords ?? ''}`,
    );
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
