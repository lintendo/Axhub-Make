import { toast } from 'sonner';
import { MAIN_IDE_APP_NAMES, MainIDEPreference } from '../../common/ide';
import { formatLocalAppOpenFailureMessage } from '../../common/localAppOpenMessage';
import { apiService } from '../services/api';
import { requireProjectScope } from '../services/projectScope';

interface OpenConfiguredIDEOptions {
    preferredIDE: MainIDEPreference;
    projectId: string;
    targetPath?: string | null;
}

export function resolveOpenIDEErrorMessage(error: unknown, preferredIDE: MainIDEPreference, hasFollowupAction: boolean): string {
    void error;
    const ideName = preferredIDE ? MAIN_IDE_APP_NAMES[preferredIDE] : '编辑器';
    const baseMessage = formatLocalAppOpenFailureMessage(ideName);

    return hasFollowupAction ? `${baseMessage}，以继续后续操作` : baseMessage;
}

function openBrowserDeeplink(url: string): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.location.href = url;
}

export async function openConfiguredIDEBeforeAction({
    preferredIDE,
    projectId,
    targetPath,
}: OpenConfiguredIDEOptions): Promise<boolean> {
    if (!preferredIDE) {
        return false;
    }

    try {
        const result = await apiService.openIDE({
            ide: preferredIDE,
            projectId: requireProjectScope(projectId).projectId,
            targetPath: targetPath && targetPath.trim() ? targetPath.trim() : undefined,
        });
        if (result?.openInBrowser && result.url) {
            openBrowserDeeplink(result.url);
        }
        return true;
    } catch (error: any) {
        console.error('Failed to auto open IDE:', error);
        toast.warning(resolveOpenIDEErrorMessage(error, preferredIDE, Boolean(targetPath)));
        return false;
    }
}
