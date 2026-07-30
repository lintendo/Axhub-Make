export const COMPACT_SIDEBAR_CLOSE_DELAY_MS = 120;

export interface CompactSidebarInteraction {
    pointerEnter: () => void;
    pointerLeave: () => void;
    focusEnter: () => void;
    focusLeave: () => void;
    close: () => void;
    dispose: () => void;
}

interface CompactSidebarTrigger {
    focus: () => void;
}

export function closeCompactSidebarAndRestoreFocus(
    interaction: Pick<CompactSidebarInteraction, 'close'>,
    trigger: CompactSidebarTrigger | null,
) {
    trigger?.focus();
    interaction.close();
}

export function createCompactSidebarInteraction(
    setOpen: (open: boolean) => void,
): CompactSidebarInteraction {
    let closeTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let pointerInside = false;
    let focusInside = false;

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
        }, COMPACT_SIDEBAR_CLOSE_DELAY_MS);
    };

    return {
        pointerEnter: () => {
            pointerInside = true;
            open();
        },
        pointerLeave: () => {
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
        dispose: cancelClose,
    };
}
