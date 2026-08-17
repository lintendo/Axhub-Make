import type { CanvasAiScene } from '../shared/CanvasGenerationComposer';
import { isDocumentTemplateCompatibleWithFormat } from '../../services/documentTemplates';

export interface CanvasPrototypePromptSettings {
  count?: number;
  themeName?: string;
  needsRequirementsAnalysis?: boolean;
}

export interface CanvasImagePromptSettings {
  size?: string;
  quality?: string;
  n?: number;
  output_format?: string;
  background?: string;
  themeName?: string;
  disable_prompt_optimization?: boolean;
}

export type CanvasDocumentFormat = 'html' | 'md' | 'mermaid' | 'drawio';

export interface CanvasHtmlVisualSpecPromptSetting {
  label?: string;
  description?: string;
  themeInstruction?: string;
  skillName: string;
  githubUrl: string;
}

export interface CanvasDocumentPromptSettings {
  format?: CanvasDocumentFormat;
  htmlVisualSpec?: CanvasHtmlVisualSpecPromptSetting;
  templateName?: string;
  usePrdPlanning?: boolean;
}

export type CanvasGenerationPromptSettings =
  | CanvasPrototypePromptSettings
  | CanvasImagePromptSettings
  | CanvasDocumentPromptSettings
  | undefined;

export interface CanvasGenerationPromptCanvasContext {
  canvasFilePath?: string;
  canvasName?: string;
  generatorElementId?: string;
  statusTaskId?: string;
  statusTaskBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  source?: string;
}

export type CanvasGenerationFinalGuide = 'update-canvas' | 'local-ai-acknowledgement' | 'none';

export const CANVAS_UPDATE_FINAL_GUIDE = [
  '请在完成生成任务后',
  '再阅读 canvas-workspace 技能说明并更新当前画布。',
].join('，');
export const LOCAL_AI_COPY_FINAL_GUIDE = '请回复了解并等待用户发送需求。';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asCanvasPrototypePromptSettings(settings: Record<string, unknown>): CanvasPrototypePromptSettings {
  return settings as CanvasPrototypePromptSettings;
}

function asCanvasImagePromptSettings(settings: Record<string, unknown>): CanvasImagePromptSettings {
  return settings as CanvasImagePromptSettings;
}

function asCanvasDocumentPromptSettings(settings: Record<string, unknown>): CanvasDocumentPromptSettings {
  return settings as CanvasDocumentPromptSettings;
}

function formatOptionalValue(value: unknown, fallback = '未指定'): string {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
}

function isSpecifiedValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function isSpecifiedNonAutoValue(value: unknown): boolean {
  return isSpecifiedValue(value) && value !== 'auto';
}

function trimSentenceEnd(value: string): string {
  return value.replace(/[。.!！?？]+$/u, '');
}

function appendSettingsBlock(prompt: string, title: string, lines: string[]): string {
  const visibleLines = lines.filter((line) => line.trim().length > 0);
  if (!visibleLines.length) return prompt;
  if (prompt.includes(title)) return prompt;
  return [
    prompt.trim(),
    '',
    title,
    ...visibleLines,
  ].join('\n');
}

function formatDocumentFormat(format: CanvasDocumentFormat | undefined): string {
  if (format === 'html') return 'HTML';
  if (format === 'md') return 'Markdown';
  if (format === 'mermaid') return 'Mermaid 图表';
  if (format === 'drawio') return 'Drawio 图表';
  return '';
}

function formatPrototypeRequirementsAnalysisInstruction(enabled?: boolean): string {
  return enabled
    ? '- 需求分析：先读取 rules/requirements-alignment-guide.md，先补齐目标用户、核心任务、范围、关键流程和验收口径，再生成原型。'
    : '';
}

function formatPrdPlanningInstruction(enabled?: boolean): string {
  return enabled
    ? '- PRD 规划：使用 $plan-prds 先整理来源、现状基线、需求范围和文档计划，再按确认结果执行；不要预设 PRD 数量。'
    : '';
}

function formatMultiOptionInstruction(count: number | null, kind: 'prototype' | 'design'): string {
  if (count == null) return '';
  const target = kind === 'prototype'
    ? `生成 ${count} 个真实不同的可行原型方案`
    : `生成 ${count} 个真实不同的可行设计方案`;
  return `- 多方案提示：用户选择了方案数量，请加载本地 explore-options（多方案探索）技能提示，${target}。`;
}

function formatHtmlVisualSpecInstruction(
  format: CanvasDocumentFormat | undefined,
  htmlVisualSpec: CanvasHtmlVisualSpecPromptSetting | undefined,
): string {
  if (format !== 'html' || !htmlVisualSpec) return '';
  const label = typeof htmlVisualSpec.label === 'string' ? htmlVisualSpec.label.trim() : '';
  const description = typeof htmlVisualSpec.description === 'string' ? htmlVisualSpec.description.trim() : '';
  const themeInstruction = typeof htmlVisualSpec.themeInstruction === 'string' ? htmlVisualSpec.themeInstruction.trim() : '';
  const skillName = typeof htmlVisualSpec.skillName === 'string' ? htmlVisualSpec.skillName.trim() : '';
  const githubUrl = typeof htmlVisualSpec.githubUrl === 'string' ? htmlVisualSpec.githubUrl.trim() : '';
  if (!skillName || !githubUrl) return '';
  const topic = label
    ? `${label}${description ? `。${trimSentenceEnd(description)}` : ''}`
    : '未命名主题';
  const skillInstruction = `使用技能 ${skillName}（${githubUrl}，若已安装可忽略；若未安装，请在线读取该 GitHub 技能说明）`;
  const themeSentence = themeInstruction ? `。${trimSentenceEnd(themeInstruction)}。` : '。';
  return `- HTML 视觉主题：${topic}。${skillInstruction}${themeSentence}`;
}

function formatDocumentTemplatePath(templateName: string): string {
  const normalizedName = templateName.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return normalizedName.startsWith('templates/') ? normalizedName : '';
}

function normalizeCanvasContextValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\\/g, '/') : '';
}

function resolveCanvasGenerationFinalGuide(finalGuide: CanvasGenerationFinalGuide = 'update-canvas'): string {
  if (finalGuide === 'none') return '';
  return finalGuide === 'local-ai-acknowledgement'
    ? LOCAL_AI_COPY_FINAL_GUIDE
    : '';
}

function formatCanvasWorkspaceInstructionLines(canvasContext?: CanvasGenerationPromptCanvasContext): string[] {
  const canvasFilePath = normalizeCanvasContextValue(canvasContext?.canvasFilePath);
  const statusTaskId = normalizeCanvasContextValue(canvasContext?.statusTaskId);
  if (!canvasFilePath && !statusTaskId) return [];

  return [
    ...(canvasFilePath ? [`- 画布文件：${canvasFilePath}`] : []),
    ...(statusTaskId ? [`- 占位节点：${statusTaskId}`] : []),
    '- 首个产物必须覆盖或替换占位节点；多个产物从该位置向右排列。',
    '- 写回方式按 canvas-workspace 技能执行。',
  ];
}

export function appendCanvasWorkspaceInstruction(
  prompt: string,
  canvasContext?: CanvasGenerationPromptCanvasContext,
): string {
  return appendSettingsBlock(prompt, '画布写回定位：', [
    ...formatCanvasWorkspaceInstructionLines(canvasContext),
  ]);
}

export function appendCanvasGenerationFinalGuide({
  prompt,
  finalGuide = 'update-canvas',
}: {
  prompt: string;
  finalGuide?: CanvasGenerationFinalGuide;
}): string {
  const guide = resolveCanvasGenerationFinalGuide(finalGuide);
  const knownGuides = new Set([CANVAS_UPDATE_FINAL_GUIDE, LOCAL_AI_COPY_FINAL_GUIDE]);
  const lines = prompt.trim().split('\n');
  while (lines.length > 0 && knownGuides.has(lines[lines.length - 1].trim())) {
    lines.pop();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim().length === 0) {
    lines.pop();
  }
  const basePrompt = lines.join('\n').trim();
  if (!guide) return basePrompt;
  return basePrompt ? `${basePrompt}\n\n${guide}` : guide;
}

export function appendPrototypeStartPromptSettings({
  prompt,
  settings,
}: {
  prompt: string;
  settings: CanvasPrototypePromptSettings;
}): string {
  const hasCount = typeof settings.count === 'number' && Number.isFinite(settings.count);
  const count = hasCount ? Math.max(1, Math.min(4, Math.round(Number(settings.count)))) : null;
  return appendSettingsBlock(prompt, '原型生成设置：', [
    count == null ? '' : `- 方案数量：${count} 个`,
    formatMultiOptionInstruction(count, 'prototype'),
    isSpecifiedValue(settings.themeName) ? `- 设计系统：${formatOptionalValue(settings.themeName)}` : '',
    formatPrototypeRequirementsAnalysisInstruction(settings.needsRequirementsAnalysis),
  ]);
}

export function appendImageStartPromptSettings({
  prompt,
  settings,
}: {
  prompt: string;
  settings: CanvasImagePromptSettings;
}): string {
  const hasCount = typeof settings.n === 'number' && Number.isFinite(settings.n);
  const count = hasCount ? Math.max(1, Math.min(10, Math.round(Number(settings.n)))) : null;
  return appendSettingsBlock(prompt, '图片生成设置：', [
    isSpecifiedNonAutoValue(settings.size) ? `- 尺寸：${formatOptionalValue(settings.size)}` : '',
    isSpecifiedNonAutoValue(settings.quality) ? `- 质量：${formatOptionalValue(settings.quality)}` : '',
    count == null ? '' : `- 方案数量：${count} 个`,
    formatMultiOptionInstruction(count, 'design'),
    isSpecifiedValue(settings.output_format) ? `- 格式：${formatOptionalValue(settings.output_format)}` : '',
    isSpecifiedValue(settings.themeName) ? `- 设计系统：${formatOptionalValue(settings.themeName)}` : '',
    ...(settings.disable_prompt_optimization ? ['- 禁止优化提示词：请不要改写用户输入的提示词，直接按原始提示词生成图片。'] : []),
    ...(settings.output_format === 'png' && settings.background === 'transparent' ? ['- 背景：transparent'] : []),
  ]);
}

export function appendDocumentStartPromptSettings({
  prompt,
  settings,
}: {
  prompt: string;
  settings: CanvasDocumentPromptSettings;
}): string {
  const formatLabel = formatDocumentFormat(settings.format);
  const templateName = typeof settings.templateName === 'string' ? settings.templateName.trim() : '';
  const templatePath = isDocumentTemplateCompatibleWithFormat(templateName, settings.format || '')
    ? formatDocumentTemplatePath(templateName)
    : '';
  return appendSettingsBlock(prompt, '文档生成设置：', [
    formatLabel ? `- 文档格式：${formatLabel}` : '',
    formatHtmlVisualSpecInstruction(settings.format, settings.htmlVisualSpec),
    templatePath ? `- 文档模板：${templatePath}` : '',
    formatPrdPlanningInstruction(settings.usePrdPlanning),
  ]);
}

export function appendCanvasGenerationPromptSettings({
  scene,
  prompt,
  settings,
  canvasContext,
  finalGuide = 'update-canvas',
}: {
  scene: CanvasAiScene;
  prompt: string;
  settings: CanvasGenerationPromptSettings | unknown;
  canvasContext?: CanvasGenerationPromptCanvasContext;
  finalGuide?: CanvasGenerationFinalGuide;
}): string {
  const promptWithSettings = (() => {
    if (!isRecord(settings)) return prompt;

    if (scene === 'page') {
      return appendPrototypeStartPromptSettings({
        prompt,
        settings: asCanvasPrototypePromptSettings(settings),
      });
    }

    if (scene === 'design') {
      return appendImageStartPromptSettings({
        prompt,
        settings: asCanvasImagePromptSettings(settings),
      });
    }

    if (scene === 'document') {
      return appendDocumentStartPromptSettings({
        prompt,
        settings: asCanvasDocumentPromptSettings(settings),
      });
    }

    return prompt;
  })();

  const promptWithCanvasWorkspace = finalGuide === 'update-canvas'
    ? appendCanvasWorkspaceInstruction(promptWithSettings, canvasContext)
    : promptWithSettings;
  return appendCanvasGenerationFinalGuide({
    prompt: promptWithCanvasWorkspace,
    finalGuide,
  });
}
