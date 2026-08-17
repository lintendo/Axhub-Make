import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  createWebEditorV2Controller: vi.fn(),
}));

const webEditorController = {
  enable: vi.fn(),
  disable: vi.fn(),
  getStatus: vi.fn(() => ({ active: false, undoCount: 0, redoCount: 0 })),
  saveTextChanges: vi.fn(),
  saveStyleChanges: vi.fn(),
  clearForcedStyles: vi.fn(),
  prepareQuickEditSave: vi.fn(),
  preflightQuickEditSave: vi.fn(),
  commitQuickEditSave: vi.fn(),
  getDebugState: vi.fn(() => null),
  getHostToolbarState: vi.fn(() => ({ toolbarMode: 'inline', visible: false })),
  subscribeHostToolbarState: vi.fn(() => () => undefined),
  runHostToolbarAction: vi.fn(async () => false),
  getVoiceTargets: vi.fn(),
  subscribeVoiceTargets: vi.fn(),
  findVoiceElements: vi.fn(),
  getVoiceElementStructure: vi.fn(),
  activateVoiceElement: vi.fn(),
  createVoiceComment: vi.fn(),
  getDecisionDataCount: vi.fn(() => 0),
};

vi.mock('./webEditorV2Integration', () => ({
  createWebEditorV2Controller: mocked.createWebEditorV2Controller,
}));

describe('createEditorModeManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.createWebEditorV2Controller.mockReturnValue(webEditorController);
  });

  it('treats unsupported editor query modes as none', async () => {
    const { resolveEditorMode } = await import('./editorModeManager');

    expect(resolveEditorMode('?editor=textEdit')).toBe('none');
    expect(resolveEditorMode('?editor=annotation')).toBe('none');
    expect(resolveEditorMode('?editor=inspecta')).toBe('none');
    expect(resolveEditorMode('?inspecta=true')).toBe('none');
  });

  it('does not expose the legacy standalone textEdit controller or status', () => {
    const source = readFileSync(resolve(__dirname, './editorModeManager.ts'), 'utf8');

    expect(source).not.toContain('textEditIntegration');
    expect(source).not.toContain('createTextEditController');
    expect(source).not.toContain('textEdit');
  });

  it('still enables web editor on explicit webEditorV2 mode', async () => {
    const { createEditorModeManager } = await import('./editorModeManager');

    const manager = createEditorModeManager('webEditorV2');
    manager.applyInitialMode();
    await Promise.resolve();

    expect(webEditorController.enable).toHaveBeenCalledTimes(1);
  });

  it('passes host toolbar enable options through to the web editor controller', async () => {
    const { createEditorModeManager } = await import('./editorModeManager');

    const manager = createEditorModeManager('none');
    await Promise.resolve(manager.api.enable('webEditorV2', { toolbarMode: 'host' }));

    expect(webEditorController.enable).toHaveBeenCalledWith({ toolbarMode: 'host' });
  });

  it('passes phased quick edit saves through to the web editor controller', async () => {
    const { createEditorModeManager } = await import('./editorModeManager');
    const draft = {
      kind: 'clear-style' as const,
      action: 'clear-style' as const,
      resource: { engine: 'source' as const, projectId: '', path: 'prototypes/demo' },
    };
    webEditorController.prepareQuickEditSave.mockResolvedValue(draft);
    webEditorController.preflightQuickEditSave.mockResolvedValue({
      action: 'clear-style',
      changeCount: 1,
      affectedCount: 1,
    });
    webEditorController.commitQuickEditSave.mockResolvedValue({
      changed: true,
      changedCount: 1,
      message: '已清空自定义样式。',
    });

    const manager = createEditorModeManager('none');

    await expect(manager.api.prepareQuickEditSave('clear-style')).resolves.toEqual(draft);
    await expect(manager.api.preflightQuickEditSave(draft)).resolves.toMatchObject({ affectedCount: 1 });
    await expect(manager.api.commitQuickEditSave(draft)).resolves.toMatchObject({ changed: true });
  });

  it('passes bounded page voice operations through to the web editor controller', async () => {
    const { createEditorModeManager } = await import('./editorModeManager');
    const targets = { selected: null, hovered: null, preferred: null };
    const searchResult = { elements: [], nextCursor: null };
    const activationResult = { activated: true, targetRef: 'page.1.1' };
    const commentResult = {
      applied: true,
      targetRef: 'page.1.1',
      commentId: 'comment-1',
      target: {
        targetRef: 'page.1.1',
        label: 'button',
        textExcerpt: '提交',
        tagName: 'button',
        role: 'button',
        path: 'body > button',
        childCount: 0,
      },
    };
    const unsubscribe = vi.fn();
    webEditorController.getVoiceTargets.mockReturnValue(targets);
    webEditorController.subscribeVoiceTargets.mockReturnValue(unsubscribe);
    webEditorController.findVoiceElements.mockReturnValue(searchResult);
    webEditorController.getVoiceElementStructure.mockReturnValue(searchResult);
    webEditorController.activateVoiceElement.mockResolvedValue(activationResult);
    webEditorController.createVoiceComment.mockResolvedValue(commentResult);

    const manager = createEditorModeManager('none');
    const listener = vi.fn();

    expect(manager.api.getVoiceTargets()).toEqual(targets);
    expect(manager.api.subscribeVoiceTargets(listener)).toBe(unsubscribe);
    expect(manager.api.findVoiceElements({ role: 'button' })).toEqual(searchResult);
    expect(manager.api.getVoiceElementStructure({ depth: 1 })).toEqual(searchResult);
    await expect(manager.api.activateVoiceElement('page.1.1')).resolves.toEqual(activationResult);
    await expect(manager.api.createVoiceComment('page.1.1', '修正文案', {
      anchorPlacement: 'target',
    })).resolves.toEqual(commentResult);

    expect(webEditorController.subscribeVoiceTargets).toHaveBeenCalledWith(listener);
    expect(webEditorController.findVoiceElements).toHaveBeenCalledWith({ role: 'button' });
    expect(webEditorController.getVoiceElementStructure).toHaveBeenCalledWith({ depth: 1 });
  });

  it('passes the make-local commentary skill sources through the host controller config', async () => {
    const { createEditorModeManager } = await import('./editorModeManager');

    createEditorModeManager('none');

    expect(mocked.createWebEditorV2Controller).toHaveBeenCalledWith({
      ui: {
        skillInstallSource: [
          '.agents/skills/explore-options/SKILL.md',
          '.claude/skills/explore-options/SKILL.md',
          '.agents/skills/handle-comments/SKILL.md',
          '.claude/skills/handle-comments/SKILL.md',
        ].join('\n'),
        hideExecutionControls: true,
      },
    });
  });
});
