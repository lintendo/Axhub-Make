import {
    DEVICE_PRESET_SIZES,
    type PreviewConfig,
} from '../../domains/device/preview-layout';
import {
    normalizePreviewHeight,
    normalizePreviewWidth,
} from './previewActions.helpers';

export type PreviewDeviceParamSelection = {
    preset: 'desktop' | 'mobile' | 'tablet' | 'custom';
    width: number;
    height: number;
};

export function parsePreviewDeviceParam(value: unknown): PreviewDeviceParamSelection | null {
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (normalizedValue === 'desktop') {
        return {
            preset: 'desktop',
            ...DEVICE_PRESET_SIZES.desktop,
        };
    }

    const match = /^(\d+)x(\d+)$/u.exec(normalizedValue);
    if (!match) return null;

    const width = Number.parseInt(match[1], 10);
    const height = Number.parseInt(match[2], 10);
    if (
        normalizePreviewWidth(width, Number.NaN) !== width
        || normalizePreviewHeight(height, Number.NaN) !== height
    ) {
        return null;
    }

    const preset = width === DEVICE_PRESET_SIZES.mobile.width
        && height === DEVICE_PRESET_SIZES.mobile.height
        ? 'mobile'
        : width === DEVICE_PRESET_SIZES.tablet.width
            && height === DEVICE_PRESET_SIZES.tablet.height
            ? 'tablet'
            : 'custom';

    return { preset, width, height };
}

export function formatPreviewDeviceParamSelection(selection: PreviewDeviceParamSelection): string {
    return selection.preset === 'desktop'
        ? 'desktop'
        : `${selection.width}x${selection.height}`;
}

export function serializePreviewDeviceParam(
    config: PreviewConfig,
    options: { explicitDesktop?: boolean } = {},
): string | null {
    if (config.previewMode !== 'single') {
        return null;
    }
    if (config.singlePreset === 'desktop') {
        return options.explicitDesktop ? 'desktop' : null;
    }

    if (config.singlePreset === 'mobile' || config.singlePreset === 'tablet') {
        const size = DEVICE_PRESET_SIZES[config.singlePreset];
        return `${size.width}x${size.height}`;
    }

    const selection = parsePreviewDeviceParam(`${config.customWidth ?? ''}x${config.customHeight ?? ''}`);
    return selection ? formatPreviewDeviceParamSelection(selection) : null;
}
