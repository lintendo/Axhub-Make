import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('EmbedFloatingToolbar source', () => {
    it('keeps live preview active when changing size, orientation, or content scale', () => {
        const source = readFileSync(resolve(__dirname, './EmbedFloatingToolbar.tsx'), 'utf8');

        expect(source).not.toContain("deactivateActivePreviewForCanvasEdit('size-preset')");
        expect(source).not.toContain("deactivateActivePreviewForCanvasEdit('orientation')");
        expect(source).not.toContain("deactivateActivePreviewForCanvasEdit('content-scale')");
    });

    it('does not render preview session hint copy', () => {
        const source = readFileSync(resolve(__dirname, './EmbedFloatingToolbar.tsx'), 'utf8');
        expect(source).not.toContain('resolveEmbedPreviewSessionHint');
        expect(source).not.toContain('resolveEmbedPreviewExitPointerDecision');
        expect(source).not.toContain('previewSessionHint');
        expect(source).not.toContain('exitPromptRef');
        expect(source).not.toContain('已进入预览页面');
        expect(source).not.toContain('再次点击退出预览');
    });

    it('uses the shared node title label for existing preview node titles', () => {
        const source = readFileSync(resolve(__dirname, './EmbedFloatingToolbar.tsx'), 'utf8');

        expect(source).toContain('import CanvasNodeTitleLabel');
        expect(source).toContain("from './CanvasNodeTitleLabel';");
        expect(source).toContain('<CanvasNodeTitleLabel');
        expect(source).toContain('title={label.title}');
        expect(source).toContain('strokeColor={label.strokeColor}');
    });

    it('shows node title labels for annotation-backed AI task nodes without treating them as regular preview embeds', () => {
        const source = readFileSync(resolve(__dirname, './EmbedFloatingToolbar.tsx'), 'utf8');

        expect(source).toContain('getCanvasDirectRunAnnotationTaskRef');
        expect(source).toContain('const annotationTaskRef = getCanvasDirectRunAnnotationTaskRef(el);');
        expect(source).toContain("const isAnnotationTaskNode = Boolean(annotationTaskRef);");
        expect(source).toContain("const isRegularEmbedNode = el.type === 'embeddable' && Boolean(el.link);");
        expect(source).toContain('if (el.isDeleted || (!isRegularEmbedNode && !isAnnotationTaskNode)) continue;');
        expect(source).toContain("const viewMode = isAnnotationTaskNode ? 'preview' : el.customData?.embedViewMode === 'preview' ? 'preview' : 'link';");
        expect(source).toContain('if (!annotationTaskRef && isSelected && selectedIdSet.size === 1) {');
    });

    it('opens prototype preview nodes through their client preview url', () => {
        const source = readFileSync(resolve(__dirname, './EmbedFloatingToolbar.tsx'), 'utf8');
        const resolverStart = source.indexOf('function resolveEmbedOpenUrl');
        const resolverEnd = source.indexOf('function isEmbedPreviewable', resolverStart);
        const resolverSource = source.slice(resolverStart, resolverEnd);

        expect(resolverSource).toContain("el?.customData?.sourceResourceType === 'prototype'");
        expect(resolverSource).toContain('return previewUrl;');
        expect(resolverSource).toContain('return resolveString(el?.customData?.openUrl) || resolveString(el?.link);');
    });

    it('enters preview only from a double click on the selected embed', () => {
        const source = readFileSync(resolve(__dirname, './EmbedFloatingToolbar.tsx'), 'utf8');

        expect(source).toContain("addEventListener('dblclick'");
        expect(source).toContain("AXHUB_EMBED_ACTIVATE_REQUESTED_EVENT");
        expect(source).toContain("activationMode: 'activate'");
        expect(source).not.toContain('resolveEmbedClickActivationMode');
        expect(source).not.toContain('resolveSelectionActivationMode');
        expect(source).not.toContain("dispatchEmbedSelectionChanged(info.elementId, true, 'activate')");
    });

    it('renders an outside-preview mask that exits without forwarding the click', () => {
        const source = readFileSync(resolve(__dirname, './EmbedFloatingToolbar.tsx'), 'utf8');

        expect(source).toContain('handlePreviewMaskExit');
        expect(source).toContain('AXHUB_EMBED_EXIT_PREVIEW_EVENT');
        expect(source).toContain('pointerEvents: \'auto\'');
        expect(source).toContain('background: \'transparent\'');
        expect(source).toContain('activePreviewRef.current');
    });

    it('clears tooltips when switching embed view modes because the hovered button unmounts', () => {
        const source = readFileSync(resolve(__dirname, './EmbedFloatingToolbar.tsx'), 'utf8');
        const handlerStart = source.indexOf("const handleSwitchViewMode = useCallback((targetMode: 'link' | 'preview') => {");
        const handlerEnd = source.indexOf('/* ── Close size popover', handlerStart);
        const handlerSource = source.slice(handlerStart, handlerEnd);

        expect(handlerSource).toContain('clearTooltip();');
        expect(handlerSource.indexOf('clearTooltip();')).toBeLessThan(handlerSource.indexOf('excalidrawAPI.updateScene'));
    });
});
