import React from 'react';

import {
    closeSidebarPreviewAndRestoreFocus,
    createSidebarPreviewInteraction,
    type SidebarPreviewInteraction,
} from './responsiveSidebarInteraction';

export interface ResponsiveSidebarControllerValue {
    previewOpen: boolean;
    contentId: string;
    triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
    interaction: SidebarPreviewInteraction;
    closeAndRestoreFocus: () => void;
}

interface ResponsiveSidebarTriggerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    ref?: React.MutableRefObject<HTMLButtonElement | null>;
}

export interface ResponsiveSidebarTriggerBindings {
    buttonProps: ResponsiveSidebarTriggerButtonProps;
}

const ResponsiveSidebarContext = React.createContext<ResponsiveSidebarControllerValue | null>(null);

export function ResponsiveSidebarProvider({ children }: { children: React.ReactNode }) {
    const [previewOpen, setPreviewOpen] = React.useState(false);
    const contentId = React.useId();
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const interaction = React.useMemo(
        () => createSidebarPreviewInteraction(setPreviewOpen),
        [],
    );

    React.useEffect(() => () => interaction.dispose(), [interaction]);

    const closeAndRestoreFocus = React.useCallback(() => {
        closeSidebarPreviewAndRestoreFocus(interaction, triggerRef.current);
    }, [interaction]);

    const value = React.useMemo<ResponsiveSidebarControllerValue>(() => ({
        previewOpen,
        contentId,
        triggerRef,
        interaction,
        closeAndRestoreFocus,
    }), [closeAndRestoreFocus, contentId, interaction, previewOpen]);

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
    const previewOpen = responsiveSidebar?.previewOpen === true;

    return {
        buttonProps: {
            ref: responsiveSidebar?.triggerRef,
            onPointerEnter: collapsed ? responsiveSidebar?.interaction.pointerEnter : undefined,
            onPointerLeave: collapsed ? responsiveSidebar?.interaction.pointerLeave : undefined,
            onFocus: collapsed ? responsiveSidebar?.interaction.focusEnter : undefined,
            onBlur: collapsed ? responsiveSidebar?.interaction.focusLeave : undefined,
            onKeyDown: (event) => {
                if (event.key === 'Escape' && collapsed) {
                    responsiveSidebar?.closeAndRestoreFocus();
                }
            },
            onClick: () => {
                responsiveSidebar?.interaction.suppressUntilPointerLeave();
                toggle();
            },
            'aria-label': collapsed ? '展开侧边栏' : '收起侧边栏',
            'aria-controls': collapsed ? responsiveSidebar?.contentId : undefined,
            'aria-expanded': collapsed ? previewOpen : undefined,
        },
    };
}
