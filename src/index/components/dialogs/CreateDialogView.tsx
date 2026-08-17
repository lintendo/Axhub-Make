import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppWindow, Boxes, Code2, Globe, Loader2, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { PromptClientPreference } from '../../types';
import { IDEAvailabilityMap, MainIDEPreference } from '../../../common/ide';
import type { CreateDialogTab, PrototypeUploadType } from '../../types/index-page.types';
import PromptActionButton from '../PromptActionButton';
import { Button } from '@/components/ui/button';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { generateTemplateImportPrompt, type TemplateLibraryPromptItem } from '../../utils/templateImportPrompts';
import { getUserFriendlyUploadErrorMessage } from '../../utils/uploadErrors';
import { cn } from '@/lib/utils';
import type { ResourceWriteCapabilities } from '../../services/projectResources';
import {
    Sheet,
    SheetContent,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import TemplateLibraryCard, { type TemplateLibraryCardItem } from './TemplateLibraryCard';
import { requireProjectScope, withProjectScope } from '../../services/projectScope';

type CreateDialogViewTab = 'upload' | 'onlineImport';

interface CreateDialogProps {
    visible: boolean;
    onClose: () => void;
    activeTab: 'prototypes';
    activeProjectId: string;
    initialTab?: CreateDialogTab;
    resourceWriteCapabilities: ResourceWriteCapabilities;
    preferredPromptClient: PromptClientPreference;
    preferredIDE: MainIDEPreference;
    ideAvailability?: IDEAvailabilityMap;
    assistantOpen?: boolean;
    initialUploadType?: PrototypeUploadType;
    targetPrototypeName?: string;
    onAfterCreatePromptAction: () => void;
    onExecutePrompt?: (prompt: string, meta: { scene: string; targetPath?: string | null }) => Promise<boolean | void> | boolean | void;
    onUploadSuccess?: (result?: any) => void | Promise<void>;
}

interface UploadResult {
    success: boolean;
    prompt?: string;
    message?: string;
    hint?: string;
    requiresAi?: boolean;
    reasons?: string[];
    path?: string;
    folderName?: string;
}

interface TemplateLibraryItem extends TemplateLibraryPromptItem {
    coverUrl: string;
    sourceUrl: string;
    author?: string;
    authorUrl?: string;
    previewUrl?: string;
    canDirectImport: boolean;
    directImportDisabledReason?: string;
}

interface TemplateLibraryState {
    loading: boolean;
    loaded: boolean;
    error: string;
    repo: string;
    branch: string;
    templates: TemplateLibraryItem[];
}

type DirectoryInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
    directory?: string;
    webkitdirectory?: string;
};

export default function CreateDialog({
    visible,
    onClose,
    activeTab,
    activeProjectId,
    initialTab = 'onlineImport',
    resourceWriteCapabilities,
    preferredPromptClient,
    preferredIDE,
    ideAvailability,
    assistantOpen,
    initialUploadType,
    targetPrototypeName,
    onAfterCreatePromptAction,
    onExecutePrompt,
    onUploadSuccess,
}: CreateDialogProps) {
    const [sheetPortalContainer, setSheetPortalContainer] = useState<HTMLDivElement | null>(null);
    const [activeKey, setActiveKey] = useState<CreateDialogViewTab>('onlineImport');
    const [uploadType, setUploadType] = useState<PrototypeUploadType>('make');
    const [uploadMode, setUploadMode] = useState<'zip' | 'folder'>('zip');
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
    const [selectedUploadFiles, setSelectedUploadFiles] = useState<File[]>([]);
    const [templateLibrary, setTemplateLibrary] = useState<TemplateLibraryState>({
        loading: false,
        loaded: false,
        error: '',
        repo: 'lintendo/Make-Template',
        branch: '',
        templates: [],
    });
    const [templateImportingId, setTemplateImportingId] = useState('');

    const uploadTabTitle = '导入原型';
    const canUploadPrototype = resourceWriteCapabilities.prototypeUpload;

    useEffect(() => {
        if (visible) {
            setActiveKey(initialTab === 'upload' && canUploadPrototype ? 'upload' : 'onlineImport');
            setUploadType(initialUploadType || 'make');
            setUploadMode('zip');
            setUploading(false);
            setUploadResult(null);
            setSelectedUploadFiles([]);
            setTemplateImportingId('');
        }
    }, [canUploadPrototype, initialTab, initialUploadType, visible]);

    const isAlwaysDirectType = (type: string) => ['make', 'axhub'].includes(type);
    const shouldTreatAsDirectResult = (type: string, result?: UploadResult | null) => {
        if (isAlwaysDirectType(type)) return true;
        if (type === 'axure_html') return result?.requiresAi !== true;
        if (type === 'google_stitch') return result?.requiresAi !== true;
        return false;
    };
    const isZipOnlyUploadType = (type: string) => type === 'figma_make';

    const uploadOptions = useMemo<Array<{
        key: PrototypeUploadType;
        title: string;
        description: string;
        requiresAi?: boolean;
        icon: React.ReactNode;
    }>>(() => {
        return [
            {
                key: 'make',
                title: 'Axhub Make',
                description: '支持自己或他人的 ZIP 包',
                icon: <Code2 className="h-8 w-8 text-sky-500" />,
            },
            {
                key: 'google_stitch',
                title: 'Google Stitch',
                description: 'AI 驱动的 UI 设计工具（静态）',
                icon: <AppWindow className="h-8 w-8 text-rose-500" />,
            },
            {
                key: 'axure_html',
                title: 'Axure HTML 原型',
                description: 'Axure HTML ZIP（实验性）',
                requiresAi: false,
                icon: <Boxes className="h-8 w-8 text-violet-500" />,
            },
            {
                key: 'figma_make',
                title: 'Figma Make',
                description: '上传 Figma 原始导出的 ZIP 工程包',
                icon: <Boxes className="h-8 w-8 text-pink-500" />,
            },
            {
                key: 'v0',
                title: 'V0 App',
                description: '在线应用生成平台',
                icon: <UploadCloud className="h-8 w-8 text-emerald-500" />,
            },
            {
                key: 'google_aistudio',
                title: 'Google AIStudio',
                description: '在线应用生成平台',
                icon: <Globe className="h-8 w-8 text-amber-500" />,
            },
        ];
    }, []);

    useEffect(() => {
        if (isZipOnlyUploadType(uploadType) && uploadMode !== 'zip') {
            setUploadMode('zip');
        }
    }, [uploadMode, uploadType]);

    useEffect(() => {
        if (!uploadOptions.some((option) => option.key === uploadType)) {
            const fallbackUploadType = uploadOptions[0]?.key;
            if (fallbackUploadType) {
                setUploadType(fallbackUploadType);
                setUploadMode('zip');
                setUploadResult(null);
                setSelectedUploadFiles([]);
            }
        }
    }, [uploadOptions, uploadType]);

    useEffect(() => {
        if (!visible || activeKey !== 'onlineImport' || templateLibrary.loaded) {
            return;
        }
        let cancelled = false;
        setTemplateLibrary((current) => ({
            ...current,
            loading: true,
            error: '',
        }));
        fetch(withProjectScope('/api/template-library', requireProjectScope(activeProjectId)))
            .then(async (response) => {
                const result = await response.json();
                if (!response.ok || result?.ok === false) {
                    throw new Error(result?.error || '模板库读取失败');
                }
                if (cancelled) return;
                setTemplateLibrary({
                    loading: false,
                    loaded: true,
                    error: '',
                    repo: String(result?.source?.repo || 'lintendo/Make-Template'),
                    branch: String(result?.source?.branch || ''),
                    templates: Array.isArray(result?.templates) ? result.templates : [],
                });
            })
            .catch((error: any) => {
                if (cancelled) return;
                setTemplateLibrary((current) => ({
                    ...current,
                    loading: false,
                    loaded: true,
                    error: getUserFriendlyUploadErrorMessage(error, '模板库读取失败，请稍后重试'),
                }));
            });
        return () => {
            cancelled = true;
        };
    }, [activeKey, activeProjectId, templateLibrary.loaded, visible]);

    const handleUpload = async (files: File[]) => {
        if (files.length === 0) return;

        if (isZipOnlyUploadType(uploadType) && uploadMode !== 'zip') {
            toast.error('当前来源仅支持 ZIP 上传');
            return;
        }

        const formData = new FormData();
        formData.append('uploadType', uploadType);
        formData.append('targetType', activeTab);
        formData.append('uploadMode', uploadMode);
        formData.append('projectId', requireProjectScope(activeProjectId).projectId);
        if (targetPrototypeName) {
            formData.append('targetPrototypeName', targetPrototypeName);
        }

        if (uploadMode === 'zip') {
            const file = files[0];
            if (!file.name.endsWith('.zip')) {
                toast.error('请上传 ZIP 文件');
                return;
            }
            formData.append('file', file, file.name);
        } else {
            if (files.length === 0) {
                toast.error(uploadMode === 'folder' ? '请选择文件夹' : '请选择文件');
                return;
            }
            if (uploadMode === 'folder') {
                const firstFilePath = files[0]?.webkitRelativePath || '';
                const folderName = firstFilePath.split('/').filter(Boolean)[0];
                if (folderName) {
                    formData.append('folderName', folderName);
                }
            }
            files.forEach((file) => {
                formData.append('files', file, file.name);
                const relativePath = uploadMode === 'folder' ? file.webkitRelativePath || file.name : file.name;
                formData.append('relativePaths', relativePath);
            });
        }

        setSelectedUploadFiles(files);

        setUploading(true);
        try {
            const response = await fetch(withProjectScope('/api/upload', requireProjectScope(activeProjectId)), {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (response.ok && result.success) {
                setUploadResult(result);
                if (shouldTreatAsDirectResult(uploadType, result)) {
                    toast.success(result.message || '上传成功');
                    setTimeout(() => {
                        onClose();
                        void onUploadSuccess?.(result);
                    }, 800);
                } else {
                    toast.success(result.message || '页面已准备好，可继续交给 AI 完善');
                }
            } else {
                console.error('[CreateDialog] 上传失败:', {
                    status: response.status,
                    statusText: response.statusText,
                    result,
                });
                toast.error(getUserFriendlyUploadErrorMessage(result?.error, '上传失败，请稍后重试'));
            }
        } catch (error: any) {
            console.error('[CreateDialog] 上传异常详情:', error);
            toast.error(getUserFriendlyUploadErrorMessage(error, '上传失败，请稍后重试'));
        } finally {
            setUploading(false);
        }
    };

    const buildImportPrompt = useCallback(() => {
        if (!uploadResult?.prompt) {
            throw new Error('没有可复制的 Prompt');
        }
        return uploadResult.prompt;
    }, [uploadResult]);

    const handleDirectTemplateImport = async (template: TemplateLibraryItem) => {
        if (!template.canDirectImport) {
            toast.warning(template.directImportDisabledReason || '该模板暂不支持直接导入');
            return;
        }
        setTemplateImportingId(template.id);
        try {
            const response = await fetch(withProjectScope('/api/template-library/import', requireProjectScope(activeProjectId)), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateId: template.id, targetPrototypeName }),
            });
            const result = await response.json();
            if (!response.ok || !result?.success) {
                throw new Error(result?.error || '直接导入失败');
            }
            toast.success('模板已导入');
            onClose();
            void onUploadSuccess?.(result);
        } catch (error: any) {
            toast.error(getUserFriendlyUploadErrorMessage(error, '直接导入失败，请稍后重试'));
        } finally {
            setTemplateImportingId('');
        }
    };

    const handleTemplatePreviewCardClick = useCallback((template: TemplateLibraryCardItem) => {
        const previewUrl = String(template.previewUrl || '').trim();
        if (!previewUrl) {
            toast.warning('该模板暂不支持在线预览');
            return;
        }
        window.open(previewUrl, '_blank', 'noopener,noreferrer');
    }, []);

    const directoryInputProps: DirectoryInputProps = uploadMode === 'folder' ? { directory: '', webkitdirectory: '' } : {};

    return (
        <Sheet open={visible} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
            <SheetContent
                ref={setSheetPortalContainer}
                side="right"
                className="flex w-full max-w-[620px] flex-col p-0 text-sm sm:max-w-[620px] [&>[data-sheet-close]]:hidden"
            >
                <Tabs
                    value={activeKey}
                    onValueChange={(value) => {
                        if (value === 'upload' || value === 'onlineImport') {
                            setActiveKey(value === 'upload' && !canUploadPrototype ? 'onlineImport' : value);
                        }
                    }}
                    className="flex h-full flex-col"
                >
                    <SheetHeader className="border-b px-5 py-3.5">
                        <SheetTitle className="sr-only">{uploadTabTitle}</SheetTitle>
                        <div className="flex items-center justify-between gap-3">
                            <TabsList className="grid h-8 w-full max-w-[240px] grid-cols-2 rounded-lg border border-border/70 bg-muted/50 p-0.5">
                                <TabsTrigger
                                    value="upload"
                                    disabled={!canUploadPrototype}
                                    className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none"
                                >
                                    上传
                                </TabsTrigger>
                                <TabsTrigger value="onlineImport" className="h-full rounded-md px-2.5 py-0 text-[13px] leading-none data-[state=active]:shadow-none">
                                    在线导入
                                </TabsTrigger>
                            </TabsList>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-7 w-7 rounded-md"
                                onClick={onClose}
                                aria-label="关闭"
                                disabled={uploading || Boolean(templateImportingId)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </SheetHeader>

                    <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4.5">
                        {activeKey === 'upload' && canUploadPrototype ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    {uploadOptions.map((option) => {
                                        const selected = option.key === uploadType;
                                        return (
                                            <button
                                                key={option.key}
                                                type="button"
                                                aria-pressed={selected}
                                                onClick={() => {
                                                    setUploadType(option.key);
                                                    setUploadMode('zip');
                                                    setUploadResult(null);
                                                    setSelectedUploadFiles([]);
                                                }}
                                                className={cn(
                                                    'flex min-w-0 items-center gap-2.5 rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                                                    selected
                                                        ? 'border-border/80'
                                                        : 'border-border/80 hover:border-primary/30 hover:bg-muted/30',
                                                )}
                                                style={selected ? { borderColor: 'hsl(var(--brand))' } : undefined}
                                            >
                                                <div className="flex-shrink-0 text-muted-foreground/80 [&_svg]:h-6 [&_svg]:w-6">{option.icon}</div>
                                                <div className="grid min-w-0 gap-1">
                                                    <div className="text-sm font-medium leading-none">{option.title}</div>
                                                    <div className="truncate text-[12px] leading-4 text-muted-foreground" title={option.description}>{option.description}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="space-y-3 pt-2">
                                    {isZipOnlyUploadType(uploadType) ? null : (
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm font-medium">上传方式</div>
                                            <ToggleGroup
                                                type="single"
                                                value={uploadMode}
                                                onValueChange={(value) => {
                                                    if (value === 'zip' || value === 'folder') {
                                                        setUploadMode(value);
                                                        setUploadResult(null);
                                                        setSelectedUploadFiles([]);
                                                    }
                                                }}
                                            >
                                                <ToggleGroupItem value="zip">ZIP</ToggleGroupItem>
                                                <ToggleGroupItem value="folder">文件夹</ToggleGroupItem>
                                            </ToggleGroup>
                                        </div>
                                    )}

                                    <FileDropzone
                                        title={isZipOnlyUploadType(uploadType)
                                            ? '点击上传或拖拽 Figma 原始 ZIP 到此区域'
                                            : uploadMode === 'zip' ? '点击上传或拖拽 ZIP 文件到此区域' : '点击上传文件夹'}
                                        description={isZipOnlyUploadType(uploadType)
                                            ? '请上传 Figma Make 原始导出的 ZIP 工程包，系统会按官方项目结构直接处理。'
                                            : uploadMode === 'zip'
                                                ? '建议优先使用 ZIP 上传，导入更稳定。'
                                                : '请选择本地文件夹，系统会按原目录结构上传。'}
                                        accept={isZipOnlyUploadType(uploadType) || uploadMode === 'zip' ? '.zip' : undefined}
                                        multiple={!isZipOnlyUploadType(uploadType) && uploadMode === 'folder'}
                                        disabled={uploading}
                                        loading={uploading}
                                        allowDrop={isZipOnlyUploadType(uploadType) || uploadMode !== 'folder'}
                                        browseLabel={isZipOnlyUploadType(uploadType) || uploadMode === 'zip' ? '选择 ZIP 文件' : '选择文件夹'}
                                        selectedFiles={selectedUploadFiles}
                                        onFilesSelected={handleUpload}
                                        onClear={() => {
                                            setSelectedUploadFiles([]);
                                            setUploadResult(null);
                                        }}
                                        inputProps={isZipOnlyUploadType(uploadType) ? undefined : directoryInputProps}
                                    />

                                    {uploadResult?.requiresAi ? (
                                        <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900">
                                            <div className="font-medium">页面已可预览</div>
                                            <div className="mt-1 leading-6 text-emerald-800">
                                                {uploadResult.message || '当前可先查看页面结构与样式效果，部分细节还可继续完善。'}
                                            </div>
                                            {uploadResult.hint ? (
                                                <div className="mt-1 text-[12px] leading-5 text-emerald-700">
                                                    {uploadResult.hint}
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}

                        {activeKey === 'onlineImport' ? (
                            <div className="min-h-[320px] space-y-3">
                                {templateLibrary.loading ? (
                                    <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        正在读取在线模板库
                                    </div>
                                ) : templateLibrary.error ? (
                                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                                        {templateLibrary.error}
                                    </div>
                                ) : templateLibrary.templates.length === 0 ? (
                                    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                                        暂无可导入模板
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {templateLibrary.templates.map((template) => {
                                            const importing = templateImportingId === template.id;
                                            const disabledReason = template.directImportDisabledReason || (!template.canDirectImport ? '直接导入不可用' : '');
                                            const directDisabled = Boolean(disabledReason) || !template.canDirectImport || Boolean(templateImportingId);
                                            const directImportTooltip = disabledReason
                                                ? '直接导入不可用，请复制提示词让 AI 完成导入'
                                                : templateImportingId && !importing ? '已有模板正在导入，请稍候' : '';
                                            return (
                                                <TemplateLibraryCard
                                                    key={template.id}
                                                    template={template}
                                                    importing={importing}
                                                    directImportDisabled={directDisabled}
                                                    directImportTooltip={directImportTooltip}
                                                    onPreview={handleTemplatePreviewCardClick}
                                                    renderCopyPromptAction={(item) => (
                                                        <PromptActionButton
                                                            type="borderless"
                                                            preferredClient={preferredPromptClient}
                                                            preferredIDE={preferredIDE}
                                                            ideAvailability={ideAvailability}
                                                            assistantOpen={assistantOpen}
                                                            scene="template-library-import"
                                                            buildPrompt={() => generateTemplateImportPrompt({
                                                                template: item as TemplateLibraryItem,
                                                                repo: templateLibrary.repo,
                                                                targetPrototypeName,
                                                            })}
                                                            getTargetPath={() => targetPrototypeName ? `src/prototypes/${targetPrototypeName}/index.tsx` : null}
                                                            onExecutePrompt={onExecutePrompt}
                                                            onAfterCopy={onAfterCreatePromptAction}
                                                            onAfterExecute={onAfterCreatePromptAction}
                                                            copyLabel="复制提示词"
                                                            copySuccessMessage="提示词已复制到剪贴板"
                                                            executeSuccessMessage="已发送到 AI 侧栏"
                                                            fallbackMessage="AI 执行失败，已回退为复制提示词"
                                                            disabled={Boolean(templateImportingId)}
                                                        />
                                                    )}
                                                    onDirectImport={(item) => void handleDirectTemplateImport(item as TemplateLibraryItem)}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>

                    <SheetFooter className="flex flex-row justify-end gap-2 border-t px-5 py-3.5">
                        <Button variant="outline" size="sm" onClick={onClose} disabled={uploading || Boolean(templateImportingId)}>
                            取消
                        </Button>
                        {activeKey === 'upload' && !shouldTreatAsDirectResult(uploadType, uploadResult) ? (
                            <PromptActionButton
                                type="primary"
                                preferredClient={preferredPromptClient}
                                preferredIDE={preferredIDE}
                                ideAvailability={ideAvailability}
                                assistantOpen={assistantOpen}
                                scene={`upload-${uploadType}-${activeTab}`}
                                buildPrompt={buildImportPrompt}
                                getTargetPath={() => uploadResult?.path || null}
                                onExecutePrompt={onExecutePrompt}
                                onAfterCopy={onAfterCreatePromptAction}
                                onAfterExecute={onAfterCreatePromptAction}
                                copySuccessMessage="提示词已复制到剪贴板，请粘贴给 AI 继续完善"
                                executeSuccessMessage="已打开新会话"
                                fallbackMessage="自动执行失败，已回退为复制 Prompt"
                                disabled={!uploadResult}
                            />
                        ) : null}
                    </SheetFooter>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}
