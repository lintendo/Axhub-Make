import React, { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Copy, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { AxureCopyOptions, ImageConfig, TabType, PromptClientPreference } from '../../types';
import { IDEAvailabilityMap, MainIDEPreference } from '../../../common/ide';
import type { ExportAvailability } from '../../types/index-page.types';
import { apiService } from '../../services/api';
import { requireProjectScope } from '../../services/projectScope';
import type {
    AxureApiListKey,
    AxureApiListPreview,
    AxureApiPreviewResponse,
    ReviewResult,
} from '../../services/api';
import { buildAxureApiUpdatePrompt } from '../../utils/axureApiPrompts';
import { createExportReviewFailureResult } from '../../utils/exportReviewPrompt';
import {
    type ExportConfigType,
    type ExportModalTabKey,
    mergeExportModalPreferences,
    readExportModalPreferences,
} from '../../utils/exportModalPreferences';
import ExportReviewDialogView from './ExportReviewDialogView';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import PromptActionButton from '../PromptActionButton';

const AXURE_API_LIST_ORDER: Array<{ key: AxureApiListKey; title: string }> = [
    { key: 'eventList', title: 'eventList 事件列表' },
    { key: 'actionList', title: 'actionList 动作列表' },
    { key: 'varList', title: 'varList 变量列表' },
    { key: 'configList', title: 'configList 配置列表' },
    { key: 'dataList', title: 'dataList 数据列表' },
];

function toDisplayText(value: unknown): string {
    if (value == null) return '—';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function statusText(status: AxureApiListPreview['parseStatus']): string {
    if (status === 'parsed') return '结构化';
    if (status === 'raw') return '部分解析';
    return '未定义';
}

interface ExportModalProps {
    open: boolean;
    projectId: string;
    preferencesStorageKey: string;
    onClose: () => void;
    imageConfig: ImageConfig;
    setImageConfig: React.Dispatch<React.SetStateAction<ImageConfig>>;
    axureCopyOptions: AxureCopyOptions;
    setAxureCopyOptions: React.Dispatch<React.SetStateAction<AxureCopyOptions>>;
    onDimensionChange: (field: 'width' | 'height', value: number | null) => void;
    onSwapDimensions: () => void;
    onDimensionBlur: () => void;
    isExporting: boolean;
    onExport: () => void;
    onCopyRuntimeComponent: () => void;
    onCopyToAxure: (options: AxureCopyOptions) => Promise<void>;
    onCopyConfig: (exportType: string) => Promise<string>;
    activeTab: TabType;
    itemName?: string;
    sourceTargetPath?: string;
    exportAvailability: ExportAvailability;
    preferredPromptClient: PromptClientPreference;
    preferredIDE: MainIDEPreference;
    ideAvailability?: IDEAvailabilityMap;
    assistantOpen?: boolean;
    onExecutePrompt?: (prompt: string, meta: { scene: string; targetPath?: string | null }) => Promise<boolean | void> | boolean | void;
    initialReviewResult?: ReviewResult | null;
    onInitialReviewHandled?: () => void;
}

export default function ExportModal({
    open,
    projectId,
    preferencesStorageKey,
    onClose,
    imageConfig,
    setImageConfig,
    axureCopyOptions,
    setAxureCopyOptions,
    onDimensionChange,
    onSwapDimensions,
    onDimensionBlur,
    isExporting,
    onExport,
    onCopyRuntimeComponent,
    onCopyToAxure,
    onCopyConfig,
    activeTab,
    itemName,
    sourceTargetPath,
    exportAvailability,
    preferredPromptClient,
    preferredIDE,
    ideAvailability,
    assistantOpen,
    onExecutePrompt,
    initialReviewResult,
    onInitialReviewHandled,
}: ExportModalProps) {
    const label = '原型';
    const runtimeScriptLink = '"><script type="text/javascript" src="https://static.axhub.im/lib/runtime.js" ></script> <link href="';
    const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [isReviewing, setIsReviewing] = useState(false);
    const showCopyConfigEntry = true;
    const [activeTabKey, setActiveTabKey] = useState<ExportModalTabKey>('dynamicPrototype');
    const [isCopyingToAxure, setIsCopyingToAxure] = useState(false);
    const [exportContent, setExportContent] = useState('');
    const [selectedExportType, setSelectedExportType] = useState<ExportConfigType>('');
    const [isLoadingConfig, setIsLoadingConfig] = useState(false);
    const [axureApiPreview, setAxureApiPreview] = useState<AxureApiPreviewResponse | null>(null);
    const [isLoadingAxureApi, setIsLoadingAxureApi] = useState(false);
    const [axureApiError, setAxureApiError] = useState('');
    const preferencesHydratedRef = useRef(false);
    const canUseSourceFeatures = exportAvailability.canUseSourceFeatures;
    const axureRuntimeDisabledReason = exportAvailability.axureRuntimeDisabledReason;
    const axureSourceDisabledReason = exportAvailability.axureSourceDisabledReason;
    const dimensionLabel = imageConfig.contentType === 'screenshot' ? '截图视窗' : '导出尺寸';
    const dimensionHint = imageConfig.contentType === 'screenshot' ? '按该视窗布局，导出完整页面' : '';

    useEffect(() => {
        preferencesHydratedRef.current = false;
        const preferences = readExportModalPreferences(preferencesStorageKey);
        setActiveTabKey(preferences.activeTabKey ?? 'dynamicPrototype');
        setSelectedExportType(preferences.selectedExportType ?? '');
        preferencesHydratedRef.current = true;
    }, [preferencesStorageKey]);

    useEffect(() => {
        if (!preferencesHydratedRef.current) return;
        mergeExportModalPreferences(preferencesStorageKey, {
            activeTabKey,
            selectedExportType,
        });
    }, [activeTabKey, preferencesStorageKey, selectedExportType]);

    useEffect(() => {
        if (!open) {
            setExportContent('');
            setAxureApiPreview(null);
            setAxureApiError('');
        }
    }, [open]);

    useEffect(() => {
        if (!open || !initialReviewResult) {
            return;
        }

        setReviewResult(initialReviewResult);
        setShowReviewModal(true);
        onInitialReviewHandled?.();
    }, [initialReviewResult, onInitialReviewHandled, open]);

    const performReview = async (): Promise<boolean> => {
        if (!sourceTargetPath) return true;
        if (!canUseSourceFeatures) {
            return true;
        }

        setIsReviewing(true);
        try {
            const result = await apiService.reviewCode(sourceTargetPath, requireProjectScope(projectId), {
                enforceComponentExportName: true,
                mode: 'axure-export',
            });

            if (!result.passed) {
                setReviewResult(result);
                setShowReviewModal(true);
                return false;
            }
            return true;
        } catch (error: any) {
            console.error('代码检查失败:', error);
            setReviewResult(createExportReviewFailureResult({
                activeTab,
                itemName: itemName || sourceTargetPath,
                sourceTargetPath,
                message: error?.message || '代码检查接口调用失败',
            }));
            setShowReviewModal(true);
            return false;
        } finally {
            setIsReviewing(false);
        }
    };

    useEffect(() => {
        const loadConfig = async () => {
            if (!(open && selectedExportType && activeTabKey === 'copyConfig')) {
                return;
            }
            if (!canUseSourceFeatures) {
                setExportContent(axureSourceDisabledReason || '源码或 artifact metadata 缺失');
                return;
            }
            setIsLoadingConfig(true);
            try {
                const passed = await performReview();
                if (!passed) {
                    setSelectedExportType('');
                    setExportContent('');
                    return;
                }
                const config = await onCopyConfig(selectedExportType);
                setExportContent(config);
            } catch {
                toast.error('加载配置失败');
                setExportContent('');
            } finally {
                setIsLoadingConfig(false);
            }
        };
        void loadConfig();
    }, [activeTabKey, axureSourceDisabledReason, canUseSourceFeatures, onCopyConfig, open, selectedExportType]);

    const loadAxureApiPreview = async () => {
        if (!sourceTargetPath) {
            setAxureApiPreview(null);
            setAxureApiError('请先选择一个条目');
            return;
        }
        if (!canUseSourceFeatures) {
            setAxureApiPreview(null);
            setAxureApiError(axureSourceDisabledReason || '源码或 artifact metadata 缺失');
            return;
        }

        setIsLoadingAxureApi(true);
        setAxureApiError('');
        try {
            const preview = await apiService.getAxureApiPreview(sourceTargetPath, requireProjectScope(projectId));
            setAxureApiPreview(preview);
        } catch (error: any) {
            setAxureApiPreview(null);
            setAxureApiError(error?.message || '加载 Axure API 失败');
        } finally {
            setIsLoadingAxureApi(false);
        }
    };

    useEffect(() => {
        if (!open || activeTabKey !== 'axureApi') {
            return;
        }
        void loadAxureApiPreview();
    }, [open, activeTabKey, sourceTargetPath]);

    const handleExport = async () => {
        const passed = await performReview();
        if (passed) {
            onExport();
        }
    };

    const handleCopyRuntimeComponent = async () => {
        const passed = await performReview();
        if (passed) {
            onCopyRuntimeComponent();
        }
    };

    const handleCopyToAxure = async () => {
        if (isCopyingToAxure || isReviewing) {
            return;
        }
        setIsCopyingToAxure(true);
        try {
            await onCopyToAxure(axureCopyOptions);
        } finally {
            setIsCopyingToAxure(false);
        }
    };

    const handleCopyConfigClick = async () => {
        if (!exportContent) {
            toast.warning('请先选择导出内容');
            return;
        }
        try {
            await navigator.clipboard.writeText(exportContent);
            toast.success('配置已复制到剪贴板');
        } catch {
            toast.error('复制失败，请检查浏览器剪贴板权限');
        }
    };

    const handleCopyRuntimeLink = async () => {
        try {
            await navigator.clipboard.writeText(runtimeScriptLink);
            toast.success('链接已复制到剪贴板');
        } catch {
            toast.error('复制链接失败，请检查浏览器剪贴板权限');
        }
    };

    const buildAxureApiPrompt = () => {
        if (!itemName) {
            throw new Error('请先选择一个条目');
        }

        return buildAxureApiUpdatePrompt({
            activeTab,
            itemName,
        });
    };

    const renderEventActionVarTable = (
        listKey: AxureApiListKey,
        listPreview: AxureApiListPreview,
    ) => {
        const thirdColumnLabel = listKey === 'eventList' ? 'payload' : listKey === 'actionList' ? 'params' : '扩展信息';
        const thirdFieldKey = listKey === 'eventList' ? 'payload' : listKey === 'actionList' ? 'params' : null;

        return (
            <div className="overflow-x-auto rounded-md border">
                <table className="min-w-full text-left text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2 font-medium">name</th>
                            <th className="px-3 py-2 font-medium">desc</th>
                            <th className="px-3 py-2 font-medium">{thirdColumnLabel}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {listPreview.items.length === 0 ? (
                            <tr>
                                <td className="px-3 py-2 text-muted-foreground" colSpan={3}>无条目</td>
                            </tr>
                        ) : (
                            listPreview.items.map((item, index) => (
                                <tr key={`${listKey}-${index}`} className="border-t">
                                    <td className="px-3 py-2 font-mono text-xs">{toDisplayText(item.name)}</td>
                                    <td className="px-3 py-2">{toDisplayText(item.desc)}</td>
                                    <td className="px-3 py-2 font-mono text-xs">
                                        {thirdFieldKey ? toDisplayText(item[thirdFieldKey]) : toDisplayText(item)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderConfigList = (listPreview: AxureApiListPreview) => {
        if (listPreview.items.length === 0) {
            return <div className="px-1 py-2 text-sm text-muted-foreground">无条目</div>;
        }
        return (
            <div className="overflow-x-auto rounded-md border">
                <table className="min-w-full text-left text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2 font-medium">type</th>
                            <th className="px-3 py-2 font-medium">attributeId</th>
                            <th className="px-3 py-2 font-medium">displayName</th>
                            <th className="px-3 py-2 font-medium">info</th>
                            <th className="px-3 py-2 font-medium">initialValue</th>
                        </tr>
                    </thead>
                    <tbody>
                        {listPreview.items.map((item, index) => (
                            <tr key={`config-${index}`} className="border-t align-top">
                                <td className="px-3 py-2">{toDisplayText(item.type)}</td>
                                <td className="px-3 py-2 font-mono text-xs">{toDisplayText(item.attributeId)}</td>
                                <td className="px-3 py-2">{toDisplayText(item.displayName)}</td>
                                <td className="px-3 py-2">{toDisplayText(item.info)}</td>
                                <td className="px-3 py-2 font-mono text-xs">{toDisplayText(item.initialValue)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const parseDataKeys = (value: unknown): Array<{ name: string; desc: string }> => {
        if (!Array.isArray(value)) {
            return [];
        }

        return value.map((keyItem) => {
            if (keyItem && typeof keyItem === 'object') {
                const keyRecord = keyItem as Record<string, unknown>;
                return {
                    name: toDisplayText(keyRecord.name),
                    desc: toDisplayText(keyRecord.desc),
                };
            }
            return {
                name: toDisplayText(keyItem),
                desc: '—',
            };
        });
    };

    const renderDataList = (listPreview: AxureApiListPreview) => {
        if (listPreview.items.length === 0) {
            return <div className="px-1 py-2 text-sm text-muted-foreground">无条目</div>;
        }
        return (
            <div className="overflow-x-auto rounded-md border">
                <table className="min-w-full text-left text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2 font-medium">name</th>
                            <th className="px-3 py-2 font-medium">desc</th>
                            <th className="px-3 py-2 font-medium">keys</th>
                        </tr>
                    </thead>
                    <tbody>
                        {listPreview.items.map((item, index) => {
                            const keys = parseDataKeys(item.keys);
                            return (
                                <tr key={`data-${index}`} className="border-t align-top">
                                    <td className="px-3 py-2 font-mono text-xs">{toDisplayText(item.name)}</td>
                                    <td className="px-3 py-2">{toDisplayText(item.desc)}</td>
                                    <td className="px-3 py-2">
                                        {keys.length === 0 ? (
                                            <span className="text-xs text-muted-foreground">无 keys</span>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5">
                                                {keys.map((keyItem, keyIndex) => (
                                                    <span
                                                        key={`data-${index}-key-${keyIndex}`}
                                                        className="inline-flex items-center rounded bg-muted/50 px-2 py-0.5 font-mono text-[11px]"
                                                    >
                                                        {keyItem.desc !== '—' ? `${keyItem.name} · ${keyItem.desc}` : keyItem.name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <>
            <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
                <DialogContent className="flex h-[560px] w-[min(90vw,860px)] max-w-[860px] flex-col overflow-hidden p-0 text-sm [&>[data-dialog-close]]:hidden">
                    <DialogHeader className="border-b px-5 py-3.5">
                        <DialogTitle className="sr-only">导出带交互原型</DialogTitle>
                        <div className="flex items-center justify-between gap-3">
                            <Tabs
                                value={activeTabKey}
                                onValueChange={(value) => {
                                    if (
                                        value === 'dynamicPrototype' ||
                                        value === 'staticPrototype' ||
                                        value === 'axureApi' ||
                                        value === 'usageGuide' ||
                                        (showCopyConfigEntry && value === 'copyConfig')
                                    ) {
                                        setActiveTabKey(value);
                                    }
                                }}
                                className="w-full max-w-[480px]"
                            >
                                <TabsList
                                    className={`grid h-8 w-full ${showCopyConfigEntry ? 'grid-cols-5' : 'grid-cols-4'} rounded-lg border border-border/70 bg-muted/50 p-0.5`}
                                >
                                    <TabsTrigger
                                        value="dynamicPrototype"
                                        className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none"
                                    >
                                        带交互原型
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="staticPrototype"
                                        className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none"
                                    >
                                        可编辑原型
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="axureApi"
                                        className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none"
                                    >
                                        Axure API
                                    </TabsTrigger>
                                    {showCopyConfigEntry ? (
                                        <TabsTrigger
                                            value="copyConfig"
                                            className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none"
                                        >
                                            复制配置
                                        </TabsTrigger>
                                    ) : null}
                                    <TabsTrigger
                                        value="usageGuide"
                                        className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none"
                                    >
                                        使用说明
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-7 w-7 shrink-0 rounded-md"
                                onClick={onClose}
                                aria-label="关闭"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-5 py-4.5">
                        {activeTabKey === 'dynamicPrototype' ? (
                            <div className="space-y-3">
                                {!canUseSourceFeatures ? (
                                    <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
                                        当前项目可打开通用 Axure 导出入口；源码或 artifact metadata 缺失，Runtime 封面、复制配置和 Figma Make 导出等高级功能暂不可用。
                                    </div>
                                ) : null}
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_248px]">
                                <div className="flex h-[360px] items-center justify-center overflow-hidden rounded-md border bg-muted/30 p-3">
                                    {imageConfig.previewUrl ? (
                                        <img
                                            src={imageConfig.previewUrl}
                                            alt="Preview"
                                            className="h-full w-full object-contain"
                                        />
                                    ) : (
                                        <div className="text-center text-sm text-muted-foreground">
                                            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                                            正在生成预览...
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <div className="text-sm font-medium">{dimensionLabel}</div>
                                            {dimensionHint ? <div className="text-xs text-muted-foreground">{dimensionHint}</div> : null}
                                        </div>
                                        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                                            <Input
                                                type="number"
                                                min={1}
                                                value={imageConfig.width}
                                                onChange={(e) => onDimensionChange('width', Number(e.target.value || 0))}
                                                onBlur={onDimensionBlur}
                                                placeholder="宽"
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                                                onClick={onSwapDimensions}
                                                aria-label="交换宽高"
                                            >
                                                <ArrowRightLeft className="h-4 w-4" />
                                            </Button>
                                            <Input
                                                type="number"
                                                min={1}
                                                value={imageConfig.height}
                                                onChange={(e) => onDimensionChange('height', Number(e.target.value || 0))}
                                                onBlur={onDimensionBlur}
                                                placeholder="高"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="text-sm font-medium">图片内容</div>
                                        <RadioGroup
                                            value={imageConfig.contentType}
                                            onValueChange={(value) => {
                                                if (!value) return;
                                                setImageConfig((prev) => ({ ...prev, contentType: value as ImageConfig['contentType'] }));
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <RadioGroupItem value="title" id="export-content-title" />
                                                <Label htmlFor="export-content-title" className="text-sm font-normal">{label}标题</Label>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <RadioGroupItem value="screenshot" id="export-content-screenshot" />
                                                <Label htmlFor="export-content-screenshot" className="text-sm font-normal">{label}截图</Label>
                                            </div>
                                        </RadioGroup>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="text-sm font-medium">包含配置</div>
                                        <Select
                                            value={imageConfig.includeConfig}
                                            onValueChange={(value) => setImageConfig((prev) => ({ ...prev, includeConfig: value as ImageConfig['includeConfig'] }))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="选择配置" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">无</SelectItem>
                                                <SelectItem value="code">原型</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {imageConfig.includeConfig === 'code' ? (
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="space-y-0.5">
                                                <div className="text-sm font-medium">导出图片素材</div>
                                                <p className="text-xs text-muted-foreground">关闭后保留图片位置并使用浅灰占位</p>
                                            </div>
                                            <Switch
                                                checked={imageConfig.includeImageAssets}
                                                onCheckedChange={(checked) => {
                                                    setImageConfig((prev) => ({ ...prev, includeImageAssets: checked }));
                                                }}
                                                aria-label="导出图片素材"
                                            />
                                        </div>
                                    ) : null}

                                    {activeTab === 'prototypes' ? (
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="space-y-0.5">
                                                <div className="text-sm font-medium">全屏展示</div>
                                                <p className="text-xs text-muted-foreground">在 Axure 中全屏渲染原型</p>
                                            </div>
                                            <Switch
                                                checked={imageConfig.isFullScreen ?? true}
                                                onCheckedChange={(checked) => {
                                                    setImageConfig((prev) => ({ ...prev, isFullScreen: checked }));
                                                }}
                                                aria-label="全屏展示"
                                            />
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                            </div>
                        ) : activeTabKey === 'staticPrototype' ? (
                            <div className="mx-auto w-full max-w-[620px] space-y-3">
                                <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
                                    {axureRuntimeDisabledReason || '粘贴到 Axure 后可自由编辑'}
                                </div>
                                <div className="rounded-md border">
                                    <div className="flex items-start justify-between gap-4 px-4 py-3">
                                        <div className="space-y-1">
                                            <div className="text-sm font-medium">保留 Axure 层级</div>
                                            <p className="text-xs text-muted-foreground">关闭后将减少大量动态面板</p>
                                        </div>
                                        <Switch
                                            checked={axureCopyOptions.preserveHierarchy}
                                            onCheckedChange={(checked) => {
                                                setAxureCopyOptions((prev) => ({ ...prev, preserveHierarchy: checked }));
                                            }}
                                            aria-label="保留 Axure 层级"
                                        />
                                    </div>
                                    <div className="h-px bg-border" />
                                    <div className="flex items-start justify-between gap-4 px-4 py-3">
                                        <div className="space-y-1">
                                            <div className="text-sm font-medium">保留 Axure SVG 图标</div>
                                            <p className="text-xs text-muted-foreground">关闭后将转化为 PNG 导出</p>
                                        </div>
                                        <Switch
                                            checked={axureCopyOptions.preserveSvgIcons}
                                            onCheckedChange={(checked) => {
                                                setAxureCopyOptions((prev) => ({ ...prev, preserveSvgIcons: checked }));
                                            }}
                                            aria-label="保留 Axure SVG 图标"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : activeTabKey === 'axureApi' ? (
                            <div className="space-y-3">
                                <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="space-y-1">
                                            <div className="font-medium">当前 Axure Handle API 预览</div>
                                            <div className="text-xs">
                                                数据来源：当前资源运行入口的 <code>useImperativeHandle</code>
                                            </div>
                                            <div className="text-xs">
                                                固定技能：<code>Axure 导出工作流</code>、<code>Axure API 规范</code>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => void loadAxureApiPreview()}
                                                disabled={isLoadingAxureApi || !itemName || Boolean(axureSourceDisabledReason)}
                                            >
                                                <RefreshCw className={`h-4 w-4 ${isLoadingAxureApi ? 'animate-spin' : ''}`} />
                                                刷新
                                            </Button>
                                            <PromptActionButton
                                                type="primary"
                                                preferredClient={preferredPromptClient}
                                                preferredIDE={preferredIDE}
                                                ideAvailability={ideAvailability}
                                                assistantOpen={assistantOpen}
                                                scene="axure-api-update"
                                                buildPrompt={buildAxureApiPrompt}
                                                getTargetPath={() => sourceTargetPath || null}
                                                onExecutePrompt={onExecutePrompt}
                                                copyLabel="复制 Prompt"
                                                copySuccessMessage="Prompt 已复制到剪贴板"
                                                executeSuccessMessage="已发送到 AI 侧栏"
                                                fallbackMessage="AI 执行失败，已回退为复制 Prompt"
                                                disabled={!itemName || Boolean(axureSourceDisabledReason)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {isLoadingAxureApi ? (
                                    <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                                        正在解析 Axure API...
                                    </div>
                                ) : axureApiError ? (
                                    <div className="rounded-md border border-amber-300/60 bg-amber-50/50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                                        {axureApiError}
                                    </div>
                                ) : axureApiPreview ? (
                                    <div className="space-y-3">
                                        {axureApiPreview.hasAxureHandle ? null : (
                                            <div className="rounded-md border border-amber-300/60 bg-amber-50/50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                                                未检测到 <code>useImperativeHandle</code>，可使用上方复制的 Prompt 让 AI 新增 Axure API。
                                            </div>
                                        )}

                                        <div className="overflow-hidden rounded-md border">
                                            {AXURE_API_LIST_ORDER.map(({ key, title }, listIndex) => {
                                                const listPreview = axureApiPreview.lists[key];
                                                const showRaw = listPreview.parseStatus === 'raw' && Boolean(listPreview.raw);
                                                const hasItems = listPreview.items.length > 0;
                                                const showDetails = hasItems || listPreview.warnings.length > 0 || showRaw;

                                                return (
                                                    <div key={key} className={listIndex === 0 ? '' : 'border-t'}>
                                                        <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/20 px-3 py-2.5">
                                                            <div className="text-sm font-medium">{title}</div>
                                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                <span>状态：{statusText(listPreview.parseStatus)}</span>
                                                                {listPreview.sourceKey ? <span>来源：{listPreview.sourceKey}</span> : null}
                                                            </div>
                                                        </div>
                                                        {showDetails ? (
                                                            <div className="space-y-2 px-3 py-3">
                                                                {hasItems ? (
                                                                    key === 'configList'
                                                                        ? renderConfigList(listPreview)
                                                                        : key === 'dataList'
                                                                            ? renderDataList(listPreview)
                                                                            : renderEventActionVarTable(key, listPreview)
                                                                ) : null}

                                                                {listPreview.warnings.length > 0 ? (
                                                                    <div className="rounded-md border border-amber-300/60 bg-amber-50/50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                                                                        {listPreview.warnings.map((warning, index) => (
                                                                            <div key={`${key}-warning-${index}`}>- {warning}</div>
                                                                        ))}
                                                                    </div>
                                                                ) : null}

                                                                {showRaw ? (
                                                                    <div className="space-y-1">
                                                                        <div className="text-xs text-muted-foreground">结构化解析不完整，已回退原始片段：</div>
                                                                        <pre className="max-h-48 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">
                                                                            {listPreview.raw}
                                                                        </pre>
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                                        暂无可展示的 Axure API 数据
                                    </div>
                                )}
                            </div>
                        ) : showCopyConfigEntry && activeTabKey === 'copyConfig' ? (
                            <div className="space-y-3">
                                <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
                                    导出本地 html 或发布到 Axure Cloud 时若图片失效，可以使用此功能复制配置。
                                </div>
                                <div className="space-y-2">
                                    <div className="text-sm font-medium">导出内容</div>
                                    <Select
                                        value={selectedExportType || undefined}
                                        onValueChange={(value) => setSelectedExportType(value as ExportConfigType)}
                                        disabled={Boolean(axureSourceDisabledReason)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="请选择导出内容" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="code">原型</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {selectedExportType ? (
                                    <div className="space-y-2">
                                        <div className="text-sm font-medium">配置内容</div>
                                        {isLoadingConfig ? (
                                            <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                                                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                                                正在加载配置...
                                            </div>
                                        ) : (
                                            <Textarea
                                                value={exportContent}
                                                readOnly
                                                onFocus={(e) => e.currentTarget.select()}
                                                className="h-[320px] w-full font-mono text-sm"
                                                placeholder="配置内容将显示在这里"
                                            />
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
                                    以下为{showCopyConfigEntry ? '四' : '三'}种方式的准备工作与使用说明。
                                </div>

                                <div className="rounded-md border">
                                    <Accordion type="single" collapsible defaultValue="runtime-component" className="w-full">
                                        <AccordionItem value="runtime-component" className="border-b px-4">
                                            <AccordionTrigger className="py-3 text-[15px] font-semibold hover:no-underline">
                                                复制 RunTime 组件（推荐）
                                            </AccordionTrigger>
                                            <AccordionContent className="pb-4">
                                                <div className="text-xs font-semibold tracking-wide text-muted-foreground">准备工作：</div>
                                                <div className="mt-1 space-y-1 text-sm text-muted-foreground">
                                                    <p>在 Axure 中-发布- 生成 html - 设置 - 字体 - 添加字体，填入以下链接(含引号)</p>
                                                </div>
                                                <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                                                    <div className="min-w-0 flex-1 font-mono text-xs break-all">{runtimeScriptLink}</div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        className="h-6 w-6 shrink-0"
                                                        onClick={() => void handleCopyRuntimeLink()}
                                                        aria-label="复制链接"
                                                    >
                                                        <Copy className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                                <div className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground">使用：</div>
                                                <p className="mt-1 text-sm text-muted-foreground">复制 RunTime 组件，粘贴到需要演示的页面即可</p>
                                            </AccordionContent>
                                        </AccordionItem>

                                        <AccordionItem value="download-cover" className="border-b px-4">
                                            <AccordionTrigger className="py-3 text-[15px] font-semibold hover:no-underline">
                                                下载 runtime 封面
                                            </AccordionTrigger>
                                            <AccordionContent className="pb-4">
                                                <div className="text-xs font-semibold tracking-wide text-muted-foreground">准备工作：</div>
                                                <p className="mt-1 text-sm text-muted-foreground">下载 Axhub Runtime 元件，拖入需要演示的页面</p>
                                                <div className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground">使用：</div>
                                                <p className="mt-1 text-sm text-muted-foreground">下载 runtime 封面，返回 Axure 双击替换 runtime 元件的封面图片</p>
                                            </AccordionContent>
                                        </AccordionItem>

                                        <AccordionItem value="copy-prototype" className="border-b px-4">
                                            <AccordionTrigger className="py-3 text-[15px] font-semibold hover:no-underline">
                                                复制原型
                                            </AccordionTrigger>
                                            <AccordionContent className="pb-4">
                                                <div className="text-xs font-semibold tracking-wide text-muted-foreground">准备工作：</div>
                                                <p className="mt-1 text-sm text-muted-foreground">打开 3743 及以上版本的 Axure</p>
                                                <div className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground">使用：</div>
                                                <p className="mt-1 text-sm text-muted-foreground">复制后粘贴到需要演示的页面即可</p>
                                            </AccordionContent>
                                        </AccordionItem>

                                        {showCopyConfigEntry ? (
                                            <AccordionItem value="copy-config" className="border-b-0 px-4">
                                                <AccordionTrigger className="py-3 text-[15px] font-semibold hover:no-underline">
                                                    复制配置
                                                </AccordionTrigger>
                                                <AccordionContent className="pb-4">
                                                    <div className="text-xs font-semibold tracking-wide text-muted-foreground">准备工作：</div>
                                                    <p className="mt-1 text-sm text-muted-foreground">下载 Axhub Runtime 元件，拖入需要演示的页面</p>
                                                    <div className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground">使用：</div>
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                        复制配置，打开 Runtime 元件下的 config 中继器，粘贴到“编辑器配置”所在行的 value
                                                    </p>
                                                </AccordionContent>
                                            </AccordionItem>
                                        ) : null}
                                    </Accordion>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="flex flex-row justify-end gap-2 border-t px-5 py-3.5">
                        <Button variant="outline" size="sm" onClick={onClose}>
                            取消
                        </Button>
                        {activeTabKey === 'dynamicPrototype' ? (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleExport()}
                                    disabled={isExporting || isReviewing || Boolean(axureSourceDisabledReason)}
                                >
                                    {isExporting || isReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    下载 Runtime 封面
                                </Button>
                                <Button
                                    variant="brand"
                                    size="sm"
                                    onClick={() => void handleCopyRuntimeComponent()}
                                    disabled={isExporting || isReviewing || Boolean(axureSourceDisabledReason)}
                                >
                                    {isExporting || isReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    复制到 RunTime 组件
                                </Button>
                            </>
                        ) : activeTabKey === 'staticPrototype' ? (
                            <Button
                                variant="brand"
                                size="sm"
                                onClick={() => void handleCopyToAxure()}
                                disabled={Boolean(axureRuntimeDisabledReason)}
                            >
                                {isCopyingToAxure || isReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                复制到 Axure
                            </Button>
                        ) : showCopyConfigEntry && activeTabKey === 'copyConfig' ? (
                            <Button variant="brand" size="sm" onClick={() => void handleCopyConfigClick()} disabled={!exportContent || Boolean(axureSourceDisabledReason)}>
                                <Copy className="h-4 w-4" />
                                复制配置
                            </Button>
                        ) : null}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ExportReviewDialogView
                open={showReviewModal}
                reviewResult={reviewResult}
                onOpenChange={(nextOpen) => setShowReviewModal(nextOpen)}
            />
        </>
    );
}
