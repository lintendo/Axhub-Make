type SafeResult<T> = {
    skipped: false;
    data: T;
} | {
    skipped: true;
    reason: 'clipboard_unavailable' | 'dom_unavailable' | 'chrome_runtime_unavailable';
};
declare const hasDomEnvironment: () => boolean;
declare const hasClipboardEnvironment: () => boolean;
declare const hasChromeRuntime: () => boolean;

interface BuildFragmentParams {
    fileKey?: string;
    layers?: any[];
    message?: any;
}
declare const buildKiwiClipboardFragment: ({ layers, fileKey, message, }: BuildFragmentParams) => Promise<string>;
declare const copyLayersToFigmaClipboard: ({ layers, fileKey, message, }: BuildFragmentParams) => Promise<void>;

interface CopyToFigmaParams {
    layers: any[];
}
interface CopyToFigmaResult {
    mode: 'clipboard';
    protocolVersion: string;
}
declare const copyToFigmaWithKiwi: ({ layers, }: CopyToFigmaParams) => Promise<CopyToFigmaResult>;
declare const copyDebugRectangleToFigmaWithKiwi: () => Promise<CopyToFigmaResult>;

type CustomFigmaScriptStatus = 'preparing_assets' | 'injecting_script' | 'running_capture' | 'fallback_bundled' | 'fallback_console' | 'success' | 'error';
interface CustomFigmaScriptConsoleFallbackPayload {
    code: string;
    copied: boolean;
}
interface CustomFigmaScriptAdapter {
    prepareAssets?: (selector: string) => Promise<void>;
    injectMainScript: (scriptContent: string) => Promise<{
        ok: boolean;
        reason?: string;
    }>;
    runCapture: (selector: string) => Promise<void>;
    injectBundledFallback?: (bundledScriptContent: string, selector: string) => Promise<void>;
    copyText?: (text: string) => Promise<boolean>;
}
interface CustomFigmaScriptParams {
    selector?: string;
    scriptContent: string;
    adapter: CustomFigmaScriptAdapter;
    fallback?: {
        bundledScriptContent?: string;
        enableConsoleFallback?: boolean;
    };
    hooks?: {
        onStatus?: (status: CustomFigmaScriptStatus) => void;
        onConsoleFallbackReady?: (payload: CustomFigmaScriptConsoleFallbackPayload) => void;
    };
}
interface CustomFigmaScriptCaptureResult {
    mode: 'main_script' | 'bundled_fallback' | 'console_fallback';
    consoleFallback?: CustomFigmaScriptConsoleFallbackPayload;
}
declare const captureWithCustomFigmaScript: ({ selector, scriptContent, adapter, fallback, hooks, }: CustomFigmaScriptParams) => Promise<CustomFigmaScriptCaptureResult>;
declare const safeCaptureWithCustomFigmaScript: (params: CustomFigmaScriptParams) => Promise<SafeResult<CustomFigmaScriptCaptureResult>>;

declare const buildKiwiMessageFromLayers: (layers: any[]) => Promise<{
    type: string;
    sessionID: number;
    ackID: number;
    pasteIsPartiallyOutsideEnclosingFrame: boolean;
    pastePageId: {
        sessionID: number;
        localID: number;
    };
    isCut: boolean;
    pasteEditorType: string;
    publishedAssetGuids: never[];
    clipboardSelectionRegions: {
        parent: {
            sessionID: number;
            localID: number;
        };
        nodes: any[];
        pasteIsPartiallyOutsideEnclosingFrame: boolean;
        focusType: string;
    }[];
    nodeChanges: any[];
    blobs: {
        bytes: Uint8Array;
    }[];
}>;
declare const buildKiwiDebugRectangleMessage: () => any;

interface FigmaProtocolAssets {
    schema: any;
    protocolVersion: string;
}
declare const getProtocolVersion: () => string;
declare const loadFigmaProtocolAssets: () => FigmaProtocolAssets;

interface FigmaSchemaValidationResult {
    definitionCount: number;
    definitionKindMissingCount: number;
    definitionTypePresentCount: number;
}
declare const validateFigmaSchema: (schema: any) => FigmaSchemaValidationResult;

declare const STANDARD_FIGMA_NODE_TYPES: readonly ["FRAME", "GROUP", "RECTANGLE", "LINE", "TEXT", "SVG"];
type StandardFigmaNodeType = (typeof STANDARD_FIGMA_NODE_TYPES)[number];
declare const STANDARD_FIGMA_PAINT_TYPES: readonly ["SOLID", "GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND", "IMAGE"];
type StandardFigmaPaintType = (typeof STANDARD_FIGMA_PAINT_TYPES)[number];
declare const STANDARD_FIGMA_EFFECT_TYPES: readonly ["INNER_SHADOW", "DROP_SHADOW", "FOREGROUND_BLUR", "BACKGROUND_BLUR"];
type StandardFigmaEffectType = (typeof STANDARD_FIGMA_EFFECT_TYPES)[number];
declare const STANDARD_LAYOUT_MODES: readonly ["NONE", "HORIZONTAL", "VERTICAL"];
type StandardLayoutMode = (typeof STANDARD_LAYOUT_MODES)[number];
declare const STANDARD_LAYOUT_WRAP: readonly ["NO_WRAP", "WRAP"];
type StandardLayoutWrap = (typeof STANDARD_LAYOUT_WRAP)[number];
declare const STANDARD_LAYOUT_SIZING: readonly ["FIXED", "AUTO"];
type StandardLayoutSizingMode = (typeof STANDARD_LAYOUT_SIZING)[number];
declare const STANDARD_PRIMARY_AXIS_ALIGN: readonly ["MIN", "CENTER", "MAX", "SPACE_BETWEEN"];
type StandardPrimaryAxisAlignItems = (typeof STANDARD_PRIMARY_AXIS_ALIGN)[number];
declare const STANDARD_COUNTER_AXIS_ALIGN: readonly ["MIN", "CENTER", "MAX", "BASELINE"];
type StandardCounterAxisAlignItems = (typeof STANDARD_COUNTER_AXIS_ALIGN)[number];
declare const STANDARD_LAYOUT_ALIGN: readonly ["MIN", "CENTER", "MAX", "STRETCH", "INHERIT"];
type StandardLayoutAlign = (typeof STANDARD_LAYOUT_ALIGN)[number];
declare const STANDARD_LAYOUT_POSITIONING: readonly ["AUTO", "ABSOLUTE"];
type StandardLayoutPositioning = (typeof STANDARD_LAYOUT_POSITIONING)[number];
declare const STANDARD_HORIZONTAL_CONSTRAINTS: readonly ["MIN", "CENTER", "MAX", "STRETCH", "SCALE", "FIXED_MIN", "FIXED_MAX"];
declare const STANDARD_VERTICAL_CONSTRAINTS: readonly ["MIN", "CENTER", "MAX", "STRETCH", "SCALE", "FIXED_MIN", "FIXED_MAX"];
type StandardHorizontalConstraint = (typeof STANDARD_HORIZONTAL_CONSTRAINTS)[number];
type StandardVerticalConstraint = (typeof STANDARD_VERTICAL_CONSTRAINTS)[number];
declare const STANDARD_IMAGE_SCALE_MODES: readonly ["STRETCH", "FIT", "FILL", "TILE"];
type StandardImageScaleMode = (typeof STANDARD_IMAGE_SCALE_MODES)[number];
declare const STANDARD_TEXT_ALIGN_HORIZONTAL: readonly ["LEFT", "CENTER", "RIGHT", "JUSTIFIED"];
type StandardTextAlignHorizontal = (typeof STANDARD_TEXT_ALIGN_HORIZONTAL)[number];
declare const STANDARD_TEXT_ALIGN_VERTICAL: readonly ["TOP", "CENTER", "BOTTOM"];
type StandardTextAlignVertical = (typeof STANDARD_TEXT_ALIGN_VERTICAL)[number];
declare const STANDARD_TEXT_CASE: readonly ["ORIGINAL", "UPPER", "LOWER", "TITLE", "SMALL_CAPS", "SMALL_CAPS_FORCED"];
type StandardTextCase = (typeof STANDARD_TEXT_CASE)[number];
declare const STANDARD_TEXT_DECORATION: readonly ["NONE", "UNDERLINE", "STRIKETHROUGH"];
type StandardTextDecoration = (typeof STANDARD_TEXT_DECORATION)[number];
declare const STANDARD_TEXT_AUTO_RESIZE: readonly ["NONE", "WIDTH_AND_HEIGHT", "HEIGHT"];
type StandardTextAutoResize = (typeof STANDARD_TEXT_AUTO_RESIZE)[number];
interface StandardFigmaColor {
    r: number;
    g: number;
    b: number;
    a: number;
}
interface StandardFigmaVector {
    x: number;
    y: number;
}
interface StandardFigmaTransform {
    m00: number;
    m01: number;
    m02: number;
    m10: number;
    m11: number;
    m12: number;
}
interface StandardFigmaNumberField {
    value: number;
    unit: 'PIXELS' | 'PERCENT' | 'RAW';
}
interface StandardFigmaGradientStop {
    color: StandardFigmaColor;
    position: number;
}
interface StandardFigmaPaintBase {
    type: StandardFigmaPaintType;
    visible: boolean;
    blendMode?: string;
    opacity?: number;
}
interface StandardFigmaSolidPaint extends StandardFigmaPaintBase {
    type: 'SOLID';
    color?: StandardFigmaColor;
}
interface StandardFigmaGradientPaint extends StandardFigmaPaintBase {
    type: 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND';
    gradientStops?: StandardFigmaGradientStop[];
    gradientHandlePositions?: StandardFigmaVector[];
}
interface StandardFigmaImagePaint extends StandardFigmaPaintBase {
    type: 'IMAGE';
    imageHash?: string;
    svg?: string;
    intArr?: unknown;
    bytes?: unknown;
    originalImageWidth?: number;
    originalImageHeight?: number;
    imageScaleMode?: StandardImageScaleMode;
    transform?: StandardFigmaTransform;
    rotation?: number;
    scale?: number;
}
type StandardFigmaPaint = StandardFigmaSolidPaint | StandardFigmaGradientPaint | StandardFigmaImagePaint;
interface StandardFigmaEffect {
    type: StandardFigmaEffectType;
    visible: boolean;
    radius: number;
    color?: StandardFigmaColor;
    offset?: StandardFigmaVector;
    blendMode?: string;
    spread?: number;
}
interface StandardFigmaFontName {
    family: string;
    style: string;
    postscript?: string;
}
interface StandardFigmaTextDataLine {
    lineType: 'PLAIN';
    styleId: number;
    indentationLevel: number;
    sourceDirectionality: 'AUTO';
    listStartOffset: number;
    isFirstLineOfList: boolean;
}
interface StandardFigmaTextData {
    characters: string;
    lines: StandardFigmaTextDataLine[];
}
interface StandardFigmaNode {
    type: StandardFigmaNodeType;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
    opacity?: number;
    rotation?: number;
    blendMode?: string;
    clipsContent?: boolean;
    fills?: StandardFigmaPaint[];
    strokes?: StandardFigmaPaint[];
    strokeWeight?: number;
    strokeAlign?: string;
    strokeCap?: string;
    strokeJoin?: string;
    dashPattern?: number[];
    effects?: StandardFigmaEffect[];
    cornerRadius?: number;
    rectangleCornerRadiiIndependent?: boolean;
    rectangleTopLeftCornerRadius?: number;
    rectangleTopRightCornerRadius?: number;
    rectangleBottomLeftCornerRadius?: number;
    rectangleBottomRightCornerRadius?: number;
    horizontalConstraint?: StandardHorizontalConstraint;
    verticalConstraint?: StandardVerticalConstraint;
    layoutMode?: StandardLayoutMode;
    layoutWrap?: StandardLayoutWrap;
    primaryAxisSizingMode?: StandardLayoutSizingMode;
    counterAxisSizingMode?: StandardLayoutSizingMode;
    primaryAxisAlignItems?: StandardPrimaryAxisAlignItems;
    counterAxisAlignItems?: StandardCounterAxisAlignItems;
    layoutAlign?: StandardLayoutAlign;
    layoutPositioning?: StandardLayoutPositioning;
    layoutGrow?: number;
    itemSpacing?: number;
    counterAxisSpacing?: number;
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    characters?: string;
    textData?: StandardFigmaTextData;
    fontSize?: number;
    fontName?: StandardFigmaFontName;
    textAlignHorizontal?: StandardTextAlignHorizontal;
    textAlignVertical?: StandardTextAlignVertical;
    textDecoration?: StandardTextDecoration;
    textCase?: StandardTextCase;
    textAutoResize?: StandardTextAutoResize;
    lineHeight?: StandardFigmaNumberField;
    letterSpacing?: StandardFigmaNumberField;
    textTracking?: number;
    svg?: string;
    children?: StandardFigmaNode[];
}
interface StandardFigmaNodeValidationResult {
    valid: boolean;
    normalizedNode?: StandardFigmaNode;
    diagnostics: string[];
}
interface StandardFigmaNodePayloadValidationResult {
    valid: boolean;
    normalizedNodes: StandardFigmaNode[];
    diagnostics: string[];
}
interface StandardFigmaFontNormalizationOptions {
    availableFontFamilies?: Iterable<string> | null;
}
declare const STANDARD_FIGMA_CONTRACT_FALLBACKS: {
    readonly nodeType: "RECTANGLE";
    readonly nodeName: "RECTANGLE";
    readonly geometry: {
        readonly x: 0;
        readonly y: 0;
        readonly width: 1;
        readonly height: 1;
        readonly rotation: 0;
        readonly opacity: 1;
    };
    readonly paint: {
        readonly type: "SOLID";
        readonly visible: true;
        readonly imageScaleMode: "FILL";
        readonly opacity: 1;
    };
    readonly text: {
        readonly characters: "";
        readonly fontFamily: "Roboto";
        readonly fontStyle: "Regular";
        readonly fontSize: 16;
        readonly textAlignHorizontal: "LEFT";
        readonly textAlignVertical: "TOP";
        readonly textDecoration: "NONE";
        readonly textCase: "ORIGINAL";
        readonly textAutoResize: "HEIGHT";
        readonly lineHeightUnit: "PIXELS";
    };
    readonly layout: {
        readonly mode: "NONE";
        readonly wrap: "NO_WRAP";
        readonly primaryAxisSizingMode: "FIXED";
        readonly counterAxisSizingMode: "FIXED";
        readonly primaryAxisAlignItems: "MIN";
        readonly counterAxisAlignItems: "MIN";
        readonly layoutAlign: "INHERIT";
        readonly layoutPositioning: "AUTO";
    };
    readonly constraints: {
        readonly horizontal: "MIN";
        readonly vertical: "MIN";
    };
};

declare const deriveStandardFontStyle: (fontWeight: unknown, fontStyle: unknown, fallback: string) => string;
declare const validateAndNormalizeStandardFigmaNode: (input: unknown, path?: string, fontOptions?: StandardFigmaFontNormalizationOptions) => StandardFigmaNodeValidationResult;
declare const validateStandardFigmaLayerPayload: (layers: unknown, fontOptions?: StandardFigmaFontNormalizationOptions) => StandardFigmaNodePayloadValidationResult;

interface MappingStats {
    inputCount: number;
    outputCount: number;
    textCount: number;
    svgCount: number;
    frameCount: number;
}
interface CompleteLayerMappingResult {
    layers: StandardFigmaNode[];
    diagnostics: string[];
    stats: MappingStats;
}
declare const mapLayersToCompleteFigmaNodes: (layers: any[]) => CompleteLayerMappingResult;

interface ConverterStats {
    inputCount: number;
    outputCount: number;
    warningCount: number;
    nodeTypeCounts: Record<StandardFigmaNodeType, number>;
}
interface ConvertLayersToStandardFigmaNodesOptions {
    validateContract?: boolean;
    rootPath?: string;
    availableFontFamilies?: Iterable<string> | null;
}
interface ConvertLayersToStandardFigmaNodesResult {
    nodes: StandardFigmaNode[];
    diagnostics: string[];
    valid: boolean;
    stats: ConverterStats;
}
declare const convertLayersToStandardFigmaNodes: (layers: unknown, options?: ConvertLayersToStandardFigmaNodesOptions) => ConvertLayersToStandardFigmaNodesResult;

declare const safeBuildKiwiClipboardFragment: (params: Parameters<typeof buildKiwiClipboardFragment>[0]) => Promise<SafeResult<Awaited<ReturnType<typeof buildKiwiClipboardFragment>>>>;
declare const safeCopyLayersToFigmaClipboard: (params: Parameters<typeof copyLayersToFigmaClipboard>[0]) => Promise<SafeResult<Awaited<ReturnType<typeof copyLayersToFigmaClipboard>>>>;
declare const safeCopyToFigmaWithKiwi: (params: Parameters<typeof copyToFigmaWithKiwi>[0]) => Promise<SafeResult<Awaited<ReturnType<typeof copyToFigmaWithKiwi>>>>;
declare const safeCopyDebugRectangleToFigmaWithKiwi: () => Promise<SafeResult<Awaited<ReturnType<typeof copyDebugRectangleToFigmaWithKiwi>>>>;

type CapturedQuadPoint = {
    x: number;
    y: number;
};
type CapturedRect = {
    x: number;
    y: number;
    width: number;
    height: number;
    cssWidth: number;
    cssHeight: number;
};
type CapturedRelativeTransform = {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
};
type CapturedAsset = {
    id: string;
    kind: 'image' | 'background' | 'canvas' | 'video';
    originalUrl?: string;
    mimeType?: string;
    dataUrl: string | null;
};
type CapturedFontUsage = {
    fontFamily: string;
    fontWeight: string;
    fontStyle: string;
    fontStretch: string;
    fontSize: string;
    metrics?: {
        fontBoundingBoxAscent?: number;
        fontBoundingBoxDescent?: number;
        lineBoxHeight?: number;
    };
};
type CapturedFontFamily = {
    familyName: string;
    faces: unknown[];
    usages: CapturedFontUsage[];
};
type CapturedFonts = {
    availableFamilies: string[];
    usages: CapturedFontUsage[];
    families?: Record<string, CapturedFontFamily>;
};
type CapturedTextNode = {
    nodeType: 3;
    id: string;
    text: string;
    rect: CapturedRect;
    lineCount: number;
};
type CapturedElementNode = {
    nodeType: 1;
    id: string;
    tag: string;
    attributes: Record<string, string>;
    styles: Record<string, string>;
    rect: CapturedRect;
    childNodes: CapturedNode[];
    content?: string;
    placeholderUrl?: string;
    pseudoElementStyles?: Partial<Record<'before' | 'after' | 'marker' | 'placeholder', Record<string, string>>>;
    variableStyles?: Record<string, string>;
    relativeTransform?: CapturedRelativeTransform;
    quad?: {
        p1: CapturedQuadPoint;
        p2: CapturedQuadPoint;
        p3: CapturedQuadPoint;
        p4: CapturedQuadPoint;
    };
};
type CapturedNode = CapturedTextNode | CapturedElementNode;
type CapturedDocument = {
    root: CapturedElementNode;
    documentTitle?: string;
    documentRect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    viewportRect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    devicePixelRatio: number;
    assets: Record<string, CapturedAsset>;
    fonts: CapturedFonts;
};
type CaptureDocumentForFigmaNewOptions = {
    selector?: string;
};
type CapturedDocumentToFigmaLayersOptions = {
    rootName?: string;
    isAxure?: boolean;
    widgetId?: string;
    enableAutoLayout?: boolean;
    useFrames?: boolean;
};
type OfficialClipboardMetadata = {
    dataType: 'h2d';
    source: 'mcp';
    capturedAtIso: string;
};
type OfficialClipboardCopyResult = {
    success: boolean;
    error?: string;
    assetCount: number;
    embeddedAssetCount: number;
    missingAssetCount: number;
    payloadSizeKb: number;
};
type OfficialClipboardSerializedResult = OfficialClipboardCopyResult & {
    htmlBase64?: string;
};
declare const __convertUrlToDataUrlForTests: (url: string) => Promise<string | null>;
declare const captureDocumentForFigmaNew: (selector?: string | Element, options?: CaptureDocumentForFigmaNewOptions) => Promise<CapturedDocument>;
declare const buildOfficialClipboardPayloadFromCapturedDocument: (capturedDoc: CapturedDocument) => Promise<string>;
declare const buildOfficialClipboardHtmlFromPayload: (payloadText: string, metadata?: OfficialClipboardMetadata) => Promise<Blob>;
declare const serializeDocumentForFigmaNewOfficialClipboard: (selector?: string | Element) => Promise<OfficialClipboardSerializedResult>;
declare const copyDocumentForFigmaNewOfficialClipboard: (selector?: string | Element) => Promise<OfficialClipboardCopyResult>;
declare const capturedDocumentToFigmaLayers: (capturedDoc: CapturedDocument, options?: CapturedDocumentToFigmaLayersOptions) => Promise<any[]>;

declare const htmlToFigma: (selector?: string | HTMLElement, options?: any) => Promise<any[]>;
declare const processWithSnapDOMImplementation: (el: HTMLElement, options?: any) => Promise<any>;
declare const processWithOriginalLogic: (el: HTMLElement, options?: any) => Promise<any>;
declare const htmlToAxure: (selector?: string | HTMLElement, options?: any) => Promise<any>;
declare const safeHtmlToFigma: (selector?: string | HTMLElement, options?: any) => Promise<SafeResult<any[]>>;
declare const safeHtmlToAxure: (selector?: string | HTMLElement, options?: any) => Promise<SafeResult<any>>;

type Numeric = number;
interface Color {
    r: Numeric;
    g: Numeric;
    b: Numeric;
    a: Numeric;
}
interface Point {
    x: Numeric;
    y: Numeric;
}
interface Rect {
    location: Point;
    size: {
        width: Numeric;
        height: Numeric;
    };
}
interface ResizingConstraints {
    hasFixedLeft: boolean;
    hasFixedRight: boolean;
    hasFixedTop: boolean;
    hasFixedBottom: boolean;
    hasFixedWidth: boolean;
    hasFixedHeight: boolean;
}
declare enum FillType {
    Solid = 1,
    Gradient = 2,
    Image = 3
}
interface BaseFill {
    type: FillType;
    enabled: boolean;
}
interface SolidFill extends BaseFill {
    type: FillType.Solid;
    color: Color;
}
interface GradientStop {
    color: Color;
    offset: Numeric;
    location: Point;
}
interface GradientFill extends BaseFill {
    type: FillType.Gradient;
    gradientType: number;
    from: Point;
    to: Point;
    stops: GradientStop[];
}
interface ImageFill extends BaseFill {
    type: FillType.Image;
    image: string;
    isHash: boolean;
    patternFillType: number;
    alignment: {
        horizontal: number;
        vertical: number;
    };
}
type Fill = SolidFill | GradientFill | ImageFill;
interface Stroke {
    alignment: number;
    fill: Fill;
}
interface ShadowEffect {
    color: Color;
    enabled: boolean;
    blur: number;
    offset: Point;
    type: 1;
    shadowType: number;
    spread: number;
}
interface BlurEffect {
    enabled: boolean;
    type: 0;
    radius: number;
    blurType: number;
}
type Effect = ShadowEffect | BlurEffect;
interface NodeScene<T = AnyNode> {
    items: T[];
}
declare enum ItemType {
    Group = 0,
    Layer = 1,
    Artboard = 2
}
interface BaseNode {
    id: string;
    name: string;
    itemType: ItemType.Layer;
    visible: boolean;
    isLocked: boolean;
    isNameDynamic: boolean;
    rotation: number;
    rect: Rect;
    resizingConstraints: ResizingConstraints;
    opacity: number;
    textAlignment: number;
    textPadding: number[];
    effects: Effect[];
    textShadows: ShadowEffect[];
    booleanOperation?: number;
    textRotation: number;
    isMask: boolean;
    backgroundFills: Fill[];
    strokes: Stroke[];
    strokeThickness: number;
    strokePattern: number[];
    flippedHorizontal?: boolean;
    flippedVertical?: boolean;
    maskedScene?: NodeScene<AnyNode> | null;
    clip?: Rect | null;
    meta?: unknown;
}
interface TextInline {
    type: 0;
    text: string;
    family: string;
    typeface: string | null;
    weight: number;
    size: number;
    textColor: Color;
    style: number;
    underline: boolean;
    strikethrough: boolean;
    superscript: number;
    baselineOffset: number;
    highlight: Color;
    characterSpacing: number;
    transform: number;
    stretch: number;
    lineHeight?: number;
}
interface TextListInfo {
    indentLevel: number;
    listChar: string | null;
    listType: number;
}
interface Paragraph {
    horizontalAlignment: number;
    lineSpacing: number;
    inlines: TextInline[];
    textListInfo?: TextListInfo;
}
interface TextNode extends BaseNode {
    type: 0;
    text: {
        paragraphs: Paragraph[];
    };
}
interface RectangleNode extends BaseNode {
    type: 0;
    corners: number[];
    border: number[];
}
interface PathPoint {
    type: 2 | 3;
    to: Point;
    lowerHandle?: Point;
    higherHandle?: Point;
}
interface PathSegment {
    closed: boolean;
    data: PathPoint[];
    endDecoration: number;
    startDecoration: number;
}
interface PathNode extends BaseNode {
    type: 2;
    paths: PathSegment[];
    svgPaths: string[];
}
interface SceneContainerNode {
    id: string;
    name: string;
    itemType: ItemType.Group;
    visible: boolean;
    isLocked: boolean;
    isNameDynamic: boolean;
    rotation: number;
    rect: Rect;
    resizingConstraints: ResizingConstraints;
    effects: Effect[];
    isMask: boolean;
    clip?: Rect | null;
    maskedScene?: NodeScene<AnyNode> | null;
    flippedHorizontal?: boolean;
    flippedVertical?: boolean;
    opacity?: number;
    scene: NodeScene<AnyNode>;
    meta?: unknown;
}
interface ArtboardNode {
    id: string;
    name: string;
    itemType: ItemType.Artboard;
    resizingConstraints: ResizingConstraints;
    isNameDynamic: boolean;
    rect: Rect;
    backgroundFill: Fill;
    backgroundShape: RectangleNode;
    scene: NodeScene<AnyNode>;
}
type LayerNode = RectangleNode | TextNode | PathNode;
type AnyNode = LayerNode | SceneContainerNode;
interface AxhubDocument {
    masters: Record<string, unknown> | null;
    imageMap: Record<string, string>;
    scene: {
        items: Array<ArtboardNode | SceneContainerNode>;
    };
}
declare function isValidAxurePayload(value: any): boolean;
declare function extractAxurePayload(value: any, visited?: Set<any>): any | null;
declare function normalizeAxurePayloadFromFrameResults(frameResults: any[]): any | null;

export { type AnyNode, type ArtboardNode, type AxhubDocument, type BaseFill, type BaseNode, type BlurEffect, type CaptureDocumentForFigmaNewOptions, type CapturedAsset, type CapturedDocument, type CapturedDocumentToFigmaLayersOptions, type CapturedElementNode, type CapturedFontFamily, type CapturedFontUsage, type CapturedFonts, type CapturedNode, type CapturedQuadPoint, type CapturedRect, type CapturedRelativeTransform, type CapturedTextNode, type Color, type CompleteLayerMappingResult, type ConvertLayersToStandardFigmaNodesOptions, type ConvertLayersToStandardFigmaNodesResult, type CopyToFigmaResult, type CustomFigmaScriptAdapter, type CustomFigmaScriptCaptureResult, type CustomFigmaScriptConsoleFallbackPayload, type CustomFigmaScriptParams, type CustomFigmaScriptStatus, type Effect, type FigmaProtocolAssets, type FigmaSchemaValidationResult, type Fill, FillType, type GradientFill, type GradientStop, type ImageFill, ItemType, type LayerNode, type NodeScene, type Numeric, type OfficialClipboardCopyResult, type OfficialClipboardSerializedResult, type Paragraph, type PathNode, type PathPoint, type PathSegment, type Point, type Rect, type RectangleNode, type ResizingConstraints, STANDARD_COUNTER_AXIS_ALIGN, STANDARD_FIGMA_CONTRACT_FALLBACKS, STANDARD_FIGMA_EFFECT_TYPES, STANDARD_FIGMA_NODE_TYPES, STANDARD_FIGMA_PAINT_TYPES, STANDARD_HORIZONTAL_CONSTRAINTS, STANDARD_IMAGE_SCALE_MODES, STANDARD_LAYOUT_ALIGN, STANDARD_LAYOUT_MODES, STANDARD_LAYOUT_POSITIONING, STANDARD_LAYOUT_SIZING, STANDARD_LAYOUT_WRAP, STANDARD_PRIMARY_AXIS_ALIGN, STANDARD_TEXT_ALIGN_HORIZONTAL, STANDARD_TEXT_ALIGN_VERTICAL, STANDARD_TEXT_AUTO_RESIZE, STANDARD_TEXT_CASE, STANDARD_TEXT_DECORATION, STANDARD_VERTICAL_CONSTRAINTS, type SafeResult, type SceneContainerNode, type ShadowEffect, type SolidFill, type StandardCounterAxisAlignItems, type StandardFigmaColor, type StandardFigmaEffect, type StandardFigmaEffectType, type StandardFigmaFontName, type StandardFigmaFontNormalizationOptions, type StandardFigmaGradientPaint, type StandardFigmaGradientStop, type StandardFigmaImagePaint, type StandardFigmaNode, type StandardFigmaNodePayloadValidationResult, type StandardFigmaNodeType, type StandardFigmaNodeValidationResult, type StandardFigmaNumberField, type StandardFigmaPaint, type StandardFigmaPaintType, type StandardFigmaSolidPaint, type StandardFigmaTextData, type StandardFigmaTextDataLine, type StandardFigmaTransform, type StandardFigmaVector, type StandardHorizontalConstraint, type StandardImageScaleMode, type StandardLayoutAlign, type StandardLayoutMode, type StandardLayoutPositioning, type StandardLayoutSizingMode, type StandardLayoutWrap, type StandardPrimaryAxisAlignItems, type StandardTextAlignHorizontal, type StandardTextAlignVertical, type StandardTextAutoResize, type StandardTextCase, type StandardTextDecoration, type StandardVerticalConstraint, type Stroke, type TextInline, type TextListInfo, type TextNode, __convertUrlToDataUrlForTests, buildKiwiClipboardFragment, buildKiwiDebugRectangleMessage, buildKiwiMessageFromLayers, buildOfficialClipboardHtmlFromPayload, buildOfficialClipboardPayloadFromCapturedDocument, captureDocumentForFigmaNew, captureWithCustomFigmaScript, capturedDocumentToFigmaLayers, convertLayersToStandardFigmaNodes, copyDebugRectangleToFigmaWithKiwi, copyDocumentForFigmaNewOfficialClipboard, copyLayersToFigmaClipboard, copyToFigmaWithKiwi, deriveStandardFontStyle, extractAxurePayload, getProtocolVersion, hasChromeRuntime, hasClipboardEnvironment, hasDomEnvironment, htmlToAxure, htmlToFigma, isValidAxurePayload, loadFigmaProtocolAssets, mapLayersToCompleteFigmaNodes, normalizeAxurePayloadFromFrameResults, processWithOriginalLogic, processWithSnapDOMImplementation, safeBuildKiwiClipboardFragment, safeCaptureWithCustomFigmaScript, safeCopyDebugRectangleToFigmaWithKiwi, safeCopyLayersToFigmaClipboard, safeCopyToFigmaWithKiwi, safeHtmlToAxure, safeHtmlToFigma, serializeDocumentForFigmaNewOfficialClipboard, validateAndNormalizeStandardFigmaNode, validateFigmaSchema, validateStandardFigmaLayerPayload };
