import React from 'react';
import { createPortal } from 'react-dom';
import { ItemData, ViewMode } from '../../types';
import type { DataTableResourceItem, ThemeResourceItem } from '../../domains/resources/resource.types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Columns2,
    ChevronDown,
    CircleX,
    Cloud,
    Code2,
    Copy,
    Download,
    FileText,
    HelpCircle,
    ImageIcon,
    Keyboard,
    LayoutGrid,
    List,
    ListChecks,
    MapPin,
    Monitor,
    PencilRuler,
    ScanSearch,
    RotateCw,
    Save,
    Send,
    Settings2,
    SlidersHorizontal,
    Square,
    SquarePen,
    Smartphone,
    Tablet,
    Trash2,
} from "lucide-react";
import { Segmented } from 'antd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';
import { MAIN_IDE_APP_NAMES, resolveVisibleIDEPreference } from '../../../common/ide';
import type { IDEAvailabilityMap, MainIDEPreference } from '../../../common/ide';
import type {
    CommentaryHostToolbarAction,
    CommentaryHostToolbarState,
} from '@axhub/commentary';
import { isDocumentCommentableResource, isHtmlCommentableResource, isMarkdownEditableResource } from '../../app/index-page.helpers';
import { hasExplicitLocalPath } from '../../utils/localPath';
import { SPEC_QUICK_EDIT_SEGMENT_OPTIONS, type SpecQuickEditMode } from '../../utils/specQuickEdit';
import type {
    MultiPageColumns,
    PreviewConfig,
    PreviewScaleMode,
    PreviewSinglePreset,
} from '../../domains/device/preview-layout';
import type { ConfigurableCloudPublishTarget, ExportAvailability, QuickEditRuntimeStatus, QuickEditSaveAction } from '../../types/index-page.types';
import type { CloudPublishTarget } from '../../services/api';
import ResponsiveSidebarTriggerButton from '../sidebar/ResponsiveSidebarTriggerButton';

function PreviewSplitIcon() {
    return (
        <span className="relative flex h-4 w-5 items-center justify-center">
            <Monitor className="h-3.5 w-3.5 translate-x-[-3px]" />
            <Smartphone className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2" />
        </span>
    );
}

function PreviewDeviceActionButton({
    active = false,
    icon,
    title,
    subtitle,
    trailing,
    onClick,
}: {
    active?: boolean;
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    trailing?: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClick();
                }
            }}
            className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent",
                active && "bg-accent text-accent-foreground",
            )}
        >
            <span className="shrink-0 text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-[12px] leading-5">{title}</span>
                {subtitle ? <span className="block text-[11px] leading-4 text-muted-foreground">{subtitle}</span> : null}
            </span>
            {trailing ? (
                <div className="flex shrink-0 items-center gap-1.5">
                    {trailing}
                </div>
            ) : null}
        </div>
    );
}

interface PresentationToolbarProps {
    showSidebarToggle?: boolean;
    collapsed: boolean;
    setCollapsed: (collapsed: boolean) => void;
    selectedItem: ItemData | null;
    viewMode: ViewMode;
    activeTab: 'prototypes';
    setViewMode: (mode: ViewMode) => void;
    selectedDeviceId: string;
    previewConfig: PreviewConfig;
    deviceSegmentOptions: Array<{ value: string; icon: React.ReactNode }>;
    handleSelectPreviewSinglePreset: (preset: PreviewSinglePreset) => void;
    handleSelectCustomPreview: () => void;
    handleActivateSplitPreview: () => void;
    handleActivateMultiPagePreview: (pageCount?: number) => void;
    handleChangeMultiPageColumns: (columns: MultiPageColumns) => void;
    handleChangeCustomPreviewWidth: (width: number) => void;
    handleChangeCustomPreviewHeight: (height: number) => void;
    handleChangeSplitPreviewWidth: (pane: 'primary' | 'secondary', width: number) => void;
    handleChangeSplitPreviewHeight: (pane: 'primary' | 'secondary', height: number) => void;
    handleChangePreviewScaleMode: (mode: PreviewScaleMode) => void;
    handleOpenWebEditor: () => void | Promise<void>;
    handleExitWebEditor: () => void;
    handleEnableDocEdit: (mode?: SpecQuickEditMode, options?: { disableSelectionMode?: boolean; preserveSidebar?: boolean }) => void;
    handleSaveDocEdit: () => void;
    handleExitDocEdit: () => void;
    handleSwitchDocQuickEditMode: (mode: SpecQuickEditMode) => void;
    drawioResourceEditAvailable?: boolean;
    handleOpenDrawioResourceEditor: () => void | Promise<void>;
    handleCopyMarkdownPrompt: () => void | Promise<void>;
    handleRefreshElement: () => void;
    handleCopyToFigma: () => void;
    handleCopyCurrentScreenshot: () => void | Promise<void>;
    handleExportMake: () => void;
    handleExportHtml: (options?: { includeSource?: boolean }) => void;
    handlePublishCloudTarget: (target: CloudPublishTarget) => void | Promise<void>;
    handleOpenCloudPublishSettings: (target?: ConfigurableCloudPublishTarget | 'publish-settings') => void;
    handleOpenAxhubPublishDialog: () => void | Promise<void>;
    currentPublishResourcePath?: string;
    visibleCloudPublishTargets?: CloudPublishTarget[];
    latestCloudPublishUrl: string;
    handleCopyLatestCloudPublishUrl: () => void | Promise<void>;
    setIsExportModalOpen: (open: boolean) => void;
    handleQuickCopyEditablePrototype: () => void;
    handleOpenAxureUsageGuide: () => void;
    handleOpenIdeFile: () => void | Promise<void>;
    handleOpenDocInIDE: () => void | Promise<void>;
    handleOpenPrototypeSpec: () => void | Promise<void>;
    handleOpenThemeInIDE: () => void | Promise<void>;
    handleOpenDataTableInIDE: () => void | Promise<void>;
    preferredIDE?: MainIDEPreference;
    ideAvailability?: IDEAvailabilityMap;
    quickEditAvailable: boolean;
    quickEditActive?: boolean;
    prototypeAnnotationSessionActive?: boolean;
    prototypeAnnotationEnabled?: boolean;
    prototypeAnnotationEnableLoading?: boolean;
    prototypeAnnotationPromptCopying?: boolean;
    handleOpenPrototypeAnnotationSession: () => void | Promise<void>;
    handleCheckPrototypeAnnotationEnabled: () => Promise<boolean | null>;
    handleEnablePrototypeAnnotation: () => Promise<boolean>;
    handleCopyPrototypeAnnotationPrompt: () => void | Promise<void>;
    docEditState?: {
        enabled: boolean;
        dirty: boolean;
        saving: boolean;
        quickEditMode: SpecQuickEditMode;
    };
    markdownPromptCopying?: boolean;
    quickEditRuntimeStatus?: QuickEditRuntimeStatus;
    exportAvailability?: ExportAvailability;
    hostToolbarState?: CommentaryHostToolbarState | null;
    prototypeDecisionDataAvailable?: boolean;
    handleRunHostToolbarAction?: (action: CommentaryHostToolbarAction) => void | Promise<boolean>;
    handleRunQuickEditSaveAction?: (action: QuickEditSaveAction) => void | Promise<boolean>;
    contentMode?: 'preview' | 'prototype-spec' | 'doc' | 'template' | 'canvas' | 'theme' | 'data';
    selectedDoc?: ItemData | null;
    selectedPrototypeSpec?: ItemData | null;
    prototypeSpecSupported?: boolean;
    prototypeSpecLoading?: boolean;
    selectedTemplate?: ItemData | null;
    selectedTheme?: ThemeResourceItem | null;
    selectedDataTable?: DataTableResourceItem | null;
    startServerError?: string;
    standalonePanelOpen?: boolean;
    onStandalonePanelToggle?: () => void;
    reviewPanelOpen?: boolean;
    onReviewPanelToggle?: () => void;
    onOpenAISettings?: () => void;
}

export default function PresentationToolbar({
    showSidebarToggle = true,
    collapsed,
    setCollapsed,
    selectedItem,
    viewMode,
    activeTab,
    selectedDeviceId,
    previewConfig,
    deviceSegmentOptions: _deviceSegmentOptions,
    handleSelectPreviewSinglePreset,
    handleSelectCustomPreview,
    handleActivateSplitPreview,
    handleActivateMultiPagePreview,
    handleChangeMultiPageColumns: _handleChangeMultiPageColumns,
    handleChangeCustomPreviewWidth,
    handleChangeCustomPreviewHeight,
    handleChangeSplitPreviewWidth: _handleChangeSplitPreviewWidth,
    handleChangeSplitPreviewHeight: _handleChangeSplitPreviewHeight,
    handleChangePreviewScaleMode,
    handleOpenWebEditor,
    handleExitWebEditor,
    handleEnableDocEdit,
    handleSaveDocEdit,
    handleExitDocEdit,
    handleSwitchDocQuickEditMode,
    drawioResourceEditAvailable = false,
    handleOpenDrawioResourceEditor,
    handleCopyMarkdownPrompt,
    handleRefreshElement,
    handleCopyToFigma,
    handleCopyCurrentScreenshot,
    handleExportMake,
    handleExportHtml,
    handlePublishCloudTarget,
    handleOpenCloudPublishSettings,
    handleOpenAxhubPublishDialog,
    currentPublishResourcePath = '',
    visibleCloudPublishTargets = ['axhub'],
    latestCloudPublishUrl,
    handleCopyLatestCloudPublishUrl,
    setIsExportModalOpen,
    handleQuickCopyEditablePrototype,
    handleOpenAxureUsageGuide,
    handleOpenIdeFile,
    handleOpenPrototypeSpec,
    handleOpenDataTableInIDE,
    preferredIDE = null,
    ideAvailability,
    quickEditAvailable,
    quickEditActive = false,
    prototypeAnnotationSessionActive = false,
    prototypeAnnotationEnabled = false,
    prototypeAnnotationEnableLoading = false,
    prototypeAnnotationPromptCopying = false,
    handleOpenPrototypeAnnotationSession,
    handleCheckPrototypeAnnotationEnabled,
    handleEnablePrototypeAnnotation,
    handleCopyPrototypeAnnotationPrompt: copyPrototypeAnnotationPrompt,
    docEditState = { enabled: false, dirty: false, saving: false, quickEditMode: 'comment' },
    markdownPromptCopying = false,
    quickEditRuntimeStatus = 'idle',
    exportAvailability,
    hostToolbarState = null,
    prototypeDecisionDataAvailable = false,
    handleRunHostToolbarAction,
    handleRunQuickEditSaveAction,
    contentMode = 'preview',
    selectedDoc = null,
    selectedPrototypeSpec = null,
    prototypeSpecSupported = false,
    prototypeSpecLoading = false,
    selectedTemplate = null,
    selectedTheme = null,
    selectedDataTable = null,
    standalonePanelOpen = false,
    onStandalonePanelToggle,
    reviewPanelOpen = false,
    onReviewPanelToggle,
    onOpenAISettings,
}: PresentationToolbarProps) {
    const canOpenGenericFigmaExport = exportAvailability?.canOpenGenericFigmaExport ?? Boolean(selectedItem);
    const canOpenSelectedSource = hasExplicitLocalPath(selectedItem);
    const canOpenDataSource = hasExplicitLocalPath(selectedDataTable);
    const figmaDomDisabledReason = exportAvailability?.figmaDomDisabledReason
        || (selectedItem && quickEditRuntimeStatus !== 'ready' ? '复制当前页面需要接入 /runtime/quick-edit.js' : '');
    const canOpenGenericAxureExport = exportAvailability?.canOpenGenericAxureExport ?? Boolean(selectedItem);
    const axureSourceDisabledReason = exportAvailability?.axureSourceDisabledReason || '';
    const htmlExportDisabledReason = exportAvailability?.htmlExportDisabledReason || '';
    const makeExportDisabledReason = exportAvailability?.makeExportDisabledReason || '';
    const hasCurrentPublishResource = Boolean(currentPublishResourcePath);
    const visibleCloudPublishTargetSet = new Set(visibleCloudPublishTargets);
    const currentMarkdownItem = contentMode === 'template'
        ? selectedTemplate
        : contentMode === 'prototype-spec'
            ? selectedPrototypeSpec
            : selectedDoc;
    const currentMarkdownLabel = contentMode === 'template' ? '模板' : contentMode === 'prototype-spec' ? '规格' : '文档';
    const edgeIconButtonClass =
        "p-0 inline-flex items-center justify-center text-sm [&_svg]:h-[18px] [&_svg]:w-[18px]";
    const toolbarTextButtonClass = "gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5";
    const toolbarPillButtonClass = "h-8 rounded-md px-3 gap-1.5 text-[12px] font-medium [&_svg]:h-4 [&_svg]:w-4";

    const isPreviewContent = contentMode === 'preview';
    const currentRuntimeExportResource = contentMode === 'theme' ? selectedTheme : selectedItem;
    const showMakeExportEntry = isPreviewContent && viewMode === 'demo'
        && Boolean(selectedItem);
    const showHtmlExportEntry = activeTab === 'prototypes'
        && Boolean(currentRuntimeExportResource)
        && (isPreviewContent || contentMode === 'theme')
        && !htmlExportDisabledReason;
    const showInteractiveAxureExportEntry = isPreviewContent && viewMode === 'demo'
        && Boolean(selectedItem);
    const showEditableAxureCopyEntry = Boolean(currentRuntimeExportResource);
    const showAxureUsageGuideEntry = showInteractiveAxureExportEntry;
    const isPrototypePreviewMode = isPreviewContent && viewMode === 'demo';
    const isCanvasViewMode = isPreviewContent && viewMode === 'canvas';
    void isPrototypePreviewMode;
    void isCanvasViewMode;
    const isDocumentEditingContent = contentMode === 'doc' || contentMode === 'template' || contentMode === 'prototype-spec';
    const isHtmlDocumentEditingContent = isDocumentEditingContent && isHtmlCommentableResource(currentMarkdownItem);
    const isReadOnlyHtmlPrototypeSpec = contentMode === 'prototype-spec'
        && isHtmlDocumentEditingContent;
    const isQuickEditActive = quickEditActive && (!isDocumentEditingContent || isHtmlDocumentEditingContent);
    const isDocumentEditActive = docEditState.enabled;
    const isDocumentCommentActive = isDocumentEditActive && docEditState.quickEditMode === 'comment';
    const isSplitQuickEditActive = isQuickEditActive && previewConfig.previewMode === 'split';
    const [annotationEnableDialogOpen, setAnnotationEnableDialogOpen] = React.useState(false);

    const quickEditSegmentLabelText = '批注/编辑';
    const documentModeSegmentedControl = (
        <Segmented
            size="small"
            value={docEditState.quickEditMode}
            options={SPEC_QUICK_EDIT_SEGMENT_OPTIONS}
            style={{ fontSize: 12 }}
            onChange={(value) => handleSwitchDocQuickEditMode(value as SpecQuickEditMode)}
        />
    );
    const canInlineCurrentDocumentEdit = isDocumentEditingContent
        ? isMarkdownEditableResource(currentMarkdownItem)
        : false;
    const documentEditActionButtons = docEditState.enabled ? (
        <>
            {canInlineCurrentDocumentEdit ? documentModeSegmentedControl : null}
            {canInlineCurrentDocumentEdit && docEditState.quickEditMode === 'edit' ? (
                <Button
                    variant="ghost"
                    size="xs"
                    className={toolbarTextButtonClass}
                    onClick={handleSaveDocEdit}
                    disabled={!docEditState.dirty || docEditState.saving}
                >
                    <Save /> 保存
                </Button>
            ) : null}
        </>
    ) : null;
    const documentEditTrailingActionButtons = docEditState.enabled ? (
        <>
            <Button
                variant="ghost"
                size="xs"
                className={toolbarTextButtonClass}
                onClick={handleRefreshElement}
            >
                <RotateCw /> 刷新
            </Button>
            <Button
                variant="ghost"
                size="xs"
                className={toolbarTextButtonClass}
                onClick={handleExitDocEdit}
                disabled={docEditState.saving}
            >
                <CircleX /> 退出
            </Button>
        </>
    ) : null;

    const quickEditDisabled = isDocumentEditingContent ? false : (viewMode === 'demo' ? !quickEditAvailable : contentMode === 'theme' ? !quickEditAvailable : true);
    const resolvedOpenIDE = resolveVisibleIDEPreference(preferredIDE, ideAvailability);
    const openInIdeName = resolvedOpenIDE ? MAIN_IDE_APP_NAMES[resolvedOpenIDE] : '';
    const openInIdeTooltip = openInIdeName ? `在 ${openInIdeName} 中打开` : '在编辑器中打开';
    const getOpenInIdeTooltip = (targetLabel: string) => openInIdeName ? `在 ${openInIdeName} 中打开${targetLabel}` : `在编辑器中打开${targetLabel}`;
    const quickEditTooltip = isDocumentEditingContent
        ? (isDocumentEditActive ? '退出文档编辑' : '编辑文档')
        : contentMode === 'theme'
        ? (
            isQuickEditActive
                ? '退出快速编辑'
                : !quickEditAvailable
                    ? '当前主题页面尚未接入 DevTemplateBootstrap'
                    : '批注和编辑原型'
        )
        : viewMode === 'demo'
        ? (
            isQuickEditActive
                ? '退出快速编辑'
                : quickEditRuntimeStatus === 'pending'
                    ? '正在连接批注编辑器'
                : quickEditRuntimeStatus !== 'ready'
                    ? '当前客户端页面尚未接入 /runtime/quick-edit.js'
                    : '批注和编辑原型'
        )
        : '快速编辑';
    const propertyPanelDisabled = quickEditDisabled;
    const propertyPanelTooltip = propertyPanelDisabled
        ? quickEditTooltip
        : (standalonePanelOpen ? '关闭设计决策' : '设计决策');
    const reviewPanelTooltip = reviewPanelOpen ? '关闭评审' : '评审';
    const showReviewPanelAction = isPreviewContent
        && viewMode === 'demo'
        && Boolean(selectedItem)
        && Boolean(onReviewPanelToggle)
        && !isQuickEditActive
        && !docEditState.enabled;
    const canShowPrototypeDecisionActions = !isPreviewContent || prototypeDecisionDataAvailable;
    const showStandalonePropertyPanelAction = contentMode !== 'theme'
        && Boolean(onStandalonePanelToggle)
        && canShowPrototypeDecisionActions
        && !isQuickEditActive
        && !docEditState.enabled;
    const showHostSelectionModeAction = !isDocumentCommentActive;
    const showHostPropertyPanelAction = contentMode !== 'theme' && !isDocumentCommentActive;
    const showHostPropertyPanelToolbarAction = showHostPropertyPanelAction && canShowPrototypeDecisionActions;
    const showHostPropertyPanelMenuAction = showHostPropertyPanelAction && !canShowPrototypeDecisionActions;

    const [hostActionMenuOpen, setHostActionMenuOpen] = React.useState(false);
    const hostActionMenuTriggerRef = React.useRef<HTMLButtonElement | null>(null);
    const hostMenuPortalRef = React.useRef<HTMLDivElement | null>(null);

    const closeHostMenus = React.useCallback(() => {
        setHostActionMenuOpen(false);
    }, []);

    React.useEffect(() => {
        if (!hostToolbarState?.visible) {
            closeHostMenus();
        }
    }, [closeHostMenus, hostToolbarState?.visible]);

    React.useEffect(() => {
        if (!hostActionMenuOpen) {
            return;
        }

        const handleDocumentMouseDown = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }
            if (hostMenuPortalRef.current?.contains(target)) {
                return;
            }
            if (hostActionMenuTriggerRef.current?.contains(target)) {
                return;
            }
            closeHostMenus();
        };
        const handleDocumentKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeHostMenus();
            }
        };

        document.addEventListener('mousedown', handleDocumentMouseDown);
        document.addEventListener('keydown', handleDocumentKeyDown);
        window.addEventListener('resize', closeHostMenus);
        window.addEventListener('scroll', closeHostMenus, true);
        return () => {
            document.removeEventListener('mousedown', handleDocumentMouseDown);
            document.removeEventListener('keydown', handleDocumentKeyDown);
            window.removeEventListener('resize', closeHostMenus);
            window.removeEventListener('scroll', closeHostMenus, true);
        };
    }, [closeHostMenus, hostActionMenuOpen]);

    const handleQuickEditClick = () => {
        if (isQuickEditActive) {
            handleExitWebEditor();
            return;
        }
        handleOpenWebEditor();
    };

    const handlePrototypeAnnotationClick = async () => {
        if (prototypeAnnotationSessionActive) {
            void handleExitWebEditor();
            return;
        }
        const enabled = prototypeAnnotationEnabled
            ? true
            : await handleCheckPrototypeAnnotationEnabled();
        if (enabled === true) {
            void handleOpenPrototypeAnnotationSession();
            return;
        }
        if (enabled === false) {
            setAnnotationEnableDialogOpen(true);
        }
    };

    const handleManualPrototypeAnnotationEnable = async () => {
        const enabled = await handleEnablePrototypeAnnotation();
        if (!enabled) return;
        setAnnotationEnableDialogOpen(false);
        await handleOpenPrototypeAnnotationSession();
    };

    const handleCopyPrototypeAnnotationPrompt = async () => {
        try {
            await copyPrototypeAnnotationPrompt();
        } finally {
            setAnnotationEnableDialogOpen(false);
        }
    };

    const handleDocumentEditClick = () => {
        if (isDocumentEditActive) {
            handleExitDocEdit();
            return;
        }
        handleEnableDocEdit('comment');
    };

    const runHostAction = (action: CommentaryHostToolbarAction) => {
        void handleRunHostToolbarAction?.(action);
    };
    const runQuickEditSaveAction = (action: QuickEditSaveAction) => {
        void handleRunQuickEditSaveAction?.(action);
    };
    const getHostMenuActionHandlers = (action: CommentaryHostToolbarAction) => ({
        onMouseDown: (event: React.MouseEvent<HTMLElement>) => {
            if (event.button !== 0 || event.ctrlKey) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            closeHostMenus();
            runHostAction(action);
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                closeHostMenus();
                runHostAction(action);
            }
        },
    });
    const getQuickEditSaveMenuActionHandlers = (action: QuickEditSaveAction) => ({
        onMouseDown: (event: React.MouseEvent<HTMLElement>) => {
            if (event.button !== 0 || event.ctrlKey) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            closeHostMenus();
            runQuickEditSaveAction(action);
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                closeHostMenus();
                runQuickEditSaveAction(action);
            }
        },
    });
    const handleOpenAISettingsFromHostMenu = React.useCallback(() => {
        closeHostMenus();
        onOpenAISettings?.();
    }, [closeHostMenus, onOpenAISettings]);
    const showHostExecutionControls = Boolean(
        hostToolbarState?.visible
        && (hostToolbarState.sendVisible || hostToolbarState.interruptVisible),
    );
    const selectionModeShortcutLabel = 'Ctrl / Cmd + S';
    const selectionModeTooltip = `切换（${selectionModeShortcutLabel}）`;
    const renderHostToolbarActionButton = (
        key: string,
        label: string,
        icon: React.ReactNode,
        action: CommentaryHostToolbarAction,
        options?: {
            disabled?: boolean;
            active?: boolean;
            visible?: boolean;
            loading?: boolean;
            tooltip?: string;
        },
    ) => {
        if (options?.visible === false) return null;
        const button = (
            <Button
                key={key}
                variant="ghost"
                size="xs"
                className={cn(
                    "gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5",
                    options?.active && 'bg-secondary text-secondary-foreground',
                )}
                disabled={options?.disabled || options?.loading}
                onClick={() => runHostAction(action)}
            >
                {icon} {label}
            </Button>
        );
        if (!options?.tooltip) return button;
        return (
            <TooltipProvider key={key}>
                <Tooltip>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent>
                        <span>{options.tooltip}</span>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    };
    const hostMenuItemClass = "flex h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50";
    const hostMenuIconClass = "h-3.5 w-3.5 shrink-0";
    const hostMenuGroupLabelClass = "px-2 pb-1 pt-1.5 text-[11px] font-medium leading-4 text-muted-foreground";
    const hostMenuSeparatorClass = "my-1 h-px bg-border";
    const renderHostMenuPortal = ({
        open,
        triggerRef,
        align,
        children,
    }: {
        open: boolean;
        triggerRef: React.RefObject<HTMLElement | null>;
        align: 'start' | 'end';
        children: React.ReactNode;
    }) => {
        if (!open || typeof document === 'undefined') {
            return null;
        }

        const rect = triggerRef.current?.getBoundingClientRect();
        const menuWidth = 208;
        const viewportWidth = window.innerWidth || menuWidth + 16;
        const maxLeft = Math.max(8, viewportWidth - menuWidth - 8);
        const desiredLeft = rect
            ? (align === 'end' ? rect.right - menuWidth : rect.left)
            : (align === 'end' ? maxLeft : 8);
        const left = Math.min(Math.max(8, desiredLeft), maxLeft);
        const top = rect ? rect.bottom + 6 : 44;

        return createPortal(
            <div
                ref={hostMenuPortalRef}
                role="menu"
                className="fixed z-[2147483647] w-52 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
                style={{
                    top,
                    left,
                    pointerEvents: 'auto',
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {children}
            </div>,
            document.body,
        );
    };
    const hostMoreMenu = hostToolbarState?.visible ? (
        <>
            <Button
                ref={hostActionMenuTriggerRef}
                variant="ghost"
                size="xs"
                className="gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5"
                aria-label="更多 ACP UI 操作"
                aria-haspopup="menu"
                aria-expanded={hostActionMenuOpen}
                onClick={(event) => {
                    event.stopPropagation();
                    setHostActionMenuOpen((open) => !open);
                }}
            >
                <List /> 更多
            </Button>
            {renderHostMenuPortal({
                open: hostActionMenuOpen,
                triggerRef: hostActionMenuTriggerRef,
                align: 'start',
                children: (
                    <>
                        <div role="group" aria-label="Agent">
                            <div className={hostMenuGroupLabelClass}>Agent</div>
                            <button
                                type="button"
                                role="menuitem"
                                onClick={handleOpenAISettingsFromHostMenu}
                                className={hostMenuItemClass}
                            >
                                <Settings2 className={hostMenuIconClass} /> AI 设置
                            </button>
                            {hostToolbarState.copyPromptVisible ? (
                                <button
                                    type="button"
                                    role="menuitem"
                                    disabled={hostToolbarState.copyPromptDisabled}
                                    {...getHostMenuActionHandlers({ type: 'copy-prompt' })}
                                    className={hostMenuItemClass}
                                >
                                    <Copy className={hostMenuIconClass} /> 复制提示词
                                </button>
                            ) : null}
                            {showHostExecutionControls && hostToolbarState.interruptVisible ? (
                                <button
                                    type="button"
                                    role="menuitem"
                                    disabled={hostToolbarState.interruptDisabled || hostToolbarState.interruptLoading}
                                    {...getHostMenuActionHandlers({ type: 'interrupt-agent' })}
                                    className={hostMenuItemClass}
                                >
                                    <Square className={hostMenuIconClass} /> 中断执行
                                </button>
                            ) : null}
                        </div>
                        <div role="separator" className={hostMenuSeparatorClass} />
                        <div role="group" aria-label="页面">
                            <div className={hostMenuGroupLabelClass}>页面</div>
                            {showHostPropertyPanelMenuAction ? (
                                <button
                                    type="button"
                                    role="menuitem"
                                    {...getHostMenuActionHandlers({ type: 'toggle-property-panel' })}
                                    className={hostMenuItemClass}
                                >
                                    <SlidersHorizontal className={hostMenuIconClass} />
                                    {hostToolbarState.propertyPanelOpen ? '关闭设计决策' : '设计决策'}
                                </button>
                            ) : null}
                            <button
                                type="button"
                                role="menuitem"
                                {...getHostMenuActionHandlers({ type: 'toggle-page-animations' })}
                                className={hostMenuItemClass}
                            >
                                <Settings2 className={hostMenuIconClass} /> {hostToolbarState.disablePageAnimations ? '开启页面动画' : '关闭页面动画'}
                            </button>
                        </div>
                        <div role="separator" className={hostMenuSeparatorClass} />
                        <div role="group" aria-label="帮助">
                            <div className={hostMenuGroupLabelClass}>帮助</div>
                            <button
                                type="button"
                                role="menuitem"
                                {...getHostMenuActionHandlers({ type: 'open-keyboard-shortcuts' })}
                                className={hostMenuItemClass}
                            >
                                <Keyboard className={hostMenuIconClass} /> 快捷键
                            </button>
                        </div>
                        {isQuickEditActive && !isReadOnlyHtmlPrototypeSpec ? (
                            <>
                                <div role="separator" className={hostMenuSeparatorClass} />
                                <div role="group" aria-label="保存">
                                    <div className={hostMenuGroupLabelClass}>保存</div>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        {...getQuickEditSaveMenuActionHandlers('save-text')}
                                        className={hostMenuItemClass}
                                    >
                                        <FileText className={hostMenuIconClass} /> 保存文本
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        {...getQuickEditSaveMenuActionHandlers('save-style')}
                                        className={hostMenuItemClass}
                                    >
                                        <PencilRuler className={hostMenuIconClass} /> 保存样式
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </>
                ),
            })}
        </>
    ) : null;
    const hostExecutionToolbarControls = hostToolbarState?.visible ? (
        <>
            {renderHostToolbarActionButton(
                'host-send',
                'AI 执行',
                <Send />,
                { type: 'send-to-agent' },
                {
                    visible: showHostExecutionControls && hostToolbarState.sendVisible,
                    disabled: hostToolbarState.sendDisabled,
                    loading: hostToolbarState.sendLoading,
                },
            )}
        </>
    ) : null;
    const hostClearToolbarControl = hostToolbarState?.visible ? renderHostToolbarActionButton(
        'host-clear',
        '清空',
        <Trash2 />,
        { type: 'clear-edits', scope: 'prototype', target: 'completed' },
        {
            disabled: hostToolbarState.clearEditsDisabled,
        },
    ) : null;
    const hostToolToolbarControls = hostToolbarState?.visible ? (
        <>
            {renderHostToolbarActionButton(
                'host-selection-mode',
                '选择元素',
                <ScanSearch />,
                { type: 'toggle-selection-mode', active: !hostToolbarState.selectionModeActive },
                {
                    visible: showHostSelectionModeAction,
                    disabled: false,
                    active: hostToolbarState.selectionModeActive,
                    tooltip: selectionModeTooltip,
                },
            )}
            {showHostPropertyPanelToolbarAction ? renderHostToolbarActionButton(
                'host-panel',
                '设计决策',
                <SlidersHorizontal />,
                { type: 'toggle-property-panel' },
                { disabled: false, active: hostToolbarState.propertyPanelOpen },
            ) : null}
        </>
    ) : null;
    const hostToolbarControls = hostToolbarState?.visible ? (
        <div className="inline-flex items-center gap-1">
            {hostExecutionToolbarControls}
            {hostClearToolbarControl}
            {hostToolToolbarControls}
        </div>
    ) : null;
    const activeQuickEditToolbarButtons = (
        <div className="inline-flex items-center gap-3" data-axhub-quick-edit-toolbar="true">
            <div
                className="inline-flex items-center gap-1"
                data-axhub-toolbar-group="tools"
            >
                {hostToolToolbarControls}
            </div>
            <div
                className="inline-flex items-center gap-1"
                data-axhub-toolbar-group="execution"
            >
                {hostExecutionToolbarControls}
                {hostClearToolbarControl}
                <Button
                    variant="ghost"
                    size="xs"
                    className="gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5"
                    onClick={handleRefreshElement}
                >
                    <RotateCw /> 刷新
                </Button>
                {hostMoreMenu}
                <Button
                    variant="ghost"
                    size="xs"
                    className="gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5"
                    onClick={handleExitWebEditor}
                >
                    <CircleX /> 退出
                </Button>
            </div>
        </div>
    );

    const resourceActionButtons = (() => {
        if (
            (contentMode === 'doc' && selectedDoc)
            || (contentMode === 'template' && selectedTemplate)
            || (contentMode === 'prototype-spec' && selectedPrototypeSpec)
        ) {
            const canInlineDocEdit = isMarkdownEditableResource(currentMarkdownItem);
            const canCommentOnDocument = isDocumentCommentableResource(currentMarkdownItem);

            if (docEditState.enabled) {
                return documentEditActionButtons;
            }
            if (isHtmlDocumentEditingContent && isQuickEditActive) {
                return activeQuickEditToolbarButtons;
            }

            return (
                <>
                    {drawioResourceEditAvailable ? (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="xs" className={toolbarTextButtonClass} onClick={() => { void handleOpenDrawioResourceEditor(); }}>
                                        <SquarePen /> 在线编辑
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>使用 Draw.io 在线编辑</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    ) : null}
                    {canCommentOnDocument ? (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="xs" className={toolbarTextButtonClass} onClick={() => handleEnableDocEdit('comment')}>
                                        <PencilRuler /> 批注
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{`批注${currentMarkdownLabel}`}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    ) : null}
                    {canInlineDocEdit ? (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="xs" className={toolbarTextButtonClass} onClick={() => handleEnableDocEdit('edit')}>
                                        <FileText /> 编辑
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{`编辑${currentMarkdownLabel}`}</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    ) : null}
                </>
            );
        }

        if (contentMode === 'theme' && selectedTheme) {
            if (isQuickEditActive) {
                return activeQuickEditToolbarButtons;
            }

            return (
                <>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant={isQuickEditActive ? "secondary" : "ghost"}
                                    size="xs"
                                    className={cn(
                                        toolbarTextButtonClass,
                                        isQuickEditActive && 'bg-secondary text-secondary-foreground',
                                    )}
                                    disabled={quickEditDisabled}
                                    onClick={isQuickEditActive ? handleExitWebEditor : handleOpenWebEditor}
                                >
                                    <PencilRuler /> 批注
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{quickEditTooltip}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="xs" className={toolbarTextButtonClass} onClick={handleRefreshElement}>
                                    <RotateCw /> 刷新
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>刷新</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </>
            );
        }

        if (contentMode === 'data' && selectedDataTable) {
            return (
                canOpenDataSource ? (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="xs" className={toolbarTextButtonClass} onClick={() => { void handleOpenDataTableInIDE(); }}>
                                    <Code2 /> 打开
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{getOpenInIdeTooltip('数据表')}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : null
            );
        }

        return null;
    })();

    const canvasActionButtons = (
        <>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="xs" className={toolbarTextButtonClass} onClick={handleRefreshElement}>
                            <RotateCw /> 刷新
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>刷新</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </>
    );

    const previewActionButtons = (
        <>
            {selectedItem && (
                <>
                    {isSplitQuickEditActive ? (
                        activeQuickEditToolbarButtons
                    ) : isQuickEditActive ? (
                        activeQuickEditToolbarButtons
                    ) : viewMode === 'canvas' ? (
                        canvasActionButtons
                    ) : (
                        <>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="xs"
                                            className={toolbarTextButtonClass}
                                            disabled={!prototypeSpecSupported || prototypeSpecLoading}
                                            onClick={() => { void handleOpenPrototypeSpec(); }}
                                        >
                                            <FileText /> 规格
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{prototypeSpecSupported ? '打开当前原型规格' : '当前原型没有明确的本地源码路径'}</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="relative inline-flex">
                                            <Button
                                                variant={isQuickEditActive ? "secondary" : "ghost"}
                                                size="xs"
                                                className={cn(
                                                    toolbarTextButtonClass,
                                                    isQuickEditActive && 'bg-secondary text-secondary-foreground',
                                                )}
                                                disabled={quickEditDisabled}
                                                onClick={handleQuickEditClick}
                                            >
                                                <PencilRuler /> 批注
                                            </Button>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>{quickEditTooltip}</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant={prototypeAnnotationSessionActive ? "secondary" : "ghost"}
                                            size="xs"
                                            className={cn(
                                                toolbarTextButtonClass,
                                                prototypeAnnotationSessionActive && 'bg-secondary text-secondary-foreground',
                                            )}
                                            disabled={prototypeAnnotationEnableLoading}
                                            onClick={handlePrototypeAnnotationClick}
                                        >
                                            <MapPin /> PRD 标注
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{prototypeAnnotationSessionActive ? '退出标注' : '使用标注需求和生成 RRD'}</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            {showStandalonePropertyPanelAction ? (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant={standalonePanelOpen ? "secondary" : "ghost"}
                                                size="xs"
                                                className={cn(
                                                    toolbarTextButtonClass,
                                                    standalonePanelOpen && 'bg-secondary text-secondary-foreground',
                                                )}
                                                disabled={propertyPanelDisabled}
                                                onClick={onStandalonePanelToggle}
                                            >
                                                <SlidersHorizontal /> 决策
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{propertyPanelTooltip}</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            ) : null}

                            {showReviewPanelAction ? (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant={reviewPanelOpen ? "secondary" : "ghost"}
                                                size="xs"
                                                className={cn(
                                                    toolbarTextButtonClass,
                                                    reviewPanelOpen && 'bg-secondary text-secondary-foreground',
                                                )}
                                                onClick={onReviewPanelToggle}
                                            >
                                                <ListChecks /> 评审
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{reviewPanelTooltip}</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            ) : null}



                        </>
                    )}
                </>
            )}
        </>
    );

    const actionButtons = isDocumentEditingContent && !isPreviewContent
        ? (
            <>
                {resourceActionButtons}
                {isDocumentCommentActive ? hostToolbarControls : null}
                {isDocumentEditActive ? documentEditTrailingActionButtons : null}
            </>
        )
        : resourceActionButtons ?? (isPreviewContent ? previewActionButtons : null);

    const [deviceMenuOpen, setDeviceMenuOpen] = React.useState(false);
    const [customWidthDraft, setCustomWidthDraft] = React.useState('');
    const [customHeightDraft, setCustomHeightDraft] = React.useState('');
    const isCustomPreview = previewConfig.previewMode === 'single' && previewConfig.singlePreset === 'custom';
    const isSplitPreview = previewConfig.previewMode === 'split';
    const isMultiPagePreview = previewConfig.previewMode === 'multi-page';
    const shouldShowScaleMode = isCustomPreview || isSplitPreview;
    const selectedDeviceIcon = isSplitPreview
        ? <PreviewSplitIcon />
        : isMultiPagePreview ? <LayoutGrid className="h-3.5 w-3.5" />
            : selectedDeviceId === 'mobile'
                ? <Smartphone className="h-3.5 w-3.5" />
                : selectedDeviceId === 'tablet'
                    ? <Tablet className="h-3.5 w-3.5" />
                    : <Monitor className="h-3.5 w-3.5" />;

    React.useEffect(() => {
        setCustomWidthDraft(previewConfig.customWidth ? String(previewConfig.customWidth) : '');
        setCustomHeightDraft(previewConfig.customHeight ? String(previewConfig.customHeight) : '');
    }, [
        previewConfig.customWidth,
        previewConfig.customHeight,
    ]);

    const commitDraftWidth = React.useCallback((draft: string, onCommit: (width: number) => void) => {
        const parsed = Number.parseInt(draft.trim(), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            onCommit(parsed);
        }
    }, []);

    const isDeviceSwitcherDisabled = viewMode !== 'demo';
    const deviceSwitcherButton = (
        <Button
            variant="ghost"
            size="icon-xs"
            className={cn(
                edgeIconButtonClass,
                isSplitPreview && "bg-muted text-foreground",
                isMultiPagePreview && "bg-muted text-foreground",
                isDeviceSwitcherDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
            )}
            disabled={isDeviceSwitcherDisabled}
            aria-label="设备"
        >
            {selectedDeviceIcon}
        </Button>
    );
    const shouldShowDeviceSwitcher = isPreviewContent && viewMode === 'demo' && !isQuickEditActive;
    const deviceSwitcher = shouldShowDeviceSwitcher ? (
        isDeviceSwitcherDisabled ? deviceSwitcherButton : (
            <DropdownMenu open={deviceMenuOpen} onOpenChange={setDeviceMenuOpen}>
                <DropdownMenuTrigger asChild>
                    {deviceSwitcherButton}
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="center"
                    className="w-[248px] rounded-xl p-1.5 text-sm"
                    onCloseAutoFocus={(event) => event.preventDefault()}
                >
                    <div className="grid gap-0.5 px-1 py-0.5">
                        <PreviewDeviceActionButton
                            icon={<Monitor />}
                            title="桌面端"
                            active={previewConfig.previewMode === 'single' && previewConfig.singlePreset === 'desktop'}
                            onClick={() => {
                                handleSelectPreviewSinglePreset('desktop');
                                setDeviceMenuOpen(false);
                            }}
                        />
                        <PreviewDeviceActionButton
                            icon={<Smartphone />}
                            title="移动端"
                            active={previewConfig.previewMode === 'single' && previewConfig.singlePreset === 'mobile'}
                            onClick={() => {
                                handleSelectPreviewSinglePreset('mobile');
                                setDeviceMenuOpen(false);
                            }}
                        />
                        <PreviewDeviceActionButton
                            icon={<Tablet />}
                            title="平板"
                            active={previewConfig.previewMode === 'single' && previewConfig.singlePreset === 'tablet'}
                            onClick={() => {
                                handleSelectPreviewSinglePreset('tablet');
                                setDeviceMenuOpen(false);
                            }}
                        />
                        <PreviewDeviceActionButton
                            icon={<Monitor />}
                            title="自定义"
                            active={isCustomPreview}
                            onClick={handleSelectCustomPreview}
                            trailing={isCustomPreview ? (
                                <>
                                    <Input
                                        value={customWidthDraft}
                                        inputMode="numeric"
                                        onFocus={handleSelectCustomPreview}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) => setCustomWidthDraft(event.target.value)}
                                        onBlur={() => commitDraftWidth(customWidthDraft, handleChangeCustomPreviewWidth)}
                                        onKeyDown={(event) => {
                                            event.stopPropagation();
                                            if (event.key === 'Enter') {
                                                commitDraftWidth(customWidthDraft, handleChangeCustomPreviewWidth);
                                            }
                                        }}
                                        className="h-6 w-[56px] px-2 text-[11px]"
                                    />
                                    <span className="text-[11px] text-muted-foreground">×</span>
                                    <Input
                                        value={customHeightDraft}
                                        inputMode="numeric"
                                        onFocus={handleSelectCustomPreview}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={(event) => setCustomHeightDraft(event.target.value)}
                                        onBlur={() => commitDraftWidth(customHeightDraft, handleChangeCustomPreviewHeight)}
                                        onKeyDown={(event) => {
                                            event.stopPropagation();
                                            if (event.key === 'Enter') {
                                                commitDraftWidth(customHeightDraft, handleChangeCustomPreviewHeight);
                                            }
                                        }}
                                        className="h-6 w-[56px] px-2 text-[11px]"
                                    />
                                </>
                            ) : null}
                        />
                    </div>
                    <div className="grid gap-0.5 px-1 py-0.5">
                        <PreviewDeviceActionButton
                            icon={<PreviewSplitIcon />}
                            title="PC + 手机"
                            active={isSplitPreview}
                            onClick={handleActivateSplitPreview}
                        />
                        <PreviewDeviceActionButton
                            icon={<LayoutGrid />}
                            title="多页面"
                            subtitle="平铺当前原型页面"
                            active={isMultiPagePreview}
                            onClick={() => handleActivateMultiPagePreview(selectedItem?.pages?.length)}
                        />
                    </div>
                    {shouldShowScaleMode ? (
                        <div className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="text-[11px] font-medium text-foreground/80">缩放模式</div>
                            <Segmented
                                aria-label={quickEditSegmentLabelText}
                                size="small"
                                value={previewConfig.scaleMode}
                                className="[&_.ant-segmented-item-label]:px-2 [&_.ant-segmented-item-label]:py-0.5"
                                style={{ fontSize: 11 }}
                                onChange={(value) => handleChangePreviewScaleMode(value as PreviewScaleMode)}
                                options={[
                                    {
                                        label: (
                                            <span className="inline-flex items-center gap-1">
                                                <Columns2 className="h-3 w-3" />
                                                宽度
                                            </span>
                                        ),
                                        value: 'fit-width',
                                    },
                                    {
                                        label: (
                                            <span className="inline-flex items-center gap-1">
                                                <Monitor className="h-3 w-3" />
                                                屏幕
                                            </span>
                                        ),
                                        value: 'fit-screen',
                                    },
                                ]}
                            />
                        </div>
                    ) : null}
                </DropdownMenuContent>
            </DropdownMenu>
        )
    ) : null;

    const showExportMenuButton = ((isPreviewContent && viewMode === 'demo') || contentMode === 'theme') && (Boolean(selectedItem) || Boolean(selectedTheme));
    const canCopyCurrentScreenshot = ((isPreviewContent && viewMode === 'demo') || contentMode === 'theme')
        && Boolean(currentRuntimeExportResource);
    const exportMenuButton = (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={toolbarPillButtonClass}
                    disabled={!canCopyCurrentScreenshot && !canOpenGenericFigmaExport && !canOpenGenericAxureExport && !showHtmlExportEntry && !hasCurrentPublishResource}
                >
                    <Cloud />
                    <span>发布</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 text-sm">
                <DropdownMenuLabel className="px-2 py-1 text-[11px] font-normal text-muted-foreground">
                    Figma
                </DropdownMenuLabel>
                <DropdownMenuItem
                    onClick={handleCopyToFigma}
                    disabled={Boolean(figmaDomDisabledReason)}
                    title={figmaDomDisabledReason}
                    className="gap-2 h-7 text-sm"
                >
                    <Copy className="h-3.5 w-3.5" /> 复制到 Figma
                </DropdownMenuItem>
                {showMakeExportEntry ? (
                    <DropdownMenuItem
                        onClick={handleExportMake}
                        disabled={Boolean(makeExportDisabledReason)}
                        title={makeExportDisabledReason}
                        className="gap-2 h-7 text-sm"
                    >
                        <Download className="h-3.5 w-3.5" />
                        {makeExportDisabledReason ? `导出 Figma Make（${makeExportDisabledReason}）` : '导出 Figma Make'}
                    </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="px-2 py-1 text-[11px] font-normal text-muted-foreground">
                    Axure
                </DropdownMenuLabel>
                {showInteractiveAxureExportEntry ? (
                    <DropdownMenuItem
                        onClick={() => setIsExportModalOpen(true)}
                        disabled={!canOpenGenericAxureExport}
                        title={exportAvailability?.axureDisabledReason || ''}
                        className="gap-2 h-7 text-sm"
                    >
                        <Download className="h-3.5 w-3.5" /> 导出带交互原型
                    </DropdownMenuItem>
                ) : null}
                {showEditableAxureCopyEntry ? (
                    <DropdownMenuItem
                        onClick={handleQuickCopyEditablePrototype}
                        disabled={!canOpenGenericAxureExport}
                        title={exportAvailability?.axureDisabledReason || ''}
                        className="gap-2 h-7 text-sm"
                    >
                        <Copy className="h-3.5 w-3.5" /> 复制可编辑原型
                    </DropdownMenuItem>
                ) : null}
                {showAxureUsageGuideEntry ? (
                    <DropdownMenuItem
                        onClick={handleOpenAxureUsageGuide}
                        className="gap-2 h-7 text-sm"
                    >
                        <HelpCircle className="h-3.5 w-3.5" /> 使用说明
                    </DropdownMenuItem>
                ) : null}
                {showHtmlExportEntry ? (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="px-2 py-1 text-[11px] font-normal text-muted-foreground">
                            HTML
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                            onClick={() => handleExportHtml()}
                            className="gap-2 h-7 text-sm"
                        >
                            <Download className="h-3.5 w-3.5" /> 导出 HTML
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => handleExportHtml({ includeSource: true })}
                            className="gap-2 h-7 text-sm"
                        >
                            <Download className="h-3.5 w-3.5" /> 导出 HTML（含源码）
                        </DropdownMenuItem>
                    </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="px-2 py-1 text-[11px] font-normal text-muted-foreground">
                    云服务
                </DropdownMenuLabel>
                {visibleCloudPublishTargetSet.has('axhub') ? (
                    <DropdownMenuItem
                        onClick={() => handleOpenAxhubPublishDialog()}
                        disabled={!hasCurrentPublishResource}
                        className="gap-2 h-7 text-sm"
                    >
                        <Cloud className="h-3.5 w-3.5" /> 发布到 Axhub
                    </DropdownMenuItem>
                ) : null}
                {visibleCloudPublishTargetSet.has('s3') ? (
                    <DropdownMenuItem
                        onClick={() => handlePublishCloudTarget('s3')}
                        disabled={!hasCurrentPublishResource}
                        className="gap-2 h-7 text-sm"
                    >
                        <Send className="h-3.5 w-3.5" /> 发布到对象存储
                    </DropdownMenuItem>
                ) : null}
                {visibleCloudPublishTargetSet.has('vercel') ? (
                    <DropdownMenuItem
                        onClick={() => handlePublishCloudTarget('vercel')}
                        disabled={!hasCurrentPublishResource}
                        className="gap-2 h-7 text-sm"
                    >
                        <Send className="h-3.5 w-3.5" /> 发布到 Vercel
                    </DropdownMenuItem>
                ) : null}
                {visibleCloudPublishTargetSet.has('cloudflare-pages') ? (
                    <DropdownMenuItem
                        onClick={() => handlePublishCloudTarget('cloudflare-pages')}
                        disabled={!hasCurrentPublishResource}
                        className="gap-2 h-7 text-sm"
                    >
                        <Send className="h-3.5 w-3.5" /> 发布到 Cloudflare Pages
                    </DropdownMenuItem>
                ) : null}
                {visibleCloudPublishTargetSet.has('github-pages') ? (
                    <DropdownMenuItem
                        onClick={() => handlePublishCloudTarget('github-pages')}
                        disabled={!hasCurrentPublishResource}
                        className="gap-2 h-7 text-sm"
                    >
                        <Send className="h-3.5 w-3.5" /> 发布到 GitHub Pages
                    </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                    onClick={() => handleCopyLatestCloudPublishUrl()}
                    disabled={!latestCloudPublishUrl || !hasCurrentPublishResource}
                    className="gap-2 h-7 text-sm"
                >
                    <Copy className="h-3.5 w-3.5" /> 复制发布地址
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => handleOpenCloudPublishSettings('publish-settings')}
                    className="gap-2 h-7 text-sm"
                >
                    <Settings2 className="h-3.5 w-3.5" /> 更多平台与设置
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={handleCopyCurrentScreenshot}
                    disabled={!canCopyCurrentScreenshot}
                    className="gap-2 h-7 text-sm"
                >
                    <ImageIcon className="h-3.5 w-3.5" /> 复制截图
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
    return (
        <div className="ax-presentation-toolbar relative h-10 flex items-center justify-between border-b px-2 bg-background shrink-0 text-[12px]">
            {/* Left: Sidebar Collapse */}
            <div className="flex items-center gap-1 z-10">
                {showSidebarToggle ? (
                    <ResponsiveSidebarTriggerButton
                        collapsed={collapsed}
                        setCollapsed={setCollapsed}
                        className={edgeIconButtonClass}
                    />
                ) : null}
                {deviceSwitcher}
            </div>

            {/* Center: Tools */}
            <div className="ax-toolbar-adaptive-action flex-1 flex justify-center items-center gap-1 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="flex items-center gap-1 [&>*]:self-center text-[12px]">
                    {actionButtons}
                </div>
            </div>

            {/* Right: Export */}
            <div className="ax-toolbar-adaptive-action flex items-center justify-end gap-1.5 z-10">
                {showExportMenuButton ? exportMenuButton : null}
            </div>
            <Dialog
                open={annotationEnableDialogOpen}
                onOpenChange={setAnnotationEnableDialogOpen}
            >
                <DialogContent
                    className="w-[min(92vw,460px)] max-w-[460px] text-sm"
                >
                    <DialogHeader className="gap-2">
                        <DialogTitle className="leading-6">开启 PRD 标注</DialogTitle>
                        <DialogDescription className="leading-6">
                            当前原型还没有需求标注，请选择一种方式继续。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:space-x-0">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={prototypeAnnotationPromptCopying}
                            onClick={() => { void handleCopyPrototypeAnnotationPrompt(); }}
                        >
                            <Copy className="h-3.5 w-3.5" /> 复制提示词
                        </Button>
                        <Button
                            type="button"
                            disabled={prototypeAnnotationEnableLoading}
                            onClick={() => { void handleManualPrototypeAnnotationEnable(); }}
                        >
                            <FileText className="h-3.5 w-3.5" /> 手动开启
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
