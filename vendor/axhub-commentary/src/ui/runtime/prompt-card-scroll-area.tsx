import React from 'react';
import type { PartialOptions } from 'overlayscrollbars';
import {
  OverlayScrollbarsComponent,
  type OverlayScrollbarsComponentRef,
} from 'overlayscrollbars-react';

const PROMPT_CARD_SCROLL_OPTIONS: PartialOptions = {
  overflow: {
    x: 'hidden',
    y: 'scroll',
  },
  scrollbars: {
    theme: 'we-runtime-overlay-scrollbars',
    visibility: 'auto',
    autoHide: 'scroll',
    autoHideDelay: 180,
    autoHideSuspend: true,
    dragScroll: true,
    clickScroll: false,
    pointers: ['mouse', 'touch', 'pen'],
  },
};

function getNormalizedWheelDelta(
  event: React.WheelEvent<HTMLDivElement>,
  pageSize: number,
): { x: number; y: number } {
  if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
    return { x: event.deltaX, y: event.deltaY };
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return {
      x: event.deltaX * pageSize,
      y: event.deltaY * pageSize,
    };
  }

  const lineHeight = 16;
  return {
    x: event.deltaX * lineHeight,
    y: event.deltaY * lineHeight,
  };
}

function isQuerySelectorHost(value: unknown): value is Pick<ParentNode, 'querySelector'> {
  return (
    !!value &&
    typeof value === 'object' &&
    'querySelector' in value &&
    typeof value.querySelector === 'function'
  );
}

function isScrollableViewport(value: unknown): value is HTMLElement {
  return (
    !!value &&
    typeof value === 'object' &&
    'clientHeight' in value &&
    typeof value.clientHeight === 'number' &&
    'scrollHeight' in value &&
    typeof value.scrollHeight === 'number' &&
    'scrollTop' in value &&
    typeof value.scrollTop === 'number'
  );
}

export function resolvePromptCardScrollViewport(
  rootRef: OverlayScrollbarsComponentRef<'div'> | null,
): HTMLElement | null {
  const rootElement = rootRef?.getElement();
  if (!isQuerySelectorHost(rootElement)) {
    return null;
  }

  const viewport = rootElement.querySelector('[data-overlayscrollbars-viewport]');
  return isScrollableViewport(viewport) ? viewport : null;
}

export function PromptCardScrollArea(props: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}): React.ReactElement {
  const { children, style } = props;
  const rootRef = React.useRef<OverlayScrollbarsComponentRef<'div'> | null>(null);

  const handleWheelCapture = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const viewport = resolvePromptCardScrollViewport(rootRef.current);
    if (!viewport) {
      return;
    }

    const { x, y } = getNormalizedWheelDelta(event, viewport.clientHeight || 1);
    const delta = y !== 0 ? y : x;

    if (delta === 0) {
      event.stopPropagation();
      return;
    }

    const maxOffset = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    if (maxOffset <= 0) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const nextOffset = Math.min(maxOffset, Math.max(0, viewport.scrollTop + delta));

    event.preventDefault();
    event.stopPropagation();
    viewport.scrollTop = nextOffset;
  }, []);

  return (
    <OverlayScrollbarsComponent
      ref={rootRef}
      defer
      data-overlayscrollbars-initialize
      className="we-runtime-prompt-card__scroll-area"
      style={{ width: '100%', ...style }}
      options={PROMPT_CARD_SCROLL_OPTIONS}
      onWheelCapture={handleWheelCapture}
    >
      <div className="we-runtime-prompt-card__scroll-content">
        {children}
      </div>
    </OverlayScrollbarsComponent>
  );
}
