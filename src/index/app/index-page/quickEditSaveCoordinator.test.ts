import { describe, expect, it, vi } from 'vitest';

import type {
  QuickEditSaveCommitResult,
  QuickEditSaveDraft,
  QuickEditSavePreflight,
} from '../../../common/quickEditSave';
import { createQuickEditSaveCoordinator, type QuickEditSaveTarget } from './quickEditSaveCoordinator';

function sourceDraft(after: string, _pane: string): QuickEditSaveDraft {
  return {
    kind: 'source-text',
    action: 'save-text',
    resource: { engine: 'source', projectId: 'project-1', path: 'src/page.tsx' },
    replacements: [{ before: '旧文本', after }],
  };
}

function preflight(action: QuickEditSavePreflight['action'] = 'save-text'): QuickEditSavePreflight {
  return { action, changeCount: 2, affectedCount: 2 };
}

function commitResult(): QuickEditSaveCommitResult {
  return { changed: true, changedCount: 2, message: '保存成功' };
}

function target(id: string, draft: QuickEditSaveDraft | null): QuickEditSaveTarget {
  return {
    id,
    prepare: vi.fn(async () => ({ supported: true, draft })),
    preflight: vi.fn(async () => preflight()),
    commit: vi.fn(async () => commitResult()),
  };
}

describe('quickEditSaveCoordinator', () => {
  it('merges split drafts and confirms/commits exactly once', async () => {
    const primary = target('primary', sourceDraft('新文本', 'primary'));
    const secondary = target('secondary', sourceDraft('新文本', 'secondary'));
    const confirm = vi.fn(async () => true);
    const result = await createQuickEditSaveCoordinator().run({
      action: 'save-text',
      targets: [primary, secondary],
      confirm,
    });

    expect(result).toEqual({ handled: true, committed: true });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(primary.preflight).toHaveBeenCalledTimes(1);
    expect(primary.commit).toHaveBeenCalledTimes(1);
    expect(secondary.preflight).not.toHaveBeenCalled();
    expect(secondary.commit).not.toHaveBeenCalled();
    expect(primary.commit).toHaveBeenCalledWith(expect.objectContaining({
      replacements: [{ before: '旧文本', after: '新文本' }],
    }));
  });

  it('does not commit after cancellation and shares the same in-flight action', async () => {
    let releaseConfirm!: (value: boolean) => void;
    const confirm = vi.fn(() => new Promise<boolean>((resolve) => { releaseConfirm = resolve; }));
    const primary = target('primary', sourceDraft('新文本', 'primary'));
    const coordinator = createQuickEditSaveCoordinator();
    const first = coordinator.run({ action: 'save-text', targets: [primary], confirm });
    const second = coordinator.run({ action: 'save-text', targets: [primary], confirm });

    expect(first).toBe(second);
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    releaseConfirm(false);
    await expect(first).resolves.toEqual({ handled: true, committed: false });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(primary.commit).not.toHaveBeenCalled();
  });

  it('only shows the missing-capability warning when no target can prepare', async () => {
    const targetWithoutCapability: QuickEditSaveTarget = {
      id: 'primary',
      prepare: vi.fn(async () => ({ supported: false, draft: null })),
      preflight: vi.fn(),
      commit: vi.fn(),
    };
    const warning = vi.fn();
    const result = await createQuickEditSaveCoordinator().run({
      action: 'save-text',
      targets: [targetWithoutCapability],
      confirm: vi.fn(async () => true),
      notify: { warning },
    });

    expect(result).toEqual({ handled: false, committed: false });
    expect(warning).toHaveBeenCalledTimes(1);
  });
});
