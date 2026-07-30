import React, { useCallback, useState } from 'react';
import {
    Antigravity,
    ClaudeCode,
    Codex,
    Cursor,
    Microsoft,
    OpenAI,
    OpenCode,
    Trae,
    Windsurf,
} from '@lobehub/icons';
import { Check, ChevronDown, ChevronRight, CircleHelp, ImageIcon, Loader2, MoreHorizontal, Settings, Sparkles, SquareTerminal } from 'lucide-react';
import qoderIconUrl from '../../assets/brand-icons/qoder.svg?url';
import {
    getVisibleIDEOptions,
    IDEAvailabilityMap,
    MAIN_IDE_OPTIONS,
    MainIDE,
    MainIDEPreference,
    resolveVisibleIDEPreference,
    parseOpenMethod,
    serializeOpenMethod,
    type OpenMethod,
} from '../../../common/ide';
import {
    CLI_AGENT_OPTIONS,
    LOCAL_APP_AGENT_APP_NAMES,
    LOCAL_APP_AGENT_OPTIONS,
    type CLIAgent,
    type LocalAppAgent,
    type RuntimeAgentAvailability,
    type WebAgent,
} from '../../../common/agent';
import { formatLocalAppOpenFailureMessage } from '../../../common/localAppOpenMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { apiService } from '../../services/api';
import { requireProjectScope } from '../../services/projectScope';
import { cn } from '@/lib/utils';
import type { AcpProvider } from '@/common/assistant-context/types';

interface OpenInDropdownProps {
    handleOpenProjectInIDE: (ideOverride?: MainIDEPreference, targetPath?: string, projectId?: string) => boolean | Promise<boolean>;
    preferredIDE: MainIDEPreference;
    activeProjectId?: string | null;
    targetProjectId?: string | null;
    targetPath?: string | null;
    ideAvailability?: IDEAvailabilityMap;
    agentAvailability?: RuntimeAgentAvailability;
    onOpenAcpWebAgent?: (targetPath?: string, provider?: AcpProvider) => void | Promise<void>;
    onOpenWebAgentInPanel?: (url: string) => boolean | void | Promise<boolean | void>;
    webAgentPanelOpen?: boolean;
    aiPanelMode?: 'general-ai' | 'image-ai' | null;
    onOpenImageAiPanel?: () => void | Promise<void>;
    onCloseAiPanel?: () => void;
    onCloseWebAgentPanel?: () => void;
    onPreferredIDEChange?: (ide: MainIDEPreference) => void;
    onOpenAISettings?: () => void;
    variant?: 'compact' | 'placeholder-card' | 'inline-app-list' | 'toolbar' | 'canvas-icon';
    className?: string;
    cardTitle?: string;
    cardDescription?: string;
    cardIcon?: React.ReactNode;
}

const LOCAL_APP_GROUP_HELP = [
    {
        title: '本地应用',
        items: ['ChatGPT', 'OpenCode', 'Cursor', 'TRAE', 'VS Code', 'TRAE CN', 'Windsurf', 'Qoder', 'Antigravity'],
    },
    {
        title: '本地 CLI',
        items: ['Codex', 'Claude Code', 'OpenCode'],
    },
] as const;
const WEB_AGENT_GROUP_HELP = '打开浏览器内置的 Web AI 面板。';
const MAX_INLINE_LOCAL_APP_OPEN_OPTIONS = 5;
const LOCAL_APP_MORE_THRESHOLD = 5;

type GroupHelp = string | typeof LOCAL_APP_GROUP_HELP;

type LocalAppOpenOption =
    | { kind: 'local-app'; option: (typeof LOCAL_APP_AGENT_OPTIONS)[number] }
    | { kind: 'ide'; option: (typeof MAIN_IDE_OPTIONS)[number] };

const WEB_AI_OPEN_OPTION = {
    label: '对话 AI',
    webAgent: 'acp' as const,
};

const IMAGE_AI_OPEN_OPTION = {
    label: '生图 AI',
};

const resolveStoredWebOpenMethod = (method: OpenMethod) => {
    if (method.type !== 'web') {
        return null;
    }
    if (method.value === 'acp') {
        return { agent: 'acp' as const };
    }
    if (method.value === 'claude' || method.value === 'codex' || method.value === 'opencode') {
        return { agent: 'acp' as const, provider: method.value as AcpProvider };
    }
    return null;
};

export default function OpenInDropdown({
    handleOpenProjectInIDE,
    preferredIDE,
    activeProjectId,
    targetProjectId,
    targetPath,
    ideAvailability,
    onOpenAcpWebAgent,
    webAgentPanelOpen,
    aiPanelMode,
    onOpenImageAiPanel,
    onCloseAiPanel,
    onCloseWebAgentPanel,
    onPreferredIDEChange,
    onOpenAISettings,
    variant = 'compact',
    className,
    cardTitle = '打开 AI',
    cardDescription = '',
    cardIcon,
}: OpenInDropdownProps) {
    const [openLoading, setOpenLoading] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [openHelpDialogOpen, setOpenHelpDialogOpen] = useState(false);

    const handleDropdownOpenChange = useCallback((open: boolean) => {
        setDropdownOpen(open);
    }, []);

    const visibleIDEOptions = getVisibleIDEOptions(ideAvailability);
    const activeOpenIDE = resolveVisibleIDEPreference(preferredIDE, ideAvailability) || visibleIDEOptions[0].value;
    const localAppOpenOptions = [
        ...LOCAL_APP_AGENT_OPTIONS.map((option) => ({ kind: 'local-app' as const, option })),
        ...MAIN_IDE_OPTIONS.map((option) => ({ kind: 'ide' as const, option })),
    ] satisfies LocalAppOpenOption[];
    const shouldCollapseLocalAppOpenOptions = localAppOpenOptions.length > LOCAL_APP_MORE_THRESHOLD;
    const inlineLocalAppOpenOptions = shouldCollapseLocalAppOpenOptions
        ? localAppOpenOptions.slice(0, MAX_INLINE_LOCAL_APP_OPEN_OPTIONS)
        : localAppOpenOptions;
    const overflowLocalAppOpenOptions = shouldCollapseLocalAppOpenOptions
        ? localAppOpenOptions.slice(MAX_INLINE_LOCAL_APP_OPEN_OPTIONS)
        : [];
    const projectId = targetProjectId?.trim() || activeProjectId?.trim() || '';
    const openTargetPath = targetPath?.trim() || undefined;

    // Resolve the current open method from preferredIDE (which may contain `web:opencode` etc.)
    const openMethod: OpenMethod = parseOpenMethod(preferredIDE) || { type: 'ide', value: activeOpenIDE };
    const buttonActive = Boolean(webAgentPanelOpen);
    const activeAiPanelMode = aiPanelMode !== undefined
        ? aiPanelMode
        : buttonActive ? 'general-ai' : null;
    const shouldUpdateDefaultOpenMethod = !buttonActive;
    const storedWebOpenMethod = resolveStoredWebOpenMethod(openMethod);
    const displayOpenMethod = buttonActive && !storedWebOpenMethod
        ? { type: 'web' as const, value: 'acp' }
        : openMethod;

    const getIDEIcon = (ide: MainIDE) => {
        if (ide === 'cursor') return <Cursor size={14} />;
        if (ide === 'trae' || ide === 'trae_cn') return <Trae.Color size={14} />;
        if (ide === 'windsurf') return <Windsurf size={14} />;
        if (ide === 'vscode') return <Microsoft.Color size={14} />;
        if (ide === 'antigravity') return <Antigravity.Color size={14} />;
        if (ide === 'qoder') return <img src={qoderIconUrl} alt="" aria-hidden width={14} height={14} />;
        return <SquareTerminal className="h-3.5 w-3.5" />;
    };

    const getCLIAgentIcon = (agent: CLIAgent) => {
        if (agent === 'codex') return <Codex.Color size={14} />;
        if (agent === 'claudecode') return <ClaudeCode.Color size={14} />;
        if (agent === 'opencode') return <OpenCode size={14} />;
        return <SquareTerminal className="h-3.5 w-3.5" />;
    };

    const getLocalAppIcon = (agent: LocalAppAgent) => {
        if (agent === 'codex') return <OpenAI size={14} />;
        if (agent === 'opencode') return <OpenCode size={14} />;
        return <SquareTerminal className="h-3.5 w-3.5" />;
    };

    const getWebAgentIcon = (agent: WebAgent) => {
        if (agent === 'opencode') return <OpenCode size={14} />;
        if (agent === 'acp') return <Sparkles className="h-3.5 w-3.5" />;
        return <SquareTerminal className="h-3.5 w-3.5" />;
    };

    /** Get icon for the current open method (shown on the main button). */
    const getOpenMethodIcon = (method: OpenMethod) => {
        if (method.type === 'ide') return getIDEIcon(method.value as MainIDE);
        if (method.type === 'local-app') return getLocalAppIcon(method.value as LocalAppAgent);
        if (method.type === 'cli') return getCLIAgentIcon(method.value as CLIAgent);
        if (method.type === 'web') return getWebAgentIcon(method.value as WebAgent);
        return <SquareTerminal className="h-3.5 w-3.5" />;
    };

    const savePreference = async (method: OpenMethod) => {
        const serialized = serializeOpenMethod(method);
        await apiService.saveServerPreferences({
            automation: {
                defaultIDE: serialized as any,
            },
        }, requireProjectScope(projectId));
        onPreferredIDEChange?.(serialized as any);
    };

    const handleOpenWithIDE = async (ide: MainIDE) => {
        if (openLoading) return;
        setOpenLoading(true);

        if (shouldUpdateDefaultOpenMethod) {
            void savePreference({ type: 'ide', value: ide }).catch(() => {});
        }

        try {
            await Promise.resolve(handleOpenProjectInIDE(ide, openTargetPath, projectId));
        } finally {
            setOpenLoading(false);
        }
    };

    const handleOpenWithCLIAgent = async (agent: CLIAgent) => {
        if (openLoading) return;
        setOpenLoading(true);

        if (shouldUpdateDefaultOpenMethod) {
            void savePreference({ type: 'cli', value: agent }).catch(() => {});
        }

        try {
            await apiService.openCLIAgent({ agent, projectId, targetPath: openTargetPath });
            toast.success('已打开 CLI 终端');
        } catch (error: any) {
            toast.warning(error?.message || '打开 CLI Agent 失败');
        } finally {
            setOpenLoading(false);
        }
    };

    const handleOpenWithLocalApp = async (agent: LocalAppAgent) => {
        if (openLoading) return;
        setOpenLoading(true);

        if (shouldUpdateDefaultOpenMethod) {
            void savePreference({ type: 'local-app', value: agent }).catch(() => {});
        }

        try {
            const result = await apiService.openLocalAppAgent({ agent, projectId, targetPath: openTargetPath });
            if (result?.openInBrowser && result.url && typeof window !== 'undefined') {
                window.location.href = result.url;
            }
            toast.success('已在本地应用中打开');
        } catch {
            toast.warning(formatLocalAppOpenFailureMessage(LOCAL_APP_AGENT_APP_NAMES[agent]));
        } finally {
            setOpenLoading(false);
        }
    };

    const handleGuideToAISettings = useCallback(() => {
        onOpenAISettings?.();
        toast.warning('请先在 AI 设置中选择本地 AI Agent');
    }, [onOpenAISettings]);

    const handleUnavailableWebAgent = useCallback(() => {
        toast.warning('当前页面请直接使用页面中的 AI 输入框');
    }, []);

    const handleOpenWithWebAgent = async (agent: WebAgent, provider?: AcpProvider) => {
        if (openLoading) return;

        if (agent === 'acp' && onOpenAcpWebAgent) {
            void savePreference({ type: 'web', value: provider || agent }).catch(() => {});
            setOpenLoading(true);
            try {
                await Promise.resolve(onOpenAcpWebAgent(openTargetPath, provider));
            } finally {
                setOpenLoading(false);
            }
            return;
        }

        handleUnavailableWebAgent();
    };

    const handleOpenWithImageAi = useCallback(async () => {
        if (openLoading) return;
        if (!onOpenImageAiPanel) {
            toast.warning('打开生图 AI 失败');
            return;
        }

        setOpenLoading(true);
        try {
            await Promise.resolve(onOpenImageAiPanel?.());
        } finally {
            setOpenLoading(false);
        }
    }, [onOpenImageAiPanel, openLoading]);

    const handleOpenAISettings = useCallback(() => {
        onOpenAISettings?.();
    }, [onOpenAISettings]);

    /** Main button click handler — Web Agent toggles panel, others fire-and-forget. */
    const handleOpenDefault = () => {
        if (buttonActive) {
            onCloseAiPanel?.();
            if (!onCloseAiPanel) {
                onCloseWebAgentPanel?.();
            }
            return;
        }

        if (openMethod.type === 'web') {
            if (!storedWebOpenMethod) {
                handleGuideToAISettings();
                return;
            }
            void handleOpenWithWebAgent(storedWebOpenMethod.agent, storedWebOpenMethod.provider);
            return;
        }
        if (openMethod.type === 'cli') {
            void handleOpenWithCLIAgent(openMethod.value as CLIAgent);
            return;
        }
        if (openMethod.type === 'local-app') {
            void handleOpenWithLocalApp(openMethod.value as LocalAppAgent);
            return;
        }
        void handleOpenWithIDE(activeOpenIDE as MainIDE);
    };

    const renderGroupHelp = (help: GroupHelp) => {
        if (typeof help === 'string') {
            return help;
        }

        return (
            <div className="space-y-1">
                {help.map((section) => (
                    <div key={section.title}>
                        <div className="font-medium">{section.title}</div>
                        <div>{section.items.join('、')}</div>
                    </div>
                ))}
            </div>
        );
    };

    const renderGroupLabel = (label: string, help: GroupHelp) => (
        <div className="flex items-center gap-1.5 px-2 pb-1 pt-2 first:pt-1 text-[11px] font-medium leading-4 text-muted-foreground">
            <span>{label}</span>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground/80 hover:text-foreground">
                        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10} className="z-[3000] w-72 max-w-none whitespace-normal leading-5">
                    {renderGroupHelp(help)}
                </TooltipContent>
            </Tooltip>
        </div>
    );

    const renderEditorOption = (option: (typeof MAIN_IDE_OPTIONS)[number]) => (
        <DropdownMenuItem
            key={option.value}
            onClick={() => void handleOpenWithIDE(option.value as MainIDE)}
            className="h-8 gap-2 px-2 text-[13px]"
        >
            <span className="flex h-4 w-4 items-center justify-center text-foreground">{getIDEIcon(option.value as MainIDE)}</span>
            {option.label}
        </DropdownMenuItem>
    );

    const renderLocalAppOption = (option: (typeof LOCAL_APP_AGENT_OPTIONS)[number]) => (
        <DropdownMenuItem
            key={option.value}
            onClick={() => void handleOpenWithLocalApp(option.value)}
            className="h-8 gap-2 px-2 text-[13px]"
        >
            <span className="flex h-4 w-4 items-center justify-center text-foreground">{getLocalAppIcon(option.value)}</span>
            {option.label}
        </DropdownMenuItem>
    );

    const renderLocalAppOpenOption = (item: LocalAppOpenOption) => (
        item.kind === 'local-app'
            ? renderLocalAppOption(item.option)
            : renderEditorOption(item.option)
    );

    const renderCLIAgentOption = (option: (typeof CLI_AGENT_OPTIONS)[number]) => (
        <DropdownMenuItem
            key={option.value}
            onClick={() => void handleOpenWithCLIAgent(option.value)}
            className="h-8 gap-2 px-2 text-[13px]"
        >
            <span className="flex h-4 w-4 items-center justify-center text-foreground">{getCLIAgentIcon(option.value)}</span>
            {option.label}
        </DropdownMenuItem>
    );

    const renderCLIAgentSubmenu = () => (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger className="h-8 gap-2 px-2 text-[13px]">
                <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                    <SquareTerminal className="h-3.5 w-3.5" />
                </span>
                本地 CLI
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="z-[3000] w-56 p-1.5">
                {CLI_AGENT_OPTIONS.map(renderCLIAgentOption)}
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    );

    const renderAgentGroup = (
        label: string,
        help: GroupHelp,
        children: React.ReactNode,
        showSeparator = true,
    ) => (
        <>
            {showSeparator ? <DropdownMenuSeparator className="-mx-1 my-1.5" /> : null}
            <div>
                {renderGroupLabel(label, help)}
                <div className="space-y-0.5">
                    {children}
                </div>
            </div>
        </>
    );

    const showExpanded = !openLoading && (hovered || buttonActive || dropdownOpen);
    const toolbarButtonClassName = cn(
        "h-8 rounded-md px-3 gap-1.5 text-[12px] font-medium [&_svg]:h-4 [&_svg]:w-4",
        buttonActive
            ? "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:text-secondary-foreground"
            : "text-foreground hover:text-foreground",
    );
    const renderOpenHelpDialog = () => (
        <Dialog open={openHelpDialogOpen} onOpenChange={setOpenHelpDialogOpen}>
            <DialogContent className="w-[min(92vw,460px)] max-w-[460px] overflow-hidden rounded-[20px] border-border bg-card p-0 text-sm shadow-md">
                <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
                    <DialogHeader className="space-y-2 text-left">
                        <DialogTitle className="text-[18px] font-semibold leading-6 tracking-tight">
                            手动打开 AI 应用
                        </DialogTitle>
                        <DialogDescription className="text-[13px] leading-5 text-muted-foreground">
                            如果 Web 无法直接唤起应用，请在应用内选择当前 Make 项目目录。
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mt-5 grid gap-2">
                        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2.5">
                            <div className="text-[13px] font-medium text-foreground">方法一：新建对话</div>
                            <div className="mt-1 text-[12px] leading-5 text-muted-foreground">选择工作空间，并指向当前项目目录。</div>
                        </div>
                        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2.5">
                            <div className="text-[13px] font-medium text-foreground">方法二：新建项目</div>
                            <div className="mt-1 text-[12px] leading-5 text-muted-foreground">选择当前 Make 项目目录作为项目根目录。</div>
                        </div>
                    </div>

                    <p className="mt-4 text-[12px] leading-5 text-muted-foreground">
                        适用于 WorkBuddy、TRAE WORK 等未在列表中显示或打开失败的应用。
                    </p>

                    <DialogFooter className="mt-5 flex flex-row justify-end gap-2 sm:space-x-0">
                        <Button type="button" size="sm" className="h-8" onClick={() => setOpenHelpDialogOpen(false)}>
                            知道了
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );

    const closeAiPanel = useCallback(() => {
        onCloseAiPanel?.();
        if (!onCloseAiPanel) {
            onCloseWebAgentPanel?.();
        }
    }, [onCloseAiPanel, onCloseWebAgentPanel]);

    const generalAiMenuActive = activeAiPanelMode === 'general-ai';
    const imageAiMenuActive = activeAiPanelMode === 'image-ai';
    const webAiMenuActive = generalAiMenuActive;
    const handleToggleWebAiMenu = useCallback(() => {
        if (webAiMenuActive) {
            closeAiPanel();
            return;
        }

        void handleOpenWithWebAgent(WEB_AI_OPEN_OPTION.webAgent);
    }, [closeAiPanel, handleOpenWithWebAgent, webAiMenuActive]);

    const handleToggleImageAiMenu = useCallback(() => {
        if (imageAiMenuActive) {
            closeAiPanel();
            return;
        }

        void handleOpenWithImageAi();
    }, [closeAiPanel, handleOpenWithImageAi, imageAiMenuActive]);
    const menuContent = (
        <DropdownMenuContent
            side={variant === 'toolbar' || variant === 'canvas-icon' ? 'bottom' : 'right'}
            align={variant === 'toolbar' || variant === 'canvas-icon' ? 'end' : 'start'}
            className="w-64 p-1.5"
        >
            {renderAgentGroup('在线打开', WEB_AGENT_GROUP_HELP, (
                <>
                    <DropdownMenuItem
                        onClick={handleToggleWebAiMenu}
                        aria-checked={webAiMenuActive}
                        className={cn(
                            "h-8 gap-2 px-2 text-[13px]",
                            webAiMenuActive && 'bg-secondary text-secondary-foreground',
                        )}
                    >
                        <span
                            className={cn(
                                "flex h-4 w-4 items-center justify-center",
                                webAiMenuActive ? "text-secondary-foreground" : "text-foreground",
                            )}
                        >
                            {webAiMenuActive ? <Check className="h-3.5 w-3.5" /> : getWebAgentIcon(WEB_AI_OPEN_OPTION.webAgent)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{WEB_AI_OPEN_OPTION.label}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={handleToggleImageAiMenu}
                        aria-checked={imageAiMenuActive}
                        className={cn(
                            "h-8 gap-2 px-2 text-[13px]",
                            imageAiMenuActive && 'bg-secondary text-secondary-foreground',
                        )}
                    >
                        <span
                            className={cn(
                                "flex h-4 w-4 items-center justify-center",
                                imageAiMenuActive ? "text-secondary-foreground" : "text-foreground",
                            )}
                        >
                            {imageAiMenuActive ? <Check className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{IMAGE_AI_OPEN_OPTION.label}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={handleOpenAISettings}
                        className="h-8 gap-2 px-2 text-[13px]"
                    >
                        <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                            <Settings className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">设置</span>
                    </DropdownMenuItem>
                </>
            ), false)}
            {renderAgentGroup('在本地应用中打开', LOCAL_APP_GROUP_HELP, (
                <>
                    {inlineLocalAppOpenOptions.map(renderLocalAppOpenOption)}
                    {overflowLocalAppOpenOptions.length > 0 ? (
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="h-8 gap-2 px-2 text-[13px]">
                                <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                </span>
                                更多
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="z-[3000] w-56 p-1.5">
                                {overflowLocalAppOpenOptions.map(renderLocalAppOpenOption)}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    ) : null}
                    {renderCLIAgentSubmenu()}
                </>
            ))}
            <DropdownMenuSeparator className="-mx-1 my-1.5" />
            <DropdownMenuItem
                onClick={() => setOpenHelpDialogOpen(true)}
                className="h-8 gap-2 px-2 text-[13px] text-muted-foreground"
            >
                <CircleHelp className="h-3.5 w-3.5" />
                无法打开？
            </DropdownMenuItem>
        </DropdownMenuContent>
    );

    if (variant === 'canvas-icon') {
        return (
            <>
                <TooltipProvider>
                    <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownOpenChange}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    'axhub-canvas-ai-menu-button h-8 w-8 rounded-none border-0 text-foreground/75 hover:bg-transparent hover:text-foreground data-[active=true]:text-primary data-[active=true]:hover:text-primary [&_svg]:h-4 [&_svg]:w-4',
                                    className,
                                )}
                                aria-label={buttonActive ? 'AI 已打开' : '打开 AI'}
                                title={buttonActive ? 'AI 已打开' : '打开 AI'}
                                data-active={generalAiMenuActive || imageAiMenuActive ? 'true' : undefined}
                                disabled={openLoading}
                            >
                                {openLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            </Button>
                        </DropdownMenuTrigger>
                        {menuContent}
                    </DropdownMenu>
                </TooltipProvider>
                {renderOpenHelpDialog()}
            </>
        );
    }

    if (variant === 'toolbar') {
        return (
            <>
                <TooltipProvider>
                    <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownOpenChange}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={cn(toolbarButtonClassName, className)}
                                data-active={buttonActive ? 'true' : undefined}
                                disabled={openLoading}
                            >
                                {openLoading ? <Loader2 className="animate-spin" /> : <Sparkles />}
                                <span>{buttonActive ? '已打开' : '打开 AI'}</span>
                                <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        {menuContent}
                    </DropdownMenu>
                </TooltipProvider>
                {renderOpenHelpDialog()}
            </>
        );
    }

    if (variant === 'inline-app-list') {
        return (
            <>
                <TooltipProvider>
                    <div className={cn('flex w-full flex-col items-center gap-3 text-center', className)}>
                        <div className="text-[12px] font-medium text-slate-500">在应用中新建：</div>
                        <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
                            {localAppOpenOptions.map((item) => (
                                <button
                                    key={`${item.kind}-${item.option.value}`}
                                    type="button"
                                    className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={openLoading}
                                    onClick={() => {
                                        if (item.kind === 'ide') {
                                            void handleOpenWithIDE(item.option.value as MainIDE);
                                            return;
                                        }
                                        void handleOpenWithLocalApp(item.option.value);
                                    }}
                                >
                                    <span className="flex h-3.5 w-3.5 items-center justify-center text-slate-500">
                                        {item.kind === 'ide'
                                            ? getIDEIcon(item.option.value as MainIDE)
                                            : getLocalAppIcon(item.option.value)}
                                    </span>
                                    <span className="whitespace-nowrap">{item.option.label}</span>
                                </button>
                            ))}
                            <button
                                type="button"
                                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                                onClick={() => setOpenHelpDialogOpen(true)}
                            >
                                <span className="flex h-3.5 w-3.5 items-center justify-center text-slate-500">
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                </span>
                                <span className="whitespace-nowrap">更多</span>
                            </button>
                        </div>
                    </div>
                </TooltipProvider>
                {renderOpenHelpDialog()}
            </>
        );
    }

    if (variant === 'placeholder-card') {
        if (buttonActive) {
            return null;
        }

        return (
            <>
                <TooltipProvider>
                    <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownOpenChange}>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className={cn(
                                    'placeholder-guide-card placeholder-guide-card-action placeholder-guide-ai-card',
                                    'flex min-h-[78px] w-full items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50',
                                    className,
                                )}
                                disabled={openLoading}
                            >
                                <span className="min-w-0">
                                    <span className="placeholder-guide-card-title block text-[13px] font-medium text-slate-950">
                                        <span className="inline-flex items-center gap-2">
                                            {cardIcon ? <span className="text-slate-500">{cardIcon}</span> : null}
                                            <span>{cardTitle}</span>
                                        </span>
                                    </span>
                                    {cardDescription ? (
                                        <span className="placeholder-guide-card-description mt-1 block text-[12px] leading-5 text-slate-600">
                                            {cardDescription}
                                        </span>
                                    ) : null}
                                </span>
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                    {openLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                                </span>
                            </button>
                        </DropdownMenuTrigger>
                        {menuContent}
                    </DropdownMenu>
                </TooltipProvider>
                {renderOpenHelpDialog()}
            </>
        );
    }

    return (
        <>
            <TooltipProvider>
                <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownOpenChange}>
                    <div
                        className={cn(
                            'inline-flex items-center h-6 shrink-0 rounded-md overflow-hidden transition-all duration-200',
                            buttonActive ? 'min-w-[104px] w-auto' : openLoading ? 'w-[92px]' : showExpanded ? 'w-[82px]' : 'w-[68px]',
                            buttonActive
                                ? 'border border-primary/45 bg-background shadow-none'
                                : 'border border-border/50 bg-background hover:border-border',
                        )}
                        onMouseEnter={() => setHovered(true)}
                        onMouseLeave={() => setHovered(false)}
                    >
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={cn(
                                'gap-1.5 h-6 leading-none rounded-none border-0 shadow-none text-[12px] font-normal transition-colors duration-150 flex-1 min-w-0 data-[active=true]:text-primary data-[active=true]:hover:bg-primary/5 data-[active=true]:hover:text-primary',
                                openLoading ? 'px-3' : 'px-2',
                                buttonActive
                                    ? 'text-primary hover:bg-primary/5 hover:text-primary'
                                    : 'text-foreground/80 hover:text-foreground',
                            )}
                            data-active={buttonActive ? 'true' : undefined}
                            onClick={handleOpenDefault}
                            disabled={openLoading}
                        >
                            {openLoading
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : showExpanded
                                    ? <span className="flex items-center justify-center">{getOpenMethodIcon(displayOpenMethod)}</span>
                                    : null
                            }
                            <span className="whitespace-nowrap">{buttonActive ? '已打开' : showExpanded ? '打开' : '打开 AI'}</span>
                        </Button>
                        {showExpanded ? (
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                        'h-6 w-5 rounded-none border-0 border-l transition-colors duration-150',
                                          buttonActive
                                              ? 'border-primary/25 text-primary/70 hover:bg-primary/5 hover:text-primary'
                                              : 'border-border/40 text-foreground/60 hover:text-foreground/80',
                                    )}
                                    disabled={openLoading}
                                    aria-label="打开菜单"
                                >
                                    <ChevronDown className="h-2.5 w-2.5" />
                                </Button>
                            </DropdownMenuTrigger>
                        ) : null}
                    </div>
                    {menuContent}
                </DropdownMenu>
            </TooltipProvider>
            {renderOpenHelpDialog()}
        </>
    );
}
