import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ResourceWriteCapabilities } from '../../services/projectResources';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { getUserFriendlyUploadErrorMessage } from '../../utils/uploadErrors';
import { requireProjectScope, withProjectScope } from '../../services/projectScope';
import { useProgressiveLibraryItems } from '../../hooks/useProgressiveLibraryItems';
import TemplateLibraryCard, { type TemplateLibraryCardItem } from './TemplateLibraryCard';

interface ThemeLibraryItem extends TemplateLibraryCardItem {
    sourceUrl: string;
    canDirectImport: boolean;
}

interface ThemeLibraryState {
    loading: boolean;
    loaded: boolean;
    error: string;
    designSystems: ThemeLibraryItem[];
}

interface CreateThemeDialogProps {
    visible: boolean;
    activeProjectId: string;
    onClose: () => void;
    resourceWriteCapabilities: ResourceWriteCapabilities;
    onImportSuccess?: () => void | Promise<void>;
}

const EMPTY_THEME_LIBRARY: ThemeLibraryState = {
    loading: false,
    loaded: false,
    error: '',
    designSystems: [],
};

export default function CreateThemeDialog({
    visible,
    activeProjectId,
    onClose,
    resourceWriteCapabilities,
    onImportSuccess,
}: CreateThemeDialogProps) {
    const [themeLibrary, setThemeLibrary] = useState<ThemeLibraryState>(EMPTY_THEME_LIBRARY);
    const [themeImportingId, setThemeImportingId] = useState('');
    const canImportTheme = resourceWriteCapabilities.themeImport;
    const {
        visibleItems: visibleDesignSystems,
        hasMore: hasMoreThemeCases,
        loadMoreRef: themeCasesLoadMoreRef,
    } = useProgressiveLibraryItems(themeLibrary.designSystems, activeProjectId);

    useEffect(() => {
        setThemeLibrary(EMPTY_THEME_LIBRARY);
    }, [activeProjectId]);

    useEffect(() => {
        if (!visible || themeLibrary.loaded) {
            return;
        }
        let cancelled = false;
        setThemeLibrary((current) => ({
            ...current,
            loading: true,
            error: '',
        }));
        fetch(withProjectScope('/api/theme-library', requireProjectScope(activeProjectId)))
            .then(async (response) => {
                const result = await response.json();
                if (!response.ok || result?.ok === false) {
                    throw new Error(result?.error || '设计系统库读取失败');
                }
                if (cancelled) return;
                setThemeLibrary({
                    loading: false,
                    loaded: true,
                    error: '',
                    designSystems: Array.isArray(result?.designSystems) ? result.designSystems : [],
                });
            })
            .catch((error: any) => {
                if (cancelled) return;
                setThemeLibrary((current) => ({
                    ...current,
                    loading: false,
                    loaded: true,
                    error: getUserFriendlyUploadErrorMessage(error, '设计系统库读取失败，请稍后重试'),
                }));
            });
        return () => {
            cancelled = true;
        };
    }, [activeProjectId, themeLibrary.loaded, visible]);

    useEffect(() => {
        if (visible) {
            setThemeImportingId('');
        }
    }, [visible]);

    const handleThemePreviewCardClick = (designSystem: TemplateLibraryCardItem) => {
        const previewUrl = String(designSystem.previewUrl || '').trim();
        if (!previewUrl) {
            toast.warning('该主题暂不支持在线预览');
            return;
        }
        window.open(previewUrl, '_blank', 'noopener,noreferrer');
    };

    const handleDirectThemeLibraryImport = async (designSystem: TemplateLibraryCardItem) => {
        if (!canImportTheme) {
            toast.warning('当前项目不支持主题导入');
            return;
        }
        if (!designSystem.canDirectImport) {
            toast.warning(designSystem.directImportDisabledReason || '该设计系统暂不支持导入');
            return;
        }
        setThemeImportingId(designSystem.id);
        try {
            const response = await fetch(withProjectScope('/api/theme-library/import', requireProjectScope(activeProjectId)), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ designSystemId: designSystem.id }),
            });
            const result = await response.json();
            if (!response.ok || !result?.success) {
                throw new Error(result?.error || '导入失败');
            }
            toast.success('设计系统已导入');
            onClose();
            void onImportSuccess?.();
        } catch (error: any) {
            toast.error(getUserFriendlyUploadErrorMessage(error, '导入失败，请稍后重试'));
        } finally {
            setThemeImportingId('');
        }
    };

    return (
        <Sheet open={visible} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
            <SheetContent
                side="right"
                className="flex w-full max-w-[620px] flex-col p-0 text-sm sm:max-w-[620px] [&>[data-sheet-close]]:hidden"
            >
                <SheetHeader className="border-b px-5 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                        <SheetTitle>在线主题模板</SheetTitle>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7 rounded-md"
                            onClick={onClose}
                            aria-label="关闭"
                            disabled={Boolean(themeImportingId)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-5 py-4.5">
                    {themeLibrary.loading ? (
                        <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            正在读取在线设计系统库
                        </div>
                    ) : themeLibrary.error ? (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                            {themeLibrary.error}
                        </div>
                    ) : themeLibrary.designSystems.length === 0 ? (
                        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                            暂无可导入设计系统
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3">
                                {visibleDesignSystems.map((designSystem) => {
                                    const importing = themeImportingId === designSystem.id;
                                    const disabledReason = !canImportTheme
                                        ? '当前项目不支持主题导入'
                                        : designSystem.directImportDisabledReason || (!designSystem.canDirectImport ? '导入不可用' : '');
                                    const directDisabled = Boolean(disabledReason)
                                        || !designSystem.canDirectImport
                                        || Boolean(themeImportingId);
                                    const directImportTooltip = disabledReason
                                        || (themeImportingId && !importing ? '已有设计系统正在导入，请稍候' : '');
                                    return (
                                        <TemplateLibraryCard
                                            key={designSystem.id}
                                            template={designSystem}
                                            importing={importing}
                                            directImportDisabled={directDisabled}
                                            directImportTooltip={directImportTooltip}
                                            directImportLabel="导入"
                                            onPreview={handleThemePreviewCardClick}
                                            onDirectImport={(designSystem) => void handleDirectThemeLibraryImport(designSystem)}
                                        />
                                    );
                                })}
                            </div>
                            {hasMoreThemeCases ? (
                                <div
                                    ref={themeCasesLoadMoreRef}
                                    aria-label="继续加载主题模板"
                                    className="h-1 w-full"
                                />
                            ) : null}
                        </>
                    )}
                </div>

                <SheetFooter className="flex flex-row justify-end gap-2 border-t px-5 py-3.5">
                    <Button variant="outline" size="sm" onClick={onClose} disabled={Boolean(themeImportingId)}>
                        取消
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
