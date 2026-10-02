import type { NonDeletedSceneElementsMap } from "@excalidraw/element/types";
import type { RenderableElementsMap, StaticCanvasRenderConfig } from "../../scene/types";
import type { AppState } from "../../types";
import type { RoughCanvas } from "roughjs/bin/canvas";
interface NewElementCanvasProps {
    appState: AppState;
    newElement: NonNullable<AppState["newElement"]>;
    elementsMap: RenderableElementsMap;
    allElementsMap: NonDeletedSceneElementsMap;
    scale: number;
    rc: RoughCanvas;
    renderConfig: StaticCanvasRenderConfig;
    zIndex?: number;
}
declare const NewElementCanvas: (props: NewElementCanvasProps) => import("react/jsx-runtime").JSX.Element;
export default NewElementCanvas;
