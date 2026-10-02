import type { NonDeletedExcalidrawElement, NonDeletedSceneElementsMap } from "@excalidraw/element/types";
import type { RenderableElementsMap, StaticCanvasRenderConfig } from "../../scene/types";
import type { StaticCanvasAppState } from "../../types";
type StaticCanvasLayerProps = {
    elementsMap: RenderableElementsMap;
    allElementsMap: NonDeletedSceneElementsMap;
    visibleElements: readonly NonDeletedExcalidrawElement[];
    scale: number;
    appState: StaticCanvasAppState;
    renderConfig: StaticCanvasRenderConfig;
    zIndex: number;
};
declare const StaticCanvasLayer: (props: StaticCanvasLayerProps) => import("react/jsx-runtime").JSX.Element;
export default StaticCanvasLayer;
