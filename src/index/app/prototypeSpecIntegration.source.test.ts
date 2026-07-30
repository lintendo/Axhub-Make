import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf8');
}

describe('prototype spec workspace integration', () => {
  it('adds the prototype spec entry between open and annotation actions', () => {
    const source = readSource('../components/content/PresentationToolbar.tsx');
    const previewActions = source.slice(
      source.indexOf('const previewActionButtons = ('),
      source.indexOf('const actionButtons ='),
    );

    expect(source).toContain('handleOpenPrototypeSpec: () => void | Promise<void>;');
    expect(source).toContain('prototypeSpecSupported?: boolean;');
    expect(previewActions).toContain('<FileText /> 规格');
    expect(previewActions.indexOf('<FileText /> 规格')).toBeGreaterThan(previewActions.indexOf('<Code2 /> 打开'));
    expect(previewActions.indexOf('<FileText /> 规格')).toBeLessThan(previewActions.indexOf('<PencilRuler /> 批注'));
  });

  it('enters prototype spec annotation directly and exits through the existing annotation action', () => {
    const source = readSource('../components/content/PresentationToolbar.tsx');
    const indexSource = readSource('./IndexPage.tsx');
    const previewReadyHandler = indexSource.slice(
      indexSource.indexOf('const handlePrototypeSpecPreviewReady'),
      indexSource.indexOf('useEffect(() => {', indexSource.indexOf('const handlePrototypeSpecPreviewReady')),
    );

    expect(source).toContain("contentMode === 'prototype-spec'");
    expect(source).toContain('selectedPrototypeSpec?: ItemData | null;');
    expect(source).not.toContain('prototypeSpecCanGoBack');
    expect(source).not.toContain('handleBackPrototypeSpec');
    expect(source).not.toContain('handleReturnPrototypeSpecMain');
    expect(source).not.toContain('<FileText /> 主规格');
    expect(indexSource).toContain('handlePrototypeSpecPreviewReady');
    expect(indexSource).toContain("preview.handleEnableDocEdit('comment', { disableSelectionMode: true, preserveSidebar: true })");
    expect(previewReadyHandler).toContain(".endsWith('.md')) return;");
    expect(indexSource).toContain('const prototypeSpecAnnotationAttemptIdRef = useRef(0);');
    expect(indexSource).toContain('currentPrototypeSpecItemRef.current = prototypeSpec.currentItem;');
    expect(previewReadyHandler).toContain('const annotationEnabled = await preview.handleEnableDocEdit');
    expect(previewReadyHandler).toContain('shouldClosePrototypeSpecAfterAnnotationAttempt({');
    expect(previewReadyHandler).toContain('prototypeSpec.close();');
    expect(previewReadyHandler).not.toContain('prototypeSpecAnnotationActiveRef.current = true;');
    expect(indexSource).toContain('onPrototypeSpecExit: prototypeSpec.close');
    expect(indexSource).not.toContain('prototypeSpecAnnotationActiveRef');
  });

  it('keeps the selected prototype while the central content uses prototype-spec mode', () => {
    const indexSource = readSource('./IndexPage.tsx');
    const contentSource = readSource('../components/content/ContentAreaView.tsx');
    const presentationSource = readSource('../components/content/PresentationArea.tsx');

    expect(indexSource).toContain('usePrototypeSpecController');
    expect(indexSource).toContain("prototypeSpec.isOpen ? 'prototype-spec' : baseContentMode");
    expect(contentSource).toContain("contentMode === 'prototype-spec'");
    expect(contentSource).toContain('selectedPrototypeSpec');
    expect(presentationSource).toContain('selectedPrototypeSpec={props.selectedPrototypeSpec}');
  });

  it('uses the shared prompt action for a missing spec without rendering creation controls', () => {
    const dialogSource = readSource('../components/app/IndexDialogs.tsx');
    const presentationSource = readSource('../components/content/PresentationArea.tsx');
    const controllerSource = readSource('./hooks/usePrototypeSpecController.ts');

    expect(dialogSource).toContain('prototypeSpecPromptDialog');
    expect(dialogSource).toContain('<PromptActionButton');
    expect(dialogSource).toContain("scene=\"prototype-spec-create\"");
    expect(presentationSource).not.toContain('CreatePrototypeSpecDialog');
    expect(controllerSource).not.toContain('prototypeSpecsApi.create');
    expect(controllerSource).not.toContain('CreatePrototypeSpecRequest');
  });

  it('surfaces prototype spec read failures through the existing message API', () => {
    const indexSource = readSource('./IndexPage.tsx');
    const controllerSource = readSource('./hooks/usePrototypeSpecController.ts');

    expect(indexSource).toContain('onError: messageApi.error');
    expect(controllerSource).toContain('onError?.(message);');
  });

  it('guards automatic split-spec navigation with current-page commentary state', () => {
    const indexSource = readSource('./IndexPage.tsx');
    const controllerSource = readSource('./hooks/usePrototypeSpecController.ts');
    const documentNavigationSource = readSource('./hooks/useDocumentResourceNavigation.ts');
    const guardSource = readSource('./hooks/usePrototypeSpecNavigationGuard.ts');

    expect(indexSource).toContain('useDocumentResourceNavigation({');
    expect(documentNavigationSource).toContain("event.data?.type !== 'axhub-document-resource:navigate'");
    expect(documentNavigationSource).toContain('event.source !== sourceWindow');
    expect(indexSource).toContain('usePrototypeSpecNavigationGuard({');
    expect(indexSource).toContain('modifiedCount: preview.hostToolbarState?.modifiedCount ?? 0');
    expect(indexSource).toContain("type: 'clear-edits'");
    expect(indexSource).toContain("scope: 'page'");
    expect(indexSource).toContain('skipConfirm: true');
    expect(controllerSource).not.toContain("event.data?.type !== 'axhub-prototype-spec:navigate'");
    expect(guardSource).toContain("event.data?.type !== 'axhub-prototype-spec:navigate'");
    expect(guardSource).toContain('event.source !== sourceWindow');
  });

  it('mounts the three-action navigation dialog from the guard state', () => {
    const indexSource = readSource('./IndexPage.tsx');
    const dialogSource = readSource('../components/app/IndexDialogs.tsx');

    expect(indexSource).toContain('prototypeSpecNavigationDialog: prototypeSpecNavigation.pendingTargetPath ? {');
    expect(indexSource).toContain('annotationCount: preview.hostToolbarState?.modifiedCount ?? 0');
    expect(indexSource).toContain('onContinue: prototypeSpecNavigation.continueNavigation');
    expect(indexSource).toContain('onClearAndContinue: prototypeSpecNavigation.clearAndContinue');
    expect(indexSource).toContain('onCancel: prototypeSpecNavigation.cancelNavigation');
    expect(dialogSource).toContain('prototypeSpecNavigationDialog: PrototypeSpecNavigationDialogProps | null;');
    expect(dialogSource).toContain('<PrototypeSpecNavigationDialog {...prototypeSpecNavigationDialog} />');
  });
});
