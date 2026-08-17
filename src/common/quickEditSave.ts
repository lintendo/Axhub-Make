export type QuickEditSaveAction = 'save-text' | 'save-style' | 'clear-style';

export type QuickEditSaveResource = {
  engine: 'source' | 'html';
  projectId: string;
  path: string;
  revision?: string;
};

export type QuickEditTextReplacement = {
  before: string;
  after: string;
};

export type QuickEditHtmlTextEdit = QuickEditTextReplacement & {
  key: string;
};

export type QuickEditSaveDraft =
  | {
    kind: 'source-text';
    action: 'save-text';
    resource: QuickEditSaveResource;
    replacements: QuickEditTextReplacement[];
  }
  | {
    kind: 'html-text';
    action: 'save-text';
    resource: QuickEditSaveResource;
    edits: QuickEditHtmlTextEdit[];
  }
  | {
    kind: 'style';
    action: 'save-style';
    resource: QuickEditSaveResource;
    cssText: string;
  }
  | {
    kind: 'clear-style';
    action: 'clear-style';
    resource: QuickEditSaveResource;
  };

export type QuickEditSavePreflight = {
  action: QuickEditSaveAction;
  changeCount: number;
  affectedCount: number;
};

export type QuickEditSaveCommitResult = {
  changed: boolean;
  changedCount: number;
  changedFiles?: number;
  message: string;
};

export type QuickEditSaveDialogInput = {
  title: '确认操作';
  description: string;
  confirmText: '确定';
  cancelText: '取消';
  tone: 'brand';
  dismissible: false;
};

export type QuickEditSaveMergeFailureCode =
  | 'NO_SAVE_DRAFT'
  | 'RESOURCE_MISMATCH'
  | 'REVISION_MISMATCH'
  | 'TEXT_REPLACEMENT_CONFLICT'
  | 'HTML_TEXT_EDIT_CONFLICT';

export type QuickEditSaveMergeResult =
  | { ok: true; draft: QuickEditSaveDraft }
  | { ok: false; code: QuickEditSaveMergeFailureCode; message: string };

function normalizeIdentity(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\\/gu, '/') : '';
}

function sameResource(left: QuickEditSaveResource, right: QuickEditSaveResource): boolean {
  return left.engine === right.engine
    && normalizeIdentity(left.projectId) === normalizeIdentity(right.projectId)
    && normalizeIdentity(left.path) === normalizeIdentity(right.path);
}

function fail(code: QuickEditSaveMergeFailureCode, message: string): QuickEditSaveMergeResult {
  return { ok: false, code, message };
}

function mergeSourceTextDrafts(
  drafts: Array<Extract<QuickEditSaveDraft, { kind: 'source-text' }>>,
): QuickEditSaveMergeResult {
  const replacements = new Map<string, string>();
  for (const draft of drafts) {
    for (const replacement of draft.replacements) {
      if (!replacement.before.trim() || !replacement.after.trim() || replacement.before === replacement.after) {
        continue;
      }
      const existing = replacements.get(replacement.before);
      if (existing !== undefined && existing !== replacement.after) {
        return fail(
          'TEXT_REPLACEMENT_CONFLICT',
          `“${replacement.before}”被修改成不同内容，请统一后再保存。`,
        );
      }
      replacements.set(replacement.before, replacement.after);
    }
  }
  return {
    ok: true,
    draft: {
      ...drafts[0],
      replacements: Array.from(replacements, ([before, after]) => ({ before, after })),
    },
  };
}

function mergeHtmlTextDrafts(
  drafts: Array<Extract<QuickEditSaveDraft, { kind: 'html-text' }>>,
): QuickEditSaveMergeResult {
  const edits = new Map<string, QuickEditHtmlTextEdit>();
  for (const draft of drafts) {
    for (const edit of draft.edits) {
      const key = edit.key.trim();
      if (!key || !edit.before.trim() || !edit.after.trim() || edit.before === edit.after) {
        continue;
      }
      const existing = edits.get(key);
      if (existing && (existing.before !== edit.before || existing.after !== edit.after)) {
        return fail(
          'HTML_TEXT_EDIT_CONFLICT',
          `HTML 文本节点 ${key} 存在冲突修改，请统一后再保存。`,
        );
      }
      edits.set(key, { ...edit, key });
    }
  }
  return {
    ok: true,
    draft: {
      ...drafts[0],
      edits: Array.from(edits.values()),
    },
  };
}

export function mergeQuickEditSaveDrafts(drafts: readonly QuickEditSaveDraft[]): QuickEditSaveMergeResult {
  const first = drafts[0];
  if (!first) {
    return fail('NO_SAVE_DRAFT', '当前没有可保存的修改。');
  }

  for (const draft of drafts.slice(1)) {
    if (draft.kind !== first.kind || draft.action !== first.action || !sameResource(first.resource, draft.resource)) {
      return fail('RESOURCE_MISMATCH', '分屏画面不属于同一资源，无法合并保存。');
    }
    if (
      first.resource.engine === 'html'
      && normalizeIdentity(first.resource.revision) !== normalizeIdentity(draft.resource.revision)
    ) {
      return fail('REVISION_MISMATCH', 'HTML 源文件已更新，请刷新两个画面后重新修改。');
    }
  }

  if (first.kind === 'source-text') {
    return mergeSourceTextDrafts(drafts as Array<Extract<QuickEditSaveDraft, { kind: 'source-text' }>>);
  }
  if (first.kind === 'html-text') {
    return mergeHtmlTextDrafts(drafts as Array<Extract<QuickEditSaveDraft, { kind: 'html-text' }>>);
  }
  if (first.kind === 'style') {
    const blocks = Array.from(new Set(
      (drafts as Array<Extract<QuickEditSaveDraft, { kind: 'style' }>>)
        .map((draft) => draft.cssText.trim())
        .filter(Boolean),
    ));
    return { ok: true, draft: { ...first, cssText: blocks.join('\n\n') } };
  }
  return { ok: true, draft: first };
}

export function buildQuickEditSaveConfirmation(
  preflight: QuickEditSavePreflight,
): QuickEditSaveDialogInput {
  let description: string;
  if (preflight.action === 'save-text') {
    description = `检测到 ${preflight.changeCount} 组文本修改，预计会替换 ${preflight.affectedCount} 处文本。`;
  } else if (preflight.action === 'save-style') {
    description = '确定保存当前的样式调整吗？保存后页面会自动刷新并生效。';
  } else {
    description = '确定清空自定义样式吗？清空后页面会自动刷新并生效。';
  }
  return {
    title: '确认操作',
    description,
    confirmText: '确定',
    cancelText: '取消',
    tone: 'brand',
    dismissible: false,
  };
}
