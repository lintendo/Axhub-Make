import { describe, expect, it } from 'vitest';

import {
    clearCompletedCommentsImmediately,
    shouldSkipCompletedCommentAutoCleanup,
} from './completedCommentCleanup';

describe('shouldSkipCompletedCommentAutoCleanup', () => {
    it('skips cleanup when a direct-run target is marked as voice-owned', () => {
        expect(shouldSkipCompletedCommentAutoCleanup([{ preserveOnAutoClear: true }])).toBe(true);
        expect(shouldSkipCompletedCommentAutoCleanup([{ preserveOnAutoClear: false }])).toBe(false);
        expect(shouldSkipCompletedCommentAutoCleanup(undefined)).toBe(false);
    });
});

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
