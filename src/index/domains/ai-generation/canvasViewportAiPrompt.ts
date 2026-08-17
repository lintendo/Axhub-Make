export interface CanvasViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function normalizeViewportRect(value: CanvasViewportRect | undefined): CanvasViewportRect | null {
  if (!value) return null;
  const entries = [value.x, value.y, value.width, value.height];
  if (!entries.every(Number.isFinite) || value.width <= 0 || value.height <= 0) return null;
  return {
    x: Math.round(value.x * 100) / 100,
    y: Math.round(value.y * 100) / 100,
    width: Math.round(value.width * 100) / 100,
    height: Math.round(value.height * 100) / 100,
  };
}

export function buildCanvasViewportAiPrompt(input: {
  canvasFilePath?: string;
  viewportRect?: CanvasViewportRect;
  visibleElementIds?: string[];
}): string {
  const canvasFilePath = String(input.canvasFilePath || '').trim();
  const viewportRect = normalizeViewportRect(input.viewportRect);
  const visibleElementIds = Array.from(new Set(
    (input.visibleElementIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  )).slice(0, 200);
  return [
    '任务：画布上下文操作。',
    '使用 $canvas-workspace 技能；先按“产物分流”确定画布呈现方式，再按“画布上下文操作”处理当前画布。',
    '多元素产物必须放在同一个 Frame 内，并让所有相关元素归属该 Frame。',
    canvasFilePath ? `目标画布文件：${canvasFilePath}。` : '',
    viewportRect ? `当前视图范围（画布坐标系）：${JSON.stringify(viewportRect)}。` : '',
    visibleElementIds.length > 0 ? `当前可见元素 ID：${visibleElementIds.join(', ')}。` : '',
    '当前画布截图已随请求作为图片附件提供，表示用户当前看到的内容。',
  ].filter(Boolean).join('\n\n');
}
