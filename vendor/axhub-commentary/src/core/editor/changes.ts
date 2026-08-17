import type {
  ElementLocator,
  PrototypeEditCommentStatus,
  WebEditorElementKey,
} from '../../web-editor-types';
import { aggregateTransactionsByElement } from '../transaction-aggregator';
import { createElementLocator, locateElement } from '../locator';
import { generateFullElementLabel, generateStableElementKey } from '../element-key';
import type { EditorChangesService, ExternalEditingElementTarget } from './contracts';
import {
  ensureElementEditCommentId,
  type EditChangeKind,
  type EditorRuntimeState,
  type ElementEditMeta,
  type MarkerAnchor,
  type PromptImageAttachment,
} from './state';
import {
  createMarkerAnchor,
  getViewportPointFromMarkerAnchor,
} from './marker-anchor';
import {
  isTextCommentTargetElement,
  resolveTextCommentElementMeta,
} from './text-comment-target';
import { filterUnprocessedTransactions as filterTransactionsAfterProcessed } from './state';
import type {
  CommentaryTweakSchema,
  CommentaryTweakValue,
  CommentaryTweakValues,
} from '../../tweak/protocol';
import { getGlobalCommentaryTweakProtocol } from '../../tweak/protocol';
import { normalizePromptCardSkillIds } from '../../ui/runtime/prompt-card-skills';
import {
  extractAnnotationPanelNodeId,
  findAnnotationMarkerByNodeId,
  resolveAnnotationElementIdentity,
} from './annotation-target';

type ChangeMarkerTaskState = PrototypeEditCommentStatus;

const CHANGE_MARKER_TASK_LABELS: Record<ChangeMarkerTaskState, string> = {
  idle: '待处理',
  editing: '进行中',
  completed: '已完成',
  error: '处理失败',
};

const CHANGE_MARKER_TASK_GLYPHS = {
  completed: '✓',
  error: '!',
} as const;

export function filterVisibleChangeMarkerMetas(
  metas: readonly ElementEditMeta[],
  activeMarkerKey: WebEditorElementKey | null,
): ElementEditMeta[] {
  if (!activeMarkerKey) return metas.slice();
  return metas.filter((meta) => meta.elementKey !== activeMarkerKey);
}

export function createChangesService(options: {
  state: EditorRuntimeState;
  scheduleCacheWrite: () => void;
  persistMarkerVisibility: (visible: boolean) => void;
  getCommentTaskState?: (
    elementKey: WebEditorElementKey,
  ) => PrototypeEditCommentStatus | null;
  onCommentEdited?: (elementKey: WebEditorElementKey) => void;
  onSelectMarkedElement?: (element: Element, anchor: MarkerAnchor) => void;
  onStatusChange?: () => void;
}): EditorChangesService {
  const { state } = options;

  function normalizeNote(value: string): string {
    return String(value ?? '').replace(/\r\n/g, '\n');
  }

  function resolveEditableElementIdentity(element: Element): {
    elementKey: WebEditorElementKey;
    locator: ElementLocator;
    label: string;
  } {
    const annotationIdentity = resolveAnnotationElementIdentity(element);
    if (annotationIdentity) {
      return {
        elementKey: annotationIdentity.elementKey,
        locator: annotationIdentity.locator,
        label: annotationIdentity.label,
      };
    }

    const locator = createElementLocator(element);
    return {
      elementKey: generateStableElementKey(element, locator.shadowHostChain),
      locator,
      label: generateFullElementLabel(element, locator.shadowHostChain),
    };
  }

  function locateMarkerRenderableElement(locator: ElementLocator): Element | null {
    let element: Element | null = null;
    try {
      element = locateElement(locator);
    } catch {
      element = null;
    }
    if (element?.isConnected) return element;

    const annotationNodeId = extractAnnotationPanelNodeId(locator);
    const annotationMarker = findAnnotationMarkerByNodeId(annotationNodeId);
    return annotationMarker?.isConnected ? annotationMarker : null;
  }

  function resolveAnnotationMarkerAnchor(locator: ElementLocator): MarkerAnchor | null {
    const annotationNodeId = extractAnnotationPanelNodeId(locator);
    if (!annotationNodeId) return null;

    const annotationMarker = findAnnotationMarkerByNodeId(annotationNodeId);
    if (!annotationMarker?.isConnected) return null;

    return buildFallbackAnchor(annotationMarker);
  }

  function formatSelectorPath(locator: ElementLocator | null | undefined): string {
    if (!locator) return '';
    const selectors = (locator.selectors ?? []).map((s) => String(s ?? '').trim()).filter(Boolean);
    if (selectors.length > 0) return selectors.join(' | ');
    if (locator.path?.length) return locator.path.join('>');
    return '';
  }

  function cloneTweakValue(value: CommentaryTweakValue | undefined): CommentaryTweakValue | undefined {
    return Array.isArray(value) ? value.slice() : value;
  }

  function cloneTweakValues(values: CommentaryTweakValues | null | undefined): CommentaryTweakValues | null {
    if (!values) return null;
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, cloneTweakValue(value)]),
    );
  }

  function tweakValueEquals(
    left: CommentaryTweakValue | undefined,
    right: CommentaryTweakValue | undefined,
  ): boolean {
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right)) {
        return false;
      }
      if (left.length !== right.length) {
        return false;
      }
      return left.every((value, index) => value === right[index]);
    }
    return left === right;
  }

  function formatTweakValue(value: CommentaryTweakValue | undefined): string {
    if (Array.isArray(value)) {
      return value.length > 0 ? value.map((item) => String(item ?? '')).join(', ') : '(empty)';
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (value === null || value === undefined || value === '') {
      return '(empty)';
    }
    return String(value);
  }

  function buildTweakSummaryLines(
    schema: CommentaryTweakSchema | null | undefined,
    beforeValues: CommentaryTweakValues | null | undefined,
    afterValues: CommentaryTweakValues | null | undefined,
  ): string[] {
    const fieldLabelByKey = new Map(
      (schema?.fields ?? []).map((field) => [field.key, field.label]),
    );
    const keys = new Set<string>([
      ...Object.keys(beforeValues ?? {}),
      ...Object.keys(afterValues ?? {}),
    ]);

    const lines = Array.from(keys)
      .filter((key) => !tweakValueEquals(beforeValues?.[key], afterValues?.[key]))
      .sort()
      .map((key) => {
        const label = fieldLabelByKey.get(key) ?? key;
        return `调整 ${label}: "${formatTweakValue(beforeValues?.[key])}" -> "${formatTweakValue(afterValues?.[key])}"`;
      });

    if (lines.length <= 5) {
      return lines;
    }
    return [...lines.slice(0, 5), `还有 ${lines.length - 5} 项调整...`];
  }

  function buildTweakRevertPatch(meta: ElementEditMeta): CommentaryTweakValues {
    const baseline = meta.tweakBaselineValues ?? {};
    const current = meta.tweakCurrentValues ?? {};
    const patch: CommentaryTweakValues = {};
    const keys = new Set<string>([
      ...Object.keys(baseline),
      ...Object.keys(current),
    ]);

    for (const key of keys) {
      if (tweakValueEquals(current[key], baseline[key])) {
        continue;
      }
      patch[key] = cloneTweakValue(baseline[key]);
    }

    return patch;
  }

  function hasRecordedTweak(meta: ElementEditMeta): boolean {
    return Boolean((meta.tweakSummaryLines?.length ?? 0) > 0);
  }

  function detectFixedAnchor(element: Element): boolean {
    let current: HTMLElement | null = element instanceof HTMLElement ? element : null;
    while (current && current !== document.body) {
      try {
        const position = window.getComputedStyle(current).position;
        if (position === 'fixed' || position === 'sticky') {
          return true;
        }
      } catch {
        return false;
      }
      current = current.parentElement;
    }
    return false;
  }

  function buildAnchorFromPoint(
    element: Element,
    clientX: number,
    clientY: number,
  ): MarkerAnchor {
    const isFixed = detectFixedAnchor(element);
    const rect = element instanceof HTMLElement ? element.getBoundingClientRect() : null;
    const offsetX =
      rect && Number.isFinite(rect.left) && Number.isFinite(clientX) ? clientX - rect.left : undefined;
    const offsetY =
      rect && Number.isFinite(rect.top) && Number.isFinite(clientY) ? clientY - rect.top : undefined;
    return createMarkerAnchor({
      clientX,
      clientY,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportWidth: window.innerWidth,
      isFixed,
      offsetX,
      offsetY,
    });
  }

  function buildFallbackAnchor(element: Element): MarkerAnchor | null {
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
    return buildAnchorFromPoint(
      element,
      rect.left + rect.width / 2,
      rect.top + Math.min(18, Math.max(10, rect.height / 2)),
    );
  }

  function getOrCreateEditMeta(
    elementKey: WebEditorElementKey,
    locator: ElementLocator,
    label: string,
  ): ElementEditMeta {
    const existing = state.editMetaByKey.get(elementKey);
    if (existing) {
      existing.locator = locator;
      existing.label = label;
      return existing;
    }

    const created: ElementEditMeta = {
      commentId: null,
      elementKey,
      locator,
      label,
      note: '',
      images: [],
      anchor: null,
      dirtySince: null,
      changeKinds: [],
      tweakSummaryLines: [],
      tweakBaselineValues: null,
      tweakCurrentValues: null,
      styleSummaryLines: [],
      textSummary: null,
      classSummaryLines: [],
    };
    state.editMetaByKey.set(elementKey, created);
    return created;
  }

  function migrateEditMetaKey(
    meta: ElementEditMeta,
    nextElementKey: WebEditorElementKey,
    locator: ElementLocator,
    label: string,
  ): ElementEditMeta {
    const previousElementKey = meta.elementKey;
    meta.locator = locator;
    meta.label = label;

    if (previousElementKey === nextElementKey) {
      return meta;
    }

    state.editMetaByKey.delete(previousElementKey);
    meta.elementKey = nextElementKey;
    state.editMetaByKey.set(nextElementKey, meta);

    const processedAt = state.processedEditTimestampsByKey.get(previousElementKey);
    if (processedAt !== undefined) {
      state.processedEditTimestampsByKey.delete(previousElementKey);
      state.processedEditTimestampsByKey.set(nextElementKey, processedAt);
    }

    const pendingAnchor = state.pendingMarkerAnchors.get(previousElementKey);
    if (pendingAnchor) {
      state.pendingMarkerAnchors.delete(previousElementKey);
      state.pendingMarkerAnchors.set(nextElementKey, pendingAnchor);
    }

    return meta;
  }

  function findExistingMetaForLiveElement(
    element: Element,
    nextElementKey: WebEditorElementKey,
    locator: ElementLocator,
    label: string,
  ): ElementEditMeta | null {
    for (const meta of state.editMetaByKey.values()) {
      if (meta.elementKey === nextElementKey) {
        return migrateEditMetaKey(meta, nextElementKey, locator, label);
      }

      let liveElement: Element | null = null;
      try {
        liveElement = locateElement(meta.locator);
      } catch {
        liveElement = null;
      }

      if (liveElement !== element) {
        continue;
      }

      return migrateEditMetaKey(meta, nextElementKey, locator, label);
    }

    return null;
  }

  function getMetaForElement(element: Element | null): ElementEditMeta | null {
    if (!element) return null;
    const textCommentMeta = resolveTextCommentElementMeta(state, element);
    if (textCommentMeta) {
      return (
        state.editMetaByKey.get(textCommentMeta.elementKey) ??
        getOrCreateEditMeta(
          textCommentMeta.elementKey,
          textCommentMeta.locator,
          textCommentMeta.label,
        )
      );
    }
    if (isTextCommentTargetElement(element)) {
      return null;
    }
    const { elementKey, locator, label } = resolveEditableElementIdentity(element);
    return (
      state.editMetaByKey.get(elementKey) ??
      findExistingMetaForLiveElement(element, elementKey, locator, label) ??
      getOrCreateEditMeta(
        elementKey,
        locator,
        label,
      )
    );
  }

  function getViewportMarkerPosition(anchor: MarkerAnchor): { left: number; top: number } {
    return getViewportPointFromMarkerAnchor(anchor, {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      viewportWidth: window.innerWidth,
    });
  }

  function resolveLiveAnchor(
    locator: ElementLocator,
    fallbackAnchor: MarkerAnchor | null,
  ): MarkerAnchor | null {
    const annotationMarkerAnchor = resolveAnnotationMarkerAnchor(locator);
    if (annotationMarkerAnchor) return annotationMarkerAnchor;

    let element = locateMarkerRenderableElement(locator);

    // For text comments the locator is synthetic (empty selectors),
    // so locateElement finds nothing.  Fall back to the live source element
    // stored on the active text comment – its getBoundingClientRect()
    // correctly tracks viewport position inside nested scroll containers.
    if (!element || !element.isConnected) {
      const src = state.activeTextComment?.sourceElement;
      if (src && src.isConnected) {
        element = src;
      }
    }

    if (element && element.isConnected) {
      const rect = element instanceof HTMLElement ? element.getBoundingClientRect() : null;
      const offsetX = Number(fallbackAnchor?.offsetX);
      const offsetY = Number(fallbackAnchor?.offsetY);
      if (
        rect &&
        Number.isFinite(rect.left) &&
        Number.isFinite(rect.top) &&
        Number.isFinite(offsetX) &&
        Number.isFinite(offsetY)
      ) {
        const clampedX = Math.min(Math.max(0, offsetX), Math.max(0, rect.width));
        const clampedY = Math.min(Math.max(0, offsetY), Math.max(0, rect.height));
        return buildAnchorFromPoint(element, rect.left + clampedX, rect.top + clampedY);
      }

      if (fallbackAnchor) {
        return buildFallbackAnchor(element) ?? fallbackAnchor;
      }
      return buildFallbackAnchor(element);
    }
    return null;
  }

  function resolveSelectionAnchor(
    element: Element,
    selectionAnchor?: { clientX: number; clientY: number },
  ): MarkerAnchor | null {
    if (selectionAnchor) {
      return buildAnchorFromPoint(element, selectionAnchor.clientX, selectionAnchor.clientY);
    }

    const { elementKey } = resolveEditableElementIdentity(element);
    const meta = state.editMetaByKey.get(elementKey);
    const pendingAnchor = state.pendingMarkerAnchors.get(elementKey) ?? null;
    return pendingAnchor ?? meta?.anchor ?? buildFallbackAnchor(element);
  }

  function formatStyleValue(value: unknown): string {
    const normalized = String(value ?? '').trim();
    return normalized || '已清除';
  }

  function buildStyleSummaryLines(
    before: Record<string, string> | null | undefined,
    after: Record<string, string> | null | undefined,
  ): string[] {
    const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]))
      .map((key) => String(key ?? '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const lines = keys.map((prop) => {
      const beforeValue = String(before?.[prop] ?? '').trim();
      const afterValue = String(after?.[prop] ?? '').trim();
      if (beforeValue && afterValue) {
        return `样式 ${prop}: ${beforeValue} -> ${afterValue}`;
      }
      if (afterValue) {
        return `样式 ${prop}: ${afterValue}`;
      }
      return `样式 ${prop}: 已清除（原值 ${formatStyleValue(beforeValue)}）`;
    });

    if (lines.length <= 5) return lines;
    return [...lines.slice(0, 5), `还有 ${lines.length - 5} 项样式修改...`];
  }

  function buildMarkerDetailLines(meta: ElementEditMeta): string[] {
    const lines: string[] = [];
    const note = normalizeNote(meta.note).trim();
    const userImageCount = meta.images.filter((image) => image.source !== 'target-screenshot').length;
    if (note) {
      lines.push(note);
    } else if ((meta.skillIds?.length ?? 0) > 0) {
      lines.push('已选择 AI 技能');
    } else if (userImageCount > 0) {
      lines.push(`已附加 ${userImageCount} 张参考图片`);
    } else if (meta.changeKinds.length > 0) {
      lines.push(`已修改：${meta.changeKinds.join(' / ')}`);
    } else {
      lines.push('已记录修改');
    }

    if ((meta.tweakSummaryLines?.length ?? 0) > 0) {
      lines.push(...(meta.tweakSummaryLines ?? []));
    }

    if (meta.textSummary) {
      lines.push(meta.textSummary);
    }

    if (meta.styleSummaryLines.length > 0) {
      lines.push(...meta.styleSummaryLines);
    }

    if (meta.classSummaryLines.length > 0) {
      lines.push(...meta.classSummaryLines);
    }

    return lines;
  }

  function resolveChangeMarkerTaskState(elementKey: WebEditorElementKey): ChangeMarkerTaskState | null {
    const task =
      state.externalEditingTaskByElementKey.get(elementKey)
      ?? state.agentTaskByElementKey.get(elementKey)
      ?? null;
    if (task && !task.dismissed) {
      if (task.status === 'pending' || task.status === 'created') return 'editing';
      if (task.status === 'completed') return 'completed';
      if (task.status === 'error') return 'error';
    }
    return options.getCommentTaskState?.(elementKey) ?? null;
  }

  function pruneIdleMeta(elementKey: WebEditorElementKey): void {
    const meta = state.editMetaByKey.get(elementKey);
    if (!meta) return;
    const hasNote = Boolean(normalizeNote(meta.note).trim());
    if (hasNote) return;
    if ((meta.skillIds?.length ?? 0) > 0) return;
    if (meta.images.length > 0) return;
    if (meta.dirtySince !== null) return;
    if (meta.changeKinds.length > 0) return;
    if (hasRecordedTweak(meta)) return;
    // Prune editMeta entries with no substantive content.
    // This removes ghost markers that linger after Agent processing.
    // Note: processedEditTimestampsByKey is intentionally preserved —
    // it's needed by filterTransactionsAfterProcessed to avoid
    // re-caching already-handled transactions from the undo stack.
    state.editMetaByKey.delete(elementKey);
  }

  function renderChangeMarkers(): void {
    const layer = state.markerLayer;
    if (!layer) return;

    if (!state.changeMarkersVisible || state.promptCardVisible) {
      layer.hidden = true;
      layer.replaceChildren();
      return;
    }

    const dirtyMetas = Array.from(state.editMetaByKey.values())
      .filter((meta) => meta.dirtySince !== null && meta.anchor)
      .sort((a, b) => {
        const at = Number(a.dirtySince ?? 0);
        const bt = Number(b.dirtySince ?? 0);
        if (at !== bt) return at - bt;
        return a.label.localeCompare(b.label);
      });

    const activeMarkerKey = (() => {
      if (state.commentEntryMode !== 'bubble-card') return null;
      const selected = state.selectedElement;
      if (!selected || !selected.isConnected) return null;
      return resolveEditableElementIdentity(selected).elementKey;
    })();

    const visibleMetas = filterVisibleChangeMarkerMetas(dirtyMetas, activeMarkerKey);

    if (visibleMetas.length === 0) {
      layer.hidden = true;
      layer.replaceChildren();
      return;
    }

    const resolvedMetas = visibleMetas.flatMap((meta) => {
      const anchor = resolveLiveAnchor(meta.locator, meta.anchor);
      return anchor ? [{ meta, anchor }] : [];
    });

    const nodes = resolvedMetas.map(({ meta, anchor }, index) => {
      const position = getViewportMarkerPosition(anchor);
      const annotationNodeId = extractAnnotationPanelNodeId(meta.locator);
      const detailLines = buildMarkerDetailLines(meta);
      const markerText = String(index + 1);
      const taskState = resolveChangeMarkerTaskState(meta.elementKey);
      const taskLocked = taskState === 'editing';
      const marker = document.createElement('div');
      marker.className = [
        'we-change-marker',
        annotationNodeId ? 'we-change-marker--annotation-note' : '',
        taskState ? `we-change-marker--task-${taskState}` : '',
      ].filter(Boolean).join(' ');
      marker.style.left = `${position.left}px`;
      marker.style.top = `${position.top}px`;
      marker.setAttribute('role', 'button');
      marker.tabIndex = 0;
      marker.setAttribute(
        'aria-label',
        `定位到 ${meta.label}${taskState ? `，${CHANGE_MARKER_TASK_LABELS[taskState]}` : ''}`,
      );
      if (taskState) {
        marker.setAttribute('data-task-state', taskState);
      }
      if (taskLocked) {
        marker.setAttribute('aria-disabled', 'true');
      }

      const markerBody = document.createElement('span');
      markerBody.className = 'we-change-marker__body';
      markerBody.textContent = markerText;

      const taskGlyph = taskState === 'completed' || taskState === 'error'
        ? CHANGE_MARKER_TASK_GLYPHS[taskState]
        : null;
      const taskStatus = taskGlyph ? document.createElement('span') : null;
      if (taskStatus && taskState) {
        taskStatus.className = 'we-change-marker__task-status';
        taskStatus.textContent = taskGlyph;
        taskStatus.setAttribute('aria-hidden', 'true');
        taskStatus.title = CHANGE_MARKER_TASK_LABELS[taskState];
      }

      const tooltip = document.createElement('div');
      tooltip.className = 'we-change-marker__tooltip';

      const label = document.createElement('span');
      label.className = 'we-change-marker__label';
      label.textContent = meta.label;

      const details = document.createElement('div');
      details.className = 'we-change-marker__details';
      for (const line of [
        ...(taskState ? [`状态：${CHANGE_MARKER_TASK_LABELS[taskState]}`] : []),
        ...detailLines,
      ]) {
        const detail = document.createElement('span');
        detail.className = 'we-change-marker__note';
        detail.textContent = line;
        details.append(detail);
      }

      const selectMarkedElement = () => {
        const element = locateMarkerRenderableElement(meta.locator);
        if (!element || !element.isConnected) return;
        options.onSelectMarkedElement?.(element, anchor);
      };

      marker.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (taskLocked) return;
        selectMarkedElement();
      });
      marker.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        if (taskLocked) return;
        selectMarkedElement();
      });

      tooltip.append(label, details);
      marker.append(markerBody, ...(taskStatus ? [taskStatus] : []), tooltip);
      return marker;
    });

    layer.hidden = nodes.length === 0;
    layer.replaceChildren(...nodes);
  }

  function notifyEditMetaChanged(): void {
    options.scheduleCacheWrite();
    state.propertyPanel?.refresh();
    renderChangeMarkers();
    options.onStatusChange?.();
  }

  function notifyCommentEdited(meta: ElementEditMeta): void {
    const hasPersistentContent = Boolean(
      normalizeNote(meta.note).trim()
      || meta.images.length > 0
      || hasRecordedTweak(meta),
    );
    if (!meta.commentId || !hasPersistentContent) return;
    options.onCommentEdited?.(meta.elementKey);
  }

  function syncEditMetaWithTransactions(): void {
    const tm = state.transactionManager;
    if (!tm) {
      renderChangeMarkers();
      return;
    }

    const summaries = aggregateTransactionsByElement(filterTransactionsAfterProcessed(state, tm.getUndoStack()));
    const dirtyKeys = new Set<WebEditorElementKey>();

    for (const summary of summaries) {
      const key = summary.elementKey;
      state.processedEditTimestampsByKey.delete(key);
      dirtyKeys.add(key);
      const meta = getOrCreateEditMeta(
        key,
        summary.netEffect.locator,
        summary.fullLabel || summary.label,
      );
      meta.locator = summary.netEffect.locator;
      meta.label = summary.fullLabel || summary.label;
      if (meta.dirtySince === null) {
        meta.dirtySince = Number(summary.updatedAt ?? Date.now());
      }

      const nextKinds: EditChangeKind[] = hasRecordedTweak(meta) ? ['tweak'] : [];
      if (summary.netEffect.textChange) nextKinds.push('text');
      if (summary.netEffect.styleChanges) nextKinds.push('style');
      if (summary.netEffect.classChanges) nextKinds.push('class');
      meta.changeKinds = nextKinds;
      if (nextKinds.length > 0) {
        ensureElementEditCommentId(meta);
      }
      meta.styleSummaryLines = buildStyleSummaryLines(
        summary.netEffect.styleChanges?.before,
        summary.netEffect.styleChanges?.after,
      );
      meta.textSummary = summary.changes.text
        ? `文本：${summary.changes.text.beforePreview} -> ${summary.changes.text.afterPreview}`
        : null;
      meta.classSummaryLines = summary.changes.class
        ? [
            ...(summary.changes.class.added.length > 0
              ? [`类名新增：${summary.changes.class.added.join(', ')}`]
              : []),
            ...(summary.changes.class.removed.length > 0
              ? [`类名移除：${summary.changes.class.removed.join(', ')}`]
              : []),
          ]
        : [];

      const nextPendingAnchor = state.pendingMarkerAnchors.get(key) ?? null;
      if (nextPendingAnchor) {
        meta.anchor = nextPendingAnchor;
      } else if (!meta.anchor) {
        const fallbackElement = locateElement(summary.netEffect.locator);
        meta.anchor = fallbackElement ? buildFallbackAnchor(fallbackElement) : null;
      }
      state.pendingMarkerAnchors.delete(key);
    }

    for (const meta of state.editMetaByKey.values()) {
      if (dirtyKeys.has(meta.elementKey)) continue;
      if (normalizeNote(meta.note).trim() || (meta.skillIds?.length ?? 0) > 0) {
        if (meta.dirtySince === null) {
          meta.dirtySince = Date.now();
        }
        if (!meta.anchor) {
          const fallbackElement = locateElement(meta.locator);
          meta.anchor = fallbackElement ? buildFallbackAnchor(fallbackElement) : null;
        }
        meta.changeKinds = [];
        meta.styleSummaryLines = [];
        meta.textSummary = null;
        meta.classSummaryLines = [];
        continue;
      }

      if (hasRecordedTweak(meta)) {
        if (meta.dirtySince === null) {
          meta.dirtySince = Date.now();
        }
        if (!meta.anchor) {
          const fallbackElement = locateElement(meta.locator);
          meta.anchor = fallbackElement ? buildFallbackAnchor(fallbackElement) : null;
        }
        meta.changeKinds = ['tweak'];
        meta.styleSummaryLines = [];
        meta.textSummary = null;
        meta.classSummaryLines = [];
        continue;
      }

      meta.dirtySince = null;
      meta.changeKinds = [];
      meta.anchor = null;
      meta.tweakSummaryLines = [];
      meta.tweakBaselineValues = null;
      meta.tweakCurrentValues = null;
      meta.styleSummaryLines = [];
      meta.textSummary = null;
      meta.classSummaryLines = [];
    }

    for (const key of Array.from(state.editMetaByKey.keys())) {
      pruneIdleMeta(key);
    }

    renderChangeMarkers();
  }

  function markEditMetaHandled(
    meta: ElementEditMeta,
    selectedElement: Element | null,
  ): void {
    const handledAt = Date.now();
    meta.note = '';
    delete meta.skillIds;
    meta.images = [];
    meta.dirtySince = null;
    meta.changeKinds = [];
    meta.anchor = null;
    meta.tweakSummaryLines = [];
    meta.tweakBaselineValues = null;
    meta.tweakCurrentValues = null;
    meta.styleSummaryLines = [];
    meta.textSummary = null;
    meta.classSummaryLines = [];
    state.processedEditTimestampsByKey.set(meta.elementKey, handledAt);
    state.pendingMarkerAnchors.delete(meta.elementKey);
    if (selectedElement && state.selectedElement === selectedElement) {
      state.selectionAnchor = null;
    }
    pruneIdleMeta(meta.elementKey);
    options.scheduleCacheWrite();
    state.propertyPanel?.refresh();
    renderChangeMarkers();
  }

  function markElementEditsHandled(element: Element): void {
    if (!element || !element.isConnected) return;
    const { elementKey, locator, label } = resolveEditableElementIdentity(element);
    const meta = getOrCreateEditMeta(
      elementKey,
      locator,
      label,
    );
    meta.locator = locator;
    meta.label = label;
    markEditMetaHandled(meta, element);
  }

  function markElementEditsHandledByKey(target: ExternalEditingElementTarget): void {
    const elementKey = String(target?.elementKey ?? '').trim() as WebEditorElementKey;
    if (!elementKey || !target?.locator) return;
    const meta = getOrCreateEditMeta(
      elementKey,
      target.locator,
      String(target.label || '').trim() || elementKey,
    );
    meta.locator = target.locator;
    meta.label = String(target.label || '').trim() || elementKey;
    markEditMetaHandled(meta, null);
  }

  function clearElementEditMeta(element: Element | null): void {
    const meta = getMetaForElement(element);
    if (!meta) return;
    state.editMetaByKey.delete(meta.elementKey);
    state.processedEditTimestampsByKey.delete(meta.elementKey);
    state.pendingMarkerAnchors.delete(meta.elementKey);
    state.externalEditingTaskByElementKey.delete(meta.elementKey);
    state.agentTaskByElementKey.delete(meta.elementKey);
    if (state.selectedElement === element) {
      state.selectionAnchor = null;
    }
    options.scheduleCacheWrite();
    state.propertyPanel?.refresh();
    renderChangeMarkers();
    options.onStatusChange?.();
  }

  function setNoteForElement(
    element: Element | null,
    note: string,
    options: {
      skillIds?: readonly string[];
      voiceCreateOperationId?: string;
      voiceTargetRef?: string;
      voiceTarget?: import('../../web-editor-types').CommentaryPageElementSummary;
      anchorPlacement?: 'target';
    } = {},
  ): string | null {
    const meta = getMetaForElement(element);
    if (!meta) return null;
    meta.note = normalizeNote(note);
    const hasNote = Boolean(meta.note.trim());
    if (!hasNote) {
      delete meta.skillIds;
    } else if (options.skillIds) {
      const nextSkillIds = normalizePromptCardSkillIds(options.skillIds);
      if (nextSkillIds.length > 0) {
        meta.skillIds = nextSkillIds;
      } else {
        delete meta.skillIds;
      }
    }
    const pendingAnchor = state.pendingMarkerAnchors.get(meta.elementKey);
    if (pendingAnchor) {
      meta.anchor = pendingAnchor;
      state.pendingMarkerAnchors.delete(meta.elementKey);
    } else if (!meta.anchor && hasNote) {
      const fallbackElement = element && element.isConnected ? element : locateElement(meta.locator);
      meta.anchor = fallbackElement ? buildFallbackAnchor(fallbackElement) : null;
    }

    const commentId = hasNote ? ensureElementEditCommentId(meta) : null;
    if (hasNote) {
      const voiceCreateOperationId = String(options.voiceCreateOperationId || '').trim();
      if (voiceCreateOperationId) {
        meta.voiceCreateOperationId = voiceCreateOperationId;
        meta.voiceElementKey = meta.elementKey;
        meta.voiceTargetRef = String(options.voiceTargetRef || '').trim() || undefined;
        meta.voiceTarget = options.voiceTarget;
        meta.anchorPlacement = options.anchorPlacement;
      }
      if (meta.dirtySince === null) {
        meta.dirtySince = Date.now();
      }
    } else if (meta.changeKinds.length === 0 && meta.images.length === 0 && !hasRecordedTweak(meta)) {
      meta.dirtySince = null;
      meta.anchor = null;
      meta.tweakSummaryLines = [];
      meta.tweakBaselineValues = null;
      meta.tweakCurrentValues = null;
      meta.styleSummaryLines = [];
      meta.textSummary = null;
      meta.classSummaryLines = [];
    }

    pruneIdleMeta(meta.elementKey);
    notifyCommentEdited(meta);
    notifyEditMetaChanged();
    return commentId;
  }

  function getImagesForElement(element: Element | null): PromptImageAttachment[] {
    return getMetaForElement(element)?.images.slice() ?? [];
  }

  function setImagesForElement(
    element: Element | null,
    images: readonly PromptImageAttachment[],
  ): void {
    const meta = getMetaForElement(element);
    if (!meta) return;

    meta.images = images.map((image) => ({ ...image }));
    const pendingAnchor = state.pendingMarkerAnchors.get(meta.elementKey);
    if (pendingAnchor) {
      meta.anchor = pendingAnchor;
      state.pendingMarkerAnchors.delete(meta.elementKey);
    } else if (!meta.anchor && meta.images.length > 0) {
      const fallbackElement = element && element.isConnected ? element : locateElement(meta.locator);
      meta.anchor = fallbackElement ? buildFallbackAnchor(fallbackElement) : null;
    }

    if (meta.images.length > 0) {
      ensureElementEditCommentId(meta);
      if (meta.dirtySince === null) {
        meta.dirtySince = Date.now();
      }
    } else if (!normalizeNote(meta.note).trim() && meta.changeKinds.length === 0 && !hasRecordedTweak(meta)) {
      meta.dirtySince = null;
      meta.anchor = null;
      meta.tweakSummaryLines = [];
      meta.tweakBaselineValues = null;
      meta.tweakCurrentValues = null;
      meta.styleSummaryLines = [];
      meta.textSummary = null;
      meta.classSummaryLines = [];
    }

    pruneIdleMeta(meta.elementKey);
    notifyCommentEdited(meta);
    notifyEditMetaChanged();
  }

  function recordTweakValuesForElement(
    element: Element | null,
    payload: {
      schema: CommentaryTweakSchema | null;
      beforeValues: CommentaryTweakValues | null;
      afterValues: CommentaryTweakValues | null;
    },
  ): void {
    const meta = getMetaForElement(element);
    if (!meta) return;

    const baselineValues = meta.tweakBaselineValues ?? cloneTweakValues(payload.beforeValues);
    const currentValues = cloneTweakValues(payload.afterValues);
    const summaryLines = buildTweakSummaryLines(
      payload.schema,
      baselineValues,
      currentValues,
    );

    meta.tweakSummaryLines = summaryLines;
    if (summaryLines.length > 0) {
      ensureElementEditCommentId(meta);
      meta.tweakBaselineValues = baselineValues;
      meta.tweakCurrentValues = currentValues;
      meta.changeKinds = ['tweak', ...meta.changeKinds.filter((kind) => kind !== 'tweak')];

      const pendingAnchor = state.pendingMarkerAnchors.get(meta.elementKey);
      if (pendingAnchor) {
        meta.anchor = pendingAnchor;
        state.pendingMarkerAnchors.delete(meta.elementKey);
      } else if (!meta.anchor && element?.isConnected) {
        meta.anchor = buildFallbackAnchor(element);
      }
      if (meta.dirtySince === null) {
        meta.dirtySince = Date.now();
      }
    } else {
      meta.tweakBaselineValues = null;
      meta.tweakCurrentValues = null;
      meta.changeKinds = meta.changeKinds.filter((kind) => kind !== 'tweak');
      if (
        !normalizeNote(meta.note).trim() &&
        meta.images.length === 0 &&
        meta.changeKinds.length === 0
      ) {
        meta.dirtySince = null;
        meta.anchor = null;
      }
    }

    pruneIdleMeta(meta.elementKey);
    notifyCommentEdited(meta);
    notifyEditMetaChanged();
  }

  function clearRecordedTweakForElement(element: Element | null): void {
    const meta = getMetaForElement(element);
    if (!meta) return;

    meta.tweakSummaryLines = [];
    meta.tweakBaselineValues = null;
    meta.tweakCurrentValues = null;
    meta.changeKinds = meta.changeKinds.filter((kind) => kind !== 'tweak');
    if (!normalizeNote(meta.note).trim() && meta.images.length === 0 && meta.changeKinds.length === 0) {
      meta.dirtySince = null;
      meta.anchor = null;
    }

    pruneIdleMeta(meta.elementKey);
    notifyCommentEdited(meta);
    options.scheduleCacheWrite();
    renderChangeMarkers();
  }

  async function revertRecordedTweakForElement(element: Element | null): Promise<boolean> {
    if (!element || !element.isConnected) return false;
    const meta = getMetaForElement(element);
    if (!meta || !hasRecordedTweak(meta)) return false;

    const patch = buildTweakRevertPatch(meta);
    if (Object.keys(patch).length === 0) {
      clearRecordedTweakForElement(element);
      return false;
    }

    const protocol = getGlobalCommentaryTweakProtocol();
    if (!protocol) {
      throw new Error('Tweak protocol is unavailable.');
    }

    await protocol.update(element, patch);
    clearRecordedTweakForElement(element);
    return true;
  }

  async function revertAllRecordedTweaks(): Promise<void> {
    for (const meta of Array.from(state.editMetaByKey.values())) {
      if (!hasRecordedTweak(meta)) continue;
      const element = locateElement(meta.locator);
      if (!element || !element.isConnected) continue;
      await revertRecordedTweakForElement(element);
    }
  }

  function clearAllEditMeta(): void {
    state.editMetaByKey.clear();
    state.processedEditTimestampsByKey.clear();
    state.pendingMarkerAnchors.clear();
    state.selectionAnchor = null;
    options.scheduleCacheWrite();
    renderChangeMarkers();
    options.onStatusChange?.();
  }

  function getSelectedElementNote(): string {
    return getMetaForElement(state.selectedElement ?? state.textCommentTargetElement)?.note ?? '';
  }

  function setChangeMarkersVisible(
    visible: boolean,
    config: { persist?: boolean } = {},
  ): void {
    state.changeMarkersVisible = visible;
    if (config.persist !== false) {
      options.persistMarkerVisibility(visible);
      options.scheduleCacheWrite();
    }
    state.propertyPanel?.refresh();
    renderChangeMarkers();
    options.onStatusChange?.();
  }

  function buildModifiedElementsContext() {
    const dirtyMetas = Array.from(state.editMetaByKey.values())
      .filter((meta) => meta.dirtySince !== null)
      .sort((a, b) => Number(a.dirtySince ?? 0) - Number(b.dirtySince ?? 0));

    return dirtyMetas.map((meta, index) => ({
      selector: formatSelectorPath(meta.locator),
      label: meta.label,
      note: meta.note,
      skillIds: meta.skillIds?.slice(),
      changeKinds: meta.changeKinds.slice(),
      marker: meta.anchor
        ? {
            index: index + 1,
            clientX: meta.anchor.clientX,
            clientY: meta.anchor.clientY,
            documentX: meta.anchor.documentX,
            documentY: meta.anchor.documentY,
            isFixed: meta.anchor.isFixed,
          }
        : null,
    }));
  }

  function buildCommentCommentsContext(element?: Element | null) {
    const targetMeta = element === undefined ? null : getMetaForElement(element);
    const sourceMetas = targetMeta
      ? [targetMeta]
      : Array.from(state.editMetaByKey.values())
        .sort((a, b) => Number(a.dirtySince ?? 0) - Number(b.dirtySince ?? 0));

    return sourceMetas
      .map((meta) => {
        const note = normalizeNote(meta.note).trim();
        if (!note) return null;
        let resolvedElement: Element | null = null;
        try {
          resolvedElement = locateElement(meta.locator);
        } catch {
          resolvedElement = null;
        }
        return {
          elementKey: meta.elementKey,
          selector: formatSelectorPath(meta.locator),
          label: meta.label,
          note,
          elementType: resolvedElement?.tagName ?? '',
        };
      })
      .filter((item): item is {
        elementKey: WebEditorElementKey;
        selector: string;
        label: string;
        note: string;
        elementType: string;
      } => Boolean(item));
  }

  function rememberSelectionAnchor(
    element: Element,
    selectionAnchor?: { clientX: number; clientY: number },
  ): void {
    const { elementKey } = resolveEditableElementIdentity(element);
    const resolvedAnchor = resolveSelectionAnchor(element, selectionAnchor);
    state.selectionAnchor = resolvedAnchor;

    state.pendingMarkerAnchors.clear();
    if (resolvedAnchor) {
      state.pendingMarkerAnchors.set(elementKey, resolvedAnchor);
    }

    const meta = state.editMetaByKey.get(elementKey);
    if (meta && resolvedAnchor) {
      meta.anchor = resolvedAnchor;
      renderChangeMarkers();
    }
  }

  function clearPendingSelectionAnchor(): void {
    state.selectionAnchor = null;
    if (state.pendingMarkerAnchors.size === 0) return;
    state.pendingMarkerAnchors.clear();
    renderChangeMarkers();
  }

  return {
    normalizeNote,
    getOrCreateEditMeta,
    getMetaForElement,
    rememberSelectionAnchor,
    clearPendingSelectionAnchor,
    renderChangeMarkers,
    syncEditMetaWithTransactions,
    setNoteForElement,
    getImagesForElement,
    setImagesForElement,
    recordTweakValuesForElement,
    clearRecordedTweakForElement,
    revertRecordedTweakForElement,
    revertAllRecordedTweaks,
    markElementEditsHandled,
    markElementEditsHandledByKey,
    clearElementEditMeta,
    clearAllEditMeta,
    getSelectedElementNote,
    setChangeMarkersVisible,
    buildCommentCommentsContext,
    buildModifiedElementsContext,
  };
}
