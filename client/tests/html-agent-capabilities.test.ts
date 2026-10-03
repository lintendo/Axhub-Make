import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const guidePath = path.resolve(__dirname, '../rules/html-agent-capabilities.md');
const readGuide = () => fs.readFileSync(guidePath, 'utf8');

describe('plain HTML resource agent capabilities', () => {
  it('documents optional review comments and usable native controls', () => {
    const guide = readGuide();
    expect(guide).toContain('radio');
    expect(guide).toContain('checkbox');
    expect(guide).toContain('data-axhub-review-interactive');
    expect(guide).toContain('window.axhubReview?.setComment?.(');
    expect(guide).toContain('window.axhubReview?.clearComment?.(');
    expect(guide).toContain('协议不可用时，页面自身交互仍应正常工作');
  });

  it('documents Mermaid and editable Draw.io integration', () => {
    const guide = readGuide();
    expect(guide).toContain('class="mermaid"');
    expect(guide).toContain('Make 当前不自动注入 Mermaid 渲染库');
    expect(guide).toContain('.drawio.svg');
    expect(guide).toContain('metadata#drawio-source');
    expect(guide).toContain('.excalidraw');
  });

  it('keeps generated support files under resource-scoped assets', () => {
    const guide = readGuide();
    expect(guide).toContain('不得使用机器绝对路径');
    expect(guide).toContain('.assets/<HTML 资源相对路径>/');
    expect(guide).toContain('diagram-manifest.json');
    expect(guide).toContain('Agent 不预建或修改 `.sessions/`');
  });
});
