import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
export declare const splitVisibleElementsByEmbeddables: (visibleElements: readonly NonDeletedExcalidrawElement[]) => {
    layers: NonDeletedExcalidrawElement[][];
    embeddableLayerById: Map<string, number>;
};
export declare const getCanvasLayerZIndex: (layerIndex: number) => number;
export declare const getEmbeddableLayerZIndex: (embeddableLayer: number) => number;
export declare const getTransientCanvasLayerZIndex: (canvasLayerCount: number) => number;
export declare const getInteractiveCanvasLayerZIndex: (canvasLayerCount: number) => number;
export declare const getActiveEmbeddableLayerZIndex: (canvasLayerCount: number) => number;
