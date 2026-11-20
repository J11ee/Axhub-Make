import React from 'react';
import { cn } from '@/lib/utils';
import { useResponsiveSidebarController } from './ResponsiveSidebarController';
import { SIDEBAR_WIDTH_PX } from './responsiveSidebarState';

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const KEYBOARD_STEP = 16;

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
    const [width, setWidth] = React.useState(SIDEBAR_WIDTH_PX);
    const dragStart = React.useRef({ x: 0, width: 0 });

    const resize = (nextWidth: number) => {
        setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, nextWidth)));
    };

    return (
        <div
            className={cn(
                'ax-sidebar-shell',
                collapsed && 'is-collapsed',
                collapsed && previewOpen && 'is-preview-open',
            )}
            style={{ '--ax-sidebar-width': `${width}px` } as React.CSSProperties}
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
            {!collapsed && (
                <div
                    className="ax-sidebar-resize-handle"
                    role="separator"
                    tabIndex={0}
                    aria-label="调整侧边栏宽度"
                    aria-orientation="vertical"
                    aria-controls={contentId}
                    aria-valuemin={MIN_WIDTH}
                    aria-valuemax={MAX_WIDTH}
                    aria-valuenow={width}
                    onPointerDown={(event) => {
                        if (!event.isPrimary || event.button !== 0) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        dragStart.current = { x: event.clientX, width };
                    }}
                    onPointerMove={(event) => {
                        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                        resize(dragStart.current.width + event.clientX - dragStart.current.x);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowLeft') resize(width - KEYBOARD_STEP);
                        else if (event.key === 'ArrowRight') resize(width + KEYBOARD_STEP);
                        else if (event.key === 'Home') resize(MIN_WIDTH);
                        else if (event.key === 'End') resize(MAX_WIDTH);
                        else return;
                        event.preventDefault();
                    }}
                />
            )}
        </div>
    );
}
