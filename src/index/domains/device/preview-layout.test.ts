import { describe, expect, it } from 'vitest';
import {
  createDefaultPreviewConfig,
  getPreviewExportDeviceId,
  getWebEditorRootWidth,
  MULTI_PAGE_ACTIVE_LIMIT,
  MULTI_PAGE_MAX_VISIBLE,
  normalizeMultiPageColumns,
  resolveDefaultMultiPageColumns,
  resolveAdaptiveDesktopPreviewConfig,
  resolveMultiPageVisiblePages,
  resolvePreviewLayout,
  resolveStablePreviewContainerSize,
} from './preview-layout';

describe('preview layout', () => {
  it('subtracts layout insets from a usable container measurement', () => {
    expect(resolveStablePreviewContainerSize({
      previous: { width: 0, height: 0 },
      clientWidth: 1048,
      clientHeight: 732,
      horizontalInset: 48,
      verticalInset: 32,
    })).toEqual({ width: 1000, height: 700 });
  });

  it('preserves the previous size for zero and inset-only measurements', () => {
    const previous = { width: 1000, height: 700 };

    expect(resolveStablePreviewContainerSize({
      previous,
      clientWidth: 0,
      clientHeight: 0,
      horizontalInset: 48,
      verticalInset: 32,
    })).toBe(previous);
    expect(resolveStablePreviewContainerSize({
      previous,
      clientWidth: 48,
      clientHeight: 32,
      horizontalInset: 48,
      verticalInset: 32,
    })).toBe(previous);
  });

  it('keeps the initial unmeasured size until a usable measurement arrives', () => {
    const previous = { width: 0, height: 0 };

    expect(resolveStablePreviewContainerSize({
      previous,
      clientWidth: 1,
      clientHeight: 1,
      horizontalInset: 48,
      verticalInset: 32,
    })).toBe(previous);
  });

  it('accepts a valid measurement after an invalid transition', () => {
    const previous = { width: 1000, height: 700 };
    const preserved = resolveStablePreviewContainerSize({
      previous,
      clientWidth: 1,
      clientHeight: 1,
      horizontalInset: 48,
      verticalInset: 32,
    });

    expect(resolveStablePreviewContainerSize({
      previous: preserved,
      clientWidth: 848,
      clientHeight: 632,
      horizontalInset: 48,
      verticalInset: 32,
    })).toEqual({ width: 800, height: 600 });
  });

  it('defaults preview sizing to fit-screen so the full viewport is shown', () => {
    expect(createDefaultPreviewConfig().scaleMode).toBe('fit-screen');
  });

  it('derives a fixed 1440x900 viewport only below the adaptive activation width', () => {
    expect(resolveAdaptiveDesktopPreviewConfig(createDefaultPreviewConfig(), 1279)).toMatchObject({
      previewMode: 'single',
      singlePreset: 'custom',
      customWidth: 1440,
      customHeight: 900,
      adaptiveDesktop: true,
    });

    expect(resolveAdaptiveDesktopPreviewConfig(createDefaultPreviewConfig(), 1280)).toMatchObject({
      singlePreset: 'desktop',
      adaptiveDesktop: false,
    });

    expect(resolveAdaptiveDesktopPreviewConfig(createDefaultPreviewConfig(), 1350)).toMatchObject({
      singlePreset: 'desktop',
      adaptiveDesktop: false,
    });
  });

  it('preserves manual and wide default configurations', () => {
    expect(resolveAdaptiveDesktopPreviewConfig(createDefaultPreviewConfig(), 1440)).toMatchObject({
      singlePreset: 'desktop',
      adaptiveDesktop: false,
    });
    expect(resolveAdaptiveDesktopPreviewConfig({
      ...createDefaultPreviewConfig(),
      singlePreset: 'mobile',
    }, 500)).toMatchObject({
      singlePreset: 'mobile',
      adaptiveDesktop: false,
    });
  });

  it('honors a locked automatic desktop decision during temporary layout changes', () => {
    expect(resolveAdaptiveDesktopPreviewConfig(createDefaultPreviewConfig(), 1519, true)).toMatchObject({
      singlePreset: 'custom',
      adaptiveDesktop: true,
    });
    expect(resolveAdaptiveDesktopPreviewConfig(createDefaultPreviewConfig(), 1100, false)).toMatchObject({
      singlePreset: 'desktop',
      adaptiveDesktop: false,
    });
  });

  it('defaults multi-page preview to three columns with bounded live iframes', () => {
    const config = createDefaultPreviewConfig();

    expect(config.multiPageColumns).toBe(3);
    expect(MULTI_PAGE_MAX_VISIBLE).toBe(16);
    expect(MULTI_PAGE_ACTIVE_LIMIT).toBe(2);
  });

  it('normalizes multi-page columns to the fixed one-to-four choices', () => {
    expect(normalizeMultiPageColumns(1)).toBe(1);
    expect(normalizeMultiPageColumns(2)).toBe(2);
    expect(normalizeMultiPageColumns(3)).toBe(3);
    expect(normalizeMultiPageColumns(4)).toBe(4);
    expect(normalizeMultiPageColumns(0)).toBe(3);
    expect(normalizeMultiPageColumns(5)).toBe(3);
    expect(normalizeMultiPageColumns('4')).toBe(4);
    expect(normalizeMultiPageColumns('wide')).toBe(3);
  });

  it('chooses the default multi-page column count from the prototype page count', () => {
    expect(resolveDefaultMultiPageColumns(0)).toBe(1);
    expect(resolveDefaultMultiPageColumns(1)).toBe(1);
    expect(resolveDefaultMultiPageColumns(2)).toBe(2);
    expect(resolveDefaultMultiPageColumns(3)).toBe(3);
    expect(resolveDefaultMultiPageColumns(4)).toBe(4);
    expect(resolveDefaultMultiPageColumns(12)).toBe(4);
    expect(resolveDefaultMultiPageColumns(undefined)).toBe(3);
  });

  it('limits multi-page visible cards to the first sixteen pages by default', () => {
    const pages = Array.from({ length: 20 }, (_, index) => ({
      id: `page-${index + 1}`,
      title: `Page ${index + 1}`,
    }));

    expect(resolveMultiPageVisiblePages(pages)).toEqual(pages.slice(0, 16));
    expect(resolveMultiPageVisiblePages(pages.slice(0, 7))).toEqual(pages.slice(0, 7));
  });

  it('uses the selected device logical size for multi-page cards', () => {
    const config = {
      ...createDefaultPreviewConfig(),
      previewMode: 'multi-page' as const,
      singlePreset: 'mobile' as const,
    };

    const layout = resolvePreviewLayout({
      config,
      containerWidth: 1200,
      containerHeight: 800,
    });

    expect(layout.mode).toBe('multi-page');
    expect(layout.multiPage.card.logicalWidth).toBe(393);
    expect(layout.multiPage.card.logicalHeight).toBe(852);
    expect(layout.multiPage.columns).toBe(3);
  });

  it('always fits multi-page cards to screen even if another mode selected fit-width', () => {
    const config = {
      ...createDefaultPreviewConfig(),
      previewMode: 'multi-page' as const,
      singlePreset: 'custom' as const,
      customWidth: 1200,
      customHeight: 1600,
      multiPageColumns: 1 as const,
      scaleMode: 'fit-width' as const,
    };

    const layout = resolvePreviewLayout({
      config,
      containerWidth: 1200,
      containerHeight: 600,
    });

    expect(layout.mode).toBe('multi-page');
    expect(layout.multiPage.card.scale).toBeCloseTo(600 / 1600, 5);
    expect(layout.multiPage.card.viewportHeight).toBeLessThanOrEqual(600);
  });

  it('does not collapse multi-page cards before the container height is measured', () => {
    const config = {
      ...createDefaultPreviewConfig(),
      previewMode: 'multi-page' as const,
      singlePreset: 'desktop' as const,
      multiPageColumns: 4 as const,
    };

    const layout = resolvePreviewLayout({
      config,
      containerWidth: 1748,
      containerHeight: 0,
    });

    expect(layout.mode).toBe('multi-page');
    expect(layout.multiPage.card.viewportWidth).toBeGreaterThan(300);
    expect(layout.multiPage.card.viewportHeight).toBeGreaterThan(200);
  });

  it('shrinks custom single preview by width in fit-width mode', () => {
    const config = {
      ...createDefaultPreviewConfig(),
      singlePreset: 'custom' as const,
      customWidth: 1280,
      customHeight: 800,
      scaleMode: 'fit-width' as const,
    };

    const layout = resolvePreviewLayout({
      config,
      containerWidth: 1000,
      containerHeight: 700,
    });

    expect(layout.mode).toBe('single');
    expect(layout.single.kind).toBe('custom');
    expect(layout.single.logicalWidth).toBe(1280);
    expect(layout.single.logicalHeight).toBe(800);
    expect(layout.single.scale).toBeCloseTo(1000 / 1280, 5);
  });

  it('shrinks custom single preview by the tighter screen constraint in fit-screen mode', () => {
    const config = {
      ...createDefaultPreviewConfig(),
      singlePreset: 'custom' as const,
      customWidth: 1280,
      customHeight: 960,
      scaleMode: 'fit-screen' as const,
    };

    const layout = resolvePreviewLayout({
      config,
      containerWidth: 1100,
      containerHeight: 400,
    });

    expect(layout.mode).toBe('single');
    expect(layout.single.kind).toBe('custom');
    expect(layout.single.scale).toBeLessThan(1100 / 1280);
    expect(layout.single.viewportHeight).toBeLessThanOrEqual(400);
  });

  it('uses the measured document height for fit-screen so the whole page can fit in view', () => {
    const config = {
      ...createDefaultPreviewConfig(),
      singlePreset: 'custom' as const,
      customWidth: 1280,
      customHeight: 800,
      scaleMode: 'fit-screen' as const,
    };

    const layout = resolvePreviewLayout({
      config,
      containerWidth: 1100,
      containerHeight: 700,
      actualSingleContentSize: {
        width: 1280,
        height: 2200,
      },
    });

    expect(layout.mode).toBe('single');
    expect(layout.single.kind).toBe('custom');
    expect(layout.single.logicalHeight).toBe(2200);
    expect(layout.single.viewportHeight).toBeLessThanOrEqual(700);
    expect(layout.single.scale).toBeCloseTo(700 / 2200, 5);
  });

  it('keeps adaptive desktop height fixed so long pages scroll inside the iframe', () => {
    const layout = resolvePreviewLayout({
      config: {
        ...createDefaultPreviewConfig(),
        singlePreset: 'custom',
        customWidth: 1440,
        customHeight: 900,
        adaptiveDesktop: true,
      },
      containerWidth: 1100,
      containerHeight: 700,
      actualSingleContentSize: {
        width: 1440,
        height: 12000,
      },
    });

    expect(layout.mode).toBe('single');
    expect(layout.single.logicalHeight).toBe(900);
    expect(layout.single.iframeHeight).toBe(900);
  });

  it('keeps mobile device chrome at the preset viewport size when the page content is tall', () => {
    const config = {
      ...createDefaultPreviewConfig(),
      singlePreset: 'mobile' as const,
      scaleMode: 'fit-screen' as const,
    };

    const layout = resolvePreviewLayout({
      config,
      containerWidth: 1000,
      containerHeight: 900,
      actualSingleContentSize: {
        width: 393,
        height: 12000,
      },
      deviceShellInset: { width: 32, height: 32 },
    });

    expect(layout.mode).toBe('single');
    expect(layout.single.kind).toBe('mobile');
    expect(layout.single.logicalWidth).toBe(393);
    expect(layout.single.logicalHeight).toBe(852);
    expect(layout.single.iframeHeight).toBe(852);
    expect(layout.single.viewportWidth).toBe(393);
    expect(layout.single.viewportHeight).toBe(852);
    expect(layout.single.scale).toBe(1);
  });

  it('keeps split preview panes inside the available container width', () => {
    const config = {
      ...createDefaultPreviewConfig(),
      previewMode: 'split' as const,
      splitWidths: { primary: 1440, secondary: 393 },
      splitHeights: { primary: 900, secondary: 852 },
      scaleMode: 'fit-width' as const,
    };

    const layout = resolvePreviewLayout({
      config,
      containerWidth: 960,
      containerHeight: 720,
    });

    expect(layout.mode).toBe('split');
    expect(layout.split.primary.viewportWidth + layout.split.secondary.viewportWidth).toBeLessThanOrEqual(960);
    expect(layout.split.primary.scale).toBeLessThanOrEqual(1);
    expect(layout.split.secondary.scale).toBeLessThanOrEqual(1);
  });

  it('reserves horizontal space for split gutters so the outer page does not overflow', () => {
    const config = {
      ...createDefaultPreviewConfig(),
      previewMode: 'split' as const,
      splitWidths: { primary: 1440, secondary: 393 },
      splitHeights: { primary: 900, secondary: 852 },
      scaleMode: 'fit-width' as const,
    };

    const layout = resolvePreviewLayout({
      config,
      containerWidth: 960,
      containerHeight: 720,
      splitReservedWidth: 44,
    });

    expect(layout.mode).toBe('split');
    expect(layout.split.primary.viewportWidth + layout.split.secondary.viewportWidth).toBeLessThanOrEqual(916);
  });

  it('reserves vertical space for split headers when fitting to screen', () => {
    const config = {
      ...createDefaultPreviewConfig(),
      previewMode: 'split' as const,
      splitWidths: { primary: 1440, secondary: 393 },
      splitHeights: { primary: 900, secondary: 852 },
      scaleMode: 'fit-screen' as const,
    };

    const layout = resolvePreviewLayout({
      config,
      containerWidth: 2200,
      containerHeight: 700,
      splitReservedHeight: 40,
    });

    expect(layout.mode).toBe('split');
    expect(layout.split.primary.viewportHeight).toBeLessThanOrEqual(660);
    expect(layout.split.secondary.viewportHeight).toBeLessThanOrEqual(660);
  });

  it('accounts for device shell chrome when fitting mobile previews to screen', () => {
    const config = {
      ...createDefaultPreviewConfig(),
      singlePreset: 'mobile' as const,
    };

    const layout = resolvePreviewLayout({
      config,
      containerWidth: 430,
      containerHeight: 900,
      deviceShellInset: { width: 32, height: 32 },
    });

    expect(layout.mode).toBe('single');
    expect(layout.single.kind).toBe('mobile');
    expect(layout.single.viewportWidth).toBeLessThanOrEqual(398);
    expect(layout.single.viewportHeight).toBeLessThanOrEqual(868);
  });

  it('uses the split primary width for web editor sizing', () => {
    const config = {
      ...createDefaultPreviewConfig(),
      previewMode: 'split' as const,
      splitWidths: { primary: 1600, secondary: 430 },
      splitHeights: { primary: 1000, secondary: 932 },
    };

    expect(getWebEditorRootWidth(config)).toBe(1600);
  });

  it('falls back to desktop export defaults for split and custom modes', () => {
    expect(getPreviewExportDeviceId({
      ...createDefaultPreviewConfig(),
      singlePreset: 'custom',
      customWidth: 1366,
      customHeight: 820,
    })).toBe('desktop');

    expect(getPreviewExportDeviceId({
      ...createDefaultPreviewConfig(),
      previewMode: 'split',
    })).toBe('desktop');
  });
});
