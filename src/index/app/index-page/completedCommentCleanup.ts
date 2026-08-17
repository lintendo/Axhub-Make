export type CompletedCommentClearer = {
    clearAllEdits?: (options: {
        skipConfirm: boolean;
        scope: 'page';
        target: 'completed';
    }) => void | Promise<void>;
} | null | undefined;

export async function clearCompletedCommentsImmediately(
    editor: CompletedCommentClearer,
    enabled: boolean,
): Promise<boolean> {
    if (!enabled || typeof editor?.clearAllEdits !== 'function') {
        return false;
    }

    try {
        await editor.clearAllEdits({
            skipConfirm: true,
            scope: 'page',
            target: 'completed',
        });
        return true;
    } catch {
        return false;
    }
}
