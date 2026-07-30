import React from 'react';
import { cn } from '@/lib/utils';
import { useResponsiveSidebarController } from './ResponsiveSidebarController';

interface ResponsiveSidebarShellProps {
    collapsed: boolean;
    children: React.ReactNode;
}

export default function ResponsiveSidebarShell({
    collapsed,
    children,
}: ResponsiveSidebarShellProps) {
    const responsiveSidebar = useResponsiveSidebarController();
    const fallbackContentId = React.useId();
    const contentId = responsiveSidebar?.contentId ?? fallbackContentId;
    const compactOpen = responsiveSidebar?.compactOpen === true;

    return (
        <div
            className={cn(
                'ax-sidebar-shell',
                collapsed && 'is-collapsed',
                compactOpen && 'is-compact-open',
            )}
            data-compact-open={compactOpen ? 'true' : 'false'}
            onPointerEnter={responsiveSidebar?.compactDesktop ? responsiveSidebar?.interaction.pointerEnter : undefined}
            onPointerLeave={responsiveSidebar?.compactDesktop ? responsiveSidebar?.interaction.pointerLeave : undefined}
            onFocusCapture={responsiveSidebar?.compactDesktop ? responsiveSidebar?.interaction.focusEnter : undefined}
            onBlurCapture={(event) => {
                if (!responsiveSidebar?.compactDesktop) return;
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    responsiveSidebar?.interaction.focusLeave();
                }
            }}
            onKeyDownCapture={(event) => {
                if (event.key === 'Escape') {
                    if (!responsiveSidebar?.compactDesktop || !responsiveSidebar.compactOpen) return;
                    responsiveSidebar.closeAndRestoreFocus();
                }
            }}
        >
            <div
                id={contentId}
                className="ax-sidebar-content"
            >
                {children}
            </div>
        </div>
    );
}
