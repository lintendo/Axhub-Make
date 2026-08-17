import { createElement, useCallback, useMemo, useReducer, useState, type ReactNode, type SetStateAction } from 'react';
import {
    Columns2,
    LayoutGrid,
    Monitor,
    Smartphone,
    Tablet,
} from 'lucide-react';
import {
    createDefaultPreviewConfig,
    DEVICE_PRESET_SIZES,
    getPreviewSelectedDeviceId,
    normalizeMultiPageColumns,
    resolveAdaptiveDesktopPreviewConfig,
    resolveDefaultMultiPageColumns,
    type PreviewConfig,
    type MultiPageColumns,
    type PreviewScaleMode,
    type PreviewSinglePreset,
} from '../../domains/device/preview-layout';
import {
    createPreviewResponsiveBasisState,
    reducePreviewResponsiveBasisState,
    resolvePreviewResponsiveBasisWidth,
    type PreviewLayoutStabilizationReason,
} from '../../domains/device/preview-responsive-basis';
import {
    DEVICE_SIZES,
    normalizePreviewHeight,
    normalizePreviewWidth,
} from './previewActions.helpers';
import {
    loadStoredCustomPreviewSize,
    saveStoredCustomPreviewSize,
    getPreviewCustomSizeStorage,
} from './previewCustomSizeStorage';
import {
    parsePreviewDeviceParam,
    serializePreviewDeviceParam,
} from './previewDeviceUrl';

type PreviewDeviceActions = {
    previewConfig: PreviewConfig;
    previewDeviceParam: string | null;
    handlePreviewContainerSizeChange: (width: number) => void;
    handlePreviewExternalWorkspaceWidthChange: (width: number) => void;
    startPreviewLayoutStabilization: (reason: PreviewLayoutStabilizationReason) => void;
    endPreviewLayoutStabilization: (reason: PreviewLayoutStabilizationReason) => void;
    selectedDeviceId: string;
    setSelectedDeviceId: (id: string) => void;
    deviceSegmentOptions: Array<{ value: string; icon: ReactNode }>;
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
    currentDevice: typeof DEVICE_SIZES[keyof typeof DEVICE_SIZES];
    displaySize: { width: number; height: number };
};

export function usePreviewDeviceActions(): PreviewDeviceActions {
    const [previewIntentConfig, setPreviewIntentConfig] = useState<PreviewConfig>(() => {
        const storedCustomSize = loadStoredCustomPreviewSize();
        const defaultConfig: PreviewConfig = {
            ...createDefaultPreviewConfig(),
            customWidth: storedCustomSize?.customWidth ?? null,
            customHeight: storedCustomSize?.customHeight ?? null,
        };
        const urlSelection = typeof window === 'undefined'
            ? null
            : parsePreviewDeviceParam(new URLSearchParams(window.location.search).get('device'));
        if (!urlSelection) {
            return defaultConfig;
        }

        return {
            ...defaultConfig,
            singlePreset: urlSelection.preset,
            customWidth: urlSelection.preset === 'custom' ? urlSelection.width : defaultConfig.customWidth,
            customHeight: urlSelection.preset === 'custom' ? urlSelection.height : defaultConfig.customHeight,
            scaleMode: 'fit-screen',
        };
    });
    const [responsiveBasisState, dispatchResponsiveBasis] = useReducer(
        reducePreviewResponsiveBasisState,
        undefined,
        createPreviewResponsiveBasisState,
    );
    const [explicitDesktop, setExplicitDesktop] = useState(() => {
        if (typeof window === 'undefined') return false;
        const selection = parsePreviewDeviceParam(new URLSearchParams(window.location.search).get('device'));
        return selection?.preset === 'desktop';
    });
    const responsiveBasisWidth = resolvePreviewResponsiveBasisWidth(responsiveBasisState);

    const previewConfig = useMemo(
        () => resolveAdaptiveDesktopPreviewConfig(previewIntentConfig, responsiveBasisWidth),
        [previewIntentConfig, responsiveBasisWidth],
    );
    const previewDeviceParam = serializePreviewDeviceParam(previewIntentConfig, { explicitDesktop });
    const selectedDeviceId = getPreviewSelectedDeviceId(previewConfig);
    const currentPreviewDeviceId = previewConfig.previewMode === 'single' && previewConfig.singlePreset !== 'custom'
        ? previewConfig.singlePreset
        : 'desktop';
    const currentDevice = DEVICE_SIZES[currentPreviewDeviceId as keyof typeof DEVICE_SIZES] ?? DEVICE_SIZES.desktop;
    const displaySize = { width: currentDevice.width, height: currentDevice.height };

    const deviceSegmentOptions = useMemo(() => ([
        { value: 'desktop', icon: createElement(Monitor, { className: 'h-4 w-4' }) },
        { value: 'mobile', icon: createElement(Smartphone, { className: 'h-4 w-4' }) },
        { value: 'tablet', icon: createElement(Tablet, { className: 'h-4 w-4' }) },
        { value: 'custom', icon: createElement(Monitor, { className: 'h-4 w-4' }) },
        { value: 'split', icon: createElement(Columns2, { className: 'h-4 w-4' }) },
        { value: 'multi-page', icon: createElement(LayoutGrid, { className: 'h-4 w-4' }) },
    ]), []);

    const updatePreviewIntentConfig = useCallback((next: SetStateAction<PreviewConfig>) => {
        setPreviewIntentConfig(next);
    }, []);

    const setSelectedDeviceId = useCallback((id: string) => {
        if (id === 'desktop' || id === 'mobile' || id === 'tablet') {
            setExplicitDesktop(id === 'desktop');
            updatePreviewIntentConfig((previous) => ({
                ...previous,
                previewMode: 'single',
                singlePreset: id,
            }));
        }
    }, [updatePreviewIntentConfig]);

    const handleSelectPreviewSinglePreset = useCallback((preset: PreviewSinglePreset) => {
        setExplicitDesktop(preset === 'desktop');
        updatePreviewIntentConfig((previous) => ({
            ...previous,
            previewMode: 'single',
            singlePreset: preset,
        }));
    }, [updatePreviewIntentConfig]);

    const handleSelectCustomPreview = useCallback(() => {
        setExplicitDesktop(false);
        updatePreviewIntentConfig((previous) => ({
            ...previous,
            previewMode: 'single',
            singlePreset: 'custom',
            customWidth: normalizePreviewWidth(previewConfig.customWidth ?? DEVICE_PRESET_SIZES.desktop.width, DEVICE_PRESET_SIZES.desktop.width),
            customHeight: normalizePreviewHeight(previewConfig.customHeight ?? DEVICE_PRESET_SIZES.desktop.height, DEVICE_PRESET_SIZES.desktop.height),
            scaleMode: 'fit-screen',
        }));
    }, [previewConfig.customHeight, previewConfig.customWidth, updatePreviewIntentConfig]);

    const handleActivateSplitPreview = useCallback(() => {
        setExplicitDesktop(false);
        updatePreviewIntentConfig((previous) => ({
            ...previous,
            previewMode: 'split',
            splitWidths: {
                primary: normalizePreviewWidth(previous.splitWidths.primary, DEVICE_PRESET_SIZES.desktop.width),
                secondary: normalizePreviewWidth(previous.splitWidths.secondary, DEVICE_PRESET_SIZES.mobile.width),
            },
            splitHeights: {
                primary: normalizePreviewHeight(previous.splitHeights.primary, DEVICE_PRESET_SIZES.desktop.height),
                secondary: normalizePreviewHeight(previous.splitHeights.secondary, DEVICE_PRESET_SIZES.mobile.height),
            },
            scaleMode: 'fit-screen',
        }));
    }, [updatePreviewIntentConfig]);

    const handleActivateMultiPagePreview = useCallback((pageCount?: number) => {
        setExplicitDesktop(false);
        updatePreviewIntentConfig((previous) => ({
            ...previous,
            previewMode: 'multi-page',
            multiPageColumns: pageCount === undefined
                ? normalizeMultiPageColumns(previous.multiPageColumns)
                : resolveDefaultMultiPageColumns(pageCount),
            scaleMode: 'fit-screen',
        }));
    }, [updatePreviewIntentConfig]);

    const handleChangeMultiPageColumns = useCallback((columns: MultiPageColumns) => {
        updatePreviewIntentConfig((previous) => ({
            ...previous,
            previewMode: 'multi-page',
            multiPageColumns: normalizeMultiPageColumns(columns),
        }));
    }, [updatePreviewIntentConfig]);

    const handleChangeCustomPreviewWidth = useCallback((width: number) => {
        setExplicitDesktop(false);
        const customWidth = normalizePreviewWidth(width, previewConfig.customWidth ?? DEVICE_PRESET_SIZES.desktop.width);
        const customHeight = normalizePreviewHeight(previewConfig.customHeight ?? DEVICE_PRESET_SIZES.desktop.height, DEVICE_PRESET_SIZES.desktop.height);
        saveStoredCustomPreviewSize(getPreviewCustomSizeStorage(), { customWidth, customHeight });
        updatePreviewIntentConfig((previous) => ({
            ...previous,
            previewMode: previous.previewMode === 'multi-page' ? 'multi-page' : 'single',
            singlePreset: 'custom',
            customWidth,
        }));
    }, [previewConfig.customHeight, previewConfig.customWidth, updatePreviewIntentConfig]);

    const handleChangeCustomPreviewHeight = useCallback((height: number) => {
        setExplicitDesktop(false);
        const customWidth = normalizePreviewWidth(previewConfig.customWidth ?? DEVICE_PRESET_SIZES.desktop.width, DEVICE_PRESET_SIZES.desktop.width);
        const customHeight = normalizePreviewHeight(height, previewConfig.customHeight ?? DEVICE_PRESET_SIZES.desktop.height);
        saveStoredCustomPreviewSize(getPreviewCustomSizeStorage(), { customWidth, customHeight });
        updatePreviewIntentConfig((previous) => ({
            ...previous,
            previewMode: previous.previewMode === 'multi-page' ? 'multi-page' : 'single',
            singlePreset: 'custom',
            customHeight,
        }));
    }, [previewConfig.customHeight, previewConfig.customWidth, updatePreviewIntentConfig]);

    const handleChangeSplitPreviewWidth = useCallback((pane: 'primary' | 'secondary', width: number) => {
        updatePreviewIntentConfig((previous) => ({
            ...previous,
            previewMode: 'split',
            splitWidths: {
                ...previous.splitWidths,
                [pane]: normalizePreviewWidth(width, pane === 'primary' ? DEVICE_PRESET_SIZES.desktop.width : DEVICE_PRESET_SIZES.mobile.width),
            },
        }));
    }, [updatePreviewIntentConfig]);

    const handleChangeSplitPreviewHeight = useCallback((pane: 'primary' | 'secondary', height: number) => {
        updatePreviewIntentConfig((previous) => ({
            ...previous,
            previewMode: 'split',
            splitHeights: {
                ...previous.splitHeights,
                [pane]: normalizePreviewHeight(height, pane === 'primary' ? DEVICE_PRESET_SIZES.desktop.height : DEVICE_PRESET_SIZES.mobile.height),
            },
        }));
    }, [updatePreviewIntentConfig]);

    const handleChangePreviewScaleMode = useCallback((mode: PreviewScaleMode) => {
        updatePreviewIntentConfig((previous) => {
            if (previewConfig.adaptiveDesktop && mode !== previewConfig.scaleMode) {
                return {
                    ...previous,
                    previewMode: 'single',
                    singlePreset: 'custom',
                    customWidth: previewConfig.customWidth,
                    customHeight: previewConfig.customHeight,
                    scaleMode: mode,
                };
            }
            return {
                ...previous,
                scaleMode: mode,
            };
        });
    }, [previewConfig.adaptiveDesktop, previewConfig.customHeight, previewConfig.customWidth, previewConfig.scaleMode, updatePreviewIntentConfig]);

    const handlePreviewContainerSizeChange = useCallback((width: number) => {
        dispatchResponsiveBasis({ type: 'preview-width-changed', width });
    }, []);

    const handlePreviewExternalWorkspaceWidthChange = useCallback((width: number) => {
        dispatchResponsiveBasis({ type: 'external-workspace-width-changed', width });
    }, []);

    const startPreviewLayoutStabilization = useCallback((reason: PreviewLayoutStabilizationReason) => {
        dispatchResponsiveBasis({ type: 'stabilization-started', reason });
    }, []);

    const endPreviewLayoutStabilization = useCallback((reason: PreviewLayoutStabilizationReason) => {
        dispatchResponsiveBasis({ type: 'stabilization-ended', reason });
    }, []);

    return {
        previewConfig,
        previewDeviceParam,
        handlePreviewContainerSizeChange,
        handlePreviewExternalWorkspaceWidthChange,
        startPreviewLayoutStabilization,
        endPreviewLayoutStabilization,
        selectedDeviceId,
        setSelectedDeviceId,
        deviceSegmentOptions,
        handleSelectPreviewSinglePreset,
        handleSelectCustomPreview,
        handleActivateSplitPreview,
        handleActivateMultiPagePreview,
        handleChangeMultiPageColumns,
        handleChangeCustomPreviewWidth,
        handleChangeCustomPreviewHeight,
        handleChangeSplitPreviewWidth,
        handleChangeSplitPreviewHeight,
        handleChangePreviewScaleMode,
        currentDevice,
        displaySize,
    };
}
