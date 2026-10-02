import { describe, expect, it, vi } from 'vitest';

import { createCanvasVoiceTools } from './canvasVoiceTools';

function harness() {
  const client = {
    getContext: vi.fn(async () => ({ projectId: 'project-1', resourcePath: 'flows/home.excalidraw', sceneRevision: 'revision-1', dirty: false, connected: true })),
    capture: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,AA==' })),
    focus: vi.fn(async () => ({ focused: true })),
    submit: vi.fn(async (input: any) => ({ workId: 'work-1', kind: 'canvas', resourcePath: 'flows/home.excalidraw', status: 'queued', objective: input.objective, createdAt: '', updatedAt: '' })),
    list: vi.fn(async () => ({ works: [], total: 0, nextCursor: null })),
    get: vi.fn(async () => ({ workId: 'work-1', kind: 'canvas', resourcePath: 'flows/home.excalidraw', status: 'running', objective: 'x', createdAt: '', updatedAt: '' })),
    followUp: vi.fn(async () => ({ workId: 'work-1', kind: 'canvas', resourcePath: 'flows/home.excalidraw', status: 'waiting', objective: 'x', createdAt: '', updatedAt: '' })),
    cancel: vi.fn(async () => ({ workId: 'work-1', kind: 'canvas', resourcePath: 'flows/home.excalidraw', status: 'cancelled', objective: 'x', createdAt: '', updatedAt: '' })),
    subscribe: vi.fn(() => () => undefined),
    dispose: vi.fn(),
  };
  return { client, tools: createCanvasVoiceTools({ client }) };
}

describe('Canvas voice tools', () => {
  it('exposes only context, view and work-management tools', () => {
    const { tools } = harness();
    expect(tools.map((tool) => tool.name)).toEqual([
      'axhub_make_get_canvas_context',
      'axhub_make_capture_canvas',
      'axhub_make_focus_canvas',
      'axhub_make_submit_canvas_work',
      'axhub_make_list_canvas_work',
      'axhub_make_get_canvas_work',
      'axhub_make_follow_up_canvas_work',
      'axhub_make_cancel_canvas_work',
    ]);
    expect(tools.some((tool) => tool.name.includes('insert') || tool.name.includes('update') || tool.name.includes('delete'))).toBe(false);
  });

  it('refuses to submit when the persisted canvas is dirty', async () => {
    const { client, tools } = harness();
    client.getContext.mockResolvedValueOnce({ projectId: 'project-1', resourcePath: 'flows/home.excalidraw', sceneRevision: 'revision-1', dirty: true, connected: true });
    const submit = tools.find((tool) => tool.name === 'axhub_make_submit_canvas_work')!;
    await expect(submit.execute({ objective: '修改', baseRevision: 'revision-1' }, { requestId: 'operation-1', sessionId: 'session-1', signal: new AbortController().signal, reportProgress: vi.fn() })).rejects.toMatchObject({ code: 'CANVAS_UNSAVED' });
    expect(client.submit).not.toHaveBeenCalled();
  });
});
