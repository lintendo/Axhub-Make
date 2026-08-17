import { describe, expect, it } from 'vitest';

import { buildCanvasViewportAiPrompt } from './canvasViewportAiPrompt';

describe('buildCanvasViewportAiPrompt', () => {
  it('selects the canvas-workspace workflow and only passes dynamic context', () => {
    const prompt = buildCanvasViewportAiPrompt({
      canvasFilePath: 'src/resources/flows/home.excalidraw',
      viewportRect: { x: 100, y: 200, width: 800, height: 600 },
      visibleElementIds: ['visible-a', 'visible-b'],
    });

    expect(prompt).toContain('画布上下文操作');
    expect(prompt).toContain('使用 $canvas-workspace 技能');
    expect(prompt).toContain('先按“产物分流”确定画布呈现方式');
    expect(prompt).toContain('再按“画布上下文操作”处理当前画布');
    expect(prompt).toContain('多元素产物必须放在同一个 Frame 内');
    expect(prompt).toContain('当前画布截图已随请求作为图片附件提供');
    expect(prompt).toContain('src/resources/flows/home.excalidraw');
    expect(prompt).toContain('"x":100');
    expect(prompt).toContain('"width":800');
    expect(prompt).toContain('visible-a');
    expect(prompt).not.toContain('画布底部');
    expect(prompt).not.toContain('编辑、新增或不明确');
    expect(prompt).not.toContain('不得调用任何 MCP');
    expect(prompt).not.toContain('重新读取目标文件');
    expect(prompt).not.toContain('遮挡正式节点、文字或连线');
  });
});
