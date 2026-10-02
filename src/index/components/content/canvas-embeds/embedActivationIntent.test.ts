import { describe, expect, it } from 'vitest';

import {
    resolveEmbedClickActivationMode,
    shouldActivateEmbedOverlayClick,
} from './embedActivationIntent';

describe('embed activation intent', () => {
    it('keeps the first selection select-only even after pointer release', () => {
        expect(resolveEmbedClickActivationMode({
            currentSelectedId: 'embed-1',
            previousSelectedId: null,
            pointerIntent: {
                selectedEmbedIdAtPointerDown: null,
                released: true,
                moved: false,
                activationRequested: false,
            },
        })).toBe('select-only');
    });

    it('activates only when a click starts on the already-selected embed and does not drag', () => {
        expect(resolveEmbedClickActivationMode({
            currentSelectedId: 'embed-1',
            previousSelectedId: 'embed-1',
            pointerIntent: {
                selectedEmbedIdAtPointerDown: 'embed-1',
                released: true,
                moved: false,
                activationRequested: true,
            },
        })).toBe('activate');

        expect(resolveEmbedClickActivationMode({
            currentSelectedId: 'embed-1',
            previousSelectedId: 'embed-1',
            pointerIntent: {
                selectedEmbedIdAtPointerDown: 'embed-1',
                released: true,
                moved: true,
                activationRequested: true,
            },
        })).toBe('select-only');
    });

    it('does not activate a selected embed after an ordinary single click', () => {
        expect(resolveEmbedClickActivationMode({
            currentSelectedId: 'embed-1',
            previousSelectedId: 'embed-1',
            pointerIntent: {
                selectedEmbedIdAtPointerDown: 'embed-1',
                released: true,
                moved: false,
                activationRequested: false,
            },
        })).toBe('select-only');
    });

    it('does not activate without a completed pointer click', () => {
        expect(resolveEmbedClickActivationMode({
            currentSelectedId: 'embed-1',
            previousSelectedId: 'embed-1',
            pointerIntent: {
                selectedEmbedIdAtPointerDown: 'embed-1',
                released: false,
                moved: false,
                activationRequested: true,
            },
        })).toBe('select-only');

        expect(resolveEmbedClickActivationMode({
            currentSelectedId: 'embed-1',
            previousSelectedId: 'embed-1',
            pointerIntent: null,
        })).toBe('select-only');
    });

    it('lets the embed overlay activate only if the pointer started on an already-selected embed', () => {
        expect(shouldActivateEmbedOverlayClick({
            selectedAtPointerDown: false,
            moved: false,
            cancelled: false,
        })).toBe(false);

        expect(shouldActivateEmbedOverlayClick({
            selectedAtPointerDown: true,
            moved: false,
            cancelled: false,
        })).toBe(true);

        expect(shouldActivateEmbedOverlayClick({
            selectedAtPointerDown: true,
            moved: true,
            cancelled: false,
        })).toBe(false);
    });

});
