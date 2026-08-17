import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('dev template editor bridge launch options', () => {
  it('does not forward host-supplied AI runtime options when enabling the prototype editor over postMessage', () => {
    const source = readFileSync(resolve(__dirname, './index.tsx'), 'utf8');
    const enableStart = source.indexOf("event.data.type === 'AXHUB_PROTOTYPE_EDITOR_ENABLE'");
    const enableEnd = source.indexOf("event.data.type === 'AXHUB_PROTOTYPE_EDITOR_DISABLE'", enableStart);
    const enableSource = source.slice(enableStart, enableEnd);

    expect(enableStart).toBeGreaterThan(-1);
    expect(enableEnd).toBeGreaterThan(enableStart);
    expect(enableSource).toContain('event.data.options');
    expect(enableSource).not.toContain('agentBridge');
    expect(enableSource).not.toContain('integrationWs');
    expect(enableSource).toContain('mobileMode');
    expect(enableSource).toContain('commentPageScope');
    expect(enableSource).toContain('makeServerOrigin');
    expect(enableSource).not.toContain('annotationApiBaseUrl');
    expect(enableSource).toContain('annotationProjectId');
    expect(enableSource).toContain('readPrototypeEditorBridgeCommentPageScope');
    expect(enableSource).toContain("editorModeManager?.api.enable('webEditorV2'");
  });

  it('accepts node editing state updates over the parent bridge', () => {
    const source = readFileSync(resolve(__dirname, './index.tsx'), 'utf8');

    expect(source).toContain("event.data.type === 'AXHUB_PROTOTYPE_EDITOR_NODE_EDITING_STATE'");
    expect(source).toContain("if (!editorModeManager?.api.setNodeEditingState) {");
    expect(source).toContain("throw new Error('NOT_IMPLEMENTED: External editing state control is unavailable');");
    expect(source).toContain('await Promise.resolve(editorModeManager.api.setNodeEditingState(');
    expect(source).toContain('event.data.elementKey');
    expect(source).toContain('event.data.nextState');
    expect(source).toContain('event.data.taskRef ?? null');
    expect(source).toContain('event.data.targetRef ?? null');
  });

  it('returns web editor debug state to the parent bridge state query', () => {
    const source = readFileSync(resolve(__dirname, './index.tsx'), 'utf8');

    expect(source).toContain("event.data.type === 'AXHUB_PROTOTYPE_EDITOR_QUERY_STATE'");
    expect(source).toContain('debugState: editorModeManager?.api.getWebEditorDebugState?.() ?? null');
  });

  it('returns modified annotation elements with prompt bridge responses', () => {
    const source = readFileSync(resolve(__dirname, './index.tsx'), 'utf8');

    expect(source).toContain('modifiedElements?: CommentaryModifiedElementSummary[];');
    expect(source).toContain('editorModeManager?.api.getEditedSnapshot?.()?.modifiedElements ?? []');
    expect(source).toContain('modifiedElements,');
  });

  it('refreshes persisted voice comments over the parent bridge', () => {
    const source = readFileSync(resolve(__dirname, './index.tsx'), 'utf8');

    expect(source).toContain("event.data?.type === 'AXHUB_PROTOTYPE_EDITOR_VOICE_REFRESH_COMMENTS'");
    expect(source).toContain('editorModeManager?.api.refreshPersistedComments?.(deletedCommentIds)');
  });

  it('validates a persisted voice execution target over the parent bridge', () => {
    const source = readFileSync(resolve(__dirname, './index.tsx'), 'utf8');

    expect(source).toContain("event.data?.type === 'AXHUB_PROTOTYPE_EDITOR_VALIDATE_EDITING_TARGET'");
    expect(source).toContain('editorModeManager?.api.validateExternalEditingTarget?.(');
  });

  it('binds voice bridge requests to the parent origin established at enable time', () => {
    const source = readFileSync(resolve(__dirname, './index.tsx'), 'utf8');

    expect(source).toContain("import { normalizeMakeServerOrigin } from '../common/makeServerOrigin';");
    expect(source).toContain('let trustedPrototypeEditorParentOrigin =');
    expect(source).toContain('event.source !== window.parent');
    expect(source).toContain('normalizeMakeServerOrigin(launchOptions.makeServerOrigin)');
    expect(source).toContain('requestedParentOrigin !== event.origin');
    expect(source).toContain('trustedPrototypeEditorParentOrigin = requestedParentOrigin;');
    expect(source).toContain('isTrustedPrototypeEditorVoiceEvent(event)');
    expect(source).toContain('event.origin === trustedPrototypeEditorParentOrigin');
  });

  it('exposes phased quick edit save messages and idempotent commit handling', () => {
    const source = readFileSync(resolve(__dirname, './index.tsx'), 'utf8');

    expect(source).toContain("event.data.type === 'AXHUB_PROTOTYPE_EDITOR_PREPARE_SAVE'");
    expect(source).toContain("event.data.type === 'AXHUB_PROTOTYPE_EDITOR_PREFLIGHT_SAVE'");
    expect(source).toContain("event.data.type === 'AXHUB_PROTOTYPE_EDITOR_COMMIT_SAVE'");
    expect(source).toContain('quickEditCommitRegistry.run(requestId');
    expect(source).toContain('saveDraft');
    expect(source).toContain('savePreflight');
    expect(source).toContain('saveCommitResult');
  });
});
