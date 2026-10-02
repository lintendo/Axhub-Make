import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Bot, Check, ChevronDown, ChevronRight, FileCode2, FileText, Folder, Pencil, Plus, TextCursorInput, Trash2, X } from 'lucide-react';
import type { AnnotationDocumentDirectoryNode } from '../../types';
export type { AnnotationDocumentDirectoryNode } from '../../types';

export interface DocumentManagementDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tree: AnnotationDocumentDirectoryNode[];
    loading?: boolean;
    onTreeChange: (tree: AnnotationDocumentDirectoryNode[]) => void;
    onTreePersist: (tree: AnnotationDocumentDirectoryNode[]) => void | Promise<void>;
    onCreateDocument: (folderId?: string | null) => void | Promise<void>;
    onEditDocument: (node: AnnotationDocumentDirectoryNode) => void | Promise<void>;
    onDeleteDocument: (node: AnnotationDocumentDirectoryNode) => void | Promise<void>;
    onCopyPrompt: () => void | Promise<void>;
    promptCopying?: boolean;
}

function cloneTree(nodes: AnnotationDocumentDirectoryNode[]): AnnotationDocumentDirectoryNode[] {
    return nodes.map((node) => ({
        ...node,
        ...(node.children ? { children: cloneTree(node.children) } : {}),
    }));
}

function resolveVisibleDocumentTree(nodes: AnnotationDocumentDirectoryNode[]): AnnotationDocumentDirectoryNode[] {
    const onlyNode = nodes[0];
    if (nodes.length === 1 && onlyNode?.type === 'folder' && onlyNode.children?.length) {
        return onlyNode.children;
    }
    return nodes;
}

function restoreDocumentTreeRoot(
    originalTree: AnnotationDocumentDirectoryNode[],
    visibleTree: AnnotationDocumentDirectoryNode[],
): AnnotationDocumentDirectoryNode[] {
    const onlyNode = originalTree[0];
    if (originalTree.length === 1 && onlyNode?.type === 'folder' && onlyNode.children?.length) {
        return [{ ...onlyNode, children: visibleTree }];
    }
    return visibleTree;
}

function resolveDefaultCreateFolderId(nodes: AnnotationDocumentDirectoryNode[]): string | null {
    const onlyNode = nodes[0];
    return nodes.length === 1 && onlyNode?.type === 'folder'
        ? onlyNode.id
        : null;
}

function removeNodeById(nodes: AnnotationDocumentDirectoryNode[], id: string): AnnotationDocumentDirectoryNode | null {
    for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        if (node.id === id) {
            nodes.splice(index, 1);
            return node;
        }
        if (node.children?.length) {
            const removed = removeNodeById(node.children, id);
            if (removed) return removed;
        }
    }
    return null;
}

function insertNodeBefore(nodes: AnnotationDocumentDirectoryNode[], targetId: string, node: AnnotationDocumentDirectoryNode): boolean {
    for (let index = 0; index < nodes.length; index += 1) {
        if (nodes[index].id === targetId) {
            nodes.splice(index, 0, node);
            return true;
        }
        if (nodes[index].children?.length && insertNodeBefore(nodes[index].children || [], targetId, node)) {
            return true;
        }
    }
    return false;
}

function insertNodeIntoFolder(nodes: AnnotationDocumentDirectoryNode[], folderId: string, node: AnnotationDocumentDirectoryNode): boolean {
    for (const current of nodes) {
        if (current.id === folderId && current.type === 'folder') {
            current.children = [...(current.children || []), node];
            return true;
        }
        if (current.children?.length && insertNodeIntoFolder(current.children, folderId, node)) {
            return true;
        }
    }
    return false;
}

function collectFolderIds(nodes: AnnotationDocumentDirectoryNode[], target = new Set<string>()): Set<string> {
    nodes.forEach((node) => {
        if (node.type !== 'folder') return;
        target.add(node.id);
        collectFolderIds(node.children || [], target);
    });
    return target;
}

export function renameDocumentTitle(
    nodes: AnnotationDocumentDirectoryNode[],
    nodeId: string,
    title: string,
): AnnotationDocumentDirectoryNode[] {
    const nextTitle = title.trim();
    if (!nextTitle) return nodes;
    let changed = false;
    const nextNodes = nodes.map((node) => {
        if (node.id === nodeId && node.type !== 'folder') {
            if (node.title === nextTitle) return node;
            changed = true;
            return { ...node, title: nextTitle };
        }
        if (node.children?.length) {
            const nextChildren = renameDocumentTitle(node.children, nodeId, nextTitle);
            if (nextChildren !== node.children) {
                changed = true;
                return { ...node, children: nextChildren };
            }
        }
        return node;
    });
    return changed ? nextNodes : nodes;
}

export function DocumentRow({
    node,
    depth,
    expanded,
    onToggle,
    onEdit,
    onRename,
    onDelete,
    onDragStart,
    onDrop,
}: {
    node: AnnotationDocumentDirectoryNode;
    depth: number;
    expanded: Set<string>;
    onToggle: (id: string) => void;
    onEdit: (node: AnnotationDocumentDirectoryNode) => void;
    onRename: (node: AnnotationDocumentDirectoryNode, title: string) => void | Promise<void>;
    onDelete: (node: AnnotationDocumentDirectoryNode) => void;
    onDragStart: (node: AnnotationDocumentDirectoryNode) => void;
    onDrop: (target: AnnotationDocumentDirectoryNode) => void;
}) {
    const isFolder = node.type === 'folder';
    const isExpanded = expanded.has(node.id);
    const [renaming, setRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(node.title);

    const cancelRename = () => {
        setRenameValue(node.title);
        setRenaming(false);
    };

    const submitRename = () => {
        const nextTitle = renameValue.trim();
        if (!nextTitle) return;
        void onRename(node, nextTitle);
        setRenaming(false);
    };

    return (
        <div>
            <div
                className="group flex min-h-9 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/70"
                style={{ paddingLeft: `${8 + depth * 18}px` }}
                draggable={!isFolder && !renaming}
                onDragStart={() => onDragStart(node)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                    event.preventDefault();
                    onDrop(node);
                }}
            >
                {isFolder ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground"
                                aria-label={isExpanded ? '折叠文件夹' : '展开文件夹'}
                                onClick={() => onToggle(node.id)}
                            >
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">{isExpanded ? '折叠文件夹' : '展开文件夹'}</TooltipContent>
                    </Tooltip>
                ) : <span className="w-5" />}
                {isFolder ? <Folder className="h-4 w-4 text-muted-foreground" /> : node.type === 'html' ? <FileCode2 className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                {renaming ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                        <Input
                            autoFocus
                            aria-label="文档名称"
                            className="h-7 min-w-0 flex-1 px-2 text-sm"
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    submitRename();
                                } else if (event.key === 'Escape') {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    cancelRename();
                                }
                            }}
                        />
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label="保存名称"
                                    disabled={!renameValue.trim()}
                                    onClick={submitRename}
                                >
                                    <Check className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">保存名称</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button type="button" variant="ghost" size="icon-xs" aria-label="取消重命名" onClick={cancelRename}>
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">取消重命名</TooltipContent>
                        </Tooltip>
                    </div>
                ) : (
                    <span className="min-w-0 flex-1 truncate text-sm" title={node.markdownPath || node.htmlPath}>{node.title}</span>
                )}
                {!isFolder && !renaming ? (
                    <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button type="button" variant="ghost" size="icon-xs" aria-label={`${node.type === 'html' ? '批注' : '编辑'} ${node.title}`} onClick={() => onEdit(node)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{node.type === 'html' ? '批注' : '编辑文档'}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label={`重命名 ${node.title}`}
                                    onClick={() => {
                                        setRenameValue(node.title);
                                        setRenaming(true);
                                    }}
                                >
                                    <TextCursorInput className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">重命名目录标题</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button type="button" variant="ghost" size="icon-xs" aria-label={`删除 ${node.title}`} onClick={() => onDelete(node)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">删除文档</TooltipContent>
                        </Tooltip>
                    </span>
                ) : null}
            </div>
            {isFolder && isExpanded && node.children?.length ? (
                <div>
                    {node.children.map((child) => (
                        <DocumentRow
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            expanded={expanded}
                            onToggle={onToggle}
                            onEdit={onEdit}
                            onRename={onRename}
                            onDelete={onDelete}
                            onDragStart={onDragStart}
                            onDrop={onDrop}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default function DocumentManagementDialog({
    open,
    onOpenChange,
    tree,
    loading = false,
    onTreeChange,
    onTreePersist,
    onCreateDocument,
    onEditDocument,
    onDeleteDocument,
    onCopyPrompt,
    promptCopying = false,
}: DocumentManagementDialogProps) {
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const visibleTree = useMemo(() => resolveVisibleDocumentTree(tree || []), [tree]);

    useEffect(() => {
        if (open) {
            setExpanded((previous) => new Set([...previous, ...collectFolderIds(visibleTree)]));
        }
    }, [open, visibleTree]);

    const persistTree = async (nextTree: AnnotationDocumentDirectoryNode[]) => {
        const persistedTree = restoreDocumentTreeRoot(tree || [], nextTree);
        onTreeChange(persistedTree);
        await Promise.resolve(onTreePersist(persistedTree));
        setDraggingNodeId(null);
    };

    const handleDrop = async (target: AnnotationDocumentDirectoryNode) => {
        if (!draggingNodeId || draggingNodeId === target.id) return;
        const nextTree = cloneTree(visibleTree);
        const dragged = removeNodeById(nextTree, draggingNodeId);
        if (!dragged || dragged.type === 'folder') {
            setDraggingNodeId(null);
            return;
        }
        const inserted = target.type === 'folder'
            ? insertNodeIntoFolder(nextTree, target.id, dragged)
            : insertNodeBefore(nextTree, target.id, dragged);
        if (!inserted) nextTree.push(dragged);
        await persistTree(nextTree);
    };

    const handleDropToRoot = async (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (!draggingNodeId) return;
        const nextTree = cloneTree(visibleTree);
        const dragged = removeNodeById(nextTree, draggingNodeId);
        if (!dragged || dragged.type === 'folder') {
            setDraggingNodeId(null);
            return;
        }
        nextTree.push(dragged);
        await persistTree(nextTree);
    };

    const handleRename = async (node: AnnotationDocumentDirectoryNode, title: string) => {
        const nextTree = renameDocumentTitle(tree || [], node.id, title);
        if (nextTree === tree) return;
        onTreeChange(nextTree);
        await Promise.resolve(onTreePersist(nextTree));
    };

    return (
        <TooltipProvider delayDuration={250}>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="w-[min(92vw,640px)] max-w-[640px]"
                    onEscapeKeyDown={(event) => {
                        if ((event.target as HTMLElement).getAttribute('aria-label') === '文档名称') {
                            event.preventDefault();
                        }
                    }}
                >
                <DialogHeader>
                    <DialogTitle>文档管理</DialogTitle>
                    <DialogDescription>维护需求标注中的文档目录，可拖动文档调整位置。</DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-end gap-2">
                    <Button
                        type="button"
                        size="sm"
                        disabled={loading}
                        onClick={() => { void onCreateDocument(resolveDefaultCreateFolderId(tree || [])); }}
                    >
                        <Plus className="h-4 w-4" /> 新建
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={promptCopying}
                        onClick={() => { void onCopyPrompt(); }}
                    >
                        <Bot className="h-4 w-4" /> AI 管理文档
                    </Button>
                </div>
                <div
                    className={cn('max-h-[46vh] min-h-[180px] overflow-y-auto rounded-md border p-2', draggingNodeId && 'border-primary/50 bg-primary/5')}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDropToRoot}
                >
                    {loading ? (
                        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">正在读取标注文档...</div>
                    ) : visibleTree.length ? visibleTree.map((node) => (
                        <DocumentRow
                            key={node.id}
                            node={node}
                            depth={0}
                            expanded={expanded}
                            onToggle={(id) => setExpanded((previous) => {
                                const next = new Set(previous);
                                if (next.has(id)) next.delete(id); else next.add(id);
                                return next;
                            })}
                            onEdit={(documentNode) => {
                                onOpenChange(false);
                                void onEditDocument(documentNode);
                            }}
                            onRename={(documentNode, title) => { void handleRename(documentNode, title); }}
                            onDelete={(documentNode) => { void onDeleteDocument(documentNode); }}
                            onDragStart={(dragged) => setDraggingNodeId(dragged.id)}
                            onDrop={(target) => { void handleDrop(target); }}
                        />
                    )) : (
                        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">暂无标注文档</div>
                    )}
                </div>
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
}
