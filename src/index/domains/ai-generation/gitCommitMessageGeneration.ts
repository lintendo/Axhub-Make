import type { GitWorkspaceChangeGroup, GitWorkspaceStatusResponse } from '../../services/api';
import { runAiText } from './aiRunClient';

export interface GitCommitMessageGenerationOptions {
  projectId: string;
  scope: 'workspace' | 'prototype';
  status: GitWorkspaceStatusResponse | null;
  targetName?: string;
  targetPath?: string;
  currentMessage?: string;
}

function createGitCommitMessageRunId(): string {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `git-commit-message-${timePart}-${randomPart}`;
}

function getScopeLabel(scope: GitCommitMessageGenerationOptions['scope']): string {
  return scope === 'prototype' ? '当前原型' : '整个项目';
}

function describeChangeGroup(group: GitWorkspaceChangeGroup): string {
  if (!group.items.length) {
    return `- ${group.label}：${group.fileCount} 个文件`;
  }
  const items = group.items
    .slice(0, 6)
    .map((item) => `${item.name}（${item.fileCount} 个文件）`)
    .join('、');
  const suffix = group.items.length > 6 ? `，另有 ${group.items.length - 6} 项` : '';
  return `- ${group.label}：${items}${suffix}`;
}

function describeChanges(status: GitWorkspaceStatusResponse | null): string {
  const groups = status?.changeSummary?.groups || [];
  if (!groups.length) return '无结构化变更摘要';
  return groups.map(describeChangeGroup).join('\n');
}

function normalizeVersionNote(value: string): string {
  return value.trim();
}

export function buildGitCommitMessagePrompt(options: GitCommitMessageGenerationOptions): string {
  const status = options.status;
  const targetName = String(options.targetName || '').trim();
  const targetPath = String(options.targetPath || '').trim();
  const currentMessage = String(options.currentMessage || '').trim();

  return [
    '这是一次性的非交互式版本记录生成任务。',
    '你不能与用户继续交互，不要追问用户，不要请求用户补充信息。',
    '只返回版本记录正文，不要返回 Markdown 包裹、额外标题、解释或前后缀。',
    '输出格式必须是：第一行作为版本标题；空一行；随后输出“变更内容：”；再用短条目列出重点变更。',
    '变更内容最多 3 条，需要归纳总结，合并相近内容，不要逐文件罗列。',
    '不要输出“回归关注”，不要输出发布说明、风险项或测试建议。',
    '',
    '你的目标：根据当前 Git 变更摘要生成一条准确、克制、可直接用于提交的版本记录。',
    '',
    '当前上下文：',
    `- 目标范围：${getScopeLabel(options.scope)}`,
    `- 目标名称：${targetName || '未指定'}`,
    `- 目标路径：${targetPath || '未指定'}`,
    `- 当前分支：${status?.currentBranch || '未读取'}`,
    `- 未提交变更文件数：${status?.changedFilesCount ?? status?.changeSummary?.totalFiles ?? 0}`,
    '',
    '结构化变更摘要：',
    describeChanges(status),
    '',
    '用户已有输入：',
    currentMessage || '无',
    '',
    '请输出可直接放入提交输入框的版本记录。',
  ].join('\n');
}

export async function generateGitCommitMessage(options: GitCommitMessageGenerationOptions): Promise<string> {
  const runId = createGitCommitMessageRunId();
  const result = await runAiText({
    projectId: options.projectId,
    scene: 'direct',
    prompt: buildGitCommitMessagePrompt(options),
    runId,
    threadId: runId,
    conversationStorePath: undefined,
    contextBundle: null,
    context: undefined,
    targetPath: options.targetPath || undefined,
  });

  const message = normalizeVersionNote(result.output);
  if (!message) {
    throw new Error('AI 生成版本记录为空');
  }
  return message;
}
