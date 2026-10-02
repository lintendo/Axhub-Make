import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePreviewDeviceActions } from './usePreviewDeviceActions';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderHook(search: string) {
  const storage = new Map<string, string>();
  vi.stubGlobal('window', {
    location: { search },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });

  let value: ReturnType<typeof usePreviewDeviceActions> | null = null;
  const Probe = () => {
    value = usePreviewDeviceActions();
    return null;
  };

  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(React.createElement(Probe));
  });

  return {
    get value() {
      return value;
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

describe('usePreviewDeviceActions URL state', () => {
  it('restores named and custom single-device dimensions from the URL', () => {
    const mobile = renderHook('?projectId=make-project&p=home&device=393x852');
    expect(mobile.value?.previewConfig.singlePreset).toBe('mobile');
    expect(mobile.value?.previewDeviceParam).toBe('393x852');
    mobile.unmount();

    const custom = renderHook('?device=1280x800');
    expect(custom.value?.previewConfig).toMatchObject({
      previewMode: 'single',
      singlePreset: 'custom',
      customWidth: 1280,
      customHeight: 800,
    });
    expect(custom.value?.previewDeviceParam).toBe('1280x800');
    custom.unmount();
  });

  it('keeps default desktop state for absent or invalid device values', () => {
    const absent = renderHook('?projectId=make-project&p=home');
    expect(absent.value?.previewConfig.singlePreset).toBe('desktop');
    expect(absent.value?.previewDeviceParam).toBeNull();
    absent.unmount();

    const invalid = renderHook('?device=bad');
    expect(invalid.value?.previewConfig.singlePreset).toBe('desktop');
    expect(invalid.value?.previewDeviceParam).toBeNull();
    invalid.unmount();
  });

  it('restores an explicit desktop selection from the URL', () => {
    const hook = renderHook('?device=desktop');

    act(() => hook.value?.handlePreviewContainerSizeChange(500));
    expect(hook.value?.previewConfig).toMatchObject({
      singlePreset: 'custom',
      customWidth: 1440,
      customHeight: 900,
      adaptiveDesktop: true,
    });
    expect(hook.value?.previewDeviceParam).toBe('desktop');
    hook.unmount();
  });

  it('keeps desktop intent while scaling the canvas after the assistant narrows the preview', () => {
    const hook = renderHook('');

    act(() => hook.value?.handlePreviewContainerSizeChange(1400));
    act(() => hook.value?.handleSelectPreviewSinglePreset('desktop'));
    expect(hook.value?.previewConfig).toMatchObject({
      singlePreset: 'desktop',
      adaptiveDesktop: false,
    });
    expect(hook.value?.previewDeviceParam).toBe('desktop');

    act(() => hook.value?.handlePreviewContainerSizeChange(1000));
    expect(hook.value?.previewConfig).toMatchObject({
      singlePreset: 'custom',
      customWidth: 1440,
      customHeight: 900,
      adaptiveDesktop: true,
    });
    expect(hook.value?.previewDeviceParam).toBe('desktop');

    act(() => hook.value?.handleSelectCustomPreview());
    expect(hook.value?.previewConfig).toMatchObject({
      singlePreset: 'custom',
      customWidth: 1440,
      customHeight: 900,
      adaptiveDesktop: false,
    });
    expect(hook.value?.previewDeviceParam).toBe('1440x900');

    act(() => hook.value?.handleSelectPreviewSinglePreset('desktop'));
    expect(hook.value?.previewConfig).toMatchObject({
      singlePreset: 'custom',
      customWidth: 1440,
      customHeight: 900,
      adaptiveDesktop: true,
    });
    expect(hook.value?.previewDeviceParam).toBe('desktop');
    hook.unmount();
  });

  it('keeps a manual scale mode selection after automatic desktop sizing activates', () => {
    const hook = renderHook('');

    act(() => hook.value?.handlePreviewContainerSizeChange(1279));
    expect(hook.value?.previewConfig).toMatchObject({
      singlePreset: 'custom',
      adaptiveDesktop: true,
      scaleMode: 'fit-screen',
    });

    act(() => hook.value?.handleChangePreviewScaleMode('fit-width'));
    expect(hook.value?.previewConfig).toMatchObject({
      previewMode: 'single',
      singlePreset: 'custom',
      customWidth: 1440,
      customHeight: 900,
      adaptiveDesktop: false,
      scaleMode: 'fit-width',
    });

    hook.unmount();
  });

  it('stabilizes annotation layout changes while following real workspace resizing', () => {
    const hook = renderHook('');

    act(() => {
      hook.value?.handlePreviewContainerSizeChange(1279);
      hook.value?.handlePreviewExternalWorkspaceWidthChange(1519);
    });
    expect(hook.value?.previewConfig.adaptiveDesktop).toBe(true);

    act(() => hook.value?.startPreviewLayoutStabilization('annotation-sidebar'));
    act(() => hook.value?.handlePreviewContainerSizeChange(1519));
    expect(hook.value?.previewConfig).toMatchObject({
      singlePreset: 'custom',
      customWidth: 1440,
      customHeight: 900,
      adaptiveDesktop: true,
    });

    act(() => {
      hook.value?.handlePreviewExternalWorkspaceWidthChange(1760);
      hook.value?.handlePreviewContainerSizeChange(1760);
    });
    expect(hook.value?.previewConfig).toMatchObject({
      singlePreset: 'desktop',
      adaptiveDesktop: false,
    });

    act(() => hook.value?.endPreviewLayoutStabilization('annotation-sidebar'));
    hook.unmount();
  });

  it('keeps overlapping layout owners independent and manual device changes effective', () => {
    const hook = renderHook('');

    act(() => {
      hook.value?.handlePreviewContainerSizeChange(1350);
      hook.value?.handlePreviewExternalWorkspaceWidthChange(1590);
    });
    act(() => {
      hook.value?.startPreviewLayoutStabilization('annotation-sidebar');
      hook.value?.startPreviewLayoutStabilization('review-panel');
      hook.value?.handlePreviewContainerSizeChange(970);
    });
    act(() => hook.value?.handleSelectPreviewSinglePreset('mobile'));
    expect(hook.value?.previewConfig).toMatchObject({
      singlePreset: 'mobile',
      adaptiveDesktop: false,
    });

    act(() => hook.value?.handleSelectPreviewSinglePreset('desktop'));
    expect(hook.value?.previewConfig).toMatchObject({
      singlePreset: 'desktop',
      adaptiveDesktop: false,
    });

    act(() => hook.value?.endPreviewLayoutStabilization('annotation-sidebar'));
    expect(hook.value?.previewConfig).toMatchObject({
      singlePreset: 'desktop',
      adaptiveDesktop: false,
    });

    act(() => hook.value?.endPreviewLayoutStabilization('review-panel'));
    expect(hook.value?.previewConfig).toMatchObject({
      singlePreset: 'custom',
      customWidth: 1440,
      customHeight: 900,
      adaptiveDesktop: true,
    });
    hook.unmount();
  });

  it('does not derive adaptive desktop for manual device modes', () => {
    const hook = renderHook('?device=393x852');

    act(() => hook.value?.handlePreviewContainerSizeChange(500));
    expect(hook.value?.previewConfig).toMatchObject({
      singlePreset: 'mobile',
      adaptiveDesktop: false,
    });
    expect(hook.value?.previewDeviceParam).toBe('393x852');
    hook.unmount();
  });
});
