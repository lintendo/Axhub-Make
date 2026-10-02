import { describe, expect, it } from 'vitest';

import {
  buildQuickEditSaveConfirmation,
  mergeQuickEditSaveDrafts,
  type QuickEditSaveDraft,
  type QuickEditSaveResource,
} from './quickEditSave';

function resource(
  engine: 'source' | 'html' = 'source',
  overrides: Partial<QuickEditSaveResource> = {},
): QuickEditSaveResource {
  return {
    engine,
    projectId: 'project-a',
    path: engine === 'html' ? 'resources/demo.html' : 'prototypes/demo',
    ...(engine === 'html' ? { revision: 'revision-a' } : {}),
    ...overrides,
  };
}

function sourceTextDraft(
  replacements: Array<{ before: string; after: string }>,
  overrides: Partial<QuickEditSaveResource> = {},
): QuickEditSaveDraft {
  return {
    kind: 'source-text',
    action: 'save-text',
    resource: resource('source', overrides),
    replacements,
  };
}

describe('mergeQuickEditSaveDrafts', () => {
  it('deduplicates identical source replacements across split panes', () => {
    expect(mergeQuickEditSaveDrafts([
      sourceTextDraft([{ before: '旧标题', after: '新标题' }]),
      sourceTextDraft([{ before: '旧标题', after: '新标题' }]),
    ])).toEqual({
      ok: true,
      draft: sourceTextDraft([{ before: '旧标题', after: '新标题' }]),
    });
  });

  it('rejects conflicting source replacements before persistence', () => {
    expect(mergeQuickEditSaveDrafts([
      sourceTextDraft([{ before: '旧标题', after: '甲' }]),
      sourceTextDraft([{ before: '旧标题', after: '乙' }]),
    ])).toMatchObject({
      ok: false,
      code: 'TEXT_REPLACEMENT_CONFLICT',
    });
  });

  it('deduplicates identical HTML edits and rejects conflicting keys', () => {
    const htmlResource = resource('html');
    const draft = (after: string): QuickEditSaveDraft => ({
      kind: 'html-text',
      action: 'save-text',
      resource: htmlResource,
      edits: [{ key: 'text-key-1', before: '旧标题', after }],
    });

    expect(mergeQuickEditSaveDrafts([draft('新标题'), draft('新标题')])).toEqual({
      ok: true,
      draft: draft('新标题'),
    });
    expect(mergeQuickEditSaveDrafts([draft('甲'), draft('乙')])).toMatchObject({
      ok: false,
      code: 'HTML_TEXT_EDIT_CONFLICT',
    });
  });

  it('rejects HTML drafts from different revisions', () => {
    const htmlDraft = (revision: string): QuickEditSaveDraft => ({
      kind: 'html-text',
      action: 'save-text',
      resource: resource('html', { revision }),
      edits: [{ key: 'text-key-1', before: '旧标题', after: '新标题' }],
    });

    expect(mergeQuickEditSaveDrafts([htmlDraft('revision-a'), htmlDraft('revision-b')]))
      .toMatchObject({ ok: false, code: 'REVISION_MISMATCH' });
  });

  it('merges style blocks in pane order and removes exact duplicates', () => {
    const styleDraft = (cssText: string): QuickEditSaveDraft => ({
      kind: 'style',
      action: 'save-style',
      resource: resource(),
      cssText,
    });

    expect(mergeQuickEditSaveDrafts([
      styleDraft('.card { color: red; }'),
      styleDraft('.card { color: red; }'),
      styleDraft('.title { font-weight: 700; }'),
    ])).toEqual({
      ok: true,
      draft: styleDraft('.card { color: red; }\n\n.title { font-weight: 700; }'),
    });
  });

  it('coalesces clear-style drafts and rejects resource mismatches', () => {
    const clearDraft = (path = 'prototypes/demo'): QuickEditSaveDraft => ({
      kind: 'clear-style',
      action: 'clear-style',
      resource: resource('source', { path }),
    });

    expect(mergeQuickEditSaveDrafts([clearDraft(), clearDraft()])).toEqual({
      ok: true,
      draft: clearDraft(),
    });
    expect(mergeQuickEditSaveDrafts([clearDraft(), clearDraft('prototypes/other')]))
      .toMatchObject({ ok: false, code: 'RESOURCE_MISMATCH' });
  });

  it('returns a missing-draft result for an empty collection', () => {
    expect(mergeQuickEditSaveDrafts([])).toMatchObject({
      ok: false,
      code: 'NO_SAVE_DRAFT',
    });
  });
});

describe('buildQuickEditSaveConfirmation', () => {
  it('builds the source text confirmation from preflight counts', () => {
    expect(buildQuickEditSaveConfirmation({
      action: 'save-text',
      changeCount: 1,
      affectedCount: 3,
    })).toMatchObject({
      title: '确认操作',
      description: '检测到 1 组文本修改，预计会替换 3 处文本。',
      confirmText: '确定',
      cancelText: '取消',
      dismissible: false,
    });
  });
});
