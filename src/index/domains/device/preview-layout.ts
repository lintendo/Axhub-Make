export type PreviewMode = 'single' | 'split' | 'multi-page';
export type PreviewSinglePreset = 'desktop' | 'mobile' | 'tablet' | 'custom';
export type PreviewScaleMode = 'fit-width' | 'fit-screen';
export type PreviewDeviceId = 'desktop' | 'mobile' | 'tablet';
export type MultiPageColumns = 1 | 2 | 3 | 4;

export interface PreviewConfig {
  previewMode: PreviewMode;
  singlePreset: PreviewSinglePreset;
  adaptiveDesktop?: boolean;
  customWidth: number | null;
  customHeight: number | null;
  multiPageColumns: MultiPageColumns;
  splitWidths: {
    primary: number;
    secondary: number;
  };
  splitHeights: {
    primary: number;
    secondary: number;
  };
  scaleMode: PreviewScaleMode;
}

export interface PreviewViewportMetrics {
  logicalWidth: number;
  logicalHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  iframeHeight: number;
  scale: number;
}

export interface SinglePreviewLayoutResult {
  kind: PreviewSinglePreset;
  logicalWidth: number;
  logicalHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  iframeHeight: number;
  scale: number;
  deviceId: PreviewDeviceId | null;
}

export interface SplitPreviewLayoutResult {
  primary: PreviewViewportMetrics;
  secondary: PreviewViewportMetrics;
}

export interface MultiPageLayoutResult {
  columns: MultiPageColumns;
  card: PreviewViewportMetrics;
}

export type PreviewLayoutResult =
  | { mode: 'single'; single: SinglePreviewLayoutResult }
  | { mode: 'split'; split: SplitPreviewLayoutResult }
  | { mode: 'multi-page'; multiPage: MultiPageLayoutResult };

export interface PreviewMeasuredContentSize {
  width: number;
  height: number;
}

export function resolveStablePreviewContainerSize(params: {
  previous: PreviewMeasuredContentSize;
  clientWidth: number;
  clientHeight: number;
  horizontalInset: number;
  verticalInset: number;
}): PreviewMeasuredContentSize {
  const horizontalInset = Math.max(0, Math.floor(params.horizontalInset));
  const verticalInset = Math.max(0, Math.floor(params.verticalInset));
  const width = Number.isFinite(params.clientWidth)
    ? Math.floor(params.clientWidth) - horizontalInset
    : 0;
  const height = Number.isFinite(params.clientHeight)
    ? Math.floor(params.clientHeight) - verticalInset
    : 0;

  if (width <= 0 || height <= 0) {
    return params.previous;
  }

  if (params.previous.width === width && params.previous.height === height) {
    return params.previous;
  }

  return { width, height };
}

export const DEVICE_PRESET_SIZES: Record<PreviewDeviceId, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 393, height: 852 },
  tablet: { width: 820, height: 1180 },
};

export const ADAPTIVE_DESKTOP_WIDTH = 1440;
export const ADAPTIVE_DESKTOP_HEIGHT = 900;
export const ADAPTIVE_DESKTOP_ACTIVATION_WIDTH = 1280;

export const MULTI_PAGE_MAX_VISIBLE = 16;
export const MULTI_PAGE_ACTIVE_LIMIT = 2;
export const DEFAULT_MULTI_PAGE_COLUMNS: MultiPageColumns = 3;

export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  previewMode: 'single',
  singlePreset: 'desktop',
  customWidth: null,
  customHeight: null,
  multiPageColumns: DEFAULT_MULTI_PAGE_COLUMNS,
  splitWidths: {
    primary: DEVICE_PRESET_SIZES.desktop.width,
    secondary: DEVICE_PRESET_SIZES.mobile.width,
  },
  splitHeights: {
    primary: DEVICE_PRESET_SIZES.desktop.height,
    secondary: DEVICE_PRESET_SIZES.mobile.height,
  },
  scaleMode: 'fit-screen',
};

function clampPositive(value: number | null | undefined, fallback: number): number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    return fallback;
  }
  return Math.round(value as number);
}

export function normalizeMultiPageColumns(value: unknown, fallback: MultiPageColumns = DEFAULT_MULTI_PAGE_COLUMNS): MultiPageColumns {
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value.trim(), 10)
      : NaN;
  return numericValue === 1 || numericValue === 2 || numericValue === 3 || numericValue === 4
    ? numericValue
    : fallback;
}

export function resolveDefaultMultiPageColumns(pageCount: unknown): MultiPageColumns {
  if (typeof pageCount !== 'number' || !Number.isFinite(pageCount)) {
    return DEFAULT_MULTI_PAGE_COLUMNS;
  }
  return normalizeMultiPageColumns(Math.min(4, Math.max(1, Math.round(pageCount))), 1);
}

export function resolveMultiPageVisiblePages<T>(pages: readonly T[]): T[] {
  return pages.slice(0, MULTI_PAGE_MAX_VISIBLE);
}

function resolveMeasuredSize(
  baseWidth: number,
  baseHeight: number,
  measured: PreviewMeasuredContentSize | null | undefined,
  scaleMode: PreviewScaleMode,
): { width: number; height: number } {
  const safeBaseWidth = clampPositive(baseWidth, 1);
  const safeBaseHeight = clampPositive(baseHeight, 1);

  if (scaleMode !== 'fit-screen' || !measured) {
    return {
      width: safeBaseWidth,
      height: safeBaseHeight,
    };
  }

  return {
    width: safeBaseWidth,
    height: Math.max(safeBaseHeight, clampPositive(measured.height, safeBaseHeight)),
  };
}

function computeScale(
  logicalWidth: number,
  logicalHeight: number,
  containerWidth: number,
  containerHeight: number,
  mode: PreviewScaleMode,
): number {
  if (logicalWidth <= 0 || logicalHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return 1;
  }

  const widthScale = containerWidth / logicalWidth;
  if (mode === 'fit-width') {
    return Math.min(1, widthScale);
  }

  const screenScale = Math.min(widthScale, containerHeight / logicalHeight);
  return Math.min(1, screenScale);
}

function createViewportMetrics(
  logicalWidth: number,
  logicalHeight: number,
  containerWidth: number,
  containerHeight: number,
  scaleMode: PreviewScaleMode,
): PreviewViewportMetrics {
  const safeContainerWidth = Math.max(1, Math.floor(containerWidth));
  const safeContainerHeight = Math.max(1, Math.floor(containerHeight));
  const safeLogicalWidth = Math.max(1, Math.round(logicalWidth));
  const safeLogicalHeight = Math.max(1, Math.round(logicalHeight));
  const scale = computeScale(safeLogicalWidth, safeLogicalHeight, safeContainerWidth, safeContainerHeight, scaleMode);
  const viewportWidth = Math.max(1, Math.min(safeContainerWidth, Math.round(safeLogicalWidth * scale)));
  const scaledHeight = Math.max(1, Math.round(safeLogicalHeight * scale));
  const viewportHeight = scaleMode === 'fit-screen'
    ? Math.min(safeContainerHeight, scaledHeight)
    : scaledHeight;
  const iframeHeight = safeLogicalHeight;

  return {
    logicalWidth: safeLogicalWidth,
    logicalHeight: safeLogicalHeight,
    viewportWidth,
    viewportHeight,
    iframeHeight,
    scale,
  };
}

export function createDefaultPreviewConfig(): PreviewConfig {
  return {
    ...DEFAULT_PREVIEW_CONFIG,
    splitWidths: { ...DEFAULT_PREVIEW_CONFIG.splitWidths },
    splitHeights: { ...DEFAULT_PREVIEW_CONFIG.splitHeights },
  };
}

export function resolveAdaptiveDesktopPreviewConfig(
  intentConfig: PreviewConfig,
  previewWidth: number,
  lockedAdaptiveDesktop: boolean | null = null,
): PreviewConfig {
  if (
    intentConfig.previewMode !== 'single'
    || intentConfig.singlePreset !== 'desktop'
  ) {
    return { ...intentConfig, adaptiveDesktop: false };
  }

  const adaptiveDesktop = lockedAdaptiveDesktop ?? (
    Number.isFinite(previewWidth)
    && previewWidth > 0
    && previewWidth < ADAPTIVE_DESKTOP_ACTIVATION_WIDTH
  );
  if (!adaptiveDesktop) {
    return { ...intentConfig, adaptiveDesktop: false };
  }

  return {
    ...intentConfig,
    singlePreset: 'custom',
    customWidth: ADAPTIVE_DESKTOP_WIDTH,
    customHeight: ADAPTIVE_DESKTOP_HEIGHT,
    scaleMode: 'fit-screen',
    adaptiveDesktop: true,
  };
}

export function getSinglePreviewLogicalSize(config: PreviewConfig): { width: number; height: number } | null {
  switch (config.singlePreset) {
    case 'mobile':
      return DEVICE_PRESET_SIZES.mobile;
    case 'tablet':
      return DEVICE_PRESET_SIZES.tablet;
    case 'custom':
      return {
        width: clampPositive(config.customWidth, DEVICE_PRESET_SIZES.desktop.width),
        height: clampPositive(config.customHeight, DEVICE_PRESET_SIZES.desktop.height),
      };
    default:
      return null;
  }
}

export function getWebEditorRootWidth(config: PreviewConfig): number | null {
  if (config.previewMode === 'split') {
    return clampPositive(config.splitWidths.primary, DEVICE_PRESET_SIZES.desktop.width);
  }
  if (config.previewMode === 'multi-page') {
    return null;
  }

  return getSinglePreviewLogicalSize(config)?.width ?? null;
}

export function getPreviewExportDeviceId(config: PreviewConfig): PreviewDeviceId {
  if (config.previewMode === 'split' || config.previewMode === 'multi-page') {
    return 'desktop';
  }

  switch (config.singlePreset) {
    case 'mobile':
      return 'mobile';
    case 'tablet':
      return 'tablet';
    default:
      return 'desktop';
  }
}

export function getPreviewSelectedDeviceId(config: PreviewConfig): string {
  if (config.previewMode === 'split') {
    return 'split';
  }
  if (config.previewMode === 'multi-page') {
    return 'multi-page';
  }

  return config.singlePreset;
}

function resolveMultiPageLogicalSize(config: PreviewConfig): { width: number; height: number } {
  if (config.singlePreset === 'custom') {
    return {
      width: clampPositive(config.customWidth, DEVICE_PRESET_SIZES.desktop.width),
      height: clampPositive(config.customHeight, DEVICE_PRESET_SIZES.desktop.height),
    };
  }

  if (config.singlePreset === 'mobile' || config.singlePreset === 'tablet') {
    return DEVICE_PRESET_SIZES[config.singlePreset];
  }

  return DEVICE_PRESET_SIZES.desktop;
}

export function resolvePreviewLayout(params: {
  config: PreviewConfig;
  containerWidth: number;
  containerHeight: number;
  actualSingleContentSize?: PreviewMeasuredContentSize | null;
  actualSplitContentSizes?: {
    primary?: PreviewMeasuredContentSize | null;
    secondary?: PreviewMeasuredContentSize | null;
  };
  deviceShellInset?: {
    width: number;
    height: number;
  };
  splitReservedHeight?: number;
  splitReservedWidth?: number;
}): PreviewLayoutResult {
  const rawContainerWidth = Number.isFinite(params.containerWidth) ? Math.floor(params.containerWidth) : 0;
  const rawContainerHeight = Number.isFinite(params.containerHeight) ? Math.floor(params.containerHeight) : 0;
  const containerWidth = Math.max(1, Math.floor(params.containerWidth));
  const containerHeight = Math.max(1, Math.floor(params.containerHeight));
  const config = params.config;
  const deviceShellInset = {
    width: Math.max(0, Math.floor(params.deviceShellInset?.width ?? 0)),
    height: Math.max(0, Math.floor(params.deviceShellInset?.height ?? 0)),
  };
  const splitReservedHeight = Math.max(0, Math.floor(params.splitReservedHeight ?? 0));
  const splitReservedWidth = Math.max(0, Math.floor(params.splitReservedWidth ?? 0));

  if (config.previewMode === 'split') {
    const primaryLogicalWidth = clampPositive(config.splitWidths.primary, DEVICE_PRESET_SIZES.desktop.width);
    const secondaryLogicalWidth = clampPositive(config.splitWidths.secondary, DEVICE_PRESET_SIZES.mobile.width);
    const primaryLogicalHeight = clampPositive(config.splitHeights.primary, DEVICE_PRESET_SIZES.desktop.height);
    const secondaryLogicalHeight = clampPositive(config.splitHeights.secondary, DEVICE_PRESET_SIZES.mobile.height);
    const primaryMeasuredSize = resolveMeasuredSize(
      primaryLogicalWidth,
      primaryLogicalHeight,
      params.actualSplitContentSizes?.primary,
      config.scaleMode,
    );
    const secondaryMeasuredSize = resolveMeasuredSize(
      secondaryLogicalWidth,
      secondaryLogicalHeight,
      params.actualSplitContentSizes?.secondary,
      config.scaleMode,
    );
    const totalLogicalWidth = Math.max(1, primaryLogicalWidth + secondaryLogicalWidth);
    const splitContainerWidth = Math.max(1, containerWidth - splitReservedWidth);
    const primaryContainerWidth = Math.max(1, Math.floor((splitContainerWidth * primaryLogicalWidth) / totalLogicalWidth));
    const secondaryContainerWidth = Math.max(1, splitContainerWidth - primaryContainerWidth);
    const splitContainerHeight = Math.max(1, containerHeight - splitReservedHeight);

    return {
      mode: 'split',
      split: {
        primary: createViewportMetrics(
          primaryMeasuredSize.width,
          primaryMeasuredSize.height,
          primaryContainerWidth,
          splitContainerHeight,
          config.scaleMode,
        ),
        secondary: createViewportMetrics(
          secondaryMeasuredSize.width,
          secondaryMeasuredSize.height,
          secondaryContainerWidth,
          splitContainerHeight,
          config.scaleMode,
        ),
      },
    };
  }

  if (config.previewMode === 'multi-page') {
    const logicalSize = resolveMultiPageLogicalSize(config);
    const columns = normalizeMultiPageColumns(config.multiPageColumns);
    const horizontalGap = Math.max(0, columns - 1) * 16;
    const layoutContainerWidth = rawContainerWidth > 1
      ? containerWidth
      : logicalSize.width * columns + horizontalGap;
    const layoutContainerHeight = rawContainerHeight > 1
      ? containerHeight
      : logicalSize.height;
    const cardContainerWidth = Math.max(1, Math.floor((layoutContainerWidth - horizontalGap) / columns));
    const cardContainerHeight = Math.max(1, layoutContainerHeight);

    return {
      mode: 'multi-page',
      multiPage: {
        columns,
        card: createViewportMetrics(
          logicalSize.width,
          logicalSize.height,
          cardContainerWidth,
          cardContainerHeight,
          'fit-screen',
        ),
      },
    };
  }

  if (config.singlePreset === 'desktop') {
    return {
      mode: 'single',
      single: {
        kind: 'desktop',
        logicalWidth: containerWidth,
        logicalHeight: containerHeight,
        viewportWidth: containerWidth,
        viewportHeight: containerHeight,
        iframeHeight: containerHeight,
        scale: 1,
        deviceId: 'desktop',
      },
    };
  }

  if (config.singlePreset === 'custom') {
    const measuredSize = resolveMeasuredSize(
      clampPositive(config.customWidth, DEVICE_PRESET_SIZES.desktop.width),
      clampPositive(config.customHeight, DEVICE_PRESET_SIZES.desktop.height),
      config.adaptiveDesktop ? null : params.actualSingleContentSize,
      config.scaleMode,
    );
    const metrics = createViewportMetrics(
      measuredSize.width,
      measuredSize.height,
      containerWidth,
      containerHeight,
      config.scaleMode,
    );

    return {
      mode: 'single',
      single: {
        kind: 'custom',
        ...metrics,
        deviceId: null,
      },
    };
  }

  const deviceId = config.singlePreset;
  const deviceSize = DEVICE_PRESET_SIZES[deviceId];
  const singleContainerWidth = deviceId === 'desktop'
    ? containerWidth
    : Math.max(1, containerWidth - deviceShellInset.width);
  const singleContainerHeight = deviceId === 'desktop'
    ? containerHeight
    : Math.max(1, containerHeight - deviceShellInset.height);
  const metrics = createViewportMetrics(
    deviceSize.width,
    deviceSize.height,
    singleContainerWidth,
    singleContainerHeight,
    'fit-screen',
  );

  return {
    mode: 'single',
    single: {
      kind: deviceId,
      ...metrics,
      deviceId,
    },
  };
}
