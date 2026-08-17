import type {
  EditorFeedbackService,
  EditorChangesService,
  EditorInteractionService,
  EditorLocalActionsService,
  EditorPersistenceService,
  EditorSummariesService,
} from './contracts';
import type { EditorRuntimeState } from './state';
import type {
  CommentaryClearEditsOptions,
  CommentaryClearEditsTarget,
} from '../../web-editor-types';

export function createLocalActionsService(options: {
  state: EditorRuntimeState;
  feedback: EditorFeedbackService;
  changes: EditorChangesService;
  interaction: EditorInteractionService;
  summaries: EditorSummariesService;
  persistence: EditorPersistenceService;
  onStatusChange?: () => void;
}): EditorLocalActionsService {
  function isMissingCurrentChangeError(error: string | null | undefined): boolean {
    const normalized = String(error ?? '').trim();
    return normalized === 'Element not found in current changes';
  }

  async function handleCopyPrompt(): Promise<void> {
    const promptText = options.summaries.buildCopyPrompt();
    const filteredNotice = options.summaries.getCopyPromptFilteredNotice?.();
    if (!promptText) {
      options.feedback.toast('info', '你好像还没有修改任何内容哦。');
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(promptText);
      } else {
        await options.feedback.prompt({
          title: '请手动复制以下内容',
          content: filteredNotice
            ? `浏览器未提供剪贴板权限，请手动复制下面的内容。\n\n提示：${filteredNotice}`
            : '浏览器未提供剪贴板权限，请手动复制下面的内容。',
          label: '待复制内容',
          defaultValue: promptText,
          confirmText: '知道了',
          multiline: true,
          readOnly: true,
          rows: 12,
          selectOnOpen: true,
        });
      }
      options.feedback.toast(
        'success',
        filteredNotice ? `已复制到剪贴板。${filteredNotice}` : '已复制到剪贴板。',
      );
    } catch {
      await options.feedback.prompt({
        title: '请手动复制以下内容',
        content: filteredNotice
          ? `自动复制失败，请手动复制下面的内容。\n\n提示：${filteredNotice}`
          : '自动复制失败，请手动复制下面的内容。',
        label: '待复制内容',
        defaultValue: promptText,
        confirmText: '知道了',
        multiline: true,
        readOnly: true,
        rows: 12,
        selectOnOpen: true,
      });
      options.feedback.toast('error', '自动复制失败（已提供手动复制）。');
    }
  }

  async function handleClearEdits(
    config: CommentaryClearEditsOptions = {},
  ): Promise<CommentaryClearEditsTarget | null> {
    const tm = options.state.transactionManager;
    const clearsPrototype = config.scope === 'prototype';
    let target: CommentaryClearEditsTarget = config.target ?? 'all';

    if (!config.skipConfirm) {
      const result = await options.feedback.confirm({
        title: clearsPrototype ? '清空当前原型批注' : '清空全部编辑',
        content: clearsPrototype
          ? '请选择清空当前原型所有页面的已完成批注，或清空全部批注。已保存的代码修改不受影响。'
          : '确定要清空所有待修改内容吗？已保存的修改不受影响。',
        confirmText: clearsPrototype ? '清空已完成批注' : '清空',
        ...(clearsPrototype ? { secondaryConfirmText: '清空所有批注' } : { cancelText: '取消' }),
        confirmTone: 'primary',
      });

      if (!result) return null;
      target = result === 'secondary' ? 'all' : clearsPrototype ? 'completed' : 'all';
    }

    if (target === 'completed') {
      await options.persistence.clearStorage(config.scope, target);
      await options.persistence.restoreCachedChanges();
      options.state.propertyPanel?.refresh();
      options.onStatusChange?.();
      return target;
    }

    if (tm) {
      while (tm.canUndo()) {
        tm.undo();
      }
      tm.clear();
    }

    await options.changes.revertAllRecordedTweaks();

    options.changes.clearAllEditMeta();
    await options.persistence.clearStorage(config.scope, target);
    options.state.propertyPanel?.refresh();
    options.onStatusChange?.();
    return target;
  }

  async function handleClearElementEdits(element: Element): Promise<boolean> {
    if (!element || !element.isConnected) return false;

    const meta = options.changes.getMetaForElement(element);
    const hasNote = Boolean(options.changes.normalizeNote(meta?.note ?? '').trim());
    const hasImages = Boolean(meta?.images.length);
    const hasRecordedChanges = Boolean(meta?.changeKinds.length);
    const hasStaleDirtyMarker = Boolean(meta && meta.dirtySince !== null && !hasRecordedChanges);
    const hasStyleRelatedChanges = Boolean(
      meta?.changeKinds.some((kind) => kind === 'style' || kind === 'class'),
    );
    const hasTweakChanges = Boolean(meta?.changeKinds.includes('tweak'));
    const hasTransactionChanges = Boolean(
      meta?.changeKinds.some((kind) => kind === 'text' || kind === 'style' || kind === 'class'),
    );
    const deleteElementAnnotationLinks = meta
      ? Array.from(options.state.deleteElementAnnotationsByTransactionId.values())
        .filter((link) => link.parentElementKey === meta.elementKey && link.active)
        .reverse()
      : [];

    if (!hasNote && !hasImages && !hasRecordedChanges && !hasStaleDirtyMarker) {
      options.feedback.toast('info', '当前项没有可清空的待修改内容。');
      return false;
    }

    if (hasStyleRelatedChanges) {
      // Element-level clear is direct — no second confirmation needed.
    }

    if (hasTweakChanges) {
      await options.changes.revertRecordedTweakForElement(element);
    }

    if (deleteElementAnnotationLinks.length > 0) {
      const restoreDeletedElement = options.state.transactionManager?.restoreDeletedElement;
      if (!restoreDeletedElement) {
        await options.feedback.alert({
          title: '还原元素',
          content: '当前无法还原已删除的元素，请使用 Cmd/Ctrl + Z 后再试。',
          confirmText: '知道了',
        });
        return false;
      }
      for (const link of deleteElementAnnotationLinks) {
        if (restoreDeletedElement(link.transactionId)) continue;
        await options.feedback.alert({
          title: '还原元素',
          content: '已删除元素的原位置失效，暂时无法还原。',
          confirmText: '知道了',
        });
        return false;
      }
    }

    if (hasTransactionChanges && meta) {
      const result = await options.interaction.revertElement(meta.elementKey);
      if (!result.success) {
        if (isMissingCurrentChangeError(result.error)) {
          options.changes.markElementEditsHandled(element);
        } else {
          await options.feedback.alert({
            title: '清空编辑',
            content: `清空失败：${result.error ?? '无法回退该元素修改。'}`,
            confirmText: '知道了',
          });
          return false;
        }
      }
    }

    if (hasNote) {
      options.changes.setNoteForElement(element, '');
    }
    if (hasImages) {
      options.changes.setImagesForElement(element, []);
    }

    // Clear stale dirty entries that remain after Agent processing.
    // The marker may still be visible even though changeKinds is empty.
    if (meta) {
      options.changes.markElementEditsHandled(element);
    }

    options.state.propertyPanel?.refresh();
    options.feedback.toast('success', '已清空当前编辑。');
    options.onStatusChange?.();
    return true;
  }

  return {
    handleCopyPrompt,
    handleClearEdits,
    handleClearElementEdits,
  };
}
