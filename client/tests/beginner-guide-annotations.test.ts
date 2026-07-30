import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..');
const beginnerGuidePath = path.join(appRoot, 'src/prototypes/beginner-guide/index.tsx');
const source = fs.readFileSync(beginnerGuidePath, 'utf8');

function extractArray(name: string) {
  const start = source.indexOf(`const ${name}`);
  const end = source.indexOf('\n];', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('beginner guide annotation updates', () => {
  it('updates the recommended Agent list and installation copy', () => {
    const agents = extractArray('agentOptions');

    expect(agents).toContain("name: 'ChatGPT'");
    expect(agents).toContain("href: 'https://chatgpt.com/'");
    expect(agents).toContain("name: 'TRAE CN 系列'");
    expect(agents).not.toContain("name: 'Codex App'");
    expect(agents).not.toContain("name: 'Claude Code'");

    expect(source).toContain('Axhub Make 不挑工具：IDE、CLI、在线 Agent 都可以。');
    expect(source).not.toContain('或 Claude Code 这类 CLI');
    expect(source).toContain('<h4>在 Make 首页打开 Agent 软件</h4>');
    expect(source).toContain('<h4>在 Agent 软件中打开 Make 项目</h4>');
    expect(source).toContain('如果你用 WorkBuddy、TRAE Work、ChatGPT 这类工具，请在新建项目时，把这个目录加入进去。');
  });

  it('updates and orders the recommended models', () => {
    const models = extractArray('modelRecommendations');
    const expectedOrder = [
      'GPT-5.6',
      'Claude Opus 4.8',
      'Grok 4.5',
      'GLM-5.2',
      'Kimi K2.7',
      'DeepSeek V4 Pro',
    ];

    expectedOrder.forEach((model, index) => {
      expect(models).toContain(`name: '${model}'`);
      if (index > 0) {
        expect(models.indexOf(expectedOrder[index - 1])).toBeLessThan(models.indexOf(model));
      }
    });

    expect(models).toContain("vendor: 'xAI'");
    expect(models).toContain("feature: '适合处理复杂问题和任务，性价比高'");
    expect(models).toContain("feature: '综合能力强，速度快，性价比高'");
    expect(models).not.toContain('UI/UX 设计能力优秀，其他一般');
    expect(models).not.toContain('GPT-5.5');
    expect(models).not.toContain('Gemini 3.1 Pro');
  });

  it('updates the edit chapter heading while leaving the ignored card unchanged', () => {
    expect(source).toContain('<h3 className="beginner-guide-section-title" id="edit-start-title">你的这个需求</h3>');
    expect(source).toContain('<h4>截图 + 标注</h4>');
    expect(source).toContain('截图标注适合改局部。圈出位置，写一句“这里改成什么”，比长文字更清楚。');
  });

  it('explains result and time uncertainty before the instruction tips', () => {
    const costSection = source.indexOf('id="instruction-cost-title"');
    const uncertaintySection = source.indexOf('id="instruction-uncertainty-title"');
    const tipsSection = source.indexOf('id="instruction-tips-title"');

    expect(uncertaintySection).toBeGreaterThan(costSection);
    expect(uncertaintySection).toBeLessThan(tipsSection);
    expect(source).toContain('接受 AI 的不稳定性');
    expect(source).toContain('Vibe Coding / Vibe Design');
    expect(source).toContain('效果不确定性');
    expect(source).toContain('同一个提示词，也可能得到不同结果。');
    expect(source).toContain('时间不确定性');
    expect(source).toContain('平均效率提升');
  });

  it('replaces the advanced chapter with help options', () => {
    expect(source).toContain("{ id: 'advanced-guide', title: '获取帮助' }");
    expect(source).toContain("title: '获取帮助'");
    expect(source).toContain('https://axhub.im/');
    expect(source).toContain('请读取这个文档，并按里面的要求指导我使用 Axhub Make：');
    expect(source).toContain('https://raw.githubusercontent.com/lintendo/Axhub-Make/main/docs/guide-users-with-axhub-make.md');
    expect(source).not.toContain('进阶指导不是新手必须马上学的内容');
    expect(source).not.toContain("import onlineImportModalImage from './assets/online-import-modal.png';");
  });
});
