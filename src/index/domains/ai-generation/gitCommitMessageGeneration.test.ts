import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./aiRunClient', () => ({
  runAiText: vi.fn(async () => ({
    output: '更新首页原型交互\n\n变更内容：\n- 优化筛选交互',
    runId: 'git-commit-message-test',
    threadId: 'git-commit-message-test',
  })),
}));

import { runAiText } from './aiRunClient';
import {
  buildGitCommitMessagePrompt,
  generateGitCommitMessage,
} from './gitCommitMessageGeneration';

describe('git commit message generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a non-interactive AI prompt from version status summary', () => {
    const prompt = buildGitCommitMessagePrompt({
      scope: 'prototype',
      targetName: '首页原型',
      targetPath: 'prototypes/home',
      currentMessage: '首页改版',
      status: {
        available: true,
        gitAvailable: true,
        isGitRepo: true,
        hasCommits: true,
        currentBranch: 'main',
        hasChanges: true,
        changedFilesCount: 2,
        changeSummary: {
          totalFiles: 2,
          groups: [
            {
              key: 'prototypes',
              label: '原型',
              fileCount: 2,
              items: [
                { id: 'home', name: '首页原型', fileCount: 2 },
              ],
            },
          ],
        },
      },
    });

    expect(prompt).toContain('这是一次性的非交互式版本记录生成任务');
    expect(prompt).toContain('只返回版本记录正文');
    expect(prompt).toContain('第一行作为版本标题');
    expect(prompt).toContain('随后输出“变更内容：”');
    expect(prompt).toContain('变更内容最多 3 条');
    expect(prompt).toContain('需要归纳总结');
    expect(prompt).toContain('不要输出“回归关注”');
    expect(prompt).toContain('目标范围：当前原型');
    expect(prompt).toContain('目标名称：首页原型');
    expect(prompt).toContain('目标路径：prototypes/home');
    expect(prompt).toContain('当前分支：main');
    expect(prompt).toContain('未提交变更文件数：2');
    expect(prompt).toContain('- 原型：首页原型（2 个文件）');
    expect(prompt).toContain('用户已有输入：');
    expect(prompt).toContain('首页改版');
    expect(prompt).not.toContain('```');
    expect(prompt).not.toContain('diff');
  });

  it('submits one direct AI run and returns a trimmed multi-line version note', async () => {
    vi.mocked(runAiText).mockResolvedValueOnce({
      output: '\n\n更新首页原型交互\n\n变更内容：\n- 优化筛选交互\n- 调整状态展示\n\n',
      runId: 'git-commit-message-run',
      threadId: 'git-commit-message-run',
    });

    const result = await generateGitCommitMessage({
      projectId: 'project-b',
      scope: 'workspace',
      currentMessage: '',
      status: {
        available: true,
        gitAvailable: true,
        isGitRepo: true,
        hasCommits: true,
        hasChanges: true,
        changedFilesCount: 1,
        changeSummary: {
          totalFiles: 1,
          groups: [
            {
              key: 'resources',
              label: '资源',
              fileCount: 1,
              items: [
                { id: 'prd', name: '需求文档', fileCount: 1 },
              ],
            },
          ],
        },
      },
    });

    expect(result).toBe('更新首页原型交互\n\n变更内容：\n- 优化筛选交互\n- 调整状态展示');
    expect(runAiText).toHaveBeenCalledWith(expect.objectContaining({
      scene: 'direct',
      conversationStorePath: undefined,
      contextBundle: null,
      context: undefined,
    }));
    expect(vi.mocked(runAiText).mock.calls[0]?.[0].runId).toMatch(/^git-commit-message-/);
    expect(vi.mocked(runAiText).mock.calls[0]?.[0]).not.toHaveProperty('projectId', 'git-commit-message');
  });

  it('rejects empty AI output', async () => {
    vi.mocked(runAiText).mockResolvedValueOnce({
      output: '   ',
      runId: 'git-commit-message-run',
      threadId: 'git-commit-message-run',
    });

    await expect(generateGitCommitMessage({
      projectId: 'project-b',
      scope: 'workspace',
      status: null,
    })).rejects.toThrow('AI 生成版本记录为空');
  });
});
