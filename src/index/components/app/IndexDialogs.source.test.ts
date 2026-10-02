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

    it('hosts LAN publishing through a dedicated dialog', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain("const LocalPublishDialog = React.lazy(() => import('../dialogs/LocalPublishDialog'));");
        expect(source).toContain('localPublishDialog: {');
        expect(source).toContain('{localPublishDialog.open ? (');
        expect(source).toContain('<LocalPublishDialog');
        expect(source).toContain('mode={localPublishDialog.mode}');
        expect(source).toContain('previewUrl={localPublishDialog.previewUrl}');
        expect(source).toContain('onOpenChange={localPublishDialog.onOpenChange}');
        expect(source).not.toContain('onOpenNetworkSettings={localPublishDialog.onOpenNetworkSettings}');
    });

    it('passes saved cloud publishing config back to the page state', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain('AxhubPublishResponse,');
        expect(source).toContain('CloudPublishingConfigResponse,');
        expect(source).toContain('onSaved?: (config: CloudPublishingConfigResponse) => void;');
        expect(source).toContain('onSaved={cloudPublishSettingsDialog.onSaved}');
    });

    it('hosts remote repository settings through a focused lazy dialog', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain("const RemoteRepositorySettingsDialog = React.lazy(() => import('../RemoteRepositorySettingsDialog'));");
        expect(source).toContain('remoteRepositorySettingsOpen: boolean;');
        expect(source).toContain('setRemoteRepositorySettingsOpen: (open: boolean) => void;');
        expect(source).toContain('{remoteRepositorySettingsOpen ? (');
        expect(source).toContain('<RemoteRepositorySettingsDialog');
        expect(source).toContain('open={remoteRepositorySettingsOpen}');
        expect(source).toContain('onOpenChange={setRemoteRepositorySettingsOpen}');
    });

    it('hosts AI and network settings as separate drawers', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain('networkSettingsDialogOpen: boolean;');
        expect(source).toContain('setNetworkSettingsDialogOpen: (open: boolean) => void;');
        expect(source).toContain('{networkSettingsDialogOpen ? (');
        expect(source).toContain('standalone="network"');
        expect(source).not.toContain('WorkspaceVersionCollaborationDrawer');
    });

    it('keeps the prototype manager lazy entry separate from the project collaboration drawer', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain("const VersionManager = React.lazy(() => import('../VersionManager'));");
        expect(source).toContain('<VersionManager');
        expect(source).toContain('item={currentVersionItem}');
        expect(source).toContain('onOpenRemoteRepositorySettings={() => setRemoteRepositorySettingsOpen(true)}');
    });

    it('passes make client update reminder and availability changes back to the page', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain('makeClientUpdateReminderVisible: boolean;');
        expect(source).toContain('onMakeClientUpdateReminderSeen: () => void;');
        expect(source).toContain('onMakeClientUpdateAvailabilityChange: (status: MakeClientUpdateStatus | null) => void;');
        expect(source).not.toContain('onOpenVersionCollaborationFromSettings');
        expect(source).toContain('makeClientUpdateReminderVisible,');
        expect(source).toContain('onMakeClientUpdateReminderSeen,');
        expect(source).toContain('remoteRepositorySettingsOpen,');
        expect(source).toContain('makeClientUpdateReminderVisible={makeClientUpdateReminderVisible}');
        expect(source).toContain('onMakeClientUpdateReminderSeen={onMakeClientUpdateReminderSeen}');
        expect(source).not.toContain('onOpenVersionCollaboration=');
        expect(source).toContain('onMakeClientUpdateAvailabilityChange,');
        expect(source).toContain('onMakeClientUpdateAvailabilityChange={onMakeClientUpdateAvailabilityChange}');
    });

    it('forwards the requested voice settings section into the existing settings dialog', () => {
        const source = readIndexDialogsSource();

        expect(source).toContain('initialVoiceSection={settingsDialogAIContext?.voiceSection}');
    });
});
