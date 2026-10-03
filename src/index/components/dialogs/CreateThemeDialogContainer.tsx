import type { ResourceWriteCapabilities } from '../../services/projectResources';
import CreateThemeDialog from './CreateThemeDialogView';

interface CreateThemeDialogContainerProps {
    state: {
        visible: boolean;
        activeProjectId: string;
        resourceWriteCapabilities: ResourceWriteCapabilities;
    };
    actions: {
        onClose: () => void;
        onImportSuccess?: () => void | Promise<void>;
    };
}

export default function CreateThemeDialogContainer({
    state,
    actions,
}: CreateThemeDialogContainerProps) {
    return (
        <CreateThemeDialog
            visible={state.visible}
            activeProjectId={state.activeProjectId}
            onClose={actions.onClose}
            resourceWriteCapabilities={state.resourceWriteCapabilities}
            onImportSuccess={actions.onImportSuccess}
        />
    );
}
