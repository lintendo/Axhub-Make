import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ResponsiveSidebarProvider,
  handleResponsiveSidebarToggleClick,
  useResponsiveSidebarController,
  useResponsiveSidebarTriggerBindings,
  type ResponsiveSidebarControllerValue,
} from './ResponsiveSidebarController';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('responsive sidebar controller', () => {
  it('tracks compact desktop media state and coordinates temporary open state', () => {
    let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;
    const mediaQuery = {
      matches: true,
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        mediaListener = listener;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => mediaQuery),
    });

    let controller: ResponsiveSidebarControllerValue | null = null;
    const Probe = () => {
      controller = useResponsiveSidebarController();
      return null;
    };

    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        React.createElement(
          ResponsiveSidebarProvider,
          null,
          React.createElement(Probe),
        ),
      );
    });

    expect(controller?.compactDesktop).toBe(true);
    expect(controller?.compactOpen).toBe(false);

    act(() => {
      controller?.interaction.pointerEnter();
    });
    expect(controller?.compactOpen).toBe(true);

    act(() => {
      mediaListener?.({ matches: false } as MediaQueryListEvent);
    });
    expect(controller?.compactDesktop).toBe(false);
    expect(controller?.compactOpen).toBe(false);

    act(() => {
      renderer.unmount();
    });
    expect(mediaQuery.removeEventListener).toHaveBeenCalledOnce();
  });

  it('suppresses compact clicks and preserves the full desktop toggle', () => {
    const toggle = vi.fn();

    expect(handleResponsiveSidebarToggleClick(true, toggle)).toBe(false);
    expect(toggle).not.toHaveBeenCalled();

    expect(handleResponsiveSidebarToggleClick(false, toggle)).toBe(true);
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('provides runtime bindings for compact focus, pointer, click, and media transitions', () => {
    let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;
    const mediaQuery = {
      matches: true,
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        mediaListener = listener;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => mediaQuery),
    });

    const toggle = vi.fn();
    let bindings: ReturnType<typeof useResponsiveSidebarTriggerBindings> | null = null;
    const Probe = () => {
      bindings = useResponsiveSidebarTriggerBindings(false, toggle);
      return null;
    };

    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        React.createElement(
          ResponsiveSidebarProvider,
          null,
          React.createElement(Probe),
        ),
      );
    });

    expect(bindings?.buttonProps['aria-label']).toBe('预览侧边栏');
    act(() => bindings?.buttonProps.onPointerEnter?.({} as React.PointerEvent<HTMLButtonElement>));
    expect(bindings?.buttonProps['aria-expanded']).toBe(true);

    const preventDefault = vi.fn();
    act(() => bindings?.buttonProps.onPointerDown?.({ preventDefault } as unknown as React.PointerEvent<HTMLButtonElement>));
    expect(preventDefault).toHaveBeenCalledOnce();

    act(() => bindings?.buttonProps.onClick?.({} as React.MouseEvent<HTMLButtonElement>));
    expect(toggle).not.toHaveBeenCalled();

    act(() => mediaListener?.({ matches: false } as MediaQueryListEvent));
    expect(bindings?.buttonProps['aria-label']).toBe('收起侧边栏');
    act(() => bindings?.buttonProps.onClick?.({} as React.MouseEvent<HTMLButtonElement>));
    expect(toggle).toHaveBeenCalledOnce();

    act(() => renderer.unmount());
  });
});
