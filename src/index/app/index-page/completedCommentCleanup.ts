export type CompletedCommentClearer = {
    clearAllEdits?: (options: {
        skipConfirm: boolean;
        scope: 'page';
        target: 'completed';
    }) => void | Promise<void>;
} | null | undefined;

export type CompletedCommentAutoClearTarget = {
    preserveOnAutoClear?: boolean;
} | null | undefined;

export function shouldSkipCompletedCommentAutoCleanup(
    targets: readonly CompletedCommentAutoClearTarget[] | null | undefined,
): boolean {
    return targets?.some((target) => target?.preserveOnAutoClear === true) === true;
}

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
