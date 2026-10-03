export type PreviewLayoutStabilizationReason = 'annotation-sidebar' | 'review-panel';

export interface PreviewResponsiveBasisState {
  previewContainerWidth: number;
  externalWorkspaceWidth: number;
  activeReasons: PreviewLayoutStabilizationReason[];
  anchor: {
    previewWidth: number;
    externalWorkspaceWidth: number;
  } | null;
}

export type PreviewResponsiveBasisEvent =
  | { type: 'preview-width-changed'; width: number }
  | { type: 'external-workspace-width-changed'; width: number }
  | { type: 'stabilization-started'; reason: PreviewLayoutStabilizationReason }
  | { type: 'stabilization-ended'; reason: PreviewLayoutStabilizationReason };

export function createPreviewResponsiveBasisState(): PreviewResponsiveBasisState {
  return {
    previewContainerWidth: 0,
    externalWorkspaceWidth: 0,
    activeReasons: [],
    anchor: null,
  };
}

function normalizeWidth(width: number): number | null {
  return Number.isFinite(width) && width > 0 ? Math.floor(width) : null;
}

function captureDeferredAnchor(state: PreviewResponsiveBasisState): PreviewResponsiveBasisState {
  if (
    state.anchor
    || state.activeReasons.length === 0
    || state.previewContainerWidth <= 0
    || state.externalWorkspaceWidth <= 0
  ) {
    return state;
  }

  return {
    ...state,
    anchor: {
      previewWidth: state.previewContainerWidth,
      externalWorkspaceWidth: state.externalWorkspaceWidth,
    },
  };
}

export function reducePreviewResponsiveBasisState(
  state: PreviewResponsiveBasisState,
  event: PreviewResponsiveBasisEvent,
): PreviewResponsiveBasisState {
  if (event.type === 'preview-width-changed') {
    const width = normalizeWidth(event.width);
    return width === null
      ? state
      : captureDeferredAnchor({ ...state, previewContainerWidth: width });
  }

  if (event.type === 'external-workspace-width-changed') {
    const width = normalizeWidth(event.width);
    return width === null
      ? state
      : captureDeferredAnchor({ ...state, externalWorkspaceWidth: width });
  }

  if (event.type === 'stabilization-started') {
    if (state.activeReasons.includes(event.reason)) {
      return state;
    }

    return captureDeferredAnchor({
      ...state,
      activeReasons: [...state.activeReasons, event.reason],
    });
  }

  const activeReasons = state.activeReasons.filter((reason) => reason !== event.reason);
  if (activeReasons.length === state.activeReasons.length) {
    return state;
  }

  return {
    ...state,
    activeReasons,
    anchor: activeReasons.length > 0 ? state.anchor : null,
  };
}

export function resolvePreviewResponsiveBasisWidth(state: PreviewResponsiveBasisState): number {
  if (!state.anchor || state.externalWorkspaceWidth <= 0) {
    return state.previewContainerWidth;
  }

  return Math.max(
    1,
    state.anchor.previewWidth
      + state.externalWorkspaceWidth
      - state.anchor.externalWorkspaceWidth,
  );
}
