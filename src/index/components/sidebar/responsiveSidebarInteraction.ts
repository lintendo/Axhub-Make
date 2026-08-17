export const SIDEBAR_PREVIEW_CLOSE_DELAY_MS = 120;

export interface SidebarPreviewInteraction {
    pointerEnter: () => void;
    pointerLeave: () => void;
    focusEnter: () => void;
    focusLeave: () => void;
    close: () => void;
    suppressUntilPointerLeave: () => void;
    dispose: () => void;
}

interface SidebarPreviewTrigger {
    focus: () => void;
}

export function closeSidebarPreviewAndRestoreFocus(
    interaction: Pick<SidebarPreviewInteraction, 'close'>,
    trigger: SidebarPreviewTrigger | null,
) {
    trigger?.focus();
    interaction.close();
}

export function createSidebarPreviewInteraction(
    setOpen: (open: boolean) => void,
): SidebarPreviewInteraction {
    let closeTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let pointerInside = false;
    let focusInside = false;
    let suppressPointerUntilLeave = false;

    const cancelClose = () => {
        if (closeTimer !== null) {
            globalThis.clearTimeout(closeTimer);
            closeTimer = null;
        }
    };

    const open = () => {
        cancelClose();
        setOpen(true);
    };

    const close = () => {
        cancelClose();
        pointerInside = false;
        focusInside = false;
        setOpen(false);
    };

    const scheduleCloseIfOutside = () => {
        if (pointerInside || focusInside) return;

        cancelClose();
        closeTimer = globalThis.setTimeout(() => {
            closeTimer = null;
            setOpen(false);
        }, SIDEBAR_PREVIEW_CLOSE_DELAY_MS);
    };

    return {
        pointerEnter: () => {
            if (suppressPointerUntilLeave) return;
            pointerInside = true;
            open();
        },
        pointerLeave: () => {
            suppressPointerUntilLeave = false;
            pointerInside = false;
            scheduleCloseIfOutside();
        },
        focusEnter: () => {
            focusInside = true;
            open();
        },
        focusLeave: () => {
            focusInside = false;
            scheduleCloseIfOutside();
        },
        close,
        suppressUntilPointerLeave: () => {
            close();
            suppressPointerUntilLeave = true;
        },
        dispose: cancelClose,
    };
}
