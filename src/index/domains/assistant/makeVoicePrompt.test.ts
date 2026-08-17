import { describe, expect, it } from 'vitest';

import {
  MAKE_COMMENTARY_VOICE_INSTRUCTIONS,
  buildMakeVoiceTurnContext,
} from './makeVoicePrompt';

describe('Make 页面语音助手提示词', () => {
  it('明确区分页面修改、批注管理和页面提问三类工作流', () => {
    expect(MAKE_COMMENTARY_VOICE_INSTRUCTIONS).toContain('页面修改');
    expect(MAKE_COMMENTARY_VOICE_INSTRUCTIONS).toContain('创建批注并立即执行');
    expect(MAKE_COMMENTARY_VOICE_INSTRUCTIONS).toContain('不询问确认');
    expect(MAKE_COMMENTARY_VOICE_INSTRUCTIONS).toContain('批注管理');
    expect(MAKE_COMMENTARY_VOICE_INSTRUCTIONS).toContain('总数');
    expect(MAKE_COMMENTARY_VOICE_INSTRUCTIONS).toContain('一次返回全部匹配批注');
    expect(MAKE_COMMENTARY_VOICE_INSTRUCTIONS).toContain('用户明确要求取消');
    expect(MAKE_COMMENTARY_VOICE_INSTRUCTIONS).toContain('用户明确要求删除');
    expect(MAKE_COMMENTARY_VOICE_INSTRUCTIONS).toContain('页面相关问题必须先截图');
  });

  it('禁止伪造 ID、状态和工具错误，并要求沿用工具返回的 ID', () => {
    expect(MAKE_COMMENTARY_VOICE_INSTRUCTIONS).toContain('不得自行编造 commentId 或 executionId');
    expect(MAKE_COMMENTARY_VOICE_INSTRUCTIONS).toContain('ok 为 false');
    expect(MAKE_COMMENTARY_VOICE_INSTRUCTIONS).toContain('用 phase 区分 accepted、running、completed、failed 和 cancelled');
    expect(MAKE_COMMENTARY_VOICE_INSTRUCTIONS).toContain('不要把内部错误原文直接念给用户');
  });

  it('每轮页面上下文只包含资源和当前目标，不自动注入批注', () => {
    const oversized = '很长的页面内容'.repeat(10_000);
    const context = buildMakeVoiceTurnContext({
      resourcePath: oversized,
      resourceName: oversized,
      activeTargets: {
        selected: {
          targetRef: oversized,
          label: oversized,
          textExcerpt: oversized,
          tagName: 'button',
          role: 'button',
          path: oversized,
          childCount: 1,
        },
      },
    });
    const parsed = JSON.parse(context);

    expect(context.length).toBeLessThanOrEqual(12_000);
    expect(parsed.resourcePath.length).toBeLessThanOrEqual(512);
    expect(parsed).not.toHaveProperty('recentComments');
    expect(parsed).not.toHaveProperty('commentTotal');
  });
});
