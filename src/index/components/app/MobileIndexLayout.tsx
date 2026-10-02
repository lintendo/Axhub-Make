import React from 'react';
import { Copy, ImageIcon, Loader2, MessageCircle, Search, Sparkles } from 'lucide-react';
import type { ItemData } from '../../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MobileIndexLayoutProps {
    loading: boolean;
    items: ItemData[];
    searchText: string;
    onSearchTextChange: (value: string) => void;
    onCopyProjectDirectory: () => Promise<void> | void;
    onOpenAssistant: () => void;
    onOpenImageAiPanel: () => void;
    onOpenItem: (item: ItemData) => void;
    onOpenAssistantWithItemContext: (item: ItemData) => void;
    conversationUi?: boolean;
}

export default function MobileIndexLayout({
    loading,
    items,
    searchText,
    onSearchTextChange,
    onCopyProjectDirectory,
    onOpenAssistant,
    onOpenImageAiPanel,
    onOpenItem,
    onOpenAssistantWithItemContext,
    conversationUi = true,
}: MobileIndexLayoutProps) {
    const mobilePrototypes = items.filter((item) => {
        const lower = searchText.toLowerCase();
        return item.name.toLowerCase().includes(lower) || item.displayName.toLowerCase().includes(lower);
    });

    return (
        <div className="mobile-layout" style={{ display: 'none' }}>
            <div
                style={{
                    padding: '16px',
                    minHeight: '100vh',
                    background: 'hsl(var(--surface-page))',
                }}
            >
                <div
                    style={{
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <div>
                        <h1
                            style={{
                                margin: 0,
                                fontSize: '24px',
                                fontWeight: 600,
                                color: 'hsl(var(--foreground))',
                            }}
                        >
                            Axhub <span style={{ color: 'hsl(var(--brand))' }}>Make</span>
                        </h1>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {conversationUi ? (
                            <Button
                            variant="ghost"
                            size="icon"
                            title="在线对话 AI"
                            aria-label="在线对话 AI"
                            onClick={onOpenAssistant}
                        >
                            <Sparkles className="h-4 w-4" />
                            </Button>
                        ) : null}
                        {conversationUi ? (
                            <Button
                            variant="ghost"
                            size="icon"
                            title="生图 AI"
                            aria-label="生图 AI"
                            onClick={onOpenImageAiPanel}
                        >
                            <ImageIcon className="h-4 w-4" />
                            </Button>
                        ) : null}
                        <Button
                            variant="ghost"
                            size="icon"
                            title="复制项目目录"
                            aria-label="复制项目目录"
                            onClick={() => void onCopyProjectDirectory()}
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div style={{ position: 'relative', marginBottom: '16px' }}>
                    <Search
                        className="h-4 w-4"
                        style={{ position: 'absolute', left: 10, top: 10, color: 'hsl(var(--muted-foreground))' }}
                    />
                    <Input
                        placeholder="搜索..."
                        value={searchText}
                        onChange={(event) => onSearchTextChange(event.target.value)}
                        style={{ paddingLeft: 34 }}
                    />
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                        <div style={{ marginTop: 8, color: 'hsl(var(--muted-foreground))', fontSize: 12 }}>加载中...</div>
                    </div>
                ) : (
                    <div>
                        {mobilePrototypes.length === 0 ? (
                            <div
                                style={{
                                    textAlign: 'center',
                                    padding: '40px 0',
                                    color: 'hsl(var(--muted-foreground))',
                                }}
                            >
                                暂无原型
                            </div>
                        ) : (
                            mobilePrototypes.map((item) => (
                                <div
                                    key={item.name}
                                    className="mobile-item-card"
                                    onClick={() => onOpenItem(item)}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                >
                                    <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                                        <div className="mobile-item-title truncate">
                                            {item.displayName}
                                        </div>
                                        <div className="mobile-item-name truncate">
                                            {item.name}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        {conversationUi ? (
                                            <Button
                                            variant="ghost"
                                            size="icon"
                                            title="使用上下文对话"
                                            className="shrink-0"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onOpenAssistantWithItemContext(item);
                                            }}
                                        >
                                            <MessageCircle className="h-4 w-4" />
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
