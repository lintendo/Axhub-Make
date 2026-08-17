import { describe, expect, it } from 'vitest';

import { clearCompletedCommentsImmediately } from './completedCommentCleanup';

describe('clearCompletedCommentsImmediately', () => {
    it('removes completed comments immediately when the setting is enabled', async () => {
        const calls: unknown[] = [];
        const editor = {
            clearAllEdits: async (options: unknown) => {
                calls.push(options);
            },
        };

        await expect(clearCompletedCommentsImmediately(editor, true)).resolves.toBe(true);

        expect(calls).toEqual([{
            skipConfirm: true,
            scope: 'page',
            target: 'completed',
        }]);
    });

    it('leaves completed comments untouched when the setting is disabled', async () => {
        let callCount = 0;
        const clearAllEdits = async () => {
            callCount += 1;
        };
        const editor = { clearAllEdits };

        await expect(clearCompletedCommentsImmediately(editor, false)).resolves.toBe(false);
        expect(callCount).toBe(0);
    });
});
