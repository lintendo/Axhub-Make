import React from 'react';

import IndexDialogs from './IndexDialogs';
import IndexPageDesktop from './IndexPageDesktop';
import MobileIndexLayout from './MobileIndexLayout';
import type {
    NewSidebarGroupedProps,
    PresentationAreaGroupedProps,
} from '../../types/index-page.types';

interface IndexPageLayoutProps {
    sidebarProps: NewSidebarGroupedProps;
    presentationAreaProps: PresentationAreaGroupedProps;
    assistantPanelProps: React.ComponentProps<typeof IndexPageDesktop>['assistantPanel'];
    responsiveSidebarProps: React.ComponentProps<typeof IndexPageDesktop>['responsiveSidebar'];
    dialogsProps: React.ComponentProps<typeof IndexDialogs>;
    mobileProps: React.ComponentProps<typeof MobileIndexLayout>;
}

export default function IndexPageLayout({
    sidebarProps,
    presentationAreaProps,
    assistantPanelProps,
    responsiveSidebarProps,
    dialogsProps,
    mobileProps,
}: IndexPageLayoutProps) {
    return (
        <div
            style={{
                overflowX: 'hidden',
                minHeight: '100vh',
                ['--mobile-item-bg' as any]: 'hsl(var(--card))',
                ['--mobile-item-border' as any]: 'var(--axhub-border-color)',
                ['--mobile-item-hover-border' as any]: 'var(--axhub-ring-color)',
                ['--mobile-item-hover-shadow' as any]: 'var(--shadow-sm)',
                ['--mobile-item-title-color' as any]: 'hsl(var(--foreground))',
                ['--mobile-item-name-color' as any]: 'hsl(var(--muted-foreground))',
            }}
        >
            <IndexPageDesktop
                sidebarProps={sidebarProps}
                presentationAreaProps={presentationAreaProps}
                assistantPanel={assistantPanelProps}
                responsiveSidebar={responsiveSidebarProps}
            />

            <IndexDialogs {...dialogsProps} />

            <MobileIndexLayout {...mobileProps} />
        </div>
    );
}
