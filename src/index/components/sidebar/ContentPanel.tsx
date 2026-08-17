import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { QRCode } from 'antd';
import {
    ArrowLeft,
    Bot,
    HardDrive,
    Home,
    FolderPlus,
    Plus,
    Search,
    Check,
    ChevronDown,
    ChevronRight,
    File,
    Folder,
    FolderOpen,
    Menu,
    MoreHorizontal,
    Globe,
    Github,
    GitBranch,
    Info,
    Moon,
    Pencil,
    Copy,
    Link as LinkIcon,
    History,
    ExternalLink,
    Download,

    Settings,
    SquarePen,
    Sun,
    Trash2,
    Upload,
    Loader2,
    PanelsTopLeft,
    Square,
    RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SidebarTab } from './IconNavigation';
import { ItemData, SidebarTreeNode, SidebarTreeTab, ViewMode } from '../../types';
import type { PromptExecutionMeta, SelectedResourceFolder, UploadedResourceFile } from '../../types/index-page.types';
import type { IDEAvailabilityMap, MainIDEPreference } from '../../../common/ide';
import type { RuntimeAgentAvailability } from '../../../common/agent';
import type { AcpProvider } from '@/common/assistant-context/types';
import type { ThemeResourceItem } from '../../domains/resources/resource.types';
import OpenInDropdown from './OpenInDropdown';
import type { ProjectListItem, ResourceWriteCapabilities } from '../../services/projectResources';
import { getPrototypeLocalBasePath, hasExplicitLocalPath } from '../../utils/localPath';
import { ASSISTANT_CONTEXT_DRAG_MIME, buildAssistantContextDragPayload } from '../../domains/assistant/assistantContextDrag';
import { buildAssistantContextItemsFromResource } from '../../domains/assistant/assistantContextPayload';
import { getClipboardImageFiles } from '../../domains/shared/clipboardImages';
import { createSidebarTreeItemLookup, resolveSidebarTreeItem } from '../../utils/sidebarTree';
import { sidebarApi } from '../../services/sidebar.api';
import { requireProjectScope, withProjectScope } from '../../services/projectScope';
import { apiService } from '../../services/api';
import { buildItemUrl, buildLANItemUrl } from '../../utils/url';
import { makeClientTemplateMirrorDownloadUrl, makeClientTemplatePrimaryDownloadUrl } from '../../../common/makeClientTemplate';
import { formatProjectRootDisplayPath } from './projectSwitcherPathDisplay';
import { copyToClipboard } from '../../utils/clipboard';
import { buildPrototypePageSegments, findPrototypePageGroupKey } from './prototypePageGroups';
import type { PrototypePageItem } from './prototypePageGroups';

interface ContentPanelProps {
    activeTab: SidebarTab;
    viewMode: ViewMode;
    onTabChange: (tab: SidebarTab) => void;
    onPrototypeViewSelect: (item: ItemData, mode: ViewMode) => void | Promise<void>;
    projectTitle: string;
    activeProjectId: string | null;
    projectSetupRequired?: boolean;
    makeClientUpdateAvailable?: boolean;
    makeClientUpdateReminderVisible?: boolean;
    projects: ProjectListItem[];
    resourceWriteCapabilities: ResourceWriteCapabilities;
    onTitleChange: (title: string) => void | Promise<void>;
    onProjectSwitch: (projectId: string) => void | Promise<void>;
    onProjectDelete: (projectId: string) => void | Promise<void>;
    onProjectStop: (projectId: string) => void | Promise<void>;
    onAddProject: (root: string) => boolean | void | Promise<boolean | void>;
    onCreateBlankMakeProject: (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
    }) => Promise<unknown>;
    onCloneMakeProject: (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
        gitUrl: string;
    }) => Promise<unknown>;
    onCopyMakeProject: (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
    }) => Promise<unknown>;
    onRefreshProjects: () => void | Promise<void>;
    tree: SidebarTreeNode[];
    onTreeChange: (tree: SidebarTreeNode[]) => void;
    onTreePersist: (tree: SidebarTreeNode[]) => void | Promise<void>;
    items: ItemData[];
    selectedItem: ItemData | null;
    selectedPrototypePageId?: string | null;
    selectedFolder?: SelectedResourceFolder | null;
    onPrototypePageSelect: (item: ItemData, pageId: string) => void | Promise<void>;
    onItemClick: (item: ItemData) => void;
    onFolderClick?: (folder: SidebarTreeNode) => void;
    onSearch: (text: string) => void;
    searchText: string;
    onCreateFile: () => void;
    onCreateResourceStart: () => void;
    onCreateThemeStart: () => void;
    onUploadedResourceFiles?: (files: UploadedResourceFile[]) => void | Promise<void>;
    handleDownloadItemSource: (item: ItemData) => void | Promise<void>;
    handleDownloadThemeZip: (item: ThemeResourceItem) => void | Promise<void>;
    onCreateFolder: (tab: SidebarTreeTab) => Promise<{ createdFolderId: string } | null>;
    loading: boolean;
    handleOpenProjectInIDE: (ideOverride?: MainIDEPreference, targetPath?: string, projectId?: string) => boolean | Promise<boolean>;
    preferredIDE: MainIDEPreference;
    ideAvailability?: IDEAvailabilityMap;
    agentAvailability?: RuntimeAgentAvailability;
    onOpenAcpWebAgent?: (targetPath?: string, provider?: AcpProvider) => void | Promise<void>;
    onOpenImageAiPanel?: () => void | Promise<void>;
    onOpenWebAgentInPanel?: (url: string) => boolean | void | Promise<boolean | void>;
    onExecutePrompt?: (prompt: string, meta: PromptExecutionMeta) => Promise<boolean | void> | boolean | void;
    webAgentPanelOpen?: boolean;
    aiPanelMode?: 'general-ai' | 'image-ai' | null;
    externalOpenMenu?: boolean;
    onCloseAiPanel?: () => void;
    onCloseWebAgentPanel?: () => void;
    onPreferredIDEChange?: (ide: MainIDEPreference) => void;
    onOpenAISettings?: () => void;
    isDarkMode: boolean;
    handleRenameItem: (item: ItemData, nextName: string) => void | Promise<void>;
    handleDuplicateItem: (item: ItemData) => void;
    handleCopyItemPath: (item: ItemData) => void;
    handleVersionManagement: (item: ItemData) => void;
    handleDeleteItem: (item: ItemData) => void;
    onSettingsClick: (tab?: 'project' | 'update') => void;
    onVersionCollaborationClick: () => void;
    onToggleTheme: () => void;
    selectedTheme: ThemeResourceItem | null;
    defaultThemeName?: string | null;
    onSetDefaultTheme?: (themeName: string) => void | Promise<void>;
}

type DropPlacement = 'before' | 'inside' | 'after';
type ProjectSetupMode = 'menu' | 'blank' | 'clone' | 'copy';
const SIDEBAR_TREE_DRAG_MIME = 'application/x-axhub-sidebar-tree-node';
const SIDEBAR_TITLE_MAX_LENGTH = 40;
const UNTITLED_PROJECT_LABEL = '未命名项目';

const MAKE_CLIENT_SETUP_PHASES = [
    { key: 'template', label: '下载模板包' },
    { key: 'install', label: '安装依赖' },
    { key: 'dev', label: '启动客户端' },
] as const;
const MAKE_CLIENT_SETUP_PENDING_LABEL = '创建并启动项目';
const MAKE_CLIENT_SETUP_PENDING_DESCRIPTION = '首次新建会下载模板、安装依赖并启动客户端，可能需要几分钟；后续建议复制已有项目，会快很多';
const MAKE_CLIENT_COPY_PENDING_LABEL = '复制并启动项目';
const MAKE_CLIENT_COPY_PENDING_DESCRIPTION = '正在复制项目并启动客户端，可能需要几分钟';
const MAKE_CLIENT_CLONE_PENDING_LABEL = '克隆并启动项目';
const MAKE_CLIENT_CLONE_PENDING_DESCRIPTION = '正在全量克隆 Git 仓库、安装依赖并启动客户端，可能需要几分钟';
const MAKE_CLIENT_SETUP_FAILED_LABEL = '创建项目失败';
const MAKE_CLIENT_CLONE_FAILED_LABEL = '克隆项目失败';
const MAKE_CLIENT_COPY_FAILED_LABEL = '复制项目失败';
const MAKE_CLIENT_SETUP_FAILED_DESCRIPTION = '可以复制给 AI 处理';
const MAKE_STATE_DIR_NOT_WRITABLE = 'MAKE_STATE_DIR_NOT_WRITABLE';
const DEFAULT_MAKE_CLIENT_PROJECT_NAME = '新建 Make 项目';
const MAKE_CLIENT_LAST_PARENT_ROOT_STORAGE_KEY = 'axhub.make.lastProjectParentRoot';

function buildMakeClientAiCreatePrompt(params: {
    primaryTemplateDownloadUrl: string;
    mirrorTemplateDownloadUrl: string;
}): string {
    return [
        '请帮我新建一个 Axhub Make 客户端项目。',
        '',
        '1. 先和我确认项目目录。可以使用当前目录、我指定的目录，或你根据当前 workspace 推荐的目录；确认前不要下载、解压、安装依赖或写文件。',
        '2. 目录确认后，下载客户端模板包；主链接不可用时再用备用链接。',
        `   - 主链接：${params.primaryTemplateDownloadUrl}`,
        `   - 备用链接：${params.mirrorTemplateDownloadUrl}`,
        '3. 将压缩包解压到确认的项目目录，使用目录名作为 project.id。项目名称可以问我；如果我不指定，则 project.name 留空。',
        '4. 在项目目录内自动创建并写入 .axhub/make/client.json，不要要求我再手动选择或导入目录。文件内容包含 schemaVersion: 1、kind: "axhub-make-client"、repository、templateUrl、project.id、project.name。',
        '5. templateUrl 写实际下载成功的链接；repository 按实际来源填写：如果使用主链接，写 https://github.com/lintendo/Axhub-Make/tree/main/client；如果使用备用链接，写 https://gitee.com/axhub/Axhub-Make/tree/main/client。',
        '6. 在项目目录安装依赖并同步清单：优先执行 npm install --include=dev，再执行 npm run metadata:sync。',
        '7. 请按当前系统选择命令写法，兼容 macOS、Windows 和 Linux；遇到 Node、npm、网络、权限、路径或压缩包问题时先尝试修复再继续，无法修复时说明原因和已完成步骤。',
        '8. 完成后告诉我项目目录、实际使用的模板下载链接、.axhub/make/client.json 已写入，以及依赖安装和 metadata:sync 是否成功。',
        '',
        '不要让我再回到 Axhub Make 选择“已有项目”手动导入该目录；你已经负责把客户端项目写入到可识别的项目目录中。',
    ].join('\n');
}

function stringifyDiagnostic(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value || '');
    }
}

function readDiagnosticRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, any>
        : {};
}

function readMakeStateDetails(diagnostic: unknown): Record<string, any> {
    const record = readDiagnosticRecord(diagnostic);
    return readDiagnosticRecord(record.details);
}

function isMakeStateNotWritableDiagnostic(diagnostic: unknown): boolean {
    return readDiagnosticRecord(diagnostic).code === MAKE_STATE_DIR_NOT_WRITABLE;
}

function buildMakeStatePermissionAiPrompt(params: {
    diagnostic: unknown;
    errorMessage: string;
}): string {
    const details = readMakeStateDetails(params.diagnostic);
    const stateDir = String(details.stateDir || '');
    const registryPath = String(details.registryPath || '');
    const originalError = readDiagnosticRecord(details.error);
    return [
        '请帮我修复 Axhub Make 本机项目列表保存失败的问题。',
        '',
        `Make 数据目录：${stateDir || '(未返回)'}`,
        `项目列表文件：${registryPath || '(未返回)'}`,
        `错误：${String(originalError.code || MAKE_STATE_DIR_NOT_WRITABLE)} ${String(originalError.message || params.errorMessage || '')}`.trim(),
        '',
        '请判断当前系统是 macOS、Windows 还是 Linux，检查这个目录是否存在、当前用户是否有写入权限、是否有残留 projects.json.tmp-* 文件。',
        '能安全处理时再执行修复；不要直接使用 sudo，除非用户确认。',
        '',
        '修复后请让我回到 Axhub Make 页面点“重新检测”或重新新建项目。',
    ].join('\n');
}

function buildMakeClientSetupAiPrompt(params: {
    parentRoot: string;
    folderName: string;
    projectName: string;
    errorMessage: string;
    diagnostic: unknown;
}): string {
    if (isMakeStateNotWritableDiagnostic(params.diagnostic)) {
        return buildMakeStatePermissionAiPrompt({
            diagnostic: params.diagnostic,
            errorMessage: params.errorMessage,
        });
    }
    const trimmedParentRoot = params.parentRoot.replace(/[\\/]+$/u, '');
    const separator = trimmedParentRoot.includes('\\') ? '\\' : '/';
    const projectRoot = `${trimmedParentRoot}${separator}${params.folderName}`;
    const promptLines = [
        '请帮我修复 Axhub Make 客户端项目的启动失败问题。',
        '',
        `项目目录：${projectRoot}`,
        `项目名称：${params.projectName || params.folderName}`,
        '',
        '请在这个项目目录里按顺序排查：模板文件是否完整、Node.js 版本是否可用、依赖是否安装完成、开发服务是否能启动。需要安装依赖时优先执行 npm install；如果 npm 不可用或失败，再尝试 pnpm install。',
        '',
        '修复完成后请告诉我：回到 Axhub Make 页面刷新。如果刷新后仍停留在项目设置页，请使用添加本地已有项目的入口，选择上面的项目目录。',
        '',
        '错误摘要：',
        params.errorMessage || MAKE_CLIENT_SETUP_FAILED_LABEL,
        '',
        '诊断信息：',
        stringifyDiagnostic(params.diagnostic),
    ];
    return promptLines.join('\n');
}

function buildMakeClientCloneAiPrompt(params: {
    parentRoot: string;
    folderName: string;
    projectName: string;
    gitUrl: string;
    errorMessage: string;
    diagnostic: unknown;
}): string {
    const trimmedParentRoot = params.parentRoot.replace(/[\\/]+$/u, '');
    const separator = trimmedParentRoot.includes('\\') ? '\\' : '/';
    const projectRoot = `${trimmedParentRoot}${separator}${params.folderName}`;
    return [
        '请帮我克隆并接入 Axhub Make 客户端项目。',
        '',
        `Git 地址：${params.gitUrl || '(未填写)'}`,
        `目标目录：${projectRoot}`,
        `项目名称：${params.projectName || params.folderName}`,
        '',
        '请先确认 Git 是否可用，并根据这个地址判断需要 HTTPS 登录、SSH key、访问令牌或仓库权限。',
        '如果需要授权，请引导我完成授权；如果 clone 成功，请确认项目目录里存在 .axhub/make/client.json，并运行 npm install --include=dev 与 npm run metadata:sync。',
        '如果仓库不是 Axhub Make 客户端项目，请说明需要补齐 .axhub/make/client.json、package.json scripts.dev 和 metadata:sync 后再回到 Axhub Make 选择已有项目。',
        '',
        '错误摘要：',
        params.errorMessage || MAKE_CLIENT_CLONE_FAILED_LABEL,
        '',
        '诊断信息：',
        stringifyDiagnostic(params.diagnostic),
    ].join('\n');
}

function readProjectSetupPromptFromError(error: unknown): string {
    const diagnostic = readDiagnosticRecord((error as { diagnostic?: unknown } | null)?.diagnostic);
    return typeof diagnostic.prompt === 'string' ? diagnostic.prompt.trim() : '';
}

function slugifyProjectFolderName(input: string): string {
    return String(input || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/gu, '')
        .replace(/[^a-z0-9._-]+/gu, '-')
        .replace(/[._-]{2,}/gu, '-')
        .replace(/[._-]+$/gu, '')
        .replace(/^[._-]+/gu, '')
        .slice(0, 80);
}

async function suggestProjectFolderName(projectName: string, parentRoot: string): Promise<string> {
    const response = await fetch('/api/projects/make/folder-name-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, parentRoot }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.error || '生成文件夹名称失败');
    }
    return String(payload?.folderName || '').trim();
}

function fallbackProjectFolderName(input: string): string {
    return slugifyProjectFolderName(input) || 'make-project';
}

function readStoredMakeClientParentRoot(): string {
    if (typeof window === 'undefined') {
        return '';
    }
    try {
        return window.localStorage.getItem(MAKE_CLIENT_LAST_PARENT_ROOT_STORAGE_KEY)?.trim() || '';
    } catch {
        return '';
    }
}

function writeStoredMakeClientParentRoot(parentRoot: string): void {
    const normalizedParentRoot = parentRoot.trim();
    if (!normalizedParentRoot || typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(MAKE_CLIENT_LAST_PARENT_ROOT_STORAGE_KEY, normalizedParentRoot);
    } catch {
        // Browser storage can be unavailable in private or embedded contexts.
    }
}

function getProjectSetupErrorPhase(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error || '');
    const diagnostic = (error as { diagnostic?: unknown } | null)?.diagnostic;
    if (isMakeStateNotWritableDiagnostic(diagnostic)) return 'make-state';
    if (message.includes('克隆') || message.includes('Git clone')) return 'clone';
    if (message.includes('下载模板包') || message.includes('获取源码')) return 'template';
    if (message.includes('安装依赖')) return 'install';
    if (message.includes('metadata')) return 'metadata';
    if (message.includes('启动客户端')) return 'dev';
    return '';
}

function getProjectSetupPhaseLabel(phaseKey: string): string {
    if (phaseKey === 'make-state') {
        return '本机项目列表保存失败';
    }
    if (phaseKey === 'clone') {
        return MAKE_CLIENT_CLONE_FAILED_LABEL;
    }
    return MAKE_CLIENT_SETUP_PHASES.find((phase) => phase.key === phaseKey)?.label || MAKE_CLIENT_SETUP_FAILED_LABEL;
}

function matchesAssistantImageResourcePattern(value: unknown): boolean {
    const raw = String(value || '').trim();
    if (!raw) return false;

    const candidates = [raw];
    for (let index = 0; index < 2; index += 1) {
        const previous = candidates[candidates.length - 1];
        try {
            const decoded = decodeURIComponent(previous);
            if (decoded === previous) break;
            candidates.push(decoded);
        } catch {
            break;
        }
    }

    return candidates.some((candidate) => /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg)([?#/]|$)/i.test(candidate));
}

function isSidebarTreeDragEvent(event: React.DragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer?.types || []).includes(SIDEBAR_TREE_DRAG_MIME);
}

function isDocumentPasteBlockedTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
        return false;
    }
    const element = target as Element;
    if (element.closest('input, textarea, [contenteditable="true"], [role="textbox"], button, [data-document-paste-ignore]')) {
        return true;
    }
    const roleButton = element.closest('[role="button"]');
    return Boolean(roleButton && !roleButton.hasAttribute('data-document-paste-surface'));
}

function isDocumentPasteUploadActive(documentPanelRoot: HTMLElement, pasteArmed: boolean): boolean {
    return pasteArmed || documentPanelRoot.contains(document.activeElement);
}

function shouldUseDocumentRootPasteTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
        return true;
    }
    return !Boolean(target.closest([
        'input',
        'textarea',
        '[contenteditable="true"]',
        '[role="textbox"]',
        'button',
        '[data-document-paste-ignore]',
        '[data-document-paste-surface]',
    ].join(', ')));
}

function stopProjectSetupLinkPropagation(event: React.SyntheticEvent) {
    event.stopPropagation();
}

interface SidebarRowProps {
    title: string;
    icon?: React.ReactNode;
    suffix?: React.ReactNode;
    actions?: React.ReactNode;
    selected?: boolean;
    selectedVariant?: 'filled' | 'subtle';
    editable?: boolean;
    editingValue?: string;
    inputRef?: React.Ref<HTMLInputElement>;
    paddingLeft?: string;
    className?: string;
    titleClassName?: string;
    draggable?: boolean;
    beforeIndicator?: boolean;
    afterIndicator?: boolean;
    ariaExpanded?: boolean;
    onEditingValueChange?: (value: string) => void;
    onClick?: () => void;
    onDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
    onEditClick?: (event: React.MouseEvent<HTMLInputElement>) => void;
    onEditBlur?: () => void;
    onEditKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void;
    onFocus?: (event: React.FocusEvent<HTMLDivElement>) => void;
}

function SidebarRow({
    title,
    icon,
    suffix,
    actions,
    selected = false,
    selectedVariant = 'filled',
    editable = false,
    editingValue = '',
    inputRef,
    paddingLeft = '8px',
    className,
    titleClassName,
    draggable,
    beforeIndicator = false,
    afterIndicator = false,
    ariaExpanded,
    onEditingValueChange,
    onClick,
    onDoubleClick,
    onKeyDown,
    onEditClick,
    onEditBlur,
    onEditKeyDown,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onFocus,
}: SidebarRowProps) {
    return (
        <div className="relative">
            <div
                role="button"
                aria-expanded={ariaExpanded}
                data-document-paste-surface
                tabIndex={0}
                className={cn(
                    'menu-item-wrapper group relative flex min-w-0 w-full max-w-full items-center gap-1.5 overflow-hidden rounded-md py-1 pr-2 text-left text-[12px] leading-4 transition-colors',
                    className,
                    selected && selectedVariant === 'filled'
                        ? 'bg-accent text-accent-foreground font-semibold'
                        : null,
                    selected && selectedVariant === 'subtle'
                        ? 'text-primary font-semibold'
                        : null,
                    !selected ? 'text-foreground hover:bg-muted/50' : null,
                    selected && 'is-selected',
                )}
                style={{ paddingLeft }}
                draggable={draggable}
                onClick={onClick}
                onDoubleClick={onDoubleClick}
                onKeyDown={onKeyDown}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                onFocus={onFocus}
            >
                {icon ? <div className="shrink-0 text-muted-foreground/80">{icon}</div> : null}

                {editable ? (
                    <input
                        ref={inputRef}
                        value={editingValue}
                        onChange={(event) => onEditingValueChange?.(event.target.value)}
                        onClick={onEditClick}
                        onBlur={onEditBlur}
                        onKeyDown={onEditKeyDown}
                        maxLength={SIDEBAR_TITLE_MAX_LENGTH}
                        className="ax-inline-rename-input min-w-0 w-0 max-w-full basis-0 flex-1"
                    />
                ) : (
                    <span className={cn('block min-w-0 w-0 basis-0 flex-1 truncate pr-1', titleClassName)} title={title}>
                        {title}
                    </span>
                )}

                {suffix ? <div className="relative z-10 ml-auto flex shrink-0 items-center">{suffix}</div> : null}
                {actions ? <div className={cn('relative z-10 flex shrink-0 items-center gap-0.5', !suffix && 'ml-auto')}>{actions}</div> : null}
            </div>

            {beforeIndicator ? (
                <div className="pointer-events-none absolute left-[-8px] right-[-8px] top-0 z-10 h-[2px] bg-primary" />
            ) : null}
            {afterIndicator ? (
                <div className="pointer-events-none absolute left-[-8px] right-[-8px] bottom-0 z-10 h-[2px] bg-primary" />
            ) : null}
        </div>
    );
}

function cloneTree(nodes: SidebarTreeNode[]): SidebarTreeNode[] {
    return nodes.map((node) => ({
        ...node,
        children: node.children ? cloneTree(node.children) : undefined,
    }));
}

function collectFolderIds(nodes: SidebarTreeNode[]): string[] {
    const ids: string[] = [];
    const walk = (list: SidebarTreeNode[]) => {
        for (const node of list) {
            if (node.kind === 'folder') {
                ids.push(node.id);
                walk(node.children || []);
            }
        }
    };
    walk(nodes);
    return ids;
}

function findFolderIdByPath(nodes: SidebarTreeNode[], folderPath: string): string | null {
    const normalizedPath = String(folderPath || '').trim();
    if (!normalizedPath) {
        return null;
    }
    for (const node of nodes) {
        if (node.kind !== 'folder') {
            continue;
        }
        const nodePath = String(node.folderPath || node.path || '').trim();
        if (nodePath === normalizedPath) {
            return node.id;
        }
        const childMatch = findFolderIdByPath(node.children || [], normalizedPath);
        if (childMatch) {
            return childMatch;
        }
    }
    return null;
}

function removeNodeById(nodes: SidebarTreeNode[], nodeId: string): SidebarTreeNode | null {
    for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (node.id === nodeId) {
            nodes.splice(i, 1);
            return node;
        }
        if (node.children?.length) {
            const removed = removeNodeById(node.children, nodeId);
            if (removed) {
                return removed;
            }
        }
    }
    return null;
}

function insertNodeBefore(nodes: SidebarTreeNode[], targetId: string, nodeToInsert: SidebarTreeNode): boolean {
    for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (node.id === targetId) {
            nodes.splice(i, 0, nodeToInsert);
            return true;
        }
        if (node.children?.length && insertNodeBefore(node.children, targetId, nodeToInsert)) {
            return true;
        }
    }
    return false;
}

function insertNodeAfter(nodes: SidebarTreeNode[], targetId: string, nodeToInsert: SidebarTreeNode): boolean {
    for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (node.id === targetId) {
            nodes.splice(i + 1, 0, nodeToInsert);
            return true;
        }
        if (node.children?.length && insertNodeAfter(node.children, targetId, nodeToInsert)) {
            return true;
        }
    }
    return false;
}

function insertNodeToFolder(nodes: SidebarTreeNode[], folderId: string, nodeToInsert: SidebarTreeNode): boolean {
    for (const node of nodes) {
        if (node.id === folderId && node.kind === 'folder') {
            if (!Array.isArray(node.children)) {
                node.children = [];
            }
            node.children.push(nodeToInsert);
            return true;
        }
        if (node.children?.length && insertNodeToFolder(node.children, folderId, nodeToInsert)) {
            return true;
        }
    }
    return false;
}

function removeFolderById(
    nodes: SidebarTreeNode[],
    folderId: string,
): { nextTree: SidebarTreeNode[]; removed: boolean } {
    let removed = false;
    const nextTree: SidebarTreeNode[] = [];

    for (const node of nodes) {
        if (node.kind === 'folder' && node.id === folderId) {
            removed = true;
            continue;
        }

        if (node.kind === 'folder' && Array.isArray(node.children) && node.children.length > 0) {
            const childResult = removeFolderById(node.children, folderId);
            if (childResult.removed) {
                removed = true;
            }
            nextTree.push({
                ...node,
                children: childResult.nextTree,
            });
            continue;
        }

        nextTree.push(node);
    }

    return { nextTree, removed };
}

function removeFolderByIdAndLiftChildren(
    nodes: SidebarTreeNode[],
    folderId: string,
): { nextTree: SidebarTreeNode[]; removed: boolean } {
    let removed = false;
    const nextTree: SidebarTreeNode[] = [];

    for (const node of nodes) {
        if (node.kind === 'folder' && node.id === folderId) {
            removed = true;
            if (Array.isArray(node.children) && node.children.length > 0) {
                nextTree.push(...node.children);
            }
            continue;
        }

        if (node.kind === 'folder' && Array.isArray(node.children) && node.children.length > 0) {
            const childResult = removeFolderByIdAndLiftChildren(node.children, folderId);
            if (childResult.removed) {
                removed = true;
            }
            nextTree.push({
                ...node,
                children: childResult.nextTree,
            });
            continue;
        }

        nextTree.push(node);
    }

    return { nextTree, removed };
}

function nodeContainsId(node: SidebarTreeNode, nodeId: string): boolean {
    if (node.id === nodeId) return true;
    if (!node.children?.length) return false;
    return node.children.some((child) => nodeContainsId(child, nodeId));
}

function findNodeById(nodes: SidebarTreeNode[], nodeId: string): SidebarTreeNode | null {
    for (const node of nodes) {
        if (node.id === nodeId) {
            return node;
        }
        if (node.children?.length) {
            const found = findNodeById(node.children, nodeId);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

function updateFolderTitleById(nodes: SidebarTreeNode[], folderId: string, title: string): SidebarTreeNode[] {
    return nodes.map((node) => {
        if (node.kind !== 'folder') {
            return node;
        }
        const children = Array.isArray(node.children) ? updateFolderTitleById(node.children, folderId, title) : node.children;
        if (node.id === folderId) {
            return {
                ...node,
                title,
                children,
            };
        }
        if (children !== node.children) {
            return {
                ...node,
                children,
            };
        }
        return node;
    });
}

function filterTree(
    nodes: SidebarTreeNode[],
    keyword: string,
    getSearchText: (node: SidebarTreeNode) => string,
): SidebarTreeNode[] {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
        return nodes;
    }

    const walk = (list: SidebarTreeNode[]): SidebarTreeNode[] => {
        const result: SidebarTreeNode[] = [];
        for (const node of list) {
            const text = getSearchText(node).toLowerCase();
            const selfMatched = text.includes(normalizedKeyword);
            if (node.kind === 'folder') {
                const nextChildren = walk(node.children || []);
                if (selfMatched || nextChildren.length > 0) {
                    result.push({ ...node, children: nextChildren });
                }
            } else if (selfMatched) {
                result.push(node);
            }
        }
        return result;
    };

    return walk(nodes);
}

const getPrototypePageMatches = (item: ItemData): PrototypePageItem[] => {
    return Array.isArray(item.pages)
        ? item.pages.filter((page) => page?.id && page?.title)
        : [];
};

function resolvePrototypePageEmbedDisplayName(item: ItemData, pageTitle: string): string {
    const trimmedPageTitle = String(pageTitle || '').trim();
    const prototypeTitle = String(item.displayName || item.name || '').trim();
    if (!trimmedPageTitle) {
        return prototypeTitle;
    }
    if (!prototypeTitle || prototypeTitle === trimmedPageTitle) {
        return trimmedPageTitle;
    }
    return `${trimmedPageTitle} - ${prototypeTitle}`;
}

interface FolderBrowserFolder {
    name: string;
    path: string;
}

interface FolderBrowserPayload {
    path: string;
    home: string;
    parent: string | null;
    roots?: string[];
    folders: FolderBrowserFolder[];
}

async function browseProjectFolders(pathValue?: string): Promise<FolderBrowserPayload> {
    const query = pathValue ? `?path=${encodeURIComponent(pathValue)}` : '';
    const response = await fetch(`/api/projects/browse-folders${query}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.error || '读取目录失败');
    }
    return {
        path: String(payload?.path || ''),
        home: String(payload?.home || ''),
        parent: typeof payload?.parent === 'string' ? payload.parent : null,
        roots: Array.isArray(payload?.roots) ? payload.roots.filter((item: unknown): item is string => typeof item === 'string') : undefined,
        folders: Array.isArray(payload?.folders)
            ? payload.folders
                .map((folder: any) => ({
                    name: String(folder?.name || ''),
                    path: String(folder?.path || ''),
                }))
                .filter((folder: FolderBrowserFolder) => folder.name && folder.path)
            : [],
    };
}

interface FolderBrowserDialogProps {
    open: boolean;
    title: string;
    confirmLabel: string;
    busy?: boolean;
    initialPath?: string;
    onOpenChange: (open: boolean) => void;
    onConfirm: (path: string) => void | Promise<void>;
}

function FolderBrowserDialog({
    open,
    title,
    confirmLabel,
    busy = false,
    initialPath,
    onOpenChange,
    onConfirm,
}: FolderBrowserDialogProps) {
    const [payload, setPayload] = useState<FolderBrowserPayload | null>(null);
    const [pathInput, setPathInput] = useState('');
    const [loading, setLoading] = useState(false);

    const selectedPath = payload?.path || '';
    const loadPath = useCallback(async (nextPath?: string) => {
        setLoading(true);
        try {
            const nextPayload = await browseProjectFolders(nextPath);
            setPayload(nextPayload);
            setPathInput(nextPayload.path);
        } catch (error: any) {
            toast.error(error?.message || '读取目录失败');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }
        void loadPath(initialPath || undefined);
    }, [initialPath, loadPath, open]);

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => {
            if (!busy) {
                onOpenChange(nextOpen);
            }
        }}>
            <DialogContent className="flex w-[min(92vw,560px)] max-w-[560px] flex-col gap-0 overflow-hidden p-0 text-sm">
                <DialogHeader className="border-b px-4 py-3">
                    <DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 p-4">
                    <div className="flex gap-2">
                        <Input
                            value={pathInput}
                            onChange={(event) => setPathInput(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    void loadPath(pathInput);
                                }
                            }}
                            className="h-8 min-w-0 flex-1 text-[12px]"
                        />
                        <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => void loadPath(pathInput)} disabled={loading}>
                            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        </Button>
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void loadPath(payload?.home)} disabled={loading || !payload?.home}>
                            <Home className="h-3.5 w-3.5" />
                            Home
                        </Button>
                        {payload?.parent ? (
                            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void loadPath(payload.parent || undefined)} disabled={loading}>
                                <ArrowLeft className="h-3.5 w-3.5" />
                                上一级
                            </Button>
                        ) : null}
                        {(payload?.roots || []).map((root) => (
                            <Button key={root} type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void loadPath(root)} disabled={loading}>
                                <HardDrive className="h-3.5 w-3.5" />
                                {root}
                            </Button>
                        ))}
                    </div>
                    <ScrollArea className="h-[260px] rounded-md border">
                        <div className="p-1">
                            {loading ? (
                                <div className="flex h-[220px] items-center justify-center text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                </div>
                            ) : payload?.folders.length ? (
                                payload.folders.map((folder) => (
                                    <button
                                        key={folder.path}
                                        type="button"
                                        className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[12px] hover:bg-muted"
                                        onClick={() => void loadPath(folder.path)}
                                    >
                                        <Folder className="h-3.5 w-3.5 shrink-0 text-primary" />
                                        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                                    </button>
                                ))
                            ) : (
                                <div className="flex h-[220px] items-center justify-center text-[12px] text-muted-foreground">没有子目录</div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
                <DialogFooter className="border-t p-3">
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)} disabled={busy}>
                        取消
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-2"
                        onClick={() => {
                            if (selectedPath) {
                                void onConfirm(selectedPath);
                            }
                        }}
                        disabled={busy || loading || !selectedPath}
                    >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

interface ProjectSetupDialogProps {
    open: boolean;
    forceBlankProjectCreation?: boolean;
    initialMode?: 'menu' | 'copy';
    dismissDisabled?: boolean;
    hasActiveProject?: boolean;
    addingProject: boolean;
    creatingBlankProject: boolean;
    cloningProject: boolean;
    copyingProject: boolean;
    onOpenChange: (open: boolean) => void;
    onSetupComplete: () => void;
    onAddProject: (root: string) => boolean | void | Promise<boolean | void>;
    onCreateBlankProject: (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
    }) => Promise<unknown>;
    onCloneProject: (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
        gitUrl: string;
    }) => Promise<unknown>;
    onCopyProject: (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
    }) => Promise<unknown>;
    assistantOpen?: boolean;
    onExecutePrompt?: (prompt: string, meta: PromptExecutionMeta) => Promise<boolean | void> | boolean | void;
}

function ProjectSetupDialog({
    open,
    forceBlankProjectCreation,
    initialMode = 'menu',
    dismissDisabled,
    hasActiveProject,
    addingProject,
    creatingBlankProject,
    cloningProject,
    copyingProject,
    onOpenChange,
    onSetupComplete,
    onAddProject,
    onCreateBlankProject,
    onCloneProject,
    onCopyProject,
    assistantOpen,
    onExecutePrompt,
}: ProjectSetupDialogProps) {
    const [setupMode, setSetupMode] = useState<ProjectSetupMode>(forceBlankProjectCreation ? 'blank' : initialMode);
    const [parentRoot, setParentRoot] = useState(readStoredMakeClientParentRoot);
    const [projectName, setProjectName] = useState(DEFAULT_MAKE_CLIENT_PROJECT_NAME);
    const [folderName, setFolderName] = useState('make-project');
    const [gitUrl, setGitUrl] = useState('');
    const [manualFolderName, setManualFolderName] = useState(false);
    const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
    const [folderBrowserPurpose, setFolderBrowserPurpose] = useState<'existing' | 'parent'>('existing');
    const [runningPhase, setRunningPhase] = useState('');
    const [failedPhase, setFailedPhase] = useState('');
    const [failedMessage, setFailedMessage] = useState('');
    const [failedDiagnostic, setFailedDiagnostic] = useState('');
    const allowCloseRef = useRef(false);
    const suggestionRequestRef = useRef(0);

    const refreshSuggestedFolderName = useCallback(async (
        nextProjectName: string,
        nextParentRoot: string,
        options: { force?: boolean } = {},
    ) => {
        if (manualFolderName && !options.force) {
            return;
        }
        const requestId = suggestionRequestRef.current + 1;
        suggestionRequestRef.current = requestId;
        const fallbackFolderName = fallbackProjectFolderName(nextProjectName);
        if (!nextParentRoot.trim()) {
            setFolderName(fallbackFolderName);
            return;
        }
        try {
            const suggestedFolderName = await suggestProjectFolderName(nextProjectName, nextParentRoot);
            if (suggestionRequestRef.current === requestId) {
                setFolderName(suggestedFolderName || fallbackFolderName);
            }
        } catch {
            if (suggestionRequestRef.current === requestId) {
                setFolderName(fallbackFolderName);
            }
        }
    }, [manualFolderName]);

    function resetBlankProjectFields() {
        setProjectName(DEFAULT_MAKE_CLIENT_PROJECT_NAME);
        setGitUrl('');
        setManualFolderName(false);
        setRunningPhase('');
        setFailedPhase('');
        setFailedMessage('');
        setFailedDiagnostic('');
        void refreshSuggestedFolderName(DEFAULT_MAKE_CLIENT_PROJECT_NAME, parentRoot, { force: true });
    }

    useEffect(() => {
        void refreshSuggestedFolderName(projectName, parentRoot);
    }, [parentRoot, projectName, refreshSuggestedFolderName]);

    useEffect(() => {
        if (open) {
            allowCloseRef.current = false;
            setSetupMode(forceBlankProjectCreation ? 'blank' : initialMode);
            return;
        }
        setSetupMode('menu');
        setRunningPhase('');
        setFailedPhase('');
        setFailedMessage('');
        setFailedDiagnostic('');
        setFolderBrowserOpen(false);
    }, [forceBlankProjectCreation, initialMode, open]);

    useEffect(() => {
        if (forceBlankProjectCreation) {
            setSetupMode('blank');
        }
    }, [forceBlankProjectCreation]);

    const busy = addingProject || creatingBlankProject || cloningProject || copyingProject;
    const primaryTemplateDownloadUrl = makeClientTemplatePrimaryDownloadUrl();
    const mirrorTemplateDownloadUrl = makeClientTemplateMirrorDownloadUrl();

    const handleRunAiCreatePrompt = async () => {
        const prompt = buildMakeClientAiCreatePrompt({
            primaryTemplateDownloadUrl,
            mirrorTemplateDownloadUrl,
        });
        try {
            if (assistantOpen && onExecutePrompt) {
                const executed = await onExecutePrompt(prompt, {
                    scene: 'make-client-project-setup',
                    targetPath: null,
                });
                if (executed !== false) {
                    toast.success('已发送到 AI 侧栏');
                    return;
                }
            }
            await copyToClipboard(prompt);
            toast.success('提示词已复制');
        } catch (error: any) {
            try {
                await copyToClipboard(prompt);
                toast.warning('AI 执行失败，已回退为复制提示词');
            } catch {
                toast.error(error?.message || '操作失败');
            }
        }
    };

    const handleSelectExisting = async (selectedPath: string) => {
        try {
            setFailedPhase('');
            setFailedMessage('');
            setFailedDiagnostic('');
            const selected = await Promise.resolve(onAddProject(selectedPath));
            if (selected === false) {
                return;
            }
            allowCloseRef.current = true;
            onSetupComplete();
            onOpenChange(false);
        } catch (error: any) {
            const errorMessage = error?.message || '添加项目失败';
            setFailedPhase(getProjectSetupErrorPhase(error));
            setFailedMessage(errorMessage);
            setFailedDiagnostic(buildMakeClientSetupAiPrompt({
                parentRoot: selectedPath,
                folderName: '',
                projectName: '',
                errorMessage,
                diagnostic: error?.diagnostic || errorMessage,
            }));
            toast.error(errorMessage);
            setFolderBrowserOpen(false);
        }
    };

    const openFolderBrowser = (purpose: 'existing' | 'parent') => {
        setFolderBrowserPurpose(purpose);
        setFolderBrowserOpen(true);
    };

    const handleCreateBlankProject = async () => {
        const normalizedParent = parentRoot.trim();
        const normalizedFolder = folderName.trim();
        const normalizedProjectName = projectName.trim();
        if (!normalizedParent) {
            toast.error('请先选择项目所在位置');
            return;
        }
        if (!normalizedFolder) {
            toast.error('请填写文件夹名称');
            return;
        }
        setFailedPhase('');
        setFailedMessage('');
        setFailedDiagnostic('');
        setRunningPhase('creating');
        try {
            writeStoredMakeClientParentRoot(normalizedParent);
            await onCreateBlankProject({
                parentRoot: normalizedParent,
                folderName: normalizedFolder,
                projectName: normalizedProjectName,
            });
            allowCloseRef.current = true;
            onSetupComplete();
            onOpenChange(false);
        } catch (error: any) {
            const errorMessage = error?.message || '新建空白项目失败';
            setFailedPhase(getProjectSetupErrorPhase(error));
            setFailedMessage(errorMessage);
            setFailedDiagnostic(buildMakeClientSetupAiPrompt({
                parentRoot: normalizedParent,
                folderName: normalizedFolder,
                projectName: normalizedProjectName,
                errorMessage,
                diagnostic: error?.diagnostic || error,
            }));
            toast.error(errorMessage);
        } finally {
            setRunningPhase('');
        }
    };

    const handleCloneMakeProject = async () => {
        const normalizedParent = parentRoot.trim();
        const normalizedFolder = folderName.trim();
        const normalizedProjectName = projectName.trim();
        const normalizedGitUrl = gitUrl.trim();
        if (!normalizedParent) {
            toast.error('请先选择项目所在位置');
            return;
        }
        if (!normalizedFolder) {
            toast.error('请填写文件夹名称');
            return;
        }
        if (!normalizedGitUrl) {
            toast.error('请填写 Git 链接');
            return;
        }
        setFailedPhase('');
        setFailedMessage('');
        setFailedDiagnostic('');
        setRunningPhase('cloning');
        try {
            writeStoredMakeClientParentRoot(normalizedParent);
            await onCloneProject({
                parentRoot: normalizedParent,
                folderName: normalizedFolder,
                projectName: normalizedProjectName,
                gitUrl: normalizedGitUrl,
            });
            allowCloseRef.current = true;
            onSetupComplete();
            onOpenChange(false);
        } catch (error: any) {
            const errorMessage = error?.message || '克隆项目失败';
            setFailedPhase(getProjectSetupErrorPhase(error) || 'clone');
            setFailedMessage(errorMessage);
            setFailedDiagnostic(readProjectSetupPromptFromError(error) || buildMakeClientCloneAiPrompt({
                parentRoot: normalizedParent,
                folderName: normalizedFolder,
                projectName: normalizedProjectName,
                gitUrl: normalizedGitUrl,
                errorMessage,
                diagnostic: error?.diagnostic || error,
            }));
            toast.error(errorMessage);
        } finally {
            setRunningPhase('');
        }
    };

    const handleCopyMakeProject = async () => {
        const normalizedParent = parentRoot.trim();
        const normalizedFolder = folderName.trim();
        const normalizedProjectName = projectName.trim();
        if (!normalizedParent) {
            toast.error('请先选择项目所在位置');
            return;
        }
        if (!normalizedFolder) {
            toast.error('请填写文件夹名称');
            return;
        }
        setFailedPhase('');
        setFailedMessage('');
        setFailedDiagnostic('');
        setRunningPhase('copying');
        try {
            writeStoredMakeClientParentRoot(normalizedParent);
            await onCopyProject({
                parentRoot: normalizedParent,
                folderName: normalizedFolder,
                projectName: normalizedProjectName,
            });
            allowCloseRef.current = true;
            onSetupComplete();
            onOpenChange(false);
        } catch (error: any) {
            const errorMessage = error?.message || '复制项目失败';
            setFailedPhase(getProjectSetupErrorPhase(error));
            setFailedMessage(errorMessage);
            setFailedDiagnostic(buildMakeClientSetupAiPrompt({
                parentRoot: normalizedParent,
                folderName: normalizedFolder,
                projectName: normalizedProjectName,
                errorMessage,
                diagnostic: error?.diagnostic || error,
            }));
            toast.error(errorMessage);
        } finally {
            setRunningPhase('');
        }
    };

    const handleCopyFailedDiagnostic = async () => {
        const fallbackDiagnostic = buildMakeClientSetupAiPrompt({
            parentRoot: parentRoot.trim(),
            folderName: folderName.trim() || fallbackProjectFolderName(projectName),
            projectName: projectName.trim(),
            errorMessage: failedMessage || MAKE_CLIENT_SETUP_FAILED_LABEL,
            diagnostic: failedMessage || MAKE_CLIENT_SETUP_FAILED_LABEL,
        });
        const diagnosticPrompt = failedDiagnostic || fallbackDiagnostic;
        if (!diagnosticPrompt) {
            return;
        }
        try {
            await copyToClipboard(diagnosticPrompt);
            toast.success('已复制给 AI 的处理说明');
        } catch (error: any) {
            toast.error(error?.message || '复制失败');
        }
    };

    const pendingCreate = Boolean(runningPhase || ((creatingBlankProject || cloningProject || copyingProject) && !failedPhase));
    const pendingLabel = setupMode === 'clone'
        ? MAKE_CLIENT_CLONE_PENDING_LABEL
        : setupMode === 'copy'
            ? MAKE_CLIENT_COPY_PENDING_LABEL
            : MAKE_CLIENT_SETUP_PENDING_LABEL;
    const pendingDescription = setupMode === 'clone'
        ? MAKE_CLIENT_CLONE_PENDING_DESCRIPTION
        : setupMode === 'copy'
            ? MAKE_CLIENT_COPY_PENDING_DESCRIPTION
            : MAKE_CLIENT_SETUP_PENDING_DESCRIPTION;
    const failedTitle = failedPhase
        ? getProjectSetupPhaseLabel(failedPhase)
        : setupMode === 'clone'
            ? MAKE_CLIENT_CLONE_FAILED_LABEL
            : setupMode === 'copy'
            ? MAKE_CLIENT_COPY_FAILED_LABEL
            : MAKE_CLIENT_SETUP_FAILED_LABEL;
    const renderFailureMessage = () => failedMessage ? (
        <div className="rounded-md border border-border/70 bg-muted/30 p-3">
            <div className="flex items-start gap-2 text-[12px]">
                <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-destructive" />
                <div className="min-w-0 space-y-2">
                    <div className="font-medium text-destructive">{failedTitle}</div>
                    <div className="break-words leading-5 text-muted-foreground">{failedMessage}</div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => void handleCopyFailedDiagnostic()}
                    >
                        <Copy className="h-3.5 w-3.5" />
                        复制给 AI 处理
                    </Button>
                </div>
            </div>
        </div>
    ) : null;
    const showProjectSetupFooter = setupMode === 'blank' || setupMode === 'clone' || setupMode === 'copy' || !dismissDisabled;

    return (
        <>
            <Dialog open={open} onOpenChange={(nextOpen) => {
                if (busy) {
                    return;
                }
                if (dismissDisabled && !nextOpen && !allowCloseRef.current) {
                    return;
                }
                onOpenChange(nextOpen);
            }}>
                <DialogContent className="flex w-[min(92vw,460px)] max-w-[460px] flex-col gap-0 overflow-hidden p-0 text-sm [&>[data-dialog-close]]:hidden">
                    <DialogHeader className="border-b px-4 py-3">
                        <div className="flex items-center gap-2">
                            {setupMode !== 'menu' && !forceBlankProjectCreation ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="h-7 w-7"
                                    onClick={() => setSetupMode('menu')}
                                    disabled={busy}
                                    aria-label="返回"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                            ) : null}
                            <DialogTitle className="text-[15px] font-semibold">项目设置</DialogTitle>
                        </div>
                    </DialogHeader>
                    {!forceBlankProjectCreation && setupMode === 'menu' ? (
                        <div className="grid gap-2 p-4">
                            <button
                                type="button"
                                className="flex min-h-[88px] w-full items-center gap-3 rounded-md border border-border/70 bg-primary/5 px-3 py-3 text-left transition-colors hover:bg-primary/10 focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:outline-none disabled:opacity-50"
                                onClick={() => {
                                    resetBlankProjectFields();
                                    setSetupMode('blank');
                                }}
                                disabled={busy}
                            >
                                <FolderPlus className="h-4 w-4 shrink-0 text-primary" />
                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                    <span className="text-[13px] font-medium">新建项目</span>
                                    <span className="text-[12px] leading-5 text-muted-foreground">首次会自动下载模板并安装依赖，可能需要几分钟。复制当前项目速度最快。</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                className="flex min-h-[88px] w-full items-center gap-3 rounded-md border border-border/70 px-3 py-3 text-left transition-colors hover:bg-muted/70 focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:outline-none disabled:opacity-50"
                                onClick={() => void handleRunAiCreatePrompt()}
                                disabled={busy}
                            >
                                <Bot className="h-4 w-4 shrink-0 text-primary" />
                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                    <span className="text-[13px] font-medium">AI 执行</span>
                                    <span className="text-[12px] leading-5 text-muted-foreground">复制一段精简提示词，让 AI 先确认目录，再下载客户端、安装依赖并写入配置。</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                className="flex min-h-[88px] w-full items-center gap-3 rounded-md border border-border/70 px-3 py-3 text-left transition-colors hover:bg-muted/70 focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:outline-none disabled:opacity-50"
                                onClick={() => {
                                    resetBlankProjectFields();
                                    setSetupMode('clone');
                                }}
                                disabled={busy}
                            >
                                <GitBranch className="h-4 w-4 shrink-0 text-primary" />
                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                    <span className="text-[13px] font-medium">Git 链接克隆</span>
                                    <span className="text-[12px] leading-5 text-muted-foreground">适合团队协作、异地办公或在多台设备间同步项目，从共享仓库拉取完整项目。</span>
                                </span>
                            </button>
                            {hasActiveProject ? (
                                <button
                                    type="button"
                                    className="flex min-h-[88px] w-full items-center gap-3 rounded-md border border-border/70 px-3 py-3 text-left transition-colors hover:bg-muted/70 focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:outline-none disabled:opacity-50"
                                    onClick={() => {
                                        resetBlankProjectFields();
                                        setSetupMode('copy');
                                    }}
                                    disabled={busy}
                                >
                                    <Copy className="h-4 w-4 shrink-0 text-primary" />
                                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                                        <span className="text-[13px] font-medium">复制当前项目</span>
                                        <span className="text-[12px] leading-5 text-muted-foreground">速度最快。从当前可运行项目复制出新项目，优先复用本机依赖，失败时自动重新安装。</span>
                                    </span>
                                </button>
                            ) : null}
                            <div
                                role="button"
                                tabIndex={busy ? -1 : 0}
                                aria-disabled={busy}
                                data-project-setup-option="existing"
                                className={cn(
                                    'flex min-h-[88px] w-full items-center gap-3 rounded-md border border-border/70 px-3 py-3 text-left transition-colors hover:bg-muted/70 focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:outline-none',
                                    busy ? 'opacity-50' : null,
                                )}
                                onClick={() => {
                                    if (busy) return;
                                    openFolderBrowser('existing');
                                }}
                                onKeyDown={(event) => {
                                    if (busy) return;
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        openFolderBrowser('existing');
                                    }
                                }}
                            >
                                <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                    <span className="text-[13px] font-medium">选择已有项目</span>
                                    <span className="text-[12px] leading-5 text-muted-foreground">
                                        已有项目可直接选择文件夹导入；没有客户端包可先
                                        <a
                                            className="inline px-0.5 text-primary underline-offset-4 hover:underline"
                                            href={primaryTemplateDownloadUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={stopProjectSetupLinkPropagation}
                                            onKeyDown={stopProjectSetupLinkPropagation}
                                        >
                                            下载客户端包
                                        </a>
                                        ，打不开可用
                                        <a
                                            className="inline px-0.5 text-primary underline-offset-4 hover:underline"
                                            href={mirrorTemplateDownloadUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={stopProjectSetupLinkPropagation}
                                            onKeyDown={stopProjectSetupLinkPropagation}
                                        >
                                            备用下载
                                        </a>
                                        。
                                    </span>
                                </span>
                                {addingProject ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
                            </div>
                            {renderFailureMessage()}
                        </div>
                    ) : (
                        <div className="space-y-4 p-4">
                            <div className="space-y-2">
                                <Label htmlFor="make-project-parent" className="text-[12px]">项目所在位置</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="make-project-parent"
                                        value={parentRoot}
                                        readOnly
                                        placeholder="请选择项目所在位置"
                                        className="h-8 min-w-0 flex-1 text-[12px]"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 shrink-0 gap-1.5"
                                        onClick={() => openFolderBrowser('parent')}
                                        disabled={busy}
                                    >
                                        <FolderOpen className="h-3.5 w-3.5" />
                                        选择
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="make-project-name" className="text-[12px]">项目名称</Label>
                                <Input
                                    id="make-project-name"
                                    value={projectName}
                                    onChange={(event) => setProjectName(event.target.value)}
                                    disabled={busy}
                                    className="h-8 text-[12px]"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="make-project-folder" className="text-[12px]">文件夹名称</Label>
                                <Input
                                    id="make-project-folder"
                                    value={folderName}
                                    onChange={(event) => {
                                        setManualFolderName(true);
                                        setFolderName(event.target.value);
                                    }}
                                    disabled={busy}
                                    className="h-8 text-[12px]"
                                />
                            </div>
                            {setupMode === 'clone' ? (
                                <div className="space-y-2">
                                    <Label htmlFor="make-project-git-url" className="text-[12px]">Git 链接</Label>
                                    <Input
                                        id="make-project-git-url"
                                        value={gitUrl}
                                        onChange={(event) => setGitUrl(event.target.value)}
                                        disabled={busy}
                                        placeholder="https://github.com/owner/repo.git"
                                        className="h-8 text-[12px]"
                                    />
                                </div>
                            ) : null}
                            {pendingCreate ? (
                                <div className="rounded-md border border-border/70 bg-muted/30 p-3">
                                    <div className="flex items-start gap-2 text-[12px]">
                                        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                                        <div className="min-w-0 space-y-1">
                                            <div className="font-medium">{pendingLabel}</div>
                                            <div className="leading-5 text-muted-foreground">{pendingDescription}</div>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                            {renderFailureMessage()}
                        </div>
                    )}
                    {showProjectSetupFooter ? (
                        <DialogFooter className="border-t p-3 sm:justify-between sm:space-x-0">
                            {!dismissDisabled ? (
                                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)} disabled={busy}>
                                    取消
                                </Button>
                            ) : null}
                            {setupMode === 'blank' || setupMode === 'clone' || setupMode === 'copy' ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 gap-2"
                                    onClick={() => {
                                        if (setupMode === 'clone') {
                                            void handleCloneMakeProject();
                                            return;
                                        }
                                        if (setupMode === 'copy') {
                                            void handleCopyMakeProject();
                                            return;
                                        }
                                        void handleCreateBlankProject();
                                    }}
                                    disabled={busy || !parentRoot.trim() || !folderName.trim() || (setupMode === 'clone' && !gitUrl.trim())}
                                >
                                    {creatingBlankProject || cloningProject || copyingProject ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : setupMode === 'clone' ? <GitBranch className="h-3.5 w-3.5" /> : setupMode === 'copy' ? <Copy className="h-3.5 w-3.5" /> : <FolderPlus className="h-3.5 w-3.5" />}
                                    {setupMode === 'clone' ? '克隆并启动' : setupMode === 'copy' ? '复制并启动' : '创建并启动'}
                                </Button>
                            ) : null}
                        </DialogFooter>
                    ) : null}
                </DialogContent>
            </Dialog>
            <FolderBrowserDialog
                open={folderBrowserOpen}
                title={folderBrowserPurpose === 'existing' ? '选择已有项目' : '选择项目所在位置'}
                confirmLabel={folderBrowserPurpose === 'existing' ? '添加项目' : '使用此目录'}
                busy={folderBrowserPurpose === 'existing' && addingProject}
                initialPath={folderBrowserPurpose === 'parent' ? parentRoot : ''}
                onOpenChange={setFolderBrowserOpen}
                onConfirm={(selectedPath) => {
                    if (folderBrowserPurpose === 'parent') {
                        setParentRoot(selectedPath);
                        writeStoredMakeClientParentRoot(selectedPath);
                        setFolderBrowserOpen(false);
                        return;
                    }
                    void handleSelectExisting(selectedPath);
                }}
            />
        </>
    );
}

export default function ContentPanel({
    activeTab,
    viewMode,
    onTabChange,
    onPrototypeViewSelect,
    projectTitle,
    activeProjectId,
    projectSetupRequired,
    makeClientUpdateAvailable,
    makeClientUpdateReminderVisible,
    projects,
    resourceWriteCapabilities,
    onTitleChange,
    onProjectSwitch,
    onProjectDelete,
    onProjectStop,
    onAddProject,
    onCreateBlankMakeProject,
    onCloneMakeProject,
    onCopyMakeProject,
    onRefreshProjects,
    tree,
    onTreeChange,
    onTreePersist,
    items,
    selectedItem,
    selectedPrototypePageId,
    selectedFolder,
    onPrototypePageSelect,
    onItemClick,
    onFolderClick,
    onSearch,
    searchText,
    onCreateFile,
    onCreateResourceStart,
    onCreateThemeStart,
    onUploadedResourceFiles,
    handleDownloadItemSource,
    handleDownloadThemeZip,
    onCreateFolder,
    loading,
    handleOpenProjectInIDE,
    preferredIDE,
    ideAvailability,
    agentAvailability,
    onOpenAcpWebAgent,
    onOpenImageAiPanel,
    onOpenWebAgentInPanel,
    onExecutePrompt,
    webAgentPanelOpen,
    aiPanelMode,
    externalOpenMenu = true,
    onCloseAiPanel,
    onCloseWebAgentPanel,
    onPreferredIDEChange,
    onOpenAISettings,
    isDarkMode,
    handleRenameItem,
    handleDuplicateItem,
    handleCopyItemPath,
    handleVersionManagement,
    handleDeleteItem,
    onSettingsClick,
    onVersionCollaborationClick,
    onToggleTheme,
    selectedTheme,
    defaultThemeName,
    onSetDefaultTheme,
}: ContentPanelProps) {
    const openInSelectedItem = 'assets' === activeTab
        ? selectedTheme
        : selectedItem;
    const openInSelectedProjectId = String((openInSelectedItem as { projectId?: string } | null)?.projectId || '').trim();
    const openInTargetProjectId = openInSelectedProjectId || activeProjectId?.trim() || '';
    const openInTargetProjectRoot = projects.find((project) => project.id === openInTargetProjectId)?.root?.trim() || '';
    const openInTargetPath = openInTargetProjectRoot;

    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState(projectTitle);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const [projectSwitcherMenuOpen, setProjectSwitcherMenuOpen] = useState(false);
    const [projectSetupOpen, setProjectSetupOpen] = useState(Boolean(projectSetupRequired));
    const [projectSetupInitialMode, setProjectSetupInitialMode] = useState<'menu'>('menu');
    const [switchingProjectId, setSwitchingProjectId] = useState<string | null>(null);
    const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
    const [stoppingProjectId, setStoppingProjectId] = useState<string | null>(null);
    const [isAddingProject, setIsAddingProject] = useState(false);
    const [isCreatingBlankProject, setIsCreatingBlankProject] = useState(false);
    const [isCloningProject, setIsCloningProject] = useState(false);
    const [isCopyingProject, setIsCopyingProject] = useState(false);
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
    const [expandedPrototypePageGroups, setExpandedPrototypePageGroups] = useState<{
        prototypeId: string;
        keys: Set<string>;
    }>({ prototypeId: '', keys: new Set() });
    const knownFolderIdsRef = useRef<Set<string>>(new Set());
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string; placement: DropPlacement } | null>(null);
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
    const [editingFolderTitle, setEditingFolderTitle] = useState('');
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editingItemTitle, setEditingItemTitle] = useState('');
    const folderInputRef = useRef<HTMLInputElement>(null);
    const skipNextFolderBlurRef = useRef(false);
    const [pendingRenameFolderId, setPendingRenameFolderId] = useState<string | null>(null);
    const [makeVersion, setMakeVersion] = useState<string | null>(null);
    const [isFileDropActive, setIsFileDropActive] = useState(false);
    const [isUploadingFiles, setIsUploadingFiles] = useState(false);
    const [lanTokenUrls, setLanTokenUrls] = useState<Record<string, string>>({});
    const [lanTokenLoadingKey, setLanTokenLoadingKey] = useState<string | null>(null);
    const [documentPasteTargetFolder, setDocumentPasteTargetFolder] = useState<string | null>(null);
    const fileDropCounterRef = useRef(0);
    const documentPanelRootRef = useRef<HTMLDivElement>(null);
    const documentPasteArmedRef = useRef(false);

    const armDocumentPasteUpload = useCallback((targetFolder: string | null = null) => {
        documentPasteArmedRef.current = true;
        setDocumentPasteTargetFolder(targetFolder);
    }, []);

    const selectedDocumentFolderPath = useMemo(() => {
        if (activeTab !== 'document' || !selectedFolder) {
            return '';
        }
        return String(selectedFolder.folderPath || selectedFolder.path || '').trim();
    }, [activeTab, selectedFolder]);

    useEffect(() => {
        if (!selectedDocumentFolderPath) {
            return;
        }
        armDocumentPasteUpload(selectedDocumentFolderPath);
    }, [activeTab, selectedDocumentFolderPath, armDocumentPasteUpload]);

    const expandDocumentFolderPath = useCallback((folderPath: string | null | undefined) => {
        const folderId = findFolderIdByPath(tree, folderPath);
        if (!folderId) {
            return;
        }
        setExpandedFolderIds((previous) => {
            if (previous.has(folderId)) {
                return previous;
            }
            const next = new Set(previous);
            next.add(folderId);
            return next;
        });
    }, [tree]);

    const uploadResourceFiles = useCallback(async (files: FileList | File[], options?: { targetFolder?: string | null }) => {
        if (!files || files.length === 0) return;
        setIsUploadingFiles(true);
        try {
            const targetFolder = String(options?.targetFolder || '').trim();
            const formData = new FormData();
            formData.append('projectId', requireProjectScope(activeProjectId).projectId);
            if (targetFolder) {
                formData.append('targetFolder', targetFolder);
            }
            for (const file of Array.from(files)) {
                formData.append('file', file, file.name);
            }
            const response = await fetch(withProjectScope('/api/docs/upload', requireProjectScope(activeProjectId)), {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.error || '上传失败');
            }
            const result = await response.json();
            const uploadedFiles = Array.isArray(result?.files)
                ? result.files as UploadedResourceFile[]
                : [];
            const count = uploadedFiles.length || files.length;
            toast.success(`已上传 ${count} 个资源文件`);
            expandDocumentFolderPath(targetFolder);
            await Promise.resolve(onUploadedResourceFiles?.(uploadedFiles));
        } catch (error: any) {
            toast.error(error?.message || '资源上传失败');
        } finally {
            setIsUploadingFiles(false);
        }
    }, [activeProjectId, expandDocumentFolderPath, onUploadedResourceFiles]);

    const setDocumentPasteTargetFromFolder = useCallback((folder: SidebarTreeNode) => {
        armDocumentPasteUpload(String(folder.folderPath || folder.path || '').trim() || null);
    }, [armDocumentPasteUpload]);

    const handleDocumentPanelRootFocus = useCallback(() => {
        armDocumentPasteUpload(null);
    }, [armDocumentPasteUpload]);

    const resetSidebarHorizontalScroll = () => {
        requestAnimationFrame(() => {
            const viewport = folderInputRef.current?.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null;
            if (viewport && viewport.scrollLeft !== 0) {
                viewport.scrollLeft = 0;
            }
        });
    };

    const dataTab: SidebarTreeTab = activeTab === 'prototype'
        ? 'prototypes'
        : activeTab === 'document'
            ? 'docs'
            : activeTab === 'assets'
                ? 'themes'
                : 'canvas';
    const selectedPrototypeId = dataTab === 'prototypes' ? selectedItem?.name || '' : '';
    const selectedPrototypePageSegments = useMemo(
        () => buildPrototypePageSegments(
            selectedPrototypeId,
            selectedItem ? getPrototypePageMatches(selectedItem) : [],
        ),
        [selectedItem?.pages, selectedPrototypeId],
    );
    const validPrototypePageGroupKeys = useMemo(() => new Set(
        selectedPrototypePageSegments
            .filter((segment) => segment.kind === 'group')
            .map((segment) => segment.key),
    ), [selectedPrototypePageSegments]);
    const activePrototypePageGroupKey = useMemo(
        () => findPrototypePageGroupKey(selectedPrototypePageSegments, selectedPrototypePageId),
        [selectedPrototypePageId, selectedPrototypePageSegments],
    );
    const promptCreateEnabled = true;

    useEffect(() => {
        setExpandedPrototypePageGroups((previous) => {
            const keys = previous.prototypeId === selectedPrototypeId
                ? new Set([...previous.keys].filter((key) => validPrototypePageGroupKeys.has(key)))
                : new Set<string>();
            if (activePrototypePageGroupKey) {
                keys.add(activePrototypePageGroupKey);
            }
            if (
                previous.prototypeId === selectedPrototypeId
                && previous.keys.size === keys.size
                && [...keys].every((key) => previous.keys.has(key))
            ) {
                return previous;
            }
            return { prototypeId: selectedPrototypeId, keys };
        });
    }, [activePrototypePageGroupKey, selectedPrototypeId, selectedPrototypePageId, validPrototypePageGroupKeys]);

    const togglePrototypePageGroup = useCallback((prototypeId: string, groupKey: string) => {
        setExpandedPrototypePageGroups((previous) => {
            const keys = previous.prototypeId === prototypeId
                ? new Set(previous.keys)
                : new Set<string>();
            if (keys.has(groupKey)) {
                keys.delete(groupKey);
            } else {
                keys.add(groupKey);
            }
            return { prototypeId, keys };
        });
    }, []);

    useEffect(() => {
        setTempTitle(projectTitle);
    }, [projectTitle]);

    useEffect(() => {
        if (isEditingTitle && titleInputRef.current) {
            titleInputRef.current.focus();
        }
    }, [isEditingTitle]);

    useEffect(() => {
        if (isSearchExpanded && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isSearchExpanded]);

    useEffect(() => {
        if (!projectSwitcherMenuOpen) {
            return;
        }
        void Promise.resolve(onRefreshProjects()).catch((error: any) => {
            toast.error(error?.message || '项目列表刷新失败');
        });
    }, [projectSwitcherMenuOpen, onRefreshProjects]);

    useEffect(() => {
        if (projectSetupRequired) {
            setProjectSetupOpen(true);
            setProjectSwitcherMenuOpen(false);
        }
    }, [projectSetupRequired]);

    useEffect(() => {
        if (activeTab !== 'document') {
            documentPasteArmedRef.current = false;
            setDocumentPasteTargetFolder(null);
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab !== 'document') {
            return;
        }

        const handleDocumentPasteBoundary = (event: PointerEvent | FocusEvent) => {
            const documentPanelRoot = documentPanelRootRef.current;
            if (!documentPanelRoot || !(event.target instanceof Node) || !documentPanelRoot.contains(event.target)) {
                documentPasteArmedRef.current = false;
            }
        };

        document.addEventListener('pointerdown', handleDocumentPasteBoundary, true);
        document.addEventListener('focusin', handleDocumentPasteBoundary, true);
        return () => {
            document.removeEventListener('pointerdown', handleDocumentPasteBoundary, true);
            document.removeEventListener('focusin', handleDocumentPasteBoundary, true);
        };
    }, [activeTab]);

    useEffect(() => {
        const handleDocumentPaste = (event: ClipboardEvent) => {
            if (activeTab !== 'document') {
                return;
            }
            const documentPanelRoot = documentPanelRootRef.current;
            if (!documentPanelRoot) {
                return;
            }
            if (isDocumentPasteBlockedTarget(event.target)) {
                return;
            }
            if (!isDocumentPasteUploadActive(documentPanelRoot, documentPasteArmedRef.current)) {
                return;
            }
            const pastedFiles = getClipboardImageFiles(event);
            if (pastedFiles.length === 0) {
                return;
            }
            event.preventDefault();
            void uploadResourceFiles(pastedFiles, { targetFolder: documentPasteTargetFolder });
        };

        document.addEventListener('paste', handleDocumentPaste, true);
        return () => document.removeEventListener('paste', handleDocumentPaste, true);
    }, [activeTab, documentPasteTargetFolder, uploadResourceFiles]);

    useEffect(() => {
        if ((editingFolderId || editingItemId) && folderInputRef.current) {
            folderInputRef.current.focus();
            folderInputRef.current.select();
        }
    }, [editingFolderId, editingItemId]);

    const handleSettingsMenuSelect = useCallback(() => {
        window.setTimeout(() => {
            onSettingsClick(makeClientUpdateReminderVisible ? 'update' : 'project');
        }, 0);
    }, [makeClientUpdateReminderVisible, onSettingsClick]);
    const handleVersionCollaborationMenuSelect = useCallback(() => {
        window.setTimeout(() => {
            onVersionCollaborationClick();
        }, 0);
    }, [onVersionCollaborationClick]);

    useEffect(() => {
        knownFolderIdsRef.current = new Set(collectFolderIds(tree));
    }, [tree]);

    const canSelectFolders = typeof onFolderClick === 'function';

    useEffect(() => {
        if (!canSelectFolders || !selectedFolder?.id) {
            return;
        }
        setExpandedFolderIds((previous) => {
            if (previous.has(selectedFolder.id)) {
                return previous;
            }
            const next = new Set(previous);
            next.add(selectedFolder.id);
            return next;
        });
    }, [canSelectFolders, selectedFolder?.id]);

    useEffect(() => {
        if (!pendingRenameFolderId) {
            return;
        }
        const targetNode = findNodeById(tree, pendingRenameFolderId);
        if (!targetNode || targetNode.kind !== 'folder') {
            return;
        }
        startFolderRename(targetNode.id, targetNode.title);
        setPendingRenameFolderId(null);
    }, [pendingRenameFolderId, tree]);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/version')
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Request failed'))))
            .then((data) => {
                if (cancelled) return;
                setMakeVersion(typeof data?.version === 'string' ? data.version : null);
            })
            .catch(() => {
                if (cancelled) return;
                setMakeVersion(null);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const itemLookup = useMemo(() => createSidebarTreeItemLookup(dataTab, items), [items, dataTab]);

    const getNodeTitle = (node: SidebarTreeNode) => {
        return node.title;
    };

    const displayTree = useMemo(() => {
        return filterTree(tree, searchText, (node) => {
            if (node.kind === 'item' && node.itemKey) {
                const item = resolveSidebarTreeItem(dataTab, node, itemLookup);
                if (item) {
                    const pageSearchText = dataTab === 'prototypes'
                        ? getPrototypePageMatches(item).map((page) => `${page.title} ${page.id}`).join(' ')
                        : '';
                    return `${node.title} ${item.displayName} ${item.name} ${pageSearchText}`;
                }
            }
            return node.title;
        });
    }, [tree, searchText, dataTab, itemLookup]);

    const handleTitleSubmit = async () => {
        const nextTitle = tempTitle.trim();
        await Promise.resolve(onTitleChange(nextTitle));
        setIsEditingTitle(false);
    };

    const handleTitleKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            await handleTitleSubmit();
        } else if (e.key === 'Escape') {
            setTempTitle(projectTitle);
            setIsEditingTitle(false);
        }
    };

    const handleProjectSwitch = async (projectId: string) => {
        if (!projectId) {
            setProjectSwitcherMenuOpen(false);
            return;
        }
        setSwitchingProjectId(projectId);
        try {
            await Promise.resolve(onProjectSwitch(projectId));
            setProjectSwitcherMenuOpen(false);
        } catch (error: any) {
            toast.error(error?.message || '切换项目失败');
        } finally {
            setSwitchingProjectId(null);
        }
    };

    const handleProjectDelete = async (projectId: string) => {
        const normalizedProjectId = projectId.trim();
        if (!normalizedProjectId || deletingProjectId) {
            return;
        }
        setDeletingProjectId(normalizedProjectId);
        try {
            await Promise.resolve(onProjectDelete(normalizedProjectId));
            toast.success('已从项目列表移除');
            setProjectSwitcherMenuOpen(false);
        } catch (error: any) {
            toast.error(error?.message || '移除项目失败');
        } finally {
            setDeletingProjectId(null);
        }
    };

    const handleProjectStop = async (projectId: string) => {
        const normalizedProjectId = projectId.trim();
        if (!normalizedProjectId || stoppingProjectId) {
            return;
        }
        setStoppingProjectId(normalizedProjectId);
        try {
            await Promise.resolve(onProjectStop(normalizedProjectId));
            toast.success('已终止客户端');
        } catch (error: any) {
            toast.error(error?.message || '终止客户端失败');
        } finally {
            setStoppingProjectId(null);
        }
    };

    const handleAddProject = async (root: string) => {
        setIsAddingProject(true);
        try {
            const selected = await Promise.resolve(onAddProject(root));
            if (selected === false) {
                return false;
            }
            setProjectSetupOpen(false);
            setProjectSwitcherMenuOpen(false);
            return true;
        } finally {
            setIsAddingProject(false);
        }
    };

    const handleCreateBlankMakeProject = async (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
    }) => {
        setIsCreatingBlankProject(true);
        try {
            return await onCreateBlankMakeProject(params);
        } finally {
            setIsCreatingBlankProject(false);
        }
    };

    const handleCloneMakeProject = async (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
        gitUrl: string;
    }) => {
        setIsCloningProject(true);
        try {
            return await onCloneMakeProject(params);
        } finally {
            setIsCloningProject(false);
        }
    };

    const handleCopyMakeProject = async (params: {
        parentRoot: string;
        folderName: string;
        projectName?: string;
    }) => {
        setIsCopyingProject(true);
        try {
            return await onCopyMakeProject(params);
        } finally {
            setIsCopyingProject(false);
        }
    };

    const toggleSearch = () => {
        setIsSearchExpanded(!isSearchExpanded);
        if (isSearchExpanded) {
            onSearch('');
        }
    };

    const toggleFolder = (folderId: string) => {
        setExpandedFolderIds((previous) => {
            const next = new Set(previous);
            if (next.has(folderId)) {
                next.delete(folderId);
            } else {
                next.add(folderId);
            }
            return next;
        });
    };

    const startFolderRename = (folderId: string, title: string) => {
        setExpandedFolderIds((previous) => {
            const next = new Set(previous);
            next.add(folderId);
            return next;
        });
        setEditingFolderId(folderId);
        setEditingFolderTitle(title);
        setEditingItemId(null);
        setEditingItemTitle('');
    };

    const startItemRename = (itemId: string, title: string) => {
        setEditingItemId(itemId);
        setEditingItemTitle(title);
        setEditingFolderId(null);
        setEditingFolderTitle('');
    };

    const handleFolderRenameCancel = () => {
        setEditingFolderId(null);
        setEditingFolderTitle('');
        resetSidebarHorizontalScroll();
    };

    const handleItemRenameCancel = () => {
        setEditingItemId(null);
        setEditingItemTitle('');
        resetSidebarHorizontalScroll();
    };

    const handleFolderRenameSubmit = async () => {
        if (!editingFolderId) {
            return;
        }
        const targetNode = findNodeById(tree, editingFolderId);
        if (!targetNode || targetNode.kind !== 'folder') {
            handleFolderRenameCancel();
            return;
        }

        const nextTitle = editingFolderTitle.trim().slice(0, SIDEBAR_TITLE_MAX_LENGTH);
        if (!nextTitle || nextTitle === targetNode.title) {
            handleFolderRenameCancel();
            return;
        }

        const nextTree = updateFolderTitleById(tree, editingFolderId, nextTitle);
        onTreeChange(nextTree);
        await Promise.resolve(onTreePersist(nextTree));
        handleFolderRenameCancel();
    };

    const handleCreateFolderClick = async () => {
        if ((activeTab !== 'prototype' && activeTab !== 'document' && activeTab !== 'assets') || isCreatingFolder) {
            return;
        }
        setIsCreatingFolder(true);
        try {
            const targetTab: SidebarTreeTab = activeTab === 'prototype'
                ? 'prototypes'
                : activeTab === 'assets'
                    ? 'themes'
                    : 'docs';
            const result = await onCreateFolder(targetTab);
            if (result?.createdFolderId) {
                setPendingRenameFolderId(result.createdFolderId);
            }
        } finally {
            setIsCreatingFolder(false);
        }
    };

    const handleItemRenameSubmit = async () => {
        if (!editingItemId) {
            return;
        }
        const targetNode = findNodeById(tree, editingItemId);
        if (!targetNode || !targetNode.itemKey) {
            handleItemRenameCancel();
            return;
        }
        const item = resolveSidebarTreeItem(dataTab, targetNode, itemLookup);
        if (!item) {
            handleItemRenameCancel();
            return;
        }
        const nextTitle = editingItemTitle.trim().slice(0, SIDEBAR_TITLE_MAX_LENGTH);
        const currentTitle = item.displayName || item.name;
        if (!nextTitle || nextTitle === currentTitle) {
            handleItemRenameCancel();
            return;
        }
        await Promise.resolve(handleRenameItem(item, nextTitle));
        handleItemRenameCancel();
    };

    const getDropPlacement = (
        targetNode: SidebarTreeNode,
        container: HTMLDivElement,
        clientY: number,
    ): DropPlacement => {
        const rect = container.getBoundingClientRect();
        const relativeY = clientY - rect.top;
        if (targetNode.kind === 'folder') {
            if (relativeY < rect.height * 0.3) return 'before';
            if (relativeY > rect.height * 0.7) return 'after';
            return 'inside';
        }
        return relativeY < rect.height / 2 ? 'before' : 'after';
    };

    const handleDropOnNode = async (targetNode: SidebarTreeNode, placement: DropPlacement) => {
        if (!draggingNodeId || draggingNodeId === targetNode.id) {
            return;
        }

        const workingTree = cloneTree(tree);
        const draggedNode = removeNodeById(workingTree, draggingNodeId);
        if (!draggedNode) {
            return;
        }

        if (draggedNode.kind === 'folder' && nodeContainsId(draggedNode, targetNode.id)) {
            return;
        }

        const latestTargetNode = findNodeById(workingTree, targetNode.id);
        if (!latestTargetNode) {
            workingTree.push(draggedNode);
            onTreeChange(workingTree);
            await Promise.resolve(onTreePersist(workingTree));
            return;
        }

        let inserted = false;
        if (placement === 'inside' && latestTargetNode.kind === 'folder') {
            inserted = insertNodeToFolder(workingTree, latestTargetNode.id, draggedNode);
        } else if (placement === 'before') {
            inserted = insertNodeBefore(workingTree, latestTargetNode.id, draggedNode);
        } else {
            inserted = insertNodeAfter(workingTree, latestTargetNode.id, draggedNode);
        }

        if (!inserted) {
            workingTree.push(draggedNode);
        }

        onTreeChange(workingTree);
        await Promise.resolve(onTreePersist(workingTree));
    };

    const handleDropToRootEnd = async () => {
        if (!draggingNodeId) {
            return;
        }
        const workingTree = cloneTree(tree);
        const draggedNode = removeNodeById(workingTree, draggingNodeId);
        if (!draggedNode) {
            return;
        }
        workingTree.push(draggedNode);
        onTreeChange(workingTree);
        await Promise.resolve(onTreePersist(workingTree));
    };

    const handleDeleteFolder = async (folderId: string) => {
        const next = dataTab === 'docs'
            ? removeFolderById(tree, folderId)
            : removeFolderByIdAndLiftChildren(tree, folderId);
        if (!next.removed) {
            return;
        }
        onTreeChange(next.nextTree);
        await Promise.resolve(onTreePersist(next.nextTree));
    };

    const handleOpenResourceInSystem = async (resourcePath?: string, kind?: 'file' | 'folder') => {
        const normalizedPath = String(resourcePath || '').trim();
        if ((dataTab !== 'docs' && dataTab !== 'themes') || !normalizedPath) {
            toast.warning('当前资源没有可打开的本地路径');
            return;
        }
        try {
            await sidebarApi.openResourceInSystem(
                normalizedPath,
                requireProjectScope(activeProjectId),
                dataTab === 'themes' ? 'themes' : 'docs',
                kind,
            );
            toast.success('已打开所在目录');
        } catch (error: any) {
            toast.error(error?.message || '打开本地文件系统失败');
        }
    };

    const renderItemActions = (item: ItemData, itemNodeId: string, node?: SidebarTreeNode) => {
        const isDocItem = dataTab === 'docs';
        const isThemeItem = dataTab === 'themes';
        const isResourceTreeItem = dataTab === 'docs' || dataTab === 'themes';
        const isPrototypeItem = dataTab === 'prototypes';
        const isDefaultDesign = isThemeItem && defaultThemeName === item.name;
        const showOpenResourceDirectoryAction = dataTab === 'docs';
        const prototypeLocalBasePath = isPrototypeItem ? getPrototypeLocalBasePath(item) : '';
        const showLocalPathActions = isPrototypeItem ? Boolean(prototypeLocalBasePath) : hasExplicitLocalPath(item);
        const localShareUrl = buildItemUrl(item, 'demo')?.toString() || '';
        const lanShareUrl = buildLANItemUrl(item, 'demo');
        const lanTokenKey = `${activeProjectId || ''}:${item.name}:demo`;
        const lanTokenUrl = lanTokenUrls[lanTokenKey] || '';
        const hasShareUrl = Boolean(localShareUrl);
        const showPrototypeAccessLinks = isPrototypeItem && item.previewDisabled !== true && hasShareUrl;
        const showLANShareGroup = Boolean(lanShareUrl);
        const canDownloadPrototypeZip = isPrototypeItem && showLocalPathActions && Boolean(handleDownloadItemSource);
        const canDownloadDesignZip = isThemeItem && showLocalPathActions && Boolean(handleDownloadThemeZip);
        const canUseLocalFileOperation = !isPrototypeItem || showLocalPathActions;
        const canRenameItem = canUseLocalFileOperation;
        const canDuplicateItem = isDocItem
            ? resourceWriteCapabilities.docCreate
            : isPrototypeItem
                ? resourceWriteCapabilities.prototypeCreate && showLocalPathActions
                : true;
        const canDeleteItem = canUseLocalFileOperation;
        const showVersionAction = showLocalPathActions && !isDocItem;
        const stopRowActivation = (event: { stopPropagation: () => void }) => {
            event.stopPropagation();
        };
        const openShareUrl = (url: string) => {
            if (!url) {
                toast.warning('当前没有可访问的链接');
                return;
            }
            window.open(url, '_blank', 'noopener,noreferrer');
        };
        const copyShareUrl = (url: string, label: string) => {
            if (!url) {
                toast.warning('当前没有可访问的链接');
                return;
            }
            void navigator.clipboard.writeText(url).then(() => {
                toast.success(`${label}已复制`);
            }).catch(() => {
                toast.error('复制失败');
            });
        };
        const resolveLanShareUrl = async () => {
            if (lanTokenUrl) {
                return lanTokenUrl;
            }
            if (!lanShareUrl) {
                toast.warning('当前没有可访问的局域网链接');
                return '';
            }
            setLanTokenLoadingKey(lanTokenKey);
            try {
                const result = await apiService.createLanAccessShareUrl(lanShareUrl);
                setLanTokenUrls((previous) => ({ ...previous, [lanTokenKey]: result.url }));
                return result.url;
            } catch (error: any) {
                if (error?.code === 'LAN_PASSWORD_NOT_SET') {
                    toast.warning('请先在设置中设置局域网访问密码');
                    onSettingsClick('project');
                } else {
                    toast.error(error?.message || '生成局域网链接失败');
                }
                return '';
            } finally {
                setLanTokenLoadingKey((current) => (current === lanTokenKey ? null : current));
            }
        };
        const copyLanShareUrl = async () => {
            const url = await resolveLanShareUrl();
            if (!url) return;
            try {
                await navigator.clipboard.writeText(url);
                toast.success('局域网链接已复制');
            } catch {
                toast.error('复制失败');
            }
        };
        const openLanShareUrl = async () => {
            const url = await resolveLanShareUrl();
            if (url) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        };
        return (
            <>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="more-btn h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                            onPointerDown={stopRowActivation}
                            onClick={stopRowActivation}
                            onKeyDown={stopRowActivation}
                        >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                            <span className="sr-only">更多操作</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        side="right"
                        align="start"
                        className="w-48 text-sm"
                        onPointerDown={stopRowActivation}
                        onClick={stopRowActivation}
                        onKeyDown={stopRowActivation}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                {canRenameItem ? (
                    <DropdownMenuItem onClick={() => startItemRename(itemNodeId, node?.title || item.displayName || item.name)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        重命名
                    </DropdownMenuItem>
                ) : null}
                {canDuplicateItem ? (
                    <DropdownMenuItem onClick={() => handleDuplicateItem(item)}>
                        <Copy className="mr-2 h-4 w-4" />
                        创建副本
                    </DropdownMenuItem>
                ) : null}
                {showLocalPathActions ? (
                    <DropdownMenuItem onClick={() => handleCopyItemPath(item)}>
                        <LinkIcon className="mr-2 h-4 w-4" />
                        复制路径
                    </DropdownMenuItem>
                ) : null}
                {showOpenResourceDirectoryAction ? (
                    <DropdownMenuItem onClick={() => void handleOpenResourceInSystem(node?.path || item.name)}>
                        <FolderOpen className="mr-2 h-4 w-4" />
                        打开所在目录
                    </DropdownMenuItem>
                ) : null}
                {isThemeItem && onSetDefaultTheme ? (
                    <DropdownMenuItem onClick={() => void Promise.resolve(onSetDefaultTheme(item.name))}>
                        <Check className="mr-2 h-4 w-4" />
                        {isDefaultDesign ? '取消默认设计' : '设为默认设计'}
                    </DropdownMenuItem>
                ) : null}
                {canDownloadDesignZip ? (
                    <DropdownMenuItem onClick={() => void Promise.resolve(handleDownloadThemeZip?.(item as ThemeResourceItem))}>
                        <Download className="mr-2 h-4 w-4" />
                        导出 ZIP
                    </DropdownMenuItem>
                ) : null}
                {canDownloadPrototypeZip ? (
                    <DropdownMenuItem onClick={() => void Promise.resolve(handleDownloadItemSource(item))}>
                        <Download className="mr-2 h-4 w-4" />
                        下载 ZIP
                    </DropdownMenuItem>
                ) : null}
                {showVersionAction ? (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleVersionManagement(item)}>
                            <History className="mr-2 h-4 w-4" />
                            版本和协作
                        </DropdownMenuItem>
                    </>
                ) : null}
                {showPrototypeAccessLinks ? (
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="gap-2">
                            <Globe className="mr-2 h-4 w-4" />
                            访问链接
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-64 p-1.5">
                            <DropdownMenuLabel className="px-2 py-1 text-[11px] font-normal text-muted-foreground">
                                本地链接
                            </DropdownMenuLabel>
                            <DropdownMenuItem disabled={!hasShareUrl} onClick={() => copyShareUrl(localShareUrl, '本地链接')}>
                                <Copy className="mr-2 h-4 w-4" />
                                复制本地链接
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!hasShareUrl} onClick={() => openShareUrl(localShareUrl)}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                新窗口打开本地链接
                            </DropdownMenuItem>
                            {showLANShareGroup ? (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="px-2 py-1 text-[11px] font-normal text-muted-foreground">
                                        局域网链接
                                    </DropdownMenuLabel>
                                    <DropdownMenuItem disabled={lanTokenLoadingKey === lanTokenKey} onClick={() => void copyLanShareUrl()}>
                                        <Copy className="mr-2 h-4 w-4" />
                                        复制局域网链接
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled={lanTokenLoadingKey === lanTokenKey} onClick={() => void openLanShareUrl()}>
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        新窗口打开局域网链接
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <div
                                        className="flex flex-col items-center gap-2 px-2 py-2"
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        <span className="text-[11px] text-muted-foreground">二维码</span>
                                        {lanTokenUrl ? (
                                            <div className="rounded-md border bg-background p-2">
                                                <QRCode value={lanTokenUrl} size={132} bordered={false} />
                                            </div>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-7 gap-1.5"
                                                disabled={lanTokenLoadingKey === lanTokenKey}
                                                onClick={() => void resolveLanShareUrl()}
                                            >
                                                {lanTokenLoadingKey === lanTokenKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                                生成二维码
                                            </Button>
                                        )}
                                    </div>
                                </>
                            ) : null}
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                ) : null}
                {canDeleteItem ? (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => handleDeleteItem(item)}
                            className="text-destructive focus:text-destructive"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            删除
                        </DropdownMenuItem>
                    </>
                ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            </>
        );
    };

    const renderFolderActions = (folder: SidebarTreeNode) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="more-btn h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    <span className="sr-only">文件夹操作</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-40 text-sm">
                <DropdownMenuItem onClick={() => startFolderRename(folder.id, folder.title)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    重命名
                </DropdownMenuItem>
                {dataTab === 'docs' || dataTab === 'themes' ? (
                    <DropdownMenuItem onClick={() => void handleOpenResourceInSystem(folder.folderPath || folder.path, 'folder')}>
                        <FolderOpen className="mr-2 h-4 w-4" />
                        打开所在目录
                    </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                    onClick={() => void handleDeleteFolder(folder.id)}
                    className="text-destructive focus:text-destructive"
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );

    const renderPrototypePageRow = (item: ItemData, page: PrototypePageItem, depth: number) => (
        <SidebarRow
            key={`prototype-page:${item.name}:${page.id}`}
            title={page.title}
            icon={<File className="h-3.5 w-3.5" />}
            actions={null}
            selected={selectedItem?.name === item.name && selectedPrototypePageId === page.id}
            selectedVariant="subtle"
            paddingLeft={`${8 + depth * 8}px`}
            className="cursor-pointer text-muted-foreground"
            draggable={true}
            onClick={() => {
                void Promise.resolve(onPrototypePageSelect(item, page.id));
            }}
            onDragStart={(event) => {
                const resourceId = item.resourceId || item.name;
                const displayName = resolvePrototypePageEmbedDisplayName(item, page.title);
                event.dataTransfer.effectAllowed = 'copy';
                event.dataTransfer.setData('text/plain', `${item.name}:${page.id}`);
                try {
                    event.dataTransfer.setData(ASSISTANT_CONTEXT_DRAG_MIME, JSON.stringify(buildAssistantContextDragPayload({
                        source: 'sidebar',
                        resourceType: 'prototype-page',
                        resourceId,
                        items: buildAssistantContextItemsFromResource({
                            resourceType: 'prototype-page',
                            resourceId,
                            pageId: page.id,
                            name: item.name,
                            displayName,
                            filePath: item.filePath,
                            absoluteFilePath: item.absoluteFilePath,
                        }),
                    })));
                } catch {
                    // Older browsers may reject custom MIME types.
                }
            }}
        />
    );

    const renderPrototypePageRows = (item: ItemData, depth: number) => {
        const pages = getPrototypePageMatches(item);
        if (dataTab !== 'prototypes' || pages.length === 0) {
            return null;
        }
        const segments = item.name === selectedPrototypeId
            ? selectedPrototypePageSegments
            : buildPrototypePageSegments(item.name, pages);
        const expandedKeys = expandedPrototypePageGroups.prototypeId === item.name
            ? expandedPrototypePageGroups.keys
            : new Set<string>();

        return segments.map((segment) => {
            if (segment.kind === 'page') {
                return renderPrototypePageRow(item, segment.page, depth);
            }
            const expanded = expandedKeys.has(segment.key);
            return (
                <React.Fragment key={segment.key}>
                    <SidebarRow
                        title={segment.title}
                        icon={expanded
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                        actions={null}
                        ariaExpanded={expanded}
                        paddingLeft={`${8 + depth * 8}px`}
                        className="cursor-pointer text-muted-foreground"
                        titleClassName="font-medium"
                        onClick={() => togglePrototypePageGroup(item.name, segment.key)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                togglePrototypePageGroup(item.name, segment.key);
                            }
                        }}
                    />
                    {expanded
                        ? segment.pages.map((page) => renderPrototypePageRow(item, page, depth + 1))
                        : null}
                </React.Fragment>
            );
        });
    };

    const renderTreeNodes = (nodes: SidebarTreeNode[], depth = 0): React.ReactNode => {
        const canManageItems = true;
        return nodes.map((node) => {
            const isFolder = node.kind === 'folder';
            const isExpanded = expandedFolderIds.has(node.id);
            const item = node.kind === 'item' && node.itemKey ? resolveSidebarTreeItem(dataTab, node, itemLookup) : null;
            const isSelected = Boolean(item && selectedItem?.name === item.name);
            const isFolderSelected =
                isFolder
                && canSelectFolders
                && Boolean(selectedFolder)
                && (selectedFolder?.id === node.id || selectedFolder?.path === (node.folderPath || node.path));
            const title = getNodeTitle(node);
            const isEditingThisFolder = isFolder && editingFolderId === node.id;
            const isEditingThisItem = !isFolder && editingItemId === node.id;
            const isEditingThisNode = isEditingThisFolder || isEditingThisItem;
            const isEditingThisRow = isEditingThisNode;
            const rowPaddingLeft = `${8 + depth * 8}px`;
            const isDefaultDesignItem = !isFolder && dataTab === 'themes' && item?.name === defaultThemeName;
            const suffixElement = isDefaultDesignItem ? (
                <span
                    data-default-design-badge
                    className="rounded-sm border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary"
                >
                    默认
                </span>
            ) : null;

            let iconElement: React.ReactNode;
            if (isFolder) {
                iconElement = (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="h-4 w-4 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleFolder(node.id);
                        }}
                    >
                        {isExpanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                    </Button>
                );
            } else if (dataTab === 'prototypes') {
                iconElement = <PanelsTopLeft className="h-3.5 w-3.5" />;
            } else {
                iconElement = <File className="h-3.5 w-3.5" />;
            }

            let actionsElement: React.ReactNode = null;
            if (isFolder) {
                actionsElement = renderFolderActions(node);
            } else if (item && canManageItems) {
                actionsElement = renderItemActions(item, node.id, node);
            }

            return (
                <div key={node.id} className="relative">
                        <SidebarRow
                            title={title}
                            icon={iconElement}
                            suffix={suffixElement}
                            actions={actionsElement}
                            selected={isFolderSelected || isSelected}
                        editable={isEditingThisRow}
                        editingValue={isEditingThisFolder ? editingFolderTitle : editingItemTitle}
                        inputRef={folderInputRef}
                        paddingLeft={rowPaddingLeft}
                        className={cn(
                            isFolder ? 'cursor-default' : 'cursor-pointer',
                            dropTarget?.id === node.id && dropTarget.placement === 'inside' && 'bg-primary/10 text-foreground',
                        )}
                        draggable={!isEditingThisRow}
                        beforeIndicator={dropTarget?.id === node.id && dropTarget.placement === 'before'}
                        afterIndicator={dropTarget?.id === node.id && dropTarget.placement === 'after'}
                        onEditingValueChange={(value) => {
                            if (isEditingThisItem) {
                                setEditingItemTitle(value);
                            } else if (isEditingThisFolder) {
                                setEditingFolderTitle(value);
                            } else {
                                setEditingItemTitle(value);
                            }
                        }}
                        onClick={() => {
                            if (isEditingThisRow) {
                                return;
                            }
                            if (isFolder) {
                                if (canSelectFolders) {
                                    if (dataTab === 'docs') {
                                        setDocumentPasteTargetFromFolder(node);
                                    }
                                    const isCollapsingFolder = isExpanded;
                                    toggleFolder(node.id);
                                    if (!isCollapsingFolder) {
                                        onFolderClick?.(node);
                                    }
                                } else {
                                    toggleFolder(node.id);
                                }
                                return;
                            }
                            if (item) {
                                onItemClick(item);
                            }
                        }}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (isFolder) {
                                startFolderRename(node.id, node.title);
                                return;
                            }
                            if (item && canManageItems) {
                                startItemRename(node.id, node.title || item.displayName || item.name);
                            }
                        }}
                        onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'copyMove';
                            e.dataTransfer.setData(SIDEBAR_TREE_DRAG_MIME, node.id);
                            e.dataTransfer.setData('text/plain', node.id);
                            if (!isFolder && item) {
                                const isDocItem = dataTab === 'docs';
                                const resourceId = (item as any).resourceId || item.name;
                                const assistantResourceType = isDocItem
                                    ? ([item.name, item.displayName, item.filePath, item.absoluteFilePath, item.specUrl, item.previewUrl]
                                        .some(matchesAssistantImageResourcePattern) ? 'image' : 'doc')
                                    : dataTab === 'themes'
                                        ? 'theme'
                                        : 'prototype';
                                try {
                                    e.dataTransfer.setData(ASSISTANT_CONTEXT_DRAG_MIME, JSON.stringify(buildAssistantContextDragPayload({
                                        source: 'sidebar',
                                        resourceType: assistantResourceType,
                                        resourceId,
                                        items: buildAssistantContextItemsFromResource({
                                            resourceType: assistantResourceType,
                                            resourceId,
                                            name: item.name,
                                            displayName: item.displayName || item.name,
                                            filePath: item.filePath,
                                            absoluteFilePath: item.absoluteFilePath,
                                        }),
                                    })));
                                } catch { /* older browsers may reject custom MIME */ }
                            }
                            setDraggingNodeId(node.id);
                        }}
                        onDragEnd={() => {
                            setDraggingNodeId(null);
                            setDropTarget(null);
                        }}
                        onFocus={() => {
                            if (dataTab === 'docs' && isFolder) {
                                setDocumentPasteTargetFromFolder(node);
                            }
                        }}
                        onDragOver={(e) => {
                            if (!draggingNodeId) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const placement = getDropPlacement(node, e.currentTarget, e.clientY);
                            setDropTarget((previous) => {
                                if (previous?.id === node.id && previous.placement === placement) {
                                    return previous;
                                }
                                return { id: node.id, placement };
                            });
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const placement = getDropPlacement(node, e.currentTarget, e.clientY);
                            setDropTarget(null);
                            void handleDropOnNode(node, placement);
                        }}
                        onEditClick={(e) => e.stopPropagation()}
                        onEditBlur={() => {
                            if (skipNextFolderBlurRef.current) {
                                skipNextFolderBlurRef.current = false;
                                return;
                            }
                            if (isEditingThisFolder) {
                                void handleFolderRenameSubmit();
                            } else {
                                void handleItemRenameSubmit();
                            }
                        }}
                        onEditKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (isEditingThisFolder) {
                                    void handleFolderRenameSubmit();
                                } else {
                                    void handleItemRenameSubmit();
                                }
                                return;
                            }
                            if (e.key === 'Escape') {
                                e.preventDefault();
                                skipNextFolderBlurRef.current = true;
                                if (isEditingThisFolder) {
                                    handleFolderRenameCancel();
                                } else {
                                    handleItemRenameCancel();
                                }
                            }
                        }}
                    />

                    {isFolder && isExpanded && (node.children?.length || 0) > 0
                        ? renderTreeNodes(node.children || [], depth + 1)
                        : null}
                    {!isFolder && item && isSelected ? renderPrototypePageRows(item, depth + 1) : null}
                </div>
            );
        });
    };

    const renderTreeContent = () => {
        if (loading) {
            return <div className="py-8 text-center text-[12px] text-muted-foreground">加载中...</div>;
        }
        if (displayTree.length === 0) {
            if (dataTab === 'themes' && !searchText.trim()) {
                return (
                    <div className="px-4 py-8 text-center text-[12px] leading-5 text-muted-foreground">
                        暂无内容，创建设计规范，统一原型的视觉与文案风格
                    </div>
                );
            }
            if (dataTab === 'docs' && !searchText.trim()) {
                return (
                    <div
                        data-document-paste-focus-surface
                        className="px-4 py-8 text-center text-[12px] leading-5 text-muted-foreground"
                        tabIndex={0}
                        onFocus={handleDocumentPanelRootFocus}
                        onMouseDown={(event) => {
                            if (shouldUseDocumentRootPasteTarget(event.target)) {
                                event.currentTarget.focus();
                                handleDocumentPanelRootFocus();
                            }
                        }}
                    >
                        <span className="mx-auto block max-w-[240px]">
                            暂无内容，拖拽或上传文件到此处，可以作为原型生成的上下文
                        </span>
                    </div>
                );
            }
            return <div className="py-8 text-center text-[12px] text-muted-foreground">暂无内容</div>;
        }
        return (
            <div
                data-document-paste-focus-surface
                className="space-y-0.5 w-full min-w-0"
                onMouseDown={(event) => {
                    if (dataTab === 'docs' && shouldUseDocumentRootPasteTarget(event.target)) {
                        documentPanelRootRef.current?.focus();
                        handleDocumentPanelRootFocus();
                    }
                }}
                onDragOver={(e) => {
                    if (!draggingNodeId) return;
                    if (e.target !== e.currentTarget) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDropTarget(null);
                }}
                onDrop={(e) => {
                    if (!draggingNodeId) return;
                    if (e.target !== e.currentTarget) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDropTarget(null);
                    void handleDropToRootEnd();
                }}
            >
                {renderTreeNodes(displayTree)}
            </div>
        );
    };

    return (
        <>
        <div className="flex flex-col h-full min-h-0 flex-1 bg-background text-[12px]">
            <div className="border-b border-border">
                <div className="flex items-center justify-between p-2">
                    <TooltipProvider>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="relative h-7 w-7 shrink-0">
                                    <Menu className="h-4 w-4" />
                                    {makeClientUpdateReminderVisible ? (
                                        <span aria-label="有项目更新" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive" />
                                    ) : null}
                                    <span className="sr-only">更多</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="text-sm min-w-[132px]">
                                <DropdownMenuItem className="relative h-7 gap-2 text-sm" onSelect={handleSettingsMenuSelect}>
                                    <Settings className="h-3.5 w-3.5" />
                                    设置
                                    {makeClientUpdateReminderVisible ? (
                                        <span aria-label="有项目更新" className="ml-auto h-1.5 w-1.5 rounded-full bg-destructive" />
                                    ) : null}
                                </DropdownMenuItem>
                                <DropdownMenuItem className="h-7 gap-2 text-sm" onSelect={handleVersionCollaborationMenuSelect}>
                                    <GitBranch className="h-3.5 w-3.5" />
                                    版本和协作
                                </DropdownMenuItem>
                                <DropdownMenuItem className="h-7 gap-2 text-sm" onClick={onToggleTheme}>
                                    {isDarkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                                    {isDarkMode ? '浅色模式' : '深色模式'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    className="h-7 gap-2 text-sm"
                                    onClick={() => window.open('https://axhub.im/', '_blank', 'noopener,noreferrer')}
                                >
                                    <Globe className="h-3.5 w-3.5" />
                                    Axhub 官网
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="h-7 gap-2 text-sm"
                                    onClick={() => window.open('https://github.com/lintendo/Axhub-Make', '_blank', 'noopener,noreferrer')}
                                >
                                    <Github className="h-3.5 w-3.5" />
                                    GitHub
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="h-7 gap-2 text-sm opacity-80 pointer-events-none">
                                    <Info className="h-3.5 w-3.5" />
                                    <span className="flex w-full items-center justify-between gap-2">
                                        <span>Axhub Make</span>
                                        <span className="text-muted-foreground">{makeVersion ? `v${makeVersion}` : '-'}</span>
                                    </span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TooltipProvider>

                    {externalOpenMenu ? (
                        <div className="flex items-center gap-1">
                            <OpenInDropdown
                            handleOpenProjectInIDE={handleOpenProjectInIDE}
                            preferredIDE={preferredIDE}
                            activeProjectId={activeProjectId}
                            targetProjectId={openInTargetProjectId || undefined}
                            targetPath={openInTargetPath || undefined}
                            ideAvailability={ideAvailability}
                            agentAvailability={agentAvailability}
                            onOpenAcpWebAgent={onOpenAcpWebAgent}
                            onOpenImageAiPanel={onOpenImageAiPanel}
                            onOpenWebAgentInPanel={onOpenWebAgentInPanel}
                            webAgentPanelOpen={webAgentPanelOpen}
                            aiPanelMode={aiPanelMode}
                            onCloseAiPanel={onCloseAiPanel}
                            onCloseWebAgentPanel={onCloseWebAgentPanel}
                            onPreferredIDEChange={onPreferredIDEChange}
                            onOpenAISettings={onOpenAISettings}
                            />
                        </div>
                    ) : null}
                </div>

                <div className="px-2 pb-2">
                    {isEditingTitle ? (
                        <div className="h-6 flex items-center px-1 rounded text-[14px] leading-none font-semibold">
                            <input
                                ref={titleInputRef}
                                value={tempTitle}
                                onChange={(e) => setTempTitle(e.target.value)}
                                onBlur={() => void handleTitleSubmit()}
                                onKeyDown={(e) => void handleTitleKeyDown(e)}
                                className="ax-inline-rename-input ax-inline-rename-input-title h-full"
                            />
                        </div>
                    ) : (
                        <div className="flex h-7 min-w-0 items-center">
                            <button
                                type="button"
                                className="flex h-7 min-w-0 max-w-full items-center overflow-hidden rounded-md text-left text-[14px] font-semibold leading-none hover:bg-muted/50"
                                onDoubleClick={() => setIsEditingTitle(true)}
                                title="双击编辑标题"
                            >
                                <span className="min-w-0 truncate px-1 leading-none">{projectTitle || UNTITLED_PROJECT_LABEL}</span>
                            </button>
                            <DropdownMenu open={projectSwitcherMenuOpen} onOpenChange={setProjectSwitcherMenuOpen}>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="ml-0.5 h-7 w-7 shrink-0 rounded-md"
                                        aria-label="切换项目"
                                    >
                                        <ChevronDown className="h-3.5 w-3.5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-[360px] p-1 text-sm">
                                    <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">项目列表</div>
                                    <div className="max-h-[280px] overflow-y-auto">
                                        {projects.length > 0 ? projects.map((project) => {
                                            const active = project.id === activeProjectId;
                                            const switching = project.id === switchingProjectId;
                                            const deleting = project.id === deletingProjectId;
                                            const stopping = project.id === stoppingProjectId;
                                            const running = project.runtimeStatus?.running === true;
                                            const displayRoot = formatProjectRootDisplayPath(project.root);
                                            return (
                                                <DropdownMenuItem
                                                    key={project.id}
                                                    className={cn(
                                                        'group/project-item flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left',
                                                        active && 'bg-accent text-accent-foreground',
                                                    )}
                                                    disabled={Boolean(switchingProjectId || deletingProjectId || stoppingProjectId)}
                                                    onSelect={(event) => {
                                                        event.preventDefault();
                                                        void handleProjectSwitch(project.id);
                                                    }}
                                                >
                                                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                        <span className="flex max-w-full min-w-0 items-center gap-1.5">
                                                            <span className="min-w-0 truncate text-[13px] font-medium">{project.name || UNTITLED_PROJECT_LABEL}</span>
                                                            {running ? (
                                                                <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-emerald-700">
                                                                    运行中
                                                                </span>
                                                            ) : null}
                                                        </span>
                                                        <span className="max-w-full truncate text-[11px] text-muted-foreground" title={project.root}>{displayRoot}</span>
                                                    </span>
                                                    {running ? (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 shrink-0 opacity-0 group-hover/project-item:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                                                            aria-label={`终止 ${project.name || UNTITLED_PROJECT_LABEL}`}
                                                            disabled={Boolean(switchingProjectId || deletingProjectId || stoppingProjectId)}
                                                            onClick={(event) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                                void handleProjectStop(project.id);
                                                            }}
                                                        >
                                                            {stopping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                                                        </Button>
                                                    ) : null}
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 shrink-0 opacity-0 group-hover/project-item:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                                                        aria-label={`从列表移除 ${project.name || UNTITLED_PROJECT_LABEL}`}
                                                        disabled={Boolean(switchingProjectId || deletingProjectId || stoppingProjectId)}
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            void handleProjectDelete(project.id);
                                                        }}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                    {switching ? (
                                                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                                                    ) : deleting ? (
                                                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                                                    ) : null}
                                                </DropdownMenuItem>
                                            );
                                        }) : (
                                            <div className="flex h-20 items-center justify-center text-[12px] text-muted-foreground">
                                                暂无项目
                                            </div>
                                        )}
                                    </div>
                                    {!projectSetupRequired ? (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                className="h-8 gap-2 text-sm"
                                                disabled={Boolean(switchingProjectId || deletingProjectId || stoppingProjectId)}
                                                onSelect={(event) => {
                                                    event.preventDefault();
                                                    setProjectSetupInitialMode('menu');
                                                    setProjectSwitcherMenuOpen(false);
                                                    setProjectSetupOpen(true);
                                                }}
                                            >
                                                <FolderPlus className="h-3.5 w-3.5" />
                                                新建原型项目
                                            </DropdownMenuItem>
                                        </>
                                    ) : null}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                </div>

                <div className="px-2 pb-2">
                    <ToggleGroup
                        type="single"
                        value={activeTab}
                        onValueChange={(v) => v && onTabChange(v as SidebarTab)}
                        className="w-auto justify-start p-0 gap-1"
                    >
                        <ToggleGroupItem
                            value="prototype"
                            className="h-6 w-auto min-w-[36px] px-2 text-[11px] leading-none whitespace-nowrap rounded-sm bg-transparent hover:bg-muted/50 data-[state=off]:!text-muted-foreground/60 data-[state=off]:hover:!text-muted-foreground data-[state=on]:bg-accent data-[state=on]:!text-foreground data-[state=on]:!font-medium"
                        >
                            原型
                        </ToggleGroupItem>
                        <ToggleGroupItem
                            value="document"
                            className="h-6 w-auto min-w-[36px] px-2 text-[11px] leading-none whitespace-nowrap rounded-sm bg-transparent hover:bg-muted/50 data-[state=off]:!text-muted-foreground/60 data-[state=off]:hover:!text-muted-foreground data-[state=on]:bg-accent data-[state=on]:!text-foreground data-[state=on]:!font-medium"
                        >
                            资源
                        </ToggleGroupItem>
                        <ToggleGroupItem
                            value="assets"
                            className="h-6 w-auto min-w-[36px] px-2 text-[11px] leading-none whitespace-nowrap rounded-sm bg-transparent hover:bg-muted/50 data-[state=off]:!text-muted-foreground/60 data-[state=off]:hover:!text-muted-foreground data-[state=on]:bg-accent data-[state=on]:!text-foreground data-[state=on]:!font-medium"
                        >
                            设计
                        </ToggleGroupItem>
                    </ToggleGroup>
                </div>

                <div className="flex items-center gap-1 px-2 pb-2">
                    <div className={cn('relative flex items-center transition-all duration-300', isSearchExpanded ? 'flex-1' : 'w-auto')}>
                        {isSearchExpanded ? (
                            <Input
                                ref={searchInputRef}
                                value={searchText}
                                onChange={(e) => onSearch(e.target.value)}
                                placeholder="搜索..."
                                className="h-7 text-[12px] pr-7"
                                onBlur={() => !searchText && setIsSearchExpanded(false)}
                            />
                        ) : (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleSearch}>
                                            <Search className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>搜索</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                        {isSearchExpanded && (
                            <Search className="absolute right-2 h-3 w-3 text-muted-foreground pointer-events-none" />
                        )}
                    </div>

                    {!isSearchExpanded && activeTab === 'prototype' ? (
                        <>
                            <div className="flex-1" />
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={onCreateFile}
                                            disabled={!promptCreateEnabled}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>新建原型</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => void handleCreateFolderClick()}
                                            disabled={isCreatingFolder}
                                        >
                                            <FolderPlus className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>新建文件夹</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </>
                    ) : null}

                    {!isSearchExpanded && activeTab === 'document' ? (
                        <>
                            <div className="flex-1" />
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={onCreateResourceStart}
                                            aria-label="新建资源"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>新建资源</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => void handleCreateFolderClick()}
                                            disabled={isCreatingFolder}
                                        >
                                            <FolderPlus className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>新建文件夹</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </>
                    ) : null}

                    {!isSearchExpanded && activeTab === 'assets' ? (
                        <>
                            <div className="flex-1" />
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={onCreateThemeStart}
                                            aria-label="新建设计"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>新建设计</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => void handleCreateFolderClick()}
                                            disabled={isCreatingFolder}
                                        >
                                            <FolderPlus className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>新建文件夹</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </>
                    ) : null}

                </div>
            </div>

            <div
                    data-document-paste-focus-surface
                    ref={documentPanelRootRef}
                    className="relative flex-1 min-h-0"
                    tabIndex={activeTab === 'document' ? 0 : -1}
                    onFocus={(event) => {
                        if (activeTab !== 'document') return;
                        if (event.target === event.currentTarget) {
                            handleDocumentPanelRootFocus();
                        }
                    }}
                    onMouseDown={(event) => {
                        if (activeTab !== 'document') return;
                        if (shouldUseDocumentRootPasteTarget(event.target)) {
                            event.currentTarget.focus();
                            handleDocumentPanelRootFocus();
                        }
                    }}
                    onDragEnter={(event) => {
                        if (activeTab !== 'document') return;
                        if (isSidebarTreeDragEvent(event)) return;
                        event.preventDefault();
                        fileDropCounterRef.current += 1;
                        setIsFileDropActive(true);
                    }}
                    onDragOver={(event) => {
                        if (activeTab !== 'document') return;
                        if (isSidebarTreeDragEvent(event)) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'copy';
                    }}
                    onDragLeave={(event) => {
                        if (activeTab !== 'document') return;
                        if (isSidebarTreeDragEvent(event)) return;
                        event.preventDefault();
                        fileDropCounterRef.current -= 1;
                        if (fileDropCounterRef.current <= 0) {
                            fileDropCounterRef.current = 0;
                            setIsFileDropActive(false);
                        }
                    }}
                    onDrop={(event) => {
                        if (activeTab !== 'document') return;
                        if (isSidebarTreeDragEvent(event)) return;
                        event.preventDefault();
                        fileDropCounterRef.current = 0;
                        setIsFileDropActive(false);
                        const files = event.dataTransfer?.files;
                        if (files && files.length > 0) {
                            void uploadResourceFiles(files, { targetFolder: documentPasteTargetFolder });
                        }
                    }}
                >
                    <ScrollArea className="h-full p-2 [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!w-full [&_[data-radix-scroll-area-viewport]>div]:!min-w-0">
                        {renderTreeContent()}
                    </ScrollArea>
                    {isFileDropActive && activeTab === 'document' ? (
                        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-md border-2 border-dashed border-primary/50 bg-primary/5 backdrop-blur-[1px] pointer-events-none">
                            <div className="flex flex-col items-center gap-2 text-primary">
                                <Upload className="h-8 w-8 opacity-60" />
                                <span className="text-xs font-medium">释放以上传资源</span>
                            </div>
                        </div>
                    ) : null}
                    {isUploadingFiles ? (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
                            <span className="text-xs text-muted-foreground">上传中...</span>
                        </div>
                    ) : null}
                </div>
        </div>
        <ProjectSetupDialog
            open={projectSetupOpen}
            initialMode={projectSetupInitialMode}
            dismissDisabled={projectSetupRequired}
            hasActiveProject={Boolean(activeProjectId)}
            addingProject={isAddingProject}
            creatingBlankProject={isCreatingBlankProject}
            cloningProject={isCloningProject}
            copyingProject={isCopyingProject}
            onOpenChange={(open) => {
                if (projectSetupRequired && !open) {
                    return;
                }
                if (!open) {
                    setProjectSetupInitialMode('menu');
                }
                setProjectSetupOpen(open);
            }}
            onSetupComplete={() => {
                onTabChange('prototype');
                setProjectSetupInitialMode('menu');
                setProjectSetupOpen(false);
                setProjectSwitcherMenuOpen(false);
            }}
            onAddProject={handleAddProject}
            onCreateBlankProject={handleCreateBlankMakeProject}
            onCloneProject={handleCloneMakeProject}
            onCopyProject={handleCopyMakeProject}
            assistantOpen={webAgentPanelOpen === true && aiPanelMode === 'general-ai'}
            onExecutePrompt={onExecutePrompt}
        />
        </>
    );
}
