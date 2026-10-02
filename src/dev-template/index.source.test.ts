import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('published annotation toolbar integration', () => {
    it('starts the built-in compact toolbar only for published annotation routes', () => {
        const source = readFileSync(resolve(__dirname, './index.tsx'), 'utf8');
        expect(source).toContain("params.get('annotationSession') === '1' && Boolean(params.get('publishedShareId'))");
        expect(source).not.toContain('PublishedAnnotationToolbar');
        expect(source).not.toContain('axhub-published-annotation-toolbar-root');
        expect(source).toContain("editorModeManager?.api.enable('webEditorV2'");
        expect(source).toContain("toolbarMode: 'inline'");
        expect(source).toContain("interactionProfile: 'annotation'");
        expect(source).toContain('annotationProjectId');
        const managerInitIndex = source.indexOf('editorModeManager = createEditorModeManager();');
        expect(managerInitIndex).toBeGreaterThanOrEqual(0);
        expect(source.indexOf('mountPublishedAnnotationRuntime();', managerInitIndex)).toBeGreaterThan(managerInitIndex);
        expect(source).toContain('window.setTimeout(mount, 0)');
    });

    it('keeps the published route free of the retired inline toolbar component', () => {
        const source = readFileSync(resolve(__dirname, './webEditorV2Integration.ts'), 'utf8');
        expect(source).not.toContain('PublishedAnnotationToolbarExtras');
        expect(source).not.toContain('toolbarExtraContent');
        expect(source).toContain('publishedAnnotationSession');
    });
});
