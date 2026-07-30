import React from 'react';

import {
    closeCompactSidebarAndRestoreFocus,
    createCompactSidebarInteraction,
    type CompactSidebarInteraction,
} from './responsiveSidebarInteraction';

export const COMPACT_DESKTOP_SIDEBAR_MEDIA_QUERY = '(max-width: 1024px) and (hover: hover) and (pointer: fine)';

export interface ResponsiveSidebarControllerValue {
    compactDesktop: boolean;
    compactOpen: boolean;
    contentId: string;
    triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
    interaction: CompactSidebarInteraction;
    closeAndRestoreFocus: () => void;
}

interface ResponsiveSidebarTriggerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    ref?: React.MutableRefObject<HTMLButtonElement | null>;
}

export interface ResponsiveSidebarTriggerBindings {
    compactDesktop: boolean;
    buttonProps: ResponsiveSidebarTriggerButtonProps;
}

const ResponsiveSidebarContext = React.createContext<ResponsiveSidebarControllerValue | null>(null);

export function handleResponsiveSidebarToggleClick(
    compactDesktop: boolean,
    toggle: () => void,
) {
    if (compactDesktop) return false;
    toggle();
    return true;
}

export function ResponsiveSidebarProvider({ children }: { children: React.ReactNode }) {
    const [compactDesktop, setCompactDesktop] = React.useState(false);
    const [compactOpen, setCompactOpen] = React.useState(false);
    const contentId = React.useId();
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const interaction = React.useMemo(
        () => createCompactSidebarInteraction(setCompactOpen),
        [],
    );

    React.useEffect(() => () => interaction.dispose(), [interaction]);

    React.useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }

        const mediaQuery = window.matchMedia(COMPACT_DESKTOP_SIDEBAR_MEDIA_QUERY);
        const syncCompactDesktop = (event?: MediaQueryListEvent) => {
            const nextCompactDesktop = event?.matches ?? mediaQuery.matches;
            setCompactDesktop(nextCompactDesktop);
            if (!nextCompactDesktop) {
                interaction.close();
            }
        };

        syncCompactDesktop();
        mediaQuery.addEventListener('change', syncCompactDesktop);
        return () => mediaQuery.removeEventListener('change', syncCompactDesktop);
    }, [interaction]);

    const closeAndRestoreFocus = React.useCallback(() => {
        closeCompactSidebarAndRestoreFocus(interaction, triggerRef.current);
    }, [interaction]);

    const value = React.useMemo<ResponsiveSidebarControllerValue>(() => ({
        compactDesktop,
        compactOpen,
        contentId,
        triggerRef,
        interaction,
        closeAndRestoreFocus,
    }), [closeAndRestoreFocus, compactDesktop, compactOpen, contentId, interaction]);

    return (
        <ResponsiveSidebarContext.Provider value={value}>
            {children}
        </ResponsiveSidebarContext.Provider>
    );
}

export function useResponsiveSidebarController() {
    return React.useContext(ResponsiveSidebarContext);
}

export function useResponsiveSidebarTriggerBindings(
    collapsed: boolean,
    toggle: () => void,
): ResponsiveSidebarTriggerBindings {
    const responsiveSidebar = useResponsiveSidebarController();
    const compactDesktop = responsiveSidebar?.compactDesktop === true;

    return {
        compactDesktop,
        buttonProps: {
            ref: responsiveSidebar?.triggerRef,
            onPointerEnter: compactDesktop ? responsiveSidebar?.interaction.pointerEnter : undefined,
            onPointerLeave: compactDesktop ? responsiveSidebar?.interaction.pointerLeave : undefined,
            onPointerDown: (event) => {
                if (compactDesktop) {
                    event.preventDefault();
                }
            },
            onFocus: compactDesktop ? responsiveSidebar?.interaction.focusEnter : undefined,
            onBlur: compactDesktop ? responsiveSidebar?.interaction.focusLeave : undefined,
            onKeyDown: (event) => {
                if (event.key === 'Escape' && compactDesktop) {
                    responsiveSidebar?.interaction.close();
                }
            },
            onClick: () => handleResponsiveSidebarToggleClick(compactDesktop, toggle),
            'aria-label': compactDesktop
                ? '预览侧边栏'
                : collapsed ? '展开侧边栏' : '收起侧边栏',
            'aria-controls': compactDesktop ? responsiveSidebar?.contentId : undefined,
            'aria-expanded': compactDesktop ? responsiveSidebar?.compactOpen : undefined,
        },
    };
}
