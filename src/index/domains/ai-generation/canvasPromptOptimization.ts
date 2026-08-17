import type { ContextBundleV2, ContextItem } from '@axhub/acp/runtime';
import type { CanvasAiScene, CanvasGenerationAttachmentPart } from '../shared/CanvasGenerationComposer';
import { runAiText } from './aiRunClient';

export interface CanvasPromptOptimizationOptions {
  projectId: string;
  prompt: string;
  scene: CanvasAiScene;
  sceneSettings?: unknown;
  canvasFilePath?: string | null;
  workspacePath?: string | null;
  contextBundle: ContextBundleV2 | null;
  attachments: CanvasGenerationAttachmentPart[];
  provider: string | null;
  model: string | null;
  mode: string | null;
  thought: string | null;
}

function formatJsonForPrompt(value: unknown): string {
  if (value === undefined) return '{}';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function describeContextItem(item: ContextItem, index: number): string {
  const details = [
    `kind=${item.kind}`,
    'name' in item && item.name ? `name=${item.name}` : null,
    'title' in item && item.title ? `title=${item.title}` : null,
    'path' in item && item.path ? `path=${item.path}` : null,
    item.id ? `id=${item.id}` : null,
  ].filter(Boolean);
  return `${index + 1}. ${details.join('；') || '未命名上下文'}`;
}

function describeContextBundle(contextBundle: ContextBundleV2 | null): string {
  const items = contextBundle?.items ?? [];
  if (!items.length) return '无';
  return items.map(describeContextItem).join('\n');
}

function describeAttachment(attachment: CanvasGenerationAttachmentPart, index: number): string {
  if (attachment.type === 'image') {
    return `${index + 1}. image；filename=${attachment.filename || '未命名图片'}`;
  }
  return `${index + 1}. file；filename=${attachment.filename || '未命名文件'}；mimeType=${attachment.mimeType || 'application/octet-stream'}`;
}

function describeAttachments(attachments: readonly CanvasGenerationAttachmentPart[]): string {
  if (!attachments.length) return '无';
  return attachments.map(describeAttachment).join('\n');
}

function createCanvasPromptOptimizationRunId(): string {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `prompt-optimization-${timePart}-${randomPart}`;
}

function getGenerationTypeLabel(scene: CanvasAiScene): string {
  switch (scene) {
    case 'design':
      return '生成设计图或设计素材';
    case 'document':
      return '生成文档、流程图或关系图';
    case 'page':
    default:
      return '生成页面原型';
  }
}

export function buildCanvasPromptOptimizationPrompt(options: CanvasPromptOptimizationOptions): string {
  return [
    '这是一次性的非交互式提示词优化任务。',
    '你不能与用户继续交互，不要追问用户，不要请求用户补充信息。',
    '只返回优化后的提示词正文，不要返回 Markdown 包裹、标题、解释、清单或前后缀。',
    '',
    '你的目标：在保留用户真实意图的前提下，把提示词改写为更清晰、具体、可执行的一版，供后续生成任务直接提交。',
    '',
    '重要约束：这些生成类型、场景配置、上下文文件和附件会由系统在后续生成请求中一并发送。不要在优化后的提示词里重复罗列文件路径、配置项或附件清单，避免让后续执行 AI 读到重复上下文。优化后的提示词应聚焦用户想要的结果、内容结构、风格偏好和验收标准。',
    '',
    '当前生成类型与结构化配置：',
    `- 生成类型：${getGenerationTypeLabel(options.scene)}`,
    `- 当前目标资源路径（可能尚未创建）：${options.canvasFilePath || '未指定'}`,
    `- 工作区路径：${options.workspacePath || '未指定'}`,
    '```json',
    formatJsonForPrompt(options.sceneSettings ?? {}),
    '```',
    '',
    '已选择的项目资源 / 上下文文件：',
    describeContextBundle(options.contextBundle),
    '',
    '当前附件摘要：',
    describeAttachments(options.attachments),
    '',
    '用户原始提示词：',
    options.prompt.trim(),
    '',
    '请输出一版可直接提交给生成任务的优化后提示词。',
  ].join('\n');
}

export async function optimizeCanvasPrompt(options: CanvasPromptOptimizationOptions): Promise<string> {
  const originalPrompt = options.prompt.trim();
  if (!originalPrompt) {
    throw new Error('请输入提示词');
  }

  const runId = createCanvasPromptOptimizationRunId();
  const result = await runAiText({
    projectId: options.projectId,
    scene: 'direct',
    prompt: buildCanvasPromptOptimizationPrompt({
      ...options,
      prompt: originalPrompt,
    }),
    runId,
    threadId: runId,
    provider: options.provider,
    model: options.model,
    mode: options.mode,
    thought: options.thought,
    conversationStorePath: undefined,
    contextBundle: null,
    context: undefined,
    targetPath: options.canvasFilePath || undefined,
  });

  const optimizedPrompt = result.output.trim();
  if (!optimizedPrompt) {
    throw new Error('提示词优化结果为空');
  }
  return optimizedPrompt;
}
