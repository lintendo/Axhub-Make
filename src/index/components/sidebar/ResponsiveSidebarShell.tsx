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
    const previewOpen = responsiveSidebar?.previewOpen === true;

    return (
        <div
            className={cn(
                'ax-sidebar-shell',
                collapsed && 'is-collapsed',
                collapsed && previewOpen && 'is-preview-open',
            )}
            data-preview-open={collapsed && previewOpen ? 'true' : 'false'}
            onPointerEnter={collapsed ? responsiveSidebar?.interaction.pointerEnter : undefined}
            onPointerLeave={collapsed ? responsiveSidebar?.interaction.pointerLeave : undefined}
            onFocusCapture={collapsed ? responsiveSidebar?.interaction.focusEnter : undefined}
            onBlurCapture={(event) => {
                if (!collapsed) return;
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    responsiveSidebar?.interaction.focusLeave();
                }
            }}
            onKeyDownCapture={(event) => {
                if (event.key === 'Escape') {
                    if (!collapsed || !previewOpen || !responsiveSidebar) return;
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
