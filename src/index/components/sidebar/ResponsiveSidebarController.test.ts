import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import {
  ResponsiveSidebarProvider,
  useResponsiveSidebarController,
  useResponsiveSidebarTriggerBindings,
  type ResponsiveSidebarControllerValue,
} from './ResponsiveSidebarController';

describe('responsive sidebar controller', () => {
  it('coordinates temporary preview state without a width-specific media mode', () => {
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

    expect(controller?.previewOpen).toBe(false);
    act(() => controller?.interaction.pointerEnter());
    expect(controller?.previewOpen).toBe(true);
    act(() => controller?.interaction.close());
    expect(controller?.previewOpen).toBe(false);

    act(() => renderer.unmount());
  });

  it('opens a temporary preview while collapsed and always allows click toggling', () => {
    const toggle = vi.fn();
    let bindings: ReturnType<typeof useResponsiveSidebarTriggerBindings> | null = null;
    const Probe = ({ collapsed }: { collapsed: boolean }) => {
      bindings = useResponsiveSidebarTriggerBindings(collapsed, toggle);
      return null;
    };

    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        React.createElement(
          ResponsiveSidebarProvider,
          null,
          React.createElement(Probe, { collapsed: true }),
        ),
      );
    });

    expect(bindings?.buttonProps['aria-label']).toBe('展开侧边栏');
    act(() => bindings?.buttonProps.onPointerEnter?.({} as React.PointerEvent<HTMLButtonElement>));
    expect(bindings?.buttonProps['aria-expanded']).toBe(true);
    act(() => bindings?.buttonProps.onClick?.({} as React.MouseEvent<HTMLButtonElement>));
    expect(toggle).toHaveBeenCalledOnce();
    expect(bindings?.buttonProps['aria-expanded']).toBe(false);

    act(() => {
      renderer.update(
        React.createElement(
          ResponsiveSidebarProvider,
          null,
          React.createElement(Probe, { collapsed: false }),
        ),
      );
    });

    expect(bindings?.buttonProps['aria-label']).toBe('收起侧边栏');
    expect(bindings?.buttonProps.onPointerEnter).toBeUndefined();
    act(() => bindings?.buttonProps.onClick?.({} as React.MouseEvent<HTMLButtonElement>));
    expect(toggle).toHaveBeenCalledTimes(2);

    act(() => renderer.unmount());
  });
});
