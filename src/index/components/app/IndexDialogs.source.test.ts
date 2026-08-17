import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readIndexDialogsSource() {
    return readFileSync(resolve(__dirname, './IndexDialogs.tsx'), 'utf8');
}

describe('IndexDialogs source', () => {
    it('loads the create dialogs through the main React graph', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain("import CreateDialogContainer from '../dialogs/CreateDialogContainer';");
        expect(source).toContain("import CreateThemeDialogContainer from '../dialogs/CreateThemeDialogContainer';");
        expect(source).not.toContain("React.lazy(() => import('../dialogs/CreateDialogContainer'))");
        expect(source).not.toContain("React.lazy(() => import('../dialogs/CreateThemeDialogContainer'))");
    });

    it('forwards direct import target options into the create dialog container', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain('activeProjectId: createDialog.activeProjectId');
        expect(source).toContain('initialUploadType: createDialog.initialUploadType');
        expect(source).toContain('targetPrototypeName: createDialog.targetPrototypeName');
    });

    it('hosts the Axhub publish dialog through a dedicated lazy dialog', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain("const AxhubPublishDialog = React.lazy(() => import('../dialogs/AxhubPublishDialog'));");
        expect(source).toContain('axhubPublishDialog: {');
        expect(source).toContain('onPublished?: (result: AxhubPublishResponse) => void;');
        expect(source).toContain('{axhubPublishDialog.open ? (');
        expect(source).toContain('<AxhubPublishDialog');
        expect(source).toContain('targetPath={axhubPublishDialog.targetPath}');
        expect(source).toContain('projectId={axhubPublishDialog.projectId}');
        expect(source).toContain('onPublished={axhubPublishDialog.onPublished}');
    });

    it('passes saved cloud publishing config back to the page state', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain("import type { AxhubPublishResponse, CloudPublishingConfigResponse, MakeClientUpdateStatus, ReviewResult }");
        expect(source).toContain('onSaved?: (config: CloudPublishingConfigResponse) => void;');
        expect(source).toContain('onSaved={cloudPublishSettingsDialog.onSaved}');
    });

    it('hosts workspace version collaboration through a dedicated lazy drawer', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain("const WorkspaceVersionCollaborationDrawer = React.lazy(() => import('../WorkspaceVersionCollaborationDrawer'));");
        expect(source).toContain('versionCollaborationDrawerOpen: boolean;');
        expect(source).toContain('setVersionCollaborationDrawerOpen: (open: boolean) => void;');
        expect(source).toContain('{versionCollaborationDrawerOpen ? (');
        expect(source).toContain('<WorkspaceVersionCollaborationDrawer');
        expect(source).toContain('open={versionCollaborationDrawerOpen}');
        expect(source).toContain('onOpenChange={setVersionCollaborationDrawerOpen}');
    });

    it('passes make client update reminder and availability changes back to the page', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain('makeClientUpdateReminderVisible: boolean;');
        expect(source).toContain('onMakeClientUpdateReminderSeen: () => void;');
        expect(source).toContain('onMakeClientUpdateAvailabilityChange: (status: MakeClientUpdateStatus | null) => void;');
        expect(source).toContain('onOpenVersionCollaborationFromSettings: () => void;');
        expect(source).toContain('makeClientUpdateReminderVisible,');
        expect(source).toContain('onMakeClientUpdateReminderSeen,');
        expect(source).toContain('onOpenVersionCollaborationFromSettings,');
        expect(source).toContain('makeClientUpdateReminderVisible={makeClientUpdateReminderVisible}');
        expect(source).toContain('onMakeClientUpdateReminderSeen={onMakeClientUpdateReminderSeen}');
        expect(source).toContain('onOpenVersionCollaboration={onOpenVersionCollaborationFromSettings}');
        expect(source).toContain('onMakeClientUpdateAvailabilityChange,');
        expect(source).toContain('onMakeClientUpdateAvailabilityChange={onMakeClientUpdateAvailabilityChange}');
    });

    it('forwards the requested voice settings section into the existing settings dialog', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain('initialVoiceSection={settingsDialogAIContext?.voiceSection}');
    });
});
