import { describe, expect, it } from 'vitest';
import { buildStartGuidePrompt } from './startGuidePrompt';

describe('start guide prompt assembly', () => {
  it('uses a resource design card scene and image settings for local AI copy', () => {
    const prompt = buildStartGuidePrompt({
      kind: 'resource',
      scene: 'design',
      prompt: 'Generate a dashboard.',
      settings: {
        size: '2048x1152',
        quality: 'high',
      },
      finalGuide: 'local-ai-acknowledgement',
    });

    expect(prompt).toContain('Generate a dashboard.');
    expect(prompt).toContain('请生成设计图资源。');
    expect(prompt).toContain('图片生成设置：');
    expect(prompt).toContain('- 尺寸：2048x1152');
    expect(prompt).toContain('- 质量：high');
    expect(prompt).toContain('请回复了解并等待用户发送需求。');
    expect(prompt).not.toContain('更新到当前画布');
  });

  it('uses document PRD planning settings for a resource document card', () => {
    const prompt = buildStartGuidePrompt({
      kind: 'resource',
      scene: 'document',
      prompt: 'Generate a PRD.',
      settings: {
        format: 'md',
        usePrdPlanning: true,
      },
      finalGuide: 'local-ai-acknowledgement',
    });

    expect(prompt).toContain('请生成文档资源。');
    expect(prompt).toContain('文档生成设置：');
    expect(prompt).toContain('- 文档格式：Markdown');
    expect(prompt).toContain('PRD 规划：');
    expect(prompt).toContain('请回复了解并等待用户发送需求。');
  });

  it('uses the design start-guide system prompt without image settings', () => {
    const prompt = buildStartGuidePrompt({
      kind: 'design',
      scene: 'design',
      prompt: 'Extract a theme.',
      settings: undefined,
      finalGuide: 'local-ai-acknowledgement',
    });

    expect(prompt).toContain('请生成设计规范或设计系统。');
    expect(prompt).not.toContain('图片生成设置：');
  });
});
