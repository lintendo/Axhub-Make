export type EmbedSelectionActivationMode = 'activate' | 'select-only';

export interface EmbedPointerIntentSnapshot {
    selectedEmbedIdAtPointerDown: string | null;
    moved: boolean;
    released: boolean;
    activationRequested: boolean;
}

export function resolveEmbedClickActivationMode(options: {
    currentSelectedId: string | null;
    previousSelectedId: string | null;
    pointerIntent: EmbedPointerIntentSnapshot | null | undefined;
}): EmbedSelectionActivationMode {
    if (
        options.currentSelectedId
        && options.currentSelectedId === options.previousSelectedId
        && options.pointerIntent?.released
        && !options.pointerIntent.moved
        && options.pointerIntent.activationRequested
        && options.pointerIntent.selectedEmbedIdAtPointerDown === options.currentSelectedId
    ) {
        return 'activate';
    }

    return 'select-only';
}

export function shouldActivateEmbedOverlayClick(options: {
    selectedAtPointerDown: boolean;
    moved: boolean;
    cancelled: boolean;
}): boolean {
    return options.selectedAtPointerDown && !options.moved && !options.cancelled;
}
