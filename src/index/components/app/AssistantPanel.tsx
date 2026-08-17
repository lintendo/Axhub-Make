import React from 'react';
import { Resizable } from 're-resizable';
import { X } from 'lucide-react';
import type { AcpContextItem } from '../../domains/assistant/assistantAcpContext';
import { ASSISTANT_CONTEXT_DRAG_MIME, parseAssistantContextDragPayload } from '../../domains/assistant/assistantContextDrag';

export interface AssistantIframeRenderEntry {
    key: string;
    src: string;
}

interface AssistantPanelProps {
    mounted: boolean;
    visible: boolean;
    width: number;
    minWidth: number;
    maxWidth: number;
    iframeEntries: AssistantIframeRenderEntry[];
    activeIframeKey: string | null;
    onIframeRef: (key: string, iframe: HTMLIFrameElement | null) => void;
    onIframeLoad: (key: string) => void;
    onResize: (nextWidth: number) => void;
    onAddContextItems: (items: AcpContextItem[]) => boolean | Promise<boolean>;
    onToggle: () => void;
}

function hasAssistantContextDragType(dataTransfer: DataTransfer | null): boolean {
    return Array.from(dataTransfer?.types || []).includes(ASSISTANT_CONTEXT_DRAG_MIME);
}

export default function AssistantPanel({
    mounted,
    visible,
    width,
    minWidth,
    maxWidth,
    iframeEntries,
    activeIframeKey,
    onIframeRef,
    onIframeLoad,
    onResize,
    onAddContextItems,
    onToggle,
}: AssistantPanelProps) {
    const [assistantContextDragging, setAssistantContextDragging] = React.useState(false);
    const dragDepthRef = React.useRef(0);
    const groupHoverStyleTag = (
        <style>
            {`
                .axhub-assistant-panel__hover-close {
                    opacity: 0;
                    transform: translate(-50%, -2px);
                    pointer-events: none;
                    transition: opacity 120ms ease, transform 120ms ease, background 120ms ease, color 120ms ease;
                }
                .axhub-assistant-panel:hover .axhub-assistant-panel__hover-close,
                .axhub-assistant-panel__hover-close:focus-visible {
                    opacity: 1;
                    transform: translate(-50%, 0);
                    pointer-events: auto;
                }
            `}
        </style>
    );

    const handleAssistantContextDragEnter = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
        if (!hasAssistantContextDragType(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current += 1;
        setAssistantContextDragging(true);
    }, []);

    const handleAssistantContextDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
        if (!hasAssistantContextDragType(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        setAssistantContextDragging(true);
    }, []);

    const handleAssistantContextDragLeave = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
        if (!hasAssistantContextDragType(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
            setAssistantContextDragging(false);
        }
    }, []);

    const handleAssistantContextDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
        if (!hasAssistantContextDragType(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current = 0;
        setAssistantContextDragging(false);
        const payload = parseAssistantContextDragPayload(event.dataTransfer.getData(ASSISTANT_CONTEXT_DRAG_MIME));
        if (payload?.items.length) {
            void Promise.resolve(onAddContextItems(payload.items));
        }
    }, [onAddContextItems]);

    if (!mounted) {
        return null;
    }

    return (
        <Resizable
            className="axhub-assistant-panel"
            size={{ width: Math.min(Math.max(width, minWidth), maxWidth), height: '100%' }}
            minWidth={minWidth}
            maxWidth={maxWidth}
            enable={{
                left: true,
                right: false,
                top: false,
                bottom: false,
                topLeft: false,
                topRight: false,
                bottomLeft: false,
                bottomRight: false,
            }}
            onResize={(_event, _direction, ref) => {
                const nextWidth = Math.min(
                    Math.max(ref.getBoundingClientRect().width, minWidth),
                    maxWidth,
                );
                onResize(nextWidth);
            }}
            style={{
                borderLeft: '1px solid var(--axhub-border-strong-color)',
                background: 'hsl(var(--card))',
                display: visible ? 'flex' : 'none',
                height: '100vh',
                minHeight: 0,
                position: 'relative',
            }}
        >
            {groupHoverStyleTag}
            <div
                onDragEnter={handleAssistantContextDragEnter}
                onDragOver={handleAssistantContextDragOver}
                onDragLeave={handleAssistantContextDragLeave}
                onDrop={handleAssistantContextDrop}
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    height: '100%',
                    minHeight: 0,
                }}
            >
                <button
                    type="button"
                    className="axhub-assistant-panel__hover-close"
                    onClick={onToggle}
                    aria-label="关闭 AI 助手"
                    title="关闭 AI 助手"
                    style={{
                        position: 'absolute',
                        top: 96,
                        left: 0,
                        zIndex: 12,
                        width: 24,
                        height: 24,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(148, 163, 184, 0.34)',
                        borderRadius: 6,
                        background: 'rgba(255, 255, 255, 0.86)',
                        color: 'rgba(15, 23, 42, 0.68)',
                        boxShadow: '0 6px 18px rgba(15, 23, 42, 0.10)',
                        cursor: 'pointer',
                    }}
                >
                    <X aria-hidden="true" style={{ width: 13, height: 13, strokeWidth: 2 }} />
                </button>
                {iframeEntries.map((entry) => (
                    <iframe
                        key={entry.key}
                        ref={(iframe) => onIframeRef(entry.key, iframe)}
                        src={entry.src}
                        title="ACP UI"
                        allow="clipboard-write"
                        onLoad={() => onIframeLoad(entry.key)}
                        style={{
                            border: 'none',
                            width: '100%',
                            height: '100%',
                            display: entry.key === activeIframeKey ? 'block' : 'none',
                        }}
                    />
                ))}
                {assistantContextDragging ? (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 24,
                            background: 'rgba(15, 23, 42, 0.54)',
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 600,
                            letterSpacing: 0,
                            textAlign: 'center',
                            pointerEvents: 'auto',
                        }}
                    >
                        拖放到这里添加为 AI 上下文
                    </div>
                ) : null}
            </div>
        </Resizable>
    );
}
