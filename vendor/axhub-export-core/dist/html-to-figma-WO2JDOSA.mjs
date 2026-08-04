import {
  convertImagesInPage,
  generateFillsFromStyles,
  getRgb,
  needsScreenshotBackground,
  parseBackdropFilterStr,
  parseBorderRadius,
  parseBoxShadowStr,
  parseFilterStr,
  parseTextShadowStr,
  parseUnits
} from "./chunk-C4HSV5O2.mjs";

// src/export-core/dom/html-to-figma/helpers/svg.js
var processSvgUseElements = (el) => {
  for (const use of Array.from(el.querySelectorAll("use"))) {
    try {
      const symbolSelector = use.href.baseVal;
      const symbol = document.querySelector(symbolSelector);
      if (symbol) {
        use.outerHTML = symbol.innerHTML;
      }
    } catch (err) {
      console.warn("Error querying <use> tag href", err);
    }
  }
};
var svgCommonStyles = [
  // 基本显示（标准CSS）
  "display",
  "visibility",
  "opacity",
  // 填充和描边（SVG特有，但可通过CSS设置）
  "fill",
  "fillOpacity",
  "fillRule",
  "stroke",
  "strokeWidth",
  "strokeLinecap",
  "strokeLinejoin",
  "strokeOpacity",
  "strokeDasharray",
  "strokeDashoffset",
  // 字体（标准CSS）
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  // 文本对齐（SVG特有，但可通过CSS设置）
  "textAnchor",
  "dominantBaseline",
  // 变换和效果（标准CSS）
  "transform",
  "filter",
  "mixBlendMode",
  // 颜色（标准CSS）
  "color"
];
function getOptimizedSVGStyle(el) {
  const inlineStyle = el.style;
  const parts = [];
  for (const prop of svgCommonStyles) {
    const value = inlineStyle[prop];
    if (value && value.trim() !== "") {
      const cssProp = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
      const isDefaultValue = prop === "fill" && (value === "rgb(0, 0, 0)" || value === "black") || prop === "stroke" && value === "none" || prop === "strokeWidth" && value === "1px" || prop === "opacity" && value === "1" || prop === "display" && value === "block" || prop === "visibility" && value === "visible";
      if (!isDefaultValue) {
        parts.push(`${cssProp}:${value}`);
      }
    }
  }
  const result = parts.join(";");
  return result;
}
function cleanSvgStyles(svgElement) {
  const originalLength = svgElement.outerHTML.length;
  let cleanedCount = 0;
  function cleanElementStyles(element) {
    const optimizedStyle = getOptimizedSVGStyle(element);
    element.removeAttribute("style");
    if (optimizedStyle) {
      element.setAttribute("style", optimizedStyle);
      cleanedCount++;
    }
    for (const child of element.children) {
      cleanElementStyles(child);
    }
  }
  cleanElementStyles(svgElement);
  const finalLength = svgElement.outerHTML.length;
  const compressionRatio = (finalLength / originalLength * 100).toFixed(1);
  return svgElement.outerHTML;
}
async function compressSvgWithStyleCleaning(el) {
  try {
    const clonedEl = el.cloneNode(true);
    const compressedSvg = cleanSvgStyles(clonedEl);
    return compressedSvg;
  } catch (error) {
    console.warn("\u26A0\uFE0F [SVG\u538B\u7F29] \u6837\u5F0F\u6E05\u7406\u5931\u8D25\uFF0C\u4F7F\u7528\u539F\u59CBSVG:", error);
    return el.outerHTML;
  }
}
function getSVGPosition(svgElement) {
  if (!(svgElement instanceof SVGSVGElement)) {
    throw new Error("\u9700\u8981\u4F20\u5165\u4E00\u4E2A <svg> \u5143\u7D20");
  }
  const rect = svgElement.getBoundingClientRect();
  return {
    // Keep the same coordinate space as other layer generators
    // (RECTANGLE/TEXT use viewport-based rect.left/top in this pipeline).
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height
  };
}
var createSvgLayer = async (el) => {
  const position = getSVGPosition(el);
  const compressedSvg = await compressSvgWithStyleCleaning(el);
  const layer = {
    type: "SVG",
    svg: compressedSvg,
    x: Math.round(position.x),
    y: Math.round(position.y),
    width: Math.round(position.width),
    height: Math.round(position.height)
  };
  return layer;
};

// src/export-core/dom/html-to-figma/helpers/dimensions.js
function getBoundingClientRect(el) {
  const rect = el.getBoundingClientRect();
  return {
    ...rect,
    // 添加文档坐标（考虑滚动偏移）
    documentX: rect.left + window.scrollX,
    documentY: rect.top + window.scrollY,
    // 保持原有的视口坐标
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    x: rect.x,
    y: rect.y
  };
}

// src/export-core/dom/html-to-figma/helpers/styles.js
var getBorderRadii = ({ computedStyle, element = null }) => {
  let elementWidth = 0;
  let elementHeight = 0;
  if (element) {
    const rect = element.getBoundingClientRect();
    elementWidth = rect.width;
    elementHeight = rect.height;
  }
  const topLeft = parseBorderRadius(computedStyle.borderTopLeftRadius, elementWidth, elementHeight);
  const topRight = parseBorderRadius(
    computedStyle.borderTopRightRadius,
    elementWidth,
    elementHeight
  );
  const bottomRight = parseBorderRadius(
    computedStyle.borderBottomRightRadius,
    elementWidth,
    elementHeight
  );
  const bottomLeft = parseBorderRadius(
    computedStyle.borderBottomLeftRadius,
    elementWidth,
    elementHeight
  );
  const borderRadii = Object.assign(
    Object.assign(
      Object.assign(
        Object.assign({}, topLeft ? { topLeftRadius: topLeft.value } : {}),
        topRight ? { topRightRadius: topRight.value } : {}
      ),
      bottomRight ? { bottomRightRadius: bottomRight.value } : {}
    ),
    bottomLeft ? { bottomLeftRadius: bottomLeft.value } : {}
  );
  return borderRadii;
};
var hasVisibleBorderColor = (borderColor) => {
  if (!borderColor) {
    return false;
  }
  const rgb = getRgb(borderColor);
  if (!rgb) {
    return false;
  }
  const alpha = typeof rgb.a === "number" ? rgb.a : 1;
  return alpha > 0;
};
var hasBorder = ({ borderWidth, borderType, borderColor }) => borderWidth && borderWidth !== "0" && borderType !== "none" && hasVisibleBorderColor(borderColor);
function areBordersConsistent(computedStyle) {
  const borders = {
    top: computedStyle.borderTop,
    right: computedStyle.borderRight,
    bottom: computedStyle.borderBottom,
    left: computedStyle.borderLeft
  };
  const hasAnyBorder = Object.values(borders).some((border) => border && border !== "none");
  if (!hasAnyBorder) {
    return { consistent: false, borderInfo: null };
  }
  const borderInfos = {};
  for (const [dir, border] of Object.entries(borders)) {
    if (border && border !== "none") {
      const parsed = border.match(/^([\d\.]+)px\s*(\w+)\s*(.*)$/);
      if (parsed) {
        const [_match, borderWidth, borderType, borderColor] = parsed;
        borderInfos[dir] = { borderWidth, borderType, borderColor };
      }
    } else {
      borderInfos[dir] = { borderWidth: "0", borderType: "none", borderColor: "transparent" };
    }
  }
  const firstBorder = Object.values(borderInfos).find((info) => info.borderWidth !== "0");
  if (!firstBorder) {
    return { consistent: false, borderInfo: null };
  }
  const consistent = Object.values(borderInfos).every(
    (info) => info.borderWidth === firstBorder.borderWidth && info.borderType === firstBorder.borderType && info.borderColor === firstBorder.borderColor
  );
  return { consistent, borderInfo: firstBorder };
}
var addStrokesFromBorder = ({ computedStyle }) => {
  if (computedStyle.border && computedStyle.border !== "none") {
    const parsed = computedStyle.border.match(/^([\d\.]+)px\s*(\w+)\s*(.*)$/);
    if (parsed) {
      const [_match, borderWidth, borderType, borderColor] = parsed;
      if (hasBorder({ borderWidth, borderType, borderColor })) {
        const rgb = getRgb(borderColor);
        if (rgb) {
          return {
            strokes: [
              {
                type: "SOLID",
                color: { r: rgb.r, b: rgb.b, g: rgb.g },
                opacity: typeof rgb.a === "number" ? rgb.a : 1
              }
            ],
            strokeWeight: Math.round(parseFloat(borderWidth))
          };
        }
      }
    }
  }
  const { consistent, borderInfo } = areBordersConsistent(computedStyle);
  if (consistent && borderInfo) {
    const rgb = getRgb(borderInfo.borderColor);
    if (rgb) {
      return {
        strokes: [
          {
            type: "SOLID",
            color: { r: rgb.r, b: rgb.b, g: rgb.g },
            opacity: typeof rgb.a === "number" ? rgb.a : 1
          }
        ],
        strokeWeight: Math.round(parseFloat(borderInfo.borderWidth))
      };
    }
  }
  return null;
};
var convertToFigmaColor = (color) => {
  if (!color) return null;
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    a: color.a !== void 0 ? color.a : 1
  };
};
var getBlendMode = (computedStyle) => {
  const mixBlendMode = computedStyle.mixBlendMode;
  const blendModes = {
    normal: "NORMAL",
    multiply: "MULTIPLY",
    screen: "SCREEN",
    overlay: "OVERLAY",
    darken: "DARKEN",
    lighten: "LIGHTEN",
    "color-dodge": "COLOR_DODGE",
    "color-burn": "COLOR_BURN",
    "hard-light": "HARD_LIGHT",
    "soft-light": "SOFT_LIGHT",
    difference: "DIFFERENCE",
    exclusion: "EXCLUSION",
    hue: "HUE",
    saturation: "SATURATION",
    color: "COLOR",
    luminosity: "LUMINOSITY"
  };
  return blendModes[mixBlendMode] || "NORMAL";
};
var getShadowEffects = ({ computedStyle }) => {
  const effects = [];
  if (computedStyle.boxShadow && computedStyle.boxShadow !== "none") {
    const shadows = parseBoxShadowStr(computedStyle.boxShadow);
    shadows.forEach((shadow) => {
      const color = getRgb(shadow.color);
      if (color) {
        const figmaColor = convertToFigmaColor(color);
        const blendMode = getBlendMode(computedStyle);
        if (shadow.inset) {
          effects.push({
            type: "INNER_SHADOW",
            color: figmaColor,
            offset: {
              x: shadow.offsetX,
              y: shadow.offsetY
            },
            radius: shadow.blurRadius,
            spread: shadow.spreadRadius || 0,
            visible: true,
            blendMode
          });
        } else {
          effects.push({
            type: "DROP_SHADOW",
            color: figmaColor,
            offset: {
              x: shadow.offsetX,
              y: shadow.offsetY
            },
            radius: shadow.blurRadius,
            spread: shadow.spreadRadius || 0,
            visible: true,
            blendMode
          });
        }
      }
    });
  }
  if (computedStyle.textShadow && computedStyle.textShadow !== "none") {
    const textShadows = parseTextShadowStr(computedStyle.textShadow);
    textShadows.forEach((shadow) => {
      const color = getRgb(shadow.color);
      if (color) {
        const figmaColor = convertToFigmaColor(color);
        const blendMode = getBlendMode(computedStyle);
        effects.push({
          type: "DROP_SHADOW",
          color: figmaColor,
          offset: {
            x: shadow.offsetX,
            y: shadow.offsetY
          },
          radius: shadow.blurRadius,
          spread: 0,
          // text-shadow 不支持 spread
          visible: true,
          blendMode
        });
      }
    });
  }
  if (computedStyle.filter && computedStyle.filter !== "none") {
    const filters = parseFilterStr(computedStyle.filter);
    filters.forEach((filter) => {
      if (filter.type === "LAYER_BLUR") {
        effects.push({
          type: "LAYER_BLUR",
          radius: filter.radius,
          visible: true
        });
      }
    });
  }
  if (computedStyle.backdropFilter && computedStyle.backdropFilter !== "none") {
    const backdropFilters = parseBackdropFilterStr(computedStyle.backdropFilter);
    backdropFilters.forEach((filter) => {
      if (filter.type === "BACKGROUND_BLUR") {
        effects.push({
          type: "BACKGROUND_BLUR",
          radius: filter.radius,
          visible: true
        });
      }
    });
  }
  return effects.length > 0 ? effects : void 0;
};

// src/export-core/dom/html-to-figma/helpers/layer-ordering.js
function extractZIndexFromStyle(computedStyle) {
  const zIndex = computedStyle.zIndex;
  if (zIndex === "auto" || zIndex === "" || isNaN(parseInt(zIndex))) {
    return 0;
  }
  return parseInt(zIndex);
}
function getElementIndex(element) {
  if (!element.parentElement) {
    return 0;
  }
  return Array.from(element.parentElement.children).indexOf(element);
}
function addLayerSortingCache(layer, element, computedStyle, rect) {
  if (!element || !computedStyle || !rect) {
    return;
  }
  const zIndex = extractZIndexFromStyle(computedStyle);
  const elementIndex = getElementIndex(element);
  const parentElement = element.parentElement;
  layer._sortingCache = {
    zIndex,
    elementIndex,
    parentElement,
    // 记录父元素引用
    // 原始元素引用
    originalElement: element
  };
}
function compareLayers(layerA, layerB) {
  const cacheA = layerA._sortingCache;
  const cacheB = layerB._sortingCache;
  if (!cacheA || !cacheB) {
    console.warn("\u26A0\uFE0F [compareLayers] \u56FE\u5C42\u7F3A\u5C11\u6392\u5E8F\u7F13\u5B58\uFF0C\u8DF3\u8FC7\u6392\u5E8F");
    return 0;
  }
  const sameParent = cacheA.parentElement === cacheB.parentElement;
  if (sameParent && cacheA.zIndex !== cacheB.zIndex) {
    return cacheA.zIndex - cacheB.zIndex;
  }
  return 0;
}
function sortLayers(layers) {
  if (!layers || layers.length <= 1) {
    return layers;
  }
  const layersWithIndex = layers.map((layer, index) => ({ layer, originalIndex: index }));
  layersWithIndex.sort((a, b) => {
    const cacheA = a.layer._sortingCache;
    const cacheB = b.layer._sortingCache;
    if (!cacheA || !cacheB) {
      return a.originalIndex - b.originalIndex;
    }
    const result = compareLayers(a.layer, b.layer);
    if (result !== 0) return result;
    return a.originalIndex - b.originalIndex;
  });
  return layersWithIndex.map((item) => item.layer);
}
function cleanLayersSortingCache(layers) {
  if (!layers || !Array.isArray(layers)) {
    console.warn("\u26A0\uFE0F [cleanLayersSortingCache] layers \u4E0D\u662F\u6570\u7EC4");
    return layers;
  }
  const cleanLayerRecursively = (layer) => {
    if (!layer || typeof layer !== "object") {
      return layer;
    }
    if (layer._sortingCache) {
      delete layer._sortingCache;
    }
    if (layer.children && Array.isArray(layer.children)) {
      layer.children.forEach((child) => cleanLayerRecursively(child));
    }
    return layer;
  };
  layers.forEach((layer) => cleanLayerRecursively(layer));
  return layers;
}
function cleanLayersDebugProperties(layers) {
  if (!layers || !Array.isArray(layers)) {
    console.warn("\u26A0\uFE0F [cleanLayersDebugProperties] layers \u4E0D\u662F\u6570\u7EC4");
    return layers;
  }
  const cleanLayerRecursively = (layer) => {
    if (!layer || typeof layer !== "object") {
      return layer;
    }
    if (layer._sortingCache) {
      delete layer._sortingCache;
    }
    if (layer._debug) {
      delete layer._debug;
    }
    if (layer._tempRef) {
      delete layer._tempRef;
    }
    if (layer.children && Array.isArray(layer.children)) {
      layer.children.forEach((child) => cleanLayerRecursively(child));
    }
    return layer;
  };
  layers.forEach((layer) => cleanLayerRecursively(layer));
  return layers;
}
function processLayerOrderingRecursive(layers) {
  if (!layers || !Array.isArray(layers)) {
    return layers;
  }
  const sortedLayers = sortLayers(layers);
  const processedLayers = sortedLayers.map((layer) => {
    if (layer && typeof layer === "object" && layer.children && Array.isArray(layer.children)) {
      return {
        ...layer,
        children: processLayerOrderingRecursive(layer.children)
      };
    }
    return layer;
  });
  return processedLayers;
}
function processLayerOrdering(layers) {
  const sortedLayers = processLayerOrderingRecursive(layers);
  const cleanLayers = cleanLayersSortingCache(sortedLayers);
  return cleanLayers;
}

// src/export-core/dom/html-to-figma/helpers/object.js
var fastClone = (data) => typeof data === "symbol" ? null : JSON.parse(JSON.stringify(data));

// src/export-core/dom/html-to-figma/helpers/text.js
function addAutoLayoutChildProps(textNode, computedStyle, element) {
  const parent = element.parentElement;
  if (!parent) return;
  const parentStyle = window.getComputedStyle(parent);
  const parentDisplay = parentStyle.display;
  const isAutoLayoutParent = parentDisplay === "flex" || parentDisplay === "inline-flex" || parentDisplay === "grid" || parentDisplay === "inline-grid";
  if (!isAutoLayoutParent) return;
  const flexGrow = parseFloat(computedStyle.flexGrow) || 0;
  if (flexGrow > 0) {
    textNode.layoutGrow = 1;
    const parentFlexDirection = parentStyle.flexDirection || "row";
    if (parentDisplay === "flex" || parentDisplay === "inline-flex") {
      if (parentFlexDirection === "row" || parentFlexDirection === "row-reverse") {
        textNode.layoutSizingHorizontal = "FILL";
        textNode.layoutSizingVertical = "HUG";
      } else {
        textNode.layoutSizingHorizontal = "HUG";
        textNode.layoutSizingVertical = "FILL";
      }
    }
  }
  const alignSelf = computedStyle.alignSelf || "auto";
  if (alignSelf === "stretch") {
    textNode.layoutAlign = "STRETCH";
  } else if (alignSelf !== "auto") {
    textNode.layoutAlign = "INHERIT";
  }
  const position = computedStyle.position;
  if (position === "absolute" || position === "fixed") {
    textNode.layoutPositioning = "ABSOLUTE";
  }
}
var normalizeFontFamilyStack = (fontFamily) => {
  if (typeof fontFamily !== "string") {
    return "";
  }
  const tokens = fontFamily.split(",").map((token) => token.trim().replace(/^['"]+|['"]+$/g, "").trim()).filter(Boolean);
  if (tokens.length === 0) {
    return "";
  }
  const deduped = [];
  const seen = /* @__PURE__ */ new Set();
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(token);
  }
  return deduped.join(", ");
};
var countDistinctTextLines = (rects) => {
  if (!Array.isArray(rects) || rects.length === 0) {
    return 0;
  }
  const sortedRects = rects.filter((rect) => rect && rect.width > 0 && rect.height > 0).sort((a, b) => a.top - b.top);
  if (sortedRects.length === 0) {
    return 0;
  }
  const lineTops = [];
  const epsilon = 1;
  for (const rect of sortedRects) {
    if (!lineTops.some((top) => Math.abs(top - rect.top) <= epsilon)) {
      lineTops.push(rect.top);
    }
  }
  return lineTops.length;
};
var resolveTextAutoResizeMode = (text, lineCount) => {
  const hasManualLineBreak = /[\r\n]/.test(text || "");
  const hasSoftWrap = lineCount > 1 && !hasManualLineBreak;
  return hasSoftWrap ? "HEIGHT" : "WIDTH_AND_HEIGHT";
};
var buildTextNode = async ({ node }) => {
  const rawText = node.textContent || "";
  const normalizedText = rawText.replace(/\s+/g, " ");
  const contentForValidation = normalizedText.trim();
  if (!isValidTextContent(contentForValidation)) {
    return void 0;
  }
  const parent = node.parentElement;
  if (parent) {
    const targetElement = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!targetElement || targetElement.nodeType !== Node.ELEMENT_NODE) {
      return void 0;
    }
    if (shouldSkipElement(targetElement)) {
      return void 0;
    }
    const range = document.createRange();
    range.selectNode(node);
    const rangeRects = Array.from(range.getClientRects());
    const rect = fastClone(range.getBoundingClientRect());
    range.detach();
    if (!isValidTextDimensions(rect)) {
      return void 0;
    }
    const textLineCount = countDistinctTextLines(rangeRects);
    const textAutoResize = resolveTextAutoResizeMode(contentForValidation, textLineCount);
    const textNode = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      type: "TEXT",
      characters: normalizedText,
      // Keep clipped/ellipsis text nodes: measured width can be tiny but content is still meaningful.
      width: Math.max(1, Math.round(rect.width)),
      height: Math.round(rect.height),
      textAutoResize
    };
    const inlineStyles = window.getComputedStyle(targetElement);
    let finalTextNode;
    if (inlineStyles.length > 0) {
      finalTextNode = await enhanceTextNodeWithInlineStyles(textNode, inlineStyles, targetElement);
    } else {
      const computedStyles = getComputedStyle(targetElement);
      finalTextNode = await buildTextNodeWithComputedStyles(
        textNode,
        computedStyles,
        targetElement
      );
    }
    if (finalTextNode) {
      const computedStyle = getComputedStyle(targetElement);
      addLayerSortingCache(finalTextNode, node, computedStyle, rect);
      addAutoLayoutChildProps(finalTextNode, computedStyle, targetElement);
    }
    return finalTextNode;
  }
};
async function enhanceTextNodeWithInlineStyles(textNode, inlineStyles, targetElement) {
  const enhancedNode = { ...textNode };
  const hasTextGradient = isTextGradient(inlineStyles);
  if (hasTextGradient) {
    const fills = await generateFillsFromStyles(inlineStyles, targetElement, {
      includeImageFills: false,
      // 文本节点通常不需要图片填充
      includeBackgroundColor: true,
      // 文本渐变需要背景色填充
      includeComplexBackgrounds: true
      // 文本渐变需要复杂背景处理
    });
    if (fills.length > 0) {
      enhancedNode.fills = fills;
    }
  } else {
    if (inlineStyles.color) {
      const textColor = getRgb(inlineStyles.color);
      if (textColor) {
        enhancedNode.fills = [
          {
            type: "SOLID",
            color: {
              r: textColor.r,
              g: textColor.g,
              b: textColor.b
            },
            opacity: textColor.a || 1
          }
        ];
      }
    }
  }
  if (!enhancedNode.fills || enhancedNode.fills.length === 0) {
    enhancedNode.fills = [
      {
        type: "SOLID",
        color: { r: 0, g: 0, b: 0 },
        opacity: 1
      }
    ];
  }
  if (inlineStyles.opacity) {
    enhancedNode.opacity = parseFloat(inlineStyles.opacity);
  }
  if (inlineStyles.fontFamily) {
    const fontFamilyStack = normalizeFontFamilyStack(inlineStyles.fontFamily);
    if (fontFamilyStack) {
      enhancedNode.fontFamily = fontFamilyStack;
    }
  }
  if (inlineStyles.fontSize) {
    const fontSize = parseFloat(inlineStyles.fontSize);
    if (!isNaN(fontSize)) {
      enhancedNode.fontSize = Math.round(fontSize);
    }
  }
  if (inlineStyles.fontWeight) {
    const numericFontWeight = Number(inlineStyles.fontWeight);
    enhancedNode.fontWeight = Number.isFinite(numericFontWeight) ? Math.round(numericFontWeight) : inlineStyles.fontWeight;
  }
  if (inlineStyles.fontStyle) {
    enhancedNode.fontStyle = inlineStyles.fontStyle;
  }
  if (inlineStyles.textAlign) {
    const textAlign = inlineStyles.textAlign;
    if (["left", "center", "right", "justified"].includes(textAlign)) {
      enhancedNode.textAlignHorizontal = textAlign.toUpperCase();
    }
  }
  if (["left", "center", "right", "justified"].includes(inlineStyles.textAlign)) {
    enhancedNode.textAlignHorizontal = inlineStyles.textAlign.toUpperCase();
  }
  if (inlineStyles.textDecoration) {
    const textDecoration = inlineStyles.textDecoration;
    if (textDecoration.includes("underline")) {
      enhancedNode.textDecoration = "UNDERLINE";
    } else if (textDecoration.includes("line-through")) {
      enhancedNode.textDecoration = "STRIKETHROUGH";
    }
  }
  const adoptLineHeight = shouldAdoptLineHeight(targetElement, inlineStyles);
  if (adoptLineHeight && inlineStyles.lineHeight && inlineStyles.lineHeight !== "normal") {
    const numericFontSize = parseFloat(inlineStyles.fontSize);
    const numericLineHeight = inlineStyles.lineHeight === "normal" ? numericFontSize * 1.2 : parseFloat(inlineStyles.lineHeight);
    const ignoreLineHeight = shouldIgnoreLineHeight({
      fontSize: numericFontSize,
      lineHeightPx: numericLineHeight,
      measuredHeight: textNode.height,
      text: enhancedNode.characters || targetElement.textContent || "",
      tagName: targetElement.tagName,
      whiteSpace: inlineStyles.whiteSpace || "normal"
    });
    if (!ignoreLineHeight) {
      const lineHeight = parseUnits(inlineStyles.lineHeight);
      if (lineHeight) {
        enhancedNode.lineHeight = lineHeight;
      }
    }
  }
  if (inlineStyles.letterSpacing && inlineStyles.letterSpacing !== "normal") {
    const letterSpacing = parseUnits(inlineStyles.letterSpacing);
    if (letterSpacing) {
      enhancedNode.letterSpacing = letterSpacing;
    }
  }
  const textShadowEffects = getTextShadowEffects(inlineStyles);
  if (textShadowEffects.length > 0) {
    enhancedNode.effects = textShadowEffects;
  }
  return enhancedNode;
}
function isTextGradient(styles) {
  const hasBackgroundGradient = styles.background && (styles.background.includes("linear-gradient") || styles.background.includes("radial-gradient") || styles.background.includes("conic-gradient"));
  const hasBackgroundClipText = styles.backgroundClip === "text" || styles.webkitBackgroundClip === "text";
  const hasGradientImage = styles.backgroundImage && (styles.backgroundImage.includes("linear-gradient") || styles.backgroundImage.includes("radial-gradient") || styles.backgroundImage.includes("conic-gradient"));
  return hasBackgroundGradient && hasBackgroundClipText || hasGradientImage && hasBackgroundClipText;
}
function getTextShadowEffects(computedStyle) {
  const effects = [];
  if (computedStyle.textShadow && computedStyle.textShadow !== "none") {
    const textShadows = parseTextShadowStr(computedStyle.textShadow);
    textShadows.forEach((shadow) => {
      const color = getRgb(shadow.color);
      if (color) {
        const figmaColor = {
          r: color.r,
          g: color.g,
          b: color.b,
          a: color.a || 1
        };
        effects.push({
          type: "DROP_SHADOW",
          color: figmaColor,
          offset: {
            x: shadow.offsetX,
            y: shadow.offsetY
          },
          radius: shadow.blurRadius,
          spread: 0,
          // text-shadow 不支持 spread
          visible: true,
          blendMode: "NORMAL"
          // 文本阴影通常使用正常混合模式
        });
      }
    });
  }
  return effects;
}
async function buildTextNodeWithComputedStyles(textNode, computedStyles, targetElement) {
  const hasTextGradient = isTextGradient(computedStyles);
  if (hasTextGradient) {
    const fills = await generateFillsFromStyles(computedStyles, targetElement, {
      includeImageFills: false,
      // 文本节点通常不需要图片填充
      includeBackgroundColor: true,
      // 文本渐变需要背景色填充
      includeComplexBackgrounds: true
      // 文本渐变需要复杂背景处理
    });
    if (fills.length > 0) {
      textNode.fills = fills;
    }
  } else {
    if (computedStyles.color) {
      const textColor = getRgb(computedStyles.color);
      if (textColor) {
        textNode.fills = [
          {
            type: "SOLID",
            color: {
              r: textColor.r,
              g: textColor.g,
              b: textColor.b
            },
            opacity: textColor.a || 1
          }
        ];
      }
    }
  }
  if (!textNode.fills || textNode.fills.length === 0) {
    textNode.fills = [
      {
        type: "SOLID",
        color: { r: 0, g: 0, b: 0, a: 1 },
        opacity: 1
      }
    ];
  }
  const letterSpacing = parseUnits(computedStyles.letterSpacing);
  if (letterSpacing) {
    textNode.letterSpacing = letterSpacing;
  }
  const adoptLineHeight = shouldAdoptLineHeight(targetElement, computedStyles);
  const numericFontSize = parseFloat(computedStyles.fontSize);
  const numericLineHeight = computedStyles.lineHeight === "normal" ? numericFontSize * 1.2 : parseFloat(computedStyles.lineHeight);
  const ignoreLineHeight = shouldIgnoreLineHeight({
    fontSize: numericFontSize,
    lineHeightPx: numericLineHeight,
    measuredHeight: textNode.height,
    text: textNode.characters || targetElement.textContent || "",
    tagName: targetElement.tagName,
    whiteSpace: computedStyles.whiteSpace || "normal"
  });
  const lineHeight = adoptLineHeight && !ignoreLineHeight ? parseUnits(computedStyles.lineHeight) : null;
  if (lineHeight) {
    textNode.lineHeight = lineHeight;
  }
  const { textTransform } = computedStyles;
  switch (textTransform) {
    case "uppercase": {
      textNode.textCase = "UPPER";
      break;
    }
    case "lowercase": {
      textNode.textCase = "LOWER";
      break;
    }
    case "capitalize": {
      textNode.textCase = "TITLE";
      break;
    }
  }
  const fontSize = parseUnits(computedStyles.fontSize);
  if (fontSize) {
    textNode.fontSize = Math.round(fontSize.value);
  }
  if (computedStyles.fontFamily) {
    const fontFamilyStack = normalizeFontFamilyStack(computedStyles.fontFamily);
    if (fontFamilyStack) {
      textNode.fontFamily = fontFamilyStack;
    }
  }
  if (computedStyles.fontWeight) {
    const numericFontWeight = Number(computedStyles.fontWeight);
    textNode.fontWeight = Number.isFinite(numericFontWeight) ? Math.round(numericFontWeight) : computedStyles.fontWeight;
  }
  if (computedStyles.fontStyle) {
    textNode.fontStyle = computedStyles.fontStyle;
  }
  if (["underline", "strikethrough"].includes(computedStyles.textDecoration)) {
    textNode.textDecoration = computedStyles.textDecoration.toUpperCase();
  }
  if (["left", "center", "right", "justified"].includes(computedStyles.textAlign)) {
    textNode.textAlignHorizontal = computedStyles.textAlign.toUpperCase();
  }
  const textShadowEffects = getTextShadowEffects(computedStyles);
  if (textShadowEffects.length > 0) {
    textNode.effects = textShadowEffects;
  }
  const borderRadii = getBorderRadii({ computedStyle: computedStyles, element: targetElement });
  Object.assign(textNode, borderRadii);
  return textNode;
}
function isValidTextContent(text) {
  if (!text || text.length === 0) {
    return false;
  }
  if (/^\s+$/.test(text)) {
    return false;
  }
  return true;
}
function isValidTextDimensions(rect) {
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  if (rect.height < 3) {
    return false;
  }
  if (rect.width < 0.5) {
    return false;
  }
  if (rect.width > 1e4 || rect.height > 1e4) {
    return false;
  }
  return true;
}
function shouldSkipElement(element) {
  const skipTags = [
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "META",
    "LINK",
    "TITLE",
    "HEAD",
    "HTML",
    "BODY",
    "FRAMESET",
    "FRAME",
    "IFRAME"
  ];
  if (skipTags.includes(element.tagName)) {
    return true;
  }
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return true;
  }
  if (element.children.length === 0 && (!element.textContent || element.textContent.trim().length === 0)) {
    return true;
  }
  return false;
}
function shouldAdoptLineHeight(el, computedStyleOverride) {
  const tag = el.tagName.toUpperCase();
  const cs = computedStyleOverride || getComputedStyle(el);
  if (tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
    return false;
  }
  const text = el.textContent;
  if (!text || text.trim().length === 0) {
    return false;
  }
  const isSingleLine = !text.includes("\n") && cs.whiteSpace !== "normal" && cs.whiteSpace !== "pre-wrap";
  if (isSingleLine) {
    return false;
  }
  if (cs.display === "inline-flex" || cs.display === "flex") {
    return false;
  }
  const fontSize = parseFloat(cs.fontSize);
  if (Number.isNaN(fontSize)) {
    return false;
  }
  const lineHeight = cs.lineHeight === "normal" ? fontSize * 1.2 : parseFloat(cs.lineHeight);
  if (Number.isNaN(lineHeight)) {
    return false;
  }
  if (Math.abs(lineHeight - fontSize) < 1) {
    return false;
  }
  return true;
}
function shouldIgnoreLineHeight(ctx) {
  const { fontSize, lineHeightPx, measuredHeight, text, tagName, whiteSpace } = ctx;
  const tag = (tagName || "").toUpperCase();
  if (tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
    return true;
  }
  if (!fontSize || !lineHeightPx || !measuredHeight) {
    return false;
  }
  const isSingleLine = !text.includes("\n") && whiteSpace !== "pre-wrap";
  const lineHeightRatio = lineHeightPx / fontSize;
  const heightRatio = measuredHeight / lineHeightPx;
  if (isSingleLine) {
    if (lineHeightRatio > 2.5 && heightRatio < 0.7) {
      return true;
    }
    if (lineHeightRatio > 2 && heightRatio < 0.9) {
      return true;
    }
  }
  return false;
}

// src/export-core/dom/html-to-figma/helpers/element-utils.js
function hasClippingOverflow(computedStyle) {
  if (!computedStyle) return false;
  const overflow = computedStyle.overflow;
  const overflowX = computedStyle.overflowX;
  const overflowY = computedStyle.overflowY;
  return overflow === "hidden" || overflow === "clip" || overflowX === "hidden" || overflowX === "clip" || overflowY === "hidden" || overflowY === "clip";
}
function createGroupFromLayers(layers, elementName, elementRef, enableAutoLayout = false) {
  if (!layers || layers.length === 0) {
    return null;
  }
  if (layers.length === 1) {
    return layers[0];
  }
  const ownedBackgroundLayerCandidate = layers.find(
    (layer) => layer && layer.type === "RECTANGLE" && layer._sortingCache && layer._sortingCache.originalElement === elementRef
  ) || null;
  const hasSourceElementMarker = layers.some(
    (layer) => layer && layer._sortingCache && layer._sortingCache.originalElement
  );
  const sortedLayers = processLayerOrdering(layers);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  sortedLayers.forEach((layer) => {
    if (layer.x !== void 0 && layer.y !== void 0) {
      minX = Math.min(minX, layer.x);
      minY = Math.min(minY, layer.y);
      maxX = Math.max(maxX, layer.x + (layer.width || 0));
      maxY = Math.max(maxY, layer.y + (layer.height || 0));
    }
  });
  if (minX === Infinity || minY === Infinity) {
    return sortedLayers[0];
  }
  const layerType = enableAutoLayout ? "FRAME" : "GROUP";
  let clipsContent = false;
  if (enableAutoLayout && elementRef) {
    try {
      const computedStyle = window.getComputedStyle(elementRef);
      const overflowX = computedStyle.overflowX;
      const overflowY = computedStyle.overflowY;
      const overflow = computedStyle.overflow;
      clipsContent = overflowX === "hidden" || overflowY === "hidden" || overflow === "hidden" || overflowX === "clip" || overflowY === "clip" || overflow === "clip";
    } catch (_) {
      clipsContent = false;
    }
  }
  const frameLayer = {
    type: layerType,
    name: elementName || layerType,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    children: [],
    // 将在后面填充
    clipsContent
  };
  let backgroundLayerIndex = -1;
  const potentialBg = ownedBackgroundLayerCandidate || (!hasSourceElementMarker ? sortedLayers[0] : null);
  if (potentialBg && potentialBg.type === "RECTANGLE" && enableAutoLayout) {
    const bgWidth = potentialBg.width || 0;
    const bgHeight = potentialBg.height || 0;
    const frameWidth = frameLayer.width;
    const frameHeight = frameLayer.height;
    const elementRect = elementRef?.getBoundingClientRect?.() || null;
    const matchesElementRect = !!elementRect && Math.abs(potentialBg.width - elementRect.width) <= 2 && Math.abs(potentialBg.height - elementRect.height) <= 2 && Math.abs(potentialBg.x - elementRect.x) <= 2 && Math.abs(potentialBg.y - elementRect.y) <= 2;
    const canPromoteByOwnership = !!ownedBackgroundLayerCandidate && potentialBg === ownedBackgroundLayerCandidate;
    if (Math.abs(potentialBg.x - minX) < 1 && Math.abs(potentialBg.y - minY) < 1 && Math.abs(bgWidth - frameWidth) < 1 && Math.abs(bgHeight - frameHeight) < 1 && (canPromoteByOwnership || matchesElementRect)) {
      backgroundLayerIndex = 0;
      if (potentialBg.fills) frameLayer.fills = potentialBg.fills;
      if (potentialBg.strokes) frameLayer.strokes = potentialBg.strokes;
      if (potentialBg.strokeWeight) frameLayer.strokeWeight = potentialBg.strokeWeight;
      if (potentialBg.strokeAlign) frameLayer.strokeAlign = potentialBg.strokeAlign;
      if (potentialBg.effects) frameLayer.effects = potentialBg.effects;
      if (potentialBg.opacity !== void 0) frameLayer.opacity = potentialBg.opacity;
      if (potentialBg.blendMode) frameLayer.blendMode = potentialBg.blendMode;
      if (potentialBg.cornerRadius !== void 0)
        frameLayer.cornerRadius = potentialBg.cornerRadius;
      if (potentialBg.topLeftRadius !== void 0)
        frameLayer.topLeftRadius = potentialBg.topLeftRadius;
      if (potentialBg.topRightRadius !== void 0)
        frameLayer.topRightRadius = potentialBg.topRightRadius;
      if (potentialBg.bottomLeftRadius !== void 0)
        frameLayer.bottomLeftRadius = potentialBg.bottomLeftRadius;
      if (potentialBg.bottomRightRadius !== void 0)
        frameLayer.bottomRightRadius = potentialBg.bottomRightRadius;
    }
  }
  frameLayer.children = sortedLayers.filter((_, index) => index !== backgroundLayerIndex).map((layer) => {
    if (layer.x !== void 0 && layer.y !== void 0) {
      return {
        ...layer,
        x: layer.x - minX,
        y: layer.y - minY
      };
    }
    return layer;
  });
  if (elementRef) {
    const rect = elementRef.getBoundingClientRect();
    addLayerSortingCache(frameLayer, elementRef, elementRef.style, rect);
  }
  return frameLayer;
}
async function processElementTextNodes(el) {
  const textLayers = [];
  const normalizeTextForDedupe = (value) => (value || "").replace(/\s+/g, " ").trim();
  const directTextSeen = /* @__PURE__ */ new Set();
  for (let i = 0; i < el.childNodes.length; i++) {
    const childNode = el.childNodes[i];
    if (childNode.nodeType === Node.TEXT_NODE) {
      const rawText = childNode.textContent || "";
      if (!rawText || rawText.trim().length === 0) {
        continue;
      }
      const textNode = await buildTextNode({ node: childNode });
      if (textNode) {
        const dedupeText = normalizeTextForDedupe(textNode.characters || rawText);
        const dedupeKey = [
          dedupeText,
          typeof textNode.x === "number" ? Math.round(textNode.x) : 0,
          typeof textNode.y === "number" ? Math.round(textNode.y) : 0,
          typeof textNode.width === "number" ? Math.round(textNode.width) : 0,
          typeof textNode.height === "number" ? Math.round(textNode.height) : 0
        ].join("|");
        if (directTextSeen.has(dedupeKey)) {
          continue;
        }
        directTextSeen.add(dedupeKey);
        textLayers.push(textNode);
      }
    }
  }
  return textLayers;
}
function isHidden2(computedStyle, element) {
  const isFigmaNewMirrorSubtree = !!element && typeof element.closest === "function" && !!element.closest('[data-figma-new-mirror-root="true"]');
  const isStyleHidden = (style) => style.display === "none" || style.visibility === "hidden" || style.opacity === "0";
  const isSemanticHidden = (node2) => {
    if (!node2 || typeof node2 !== "object") {
      return false;
    }
    if (typeof node2.hasAttribute === "function") {
      if (node2.hasAttribute("hidden")) {
        return true;
      }
      const ariaHidden = node2.getAttribute("aria-hidden");
      if (typeof ariaHidden === "string" && ariaHidden.toLowerCase() === "true") {
        return true;
      }
    }
    if (node2.classList && (node2.classList.contains("is-hidden") || node2.classList.contains("hidden") || node2.classList.contains("ant-table-measure-row"))) {
      return true;
    }
    return false;
  };
  if (isStyleHidden(computedStyle) || isSemanticHidden(element)) {
    return true;
  }
  let node = element?.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (isStyleHidden(style)) {
      return true;
    }
    if (isSemanticHidden(node)) {
      return true;
    }
    if (!isFigmaNewMirrorSubtree && style.overflow !== "visible" && node.getBoundingClientRect().height < 1) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}
function shouldGenerateBackground(el, computedStyle) {
  if (computedStyle.backgroundClip === "text" || computedStyle.webkitBackgroundClip === "text") {
    return false;
  }
  const hasImportantStyles = computedStyle.backgroundColor !== "rgba(0, 0, 0, 0)" && computedStyle.backgroundColor !== "transparent" || computedStyle.borderWidth !== "0px" && computedStyle.borderWidth !== "" || computedStyle.boxShadow !== "none" && computedStyle.boxShadow !== "" || computedStyle.borderRadius !== "0px" && computedStyle.borderRadius !== "" || computedStyle.opacity !== "1" && computedStyle.opacity !== "" || computedStyle.transform !== "none" && computedStyle.transform !== "" && computedStyle.transform !== "matrix(1, 0, 0, 1, 0, 0)" || computedStyle.filter !== "none" && computedStyle.filter !== "" || computedStyle.backdropFilter !== "none" && computedStyle.backdropFilter !== "";
  const hasLayoutStyles = computedStyle.padding !== "0px" && computedStyle.padding !== "" || computedStyle.margin !== "0px" && computedStyle.margin !== "" || computedStyle.width !== "auto" && computedStyle.width !== "" || computedStyle.height !== "auto" && computedStyle.height !== "";
  const hasOtherStyles = computedStyle.backgroundImage !== "none" && computedStyle.backgroundImage !== "";
  const shouldGenerate = hasImportantStyles || hasLayoutStyles || hasOtherStyles;
  return shouldGenerate;
}
function generateElementTree(el) {
  function buildTree(node) {
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) {
      return null;
    }
    const shadowChildren = node.shadowRoot ? Array.from(node.shadowRoot.childNodes) : [];
    const domChildren = Array.from(node.childNodes);
    const allChildren = [...domChildren, ...shadowChildren];
    return {
      type: node.nodeType === Node.ELEMENT_NODE ? "element" : "text",
      el: node,
      children: allChildren.map((child) => buildTree(child)).filter(Boolean)
      // 去掉 null
    };
  }
  return buildTree(el);
}
function getElementClassNameString(el) {
  if (!el) {
    return "";
  }
  if (typeof el.getAttribute === "function") {
    const classAttr = el.getAttribute("class");
    if (typeof classAttr === "string") {
      return classAttr.trim();
    }
  }
  const { className } = el;
  if (typeof className === "string") {
    return className.trim();
  }
  if (className && typeof className.baseVal === "string") {
    return className.baseVal.trim();
  }
  if (className && typeof className.animVal === "string") {
    return className.animVal.trim();
  }
  return "";
}
function restoreElementClassName(el, className) {
  if (!el) {
    return;
  }
  const normalizedClassName = typeof className === "string" ? className.trim() : "";
  if (normalizedClassName) {
    if (typeof el.setAttribute === "function") {
      el.setAttribute("class", normalizedClassName);
      return;
    }
    if (typeof el.className === "string") {
      el.className = normalizedClassName;
    }
    return;
  }
  if (typeof el.removeAttribute === "function") {
    el.removeAttribute("class");
    return;
  }
  if (typeof el.className === "string") {
    el.className = "";
  }
}
function getElementNameWithClass(el, isAxure = false) {
  const tagName = el.tagName.toLowerCase();
  if (isAxure && el.hasAttribute("data-label")) {
    const dataLabel = el.getAttribute("data-label");
    if (dataLabel && dataLabel.trim()) {
      return `${tagName}.${dataLabel.trim()}`;
    }
  }
  if (el.id && el.id.trim()) {
    return `${tagName}.${el.id.trim()}`;
  }
  const className = getElementClassNameString(el);
  const firstClass = className ? className.split(/\s+/)[0] : null;
  if (firstClass) {
    return `${tagName}.${firstClass}`;
  }
  return tagName;
}
async function getLayersForElement(el, isAxure = false, enableAutoLayout = false) {
  const elementLayers = [];
  if (el instanceof SVGSVGElement) {
    if (el.id !== "snapdom-injected-svg") {
      const svgLayer = await createSvgLayer(el);
      elementLayers.push(svgLayer);
    }
    return elementLayers;
  } else if (el instanceof SVGElement) {
    return elementLayers;
  }
  if (el.parentElement instanceof HTMLPictureElement && el instanceof HTMLSourceElement || el instanceof HTMLPictureElement) {
    return elementLayers;
  }
  const appliedStyles = window.getComputedStyle(el);
  const isAbsolutelyPositioned = ["absolute", "fixed"].includes(appliedStyles.position);
  const deferGrowToWrapperFrame = enableAutoLayout && hasClippingOverflow(appliedStyles);
  if (isHidden2(appliedStyles, el)) {
    return elementLayers;
  }
  let shouldCreateLayer = false;
  const needsBackgroundLayer = shouldGenerateBackground(el, appliedStyles);
  if (needsBackgroundLayer) {
    shouldCreateLayer = true;
  } else {
    shouldCreateLayer = (el instanceof HTMLImageElement || el instanceof HTMLVideoElement) && // SnapDOM 元素总是尝试创建图层
    appliedStyles.display !== "none";
    if (shouldCreateLayer) {
    } else {
    }
  }
  if (shouldCreateLayer) {
    const rect = getBoundingClientRect(el);
    if (rect.width >= 1 && rect.height >= 1) {
      const fills = await generateFillsFromStyles(appliedStyles, el);
      const hasBorder2 = appliedStyles.borderWidth !== "0px" && appliedStyles.borderWidth !== "";
      const hasShadow = appliedStyles.boxShadow !== "none" && appliedStyles.boxShadow !== "";
      const hasRadius = appliedStyles.borderRadius !== "0px" && appliedStyles.borderRadius !== "";
      const hasOpacity = appliedStyles.opacity !== "1" && appliedStyles.opacity !== "";
      const hasTransform = appliedStyles.transform !== "none" && appliedStyles.transform !== "";
      const hasPadding = (parseFloat(appliedStyles.paddingTop) || 0) > 0 || (parseFloat(appliedStyles.paddingRight) || 0) > 0 || (parseFloat(appliedStyles.paddingBottom) || 0) > 0 || (parseFloat(appliedStyles.paddingLeft) || 0) > 0 || (parseFloat(appliedStyles.paddingInlineStart) || 0) > 0 || (parseFloat(appliedStyles.paddingInlineEnd) || 0) > 0 || (parseFloat(appliedStyles.paddingBlockStart) || 0) > 0 || (parseFloat(appliedStyles.paddingBlockEnd) || 0) > 0;
      if (fills.length === 0 && !hasBorder2 && !hasShadow && !hasRadius && !hasOpacity && !hasTransform && !hasPadding) {
        const noStyleTextLayers = await processElementTextNodes(el);
        elementLayers.push(...noStyleTextLayers);
        if (elementLayers.length > 1) {
          const groupLayer = createGroupFromLayers(
            elementLayers,
            getElementNameWithClass(el, isAxure),
            el,
            enableAutoLayout
          );
          return [groupLayer];
        }
        return elementLayers;
      }
      const rectNode = {
        type: "RECTANGLE",
        name: getElementNameWithClass(el, isAxure),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        fills
      };
      if (isAbsolutelyPositioned) {
        rectNode.layoutPositioning = "ABSOLUTE";
      }
      addLayerSortingCache(rectNode, el, appliedStyles, rect);
      const needsScreenshot = needsScreenshotBackground(appliedStyles);
      if (needsScreenshot) {
      } else {
        const strokes = addStrokesFromBorder({ computedStyle: appliedStyles });
        if (strokes) {
          Object.assign(rectNode, strokes);
        }
      }
      if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof SVGSVGElement) {
        rectNode.name = getElementNameWithClass(el, isAxure);
      }
      const shadowEffects = getShadowEffects({ computedStyle: appliedStyles });
      if (shadowEffects) {
        rectNode.effects = shadowEffects;
      }
      const borderRadii = getBorderRadii({ computedStyle: appliedStyles, element: el });
      Object.assign(rectNode, borderRadii);
      elementLayers.push(rectNode);
    }
  }
  const processedTextLayers = await processElementTextNodes(el);
  elementLayers.push(...processedTextLayers);
  if (elementLayers.length > 1) {
    const groupLayer = createGroupFromLayers(
      elementLayers,
      getElementNameWithClass(el, isAxure),
      el,
      enableAutoLayout
    );
    if (isAbsolutelyPositioned && groupLayer) {
      groupLayer.layoutPositioning = "ABSOLUTE";
    }
    const flexGrow = parseFloat(appliedStyles.flexGrow) || 0;
    if (flexGrow > 0 && !deferGrowToWrapperFrame) {
      groupLayer.layoutGrow = 1;
      const parentDisplay = el.parentElement ? window.getComputedStyle(el.parentElement).display : "";
      const parentFlexDirection = el.parentElement ? window.getComputedStyle(el.parentElement).flexDirection : "";
      if (parentDisplay === "flex" || parentDisplay === "inline-flex") {
        if (parentFlexDirection === "row" || parentFlexDirection === "row-reverse") {
          groupLayer.layoutSizingHorizontal = "FILL";
          groupLayer.layoutSizingVertical = "HUG";
        } else {
          groupLayer.layoutSizingHorizontal = "HUG";
          groupLayer.layoutSizingVertical = "FILL";
        }
      }
    }
    return [groupLayer];
  }
  if (elementLayers.length === 1) {
    if (isAbsolutelyPositioned) {
      elementLayers[0].layoutPositioning = "ABSOLUTE";
    }
    const flexGrow = parseFloat(appliedStyles.flexGrow) || 0;
    if (flexGrow > 0 && !deferGrowToWrapperFrame) {
      elementLayers[0].layoutGrow = 1;
      const parentDisplay = el.parentElement ? window.getComputedStyle(el.parentElement).display : "";
      const parentFlexDirection = el.parentElement ? window.getComputedStyle(el.parentElement).flexDirection : "";
      if (parentDisplay === "flex" || parentDisplay === "inline-flex") {
        if (parentFlexDirection === "row" || parentFlexDirection === "row-reverse") {
          elementLayers[0].layoutSizingHorizontal = "FILL";
          elementLayers[0].layoutSizingVertical = "HUG";
        } else {
          elementLayers[0].layoutSizingHorizontal = "HUG";
          elementLayers[0].layoutSizingVertical = "FILL";
        }
      }
    }
  }
  return elementLayers;
}

// src/export-core/dom/html-to-figma/helpers/snapdom-utils.js
var VERBOSE = false;
function getPageSize(el) {
  try {
    if (el && el !== document.body && el !== document.documentElement) {
      const rect = el.getBoundingClientRect();
      const scrollWidth2 = el.scrollWidth;
      const scrollHeight2 = el.scrollHeight;
      const clientWidth = el.clientWidth;
      const clientHeight = el.clientHeight;
      const elementWidth = Math.max(rect.width, scrollWidth2, clientWidth);
      const elementHeight = Math.max(rect.height, scrollHeight2, clientHeight);
      if (elementWidth > 0 && elementHeight > 0) {
        return {
          width: elementWidth,
          height: elementHeight
        };
      }
    }
    const scrollWidth = document.documentElement.scrollWidth;
    const scrollHeight = document.documentElement.scrollHeight;
    const bodyScrollWidth = document.body.scrollWidth;
    const bodyScrollHeight = document.body.scrollHeight;
    const elems = el ? el.querySelectorAll("*") : document.querySelectorAll("body *");
    let maxRight = 0;
    let maxBottom = 0;
    let minLeft = Infinity;
    let minTop = Infinity;
    elems.forEach((elem) => {
      if (elem.offsetParent === null) return;
      const rect = elem.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const absLeft = rect.left + window.scrollX;
      const absTop = rect.top + window.scrollY;
      const absRight = rect.right + window.scrollX;
      const absBottom = rect.bottom + window.scrollY;
      if (absRight > 0 && absBottom > 0) {
        maxRight = Math.max(maxRight, absRight);
        maxBottom = Math.max(maxBottom, absBottom);
        minLeft = Math.min(minLeft, absLeft);
        minTop = Math.min(minTop, absTop);
      }
    });
    const bodyRect = document.body.getBoundingClientRect();
    const bodyWidth = bodyRect.width;
    const bodyHeight = bodyRect.height;
    const contentWidth = maxRight - (minLeft === Infinity ? 0 : minLeft);
    const contentHeight = maxBottom - (minTop === Infinity ? 0 : minTop);
    const finalWidth = Math.max(scrollWidth, bodyScrollWidth, contentWidth, bodyWidth);
    const finalHeight = Math.max(scrollHeight, bodyScrollHeight, contentHeight, bodyHeight);
    if (finalWidth <= 0 || finalHeight <= 0) {
      throw new Error("\u4E3B\u8981\u65B9\u6CD5\u8BA1\u7B97\u51FA\u65E0\u6548\u5C3A\u5BF8");
    }
    return {
      width: finalWidth,
      height: finalHeight
    };
  } catch (error) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const docWidth = document.documentElement.clientWidth;
    const docHeight = document.documentElement.clientHeight;
    const bodyWidth = document.body.clientWidth;
    const bodyHeight = document.body.clientHeight;
    const width = Math.max(viewportWidth, docWidth, bodyWidth);
    const height = Math.max(viewportHeight, docHeight, bodyHeight);
    return { width, height };
  }
}
async function generatePageSvg(options = {}) {
  const { targetElement, filter } = options;
  try {
    if (VERBOSE) console.log("\u{1F4F8} [generatePageSvg] \u5F00\u59CB\u751F\u6210 SVG...");
    const elementToCapture = targetElement || document.body;
    if (VERBOSE) console.log("\u{1F4F8} [generatePageSvg] \u76EE\u6807\u5143\u7D20:", {
      tagName: elementToCapture.tagName,
      id: elementToCapture.id,
      className: elementToCapture.className
    });
    if (VERBOSE) console.log("\u{1F4F8} [generatePageSvg] \u8BA1\u7B97\u9875\u9762\u5C3A\u5BF8...");
    const pageSize = getPageSize(elementToCapture);
    const pageWidth = pageSize.width;
    const pageHeight = pageSize.height;
    if (VERBOSE) console.log("\u{1F4F8} [generatePageSvg] \u9875\u9762\u5C3A\u5BF8:", { pageWidth, pageHeight });
    if (VERBOSE) console.log("\u{1F4F8} [generatePageSvg] \u5BFC\u5165 snapdom \u5E93...");
    const { snapdom } = await import("@zumer/snapdom");
    if (VERBOSE) console.log("\u2705 [generatePageSvg] snapdom \u5E93\u5BFC\u5165\u6210\u529F");
    if (VERBOSE) console.log("\u{1F4F8} [generatePageSvg] \u8C03\u7528 snapdom.toBlob()...");
    const images = elementToCapture.querySelectorAll("img");
    const base64Images = Array.from(images).filter((img) => img.src.startsWith("data:"));
    if (VERBOSE) console.log("\u{1F4F8} [generatePageSvg] \u9875\u9762\u56FE\u7247\u7EDF\u8BA1:", {
      total: images.length,
      base64: base64Images.length,
      base64Sizes: base64Images.map((img) => ({
        length: img.src.length,
        fromCanvas: img.getAttribute("data-from-canvas") === "true"
      }))
    });
    const startTime = Date.now();
    if (VERBOSE) console.log("\u{1F4F8} [generatePageSvg] \u4F7F\u7528 fast \u6A21\u5F0F...");
    const svgBlob = await snapdom.toBlob(elementToCapture, {
      //compress: false,
      fast: true,
      // 使用快速模式
      embedFonts: true,
      scale: 1,
      dpr: 1,
      format: "svg",
      // 允许传入过滤函数以忽略特定节点（例如导出浮层）
      filter: typeof filter === "function" ? filter : void 0
    });
    const elapsed = Date.now() - startTime;
    if (VERBOSE) console.log("\u2705 [generatePageSvg] SVG Blob \u751F\u6210\u6210\u529F:", {
      size: svgBlob.size,
      type: svgBlob.type,
      elapsed: `${elapsed}ms`
    });
    if (VERBOSE) console.log("\u{1F4F8} [generatePageSvg] \u89E3\u6790 SVG Blob...");
    const svgText = await svgBlob.text();
    if (VERBOSE) console.log("\u2705 [generatePageSvg] SVG \u6587\u672C\u89E3\u6790\u6210\u529F:", {
      length: svgText.length,
      preview: svgText.substring(0, 200)
    });
    if (VERBOSE) console.log("\u{1F4F8} [generatePageSvg] \u89E3\u6790 SVG DOM...");
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
    const svgRoot = svgDoc.documentElement;
    if (svgRoot.tagName.toLowerCase() !== "svg") {
      console.error("\u274C [generatePageSvg] \u89E3\u6790\u7684\u4E0D\u662F\u6709\u6548\u7684 SVG:", svgRoot.tagName);
      throw new Error("\u89E3\u6790\u7684SVG\u65E0\u6548");
    }
    const svgWidth = svgRoot.getAttribute("width");
    const svgHeight = svgRoot.getAttribute("height");
    const svgViewBox = svgRoot.getAttribute("viewBox");
    if (VERBOSE) console.log("\u2705 [generatePageSvg] SVG DOM \u89E3\u6790\u6210\u529F:", {
      width: svgWidth,
      height: svgHeight,
      viewBox: svgViewBox,
      childCount: svgRoot.children.length
    });
    if (VERBOSE) console.log("\u2705 [generatePageSvg] SVG \u751F\u6210\u5B8C\u6210");
    return {
      svgBlob,
      svgText,
      svgDoc,
      svgRoot,
      pageWidth,
      pageHeight
    };
  } catch (error) {
    console.error("\u274C [generatePageSvg] SVG\u751F\u6210\u5931\u8D25:", error);
    console.error("\u274C [generatePageSvg] \u9519\u8BEF\u5806\u6808:", error.stack);
    throw error;
  }
}
function injectSvgToPage(svgData) {
  try {
    const injectedSvg = svgData.svgRoot.cloneNode(true);
    injectedSvg.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      z-index: 999999;
      pointer-events: none;
    `;
    injectedSvg.id = "snapdom-injected-svg";
    let host = document.getElementById("snapdom-shadow-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "snapdom-shadow-host";
      host.style.cssText = `
        position: fixed;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        z-index: 999999;
        pointer-events: none;
      `;
      host.attachShadow({ mode: "open" });
      document.body.appendChild(host);
    }
    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: "open" });
    shadowRoot.appendChild(injectedSvg);
    return injectedSvg;
  } catch (error) {
    console.error("\u274C [SnapDOM] SVG\u6CE8\u5165\u5931\u8D25:", error);
    throw error;
  }
}
function cleanupInjectedSvg() {
  try {
    const host = document.getElementById("snapdom-shadow-host");
    if (host) {
      host.remove();
      return;
    }
  } catch (error) {
    console.warn("\u26A0\uFE0F [SnapDOM] SVG\u6E05\u7406\u5931\u8D25:", error);
  }
}

// src/export-core/dom/html-to-figma/helpers/autoLayoutDeny.js
var VERBOSE2 = false;
function isVerboseEnabled() {
  if (VERBOSE2) return true;
  try {
    return Boolean(globalThis.__AXHUB_AUTO_LAYOUT_DEBUG__) || globalThis.localStorage?.getItem("__AXHUB_AUTO_LAYOUT_DEBUG__") === "1";
  } catch {
    return Boolean(globalThis.__AXHUB_AUTO_LAYOUT_DEBUG__);
  }
}
function logDenial(container, computedStyle, children, reason) {
  if (!isVerboseEnabled()) return;
  const firstChild = children[0];
  const firstChildStyle = firstChild ? window.getComputedStyle(firstChild) : null;
  console.group(`\u{1F6AB} [AutoLayout DENIED] ${reason}`);
  console.log("Container:", {
    tagName: container.tagName,
    className: container.className,
    id: container.id
  });
  console.log("Container CSS:", {
    display: computedStyle.display,
    flexDirection: computedStyle.flexDirection,
    flexWrap: computedStyle.flexWrap,
    gap: computedStyle.gap,
    rowGap: computedStyle.rowGap,
    columnGap: computedStyle.columnGap,
    gridTemplateColumns: computedStyle.gridTemplateColumns,
    gridTemplateRows: computedStyle.gridTemplateRows,
    position: computedStyle.position
  });
  console.log("Children count:", children.length);
  if (firstChild) {
    console.log("First child:", {
      tagName: firstChild.tagName,
      className: firstChild.className
    });
    console.log("First child CSS:", {
      display: firstChildStyle.display,
      position: firstChildStyle.position,
      marginTop: firstChildStyle.marginTop,
      marginRight: firstChildStyle.marginRight,
      marginBottom: firstChildStyle.marginBottom,
      marginLeft: firstChildStyle.marginLeft,
      paddingTop: firstChildStyle.paddingTop,
      paddingRight: firstChildStyle.paddingRight,
      paddingBottom: firstChildStyle.paddingBottom,
      paddingLeft: firstChildStyle.paddingLeft
    });
  }
  console.log("DOM structure:", container.outerHTML.substring(0, 200) + "...");
  console.groupEnd();
}
var RuleReason = {
  LESS_THAN_TWO_VISIBLE_CHILDREN: "LESS_THAN_TWO_VISIBLE_CHILDREN",
  OUT_OF_FLOW_CHILD: "OUT_OF_FLOW_CHILD",
  CHILDREN_OVERLAP: "CHILDREN_OVERLAP",
  GRID_TEMPLATE_AREAS: "GRID_TEMPLATE_AREAS",
  EXPLICIT_GRID_PLACEMENT: "EXPLICIT_GRID_PLACEMENT",
  IMPLICIT_GRID_FIXED_DIMS: "IMPLICIT_GRID_FIXED_DIMS",
  GRID_WITH_CALCULATED_POSITIONS: "GRID_WITH_CALCULATED_POSITIONS",
  FLEX_WRAP_WITH_CHILD_MARGINS: "FLEX_WRAP_WITH_CHILD_MARGINS",
  VISUAL_ORDER_MISMATCH: "VISUAL_ORDER_MISMATCH",
  NEGATIVE_MARGIN_USED: "NEGATIVE_MARGIN_USED",
  MARGIN_VARIANCE_HIGH: "MARGIN_VARIANCE_HIGH",
  TRANSFORM_LAYOUT_HACK: "TRANSFORM_LAYOUT_HACK",
  FIXED_SIZE_ALIGNED_CONTAINER: "FIXED_SIZE_ALIGNED_CONTAINER",
  EXTREME_CHILD_SIZE_DIFF_MAIN_AXIS: "EXTREME_CHILD_SIZE_DIFF_MAIN_AXIS"
};
function shouldDenyAutoLayout(container, computedStyle, childElements) {
  const reasons = [];
  const warnings = [];
  const childData = [];
  for (const child of childElements) {
    const rect = child.getBoundingClientRect();
    const childStyle = window.getComputedStyle(child);
    const isVisible = childStyle.display !== "none" && childStyle.visibility !== "hidden";
    if (isVisible && rect.width > 0 && rect.height > 0) {
      childData.push({ element: child, rect, style: childStyle });
    }
  }
  const display = computedStyle.display;
  if (display === "flex" || display === "inline-flex" || display === "grid" || display === "inline-grid") {
    if (isVerboseEnabled()) console.log("\u{1F50D} [AutoLayout] Checking container:", {
      tagName: container.tagName,
      className: container.className,
      display,
      flexWrap: computedStyle.flexWrap,
      gap: computedStyle.gap,
      childrenCount: childData.length
    });
  }
  if (childData.length < 2) {
    if (childData.length === 0) {
      logDenial(container, computedStyle, childData.map((d) => d.element), RuleReason.LESS_THAN_TWO_VISIBLE_CHILDREN);
      reasons.push(RuleReason.LESS_THAN_TWO_VISIBLE_CHILDREN);
      return { deny: true, reasons, warnings };
    }
    const layoutValue = evaluateAutoLayoutValue(computedStyle, display, childData);
    if (!layoutValue.hasValue) {
      logDenial(container, computedStyle, childData.map((d) => d.element), RuleReason.LESS_THAN_TWO_VISIBLE_CHILDREN);
      reasons.push(RuleReason.LESS_THAN_TWO_VISIBLE_CHILDREN);
      return { deny: true, reasons, warnings };
    }
    if (isVerboseEnabled()) console.log("\u2705 [AutoLayout] Single child with valuable layout properties allowed:", {
      tagName: container.tagName,
      className: container.className,
      display,
      reasons: layoutValue.reasons
    });
  }
  if (childData.length === 2) {
    const layoutValue = evaluateAutoLayoutValue(computedStyle, display, childData);
    if (!layoutValue.hasValue) {
      logDenial(container, computedStyle, childData.map((d) => d.element), "TWO_CHILDREN_NO_LAYOUT_VALUE");
      reasons.push("TWO_CHILDREN_NO_LAYOUT_VALUE");
      return { deny: true, reasons, warnings };
    }
  }
  let hasOutOfFlowChild = false;
  let hasNegMargin = false;
  let hasTransformHack = false;
  let hasChildMargins = false;
  const flexWrap = computedStyle.flexWrap || "nowrap";
  const isFlexWrap = (display === "flex" || display === "inline-flex") && (flexWrap === "wrap" || flexWrap === "wrap-reverse");
  const gap = computedStyle.gap || "0px";
  const rowGap = parseFloat(computedStyle.rowGap) || 0;
  const columnGap = parseFloat(computedStyle.columnGap) || 0;
  const hasGap = gap !== "0px" && gap !== "normal" || rowGap > 0 || columnGap > 0;
  const needsMarginCheck = isFlexWrap && !hasGap;
  for (const { style } of childData) {
    if (!hasOutOfFlowChild && (style.position === "absolute" || style.position === "fixed")) {
      hasOutOfFlowChild = true;
    }
    if (!hasNegMargin && hasNegativeMargin(style)) {
      hasNegMargin = true;
    }
    if (!hasTransformHack) {
      const transform = style.transform;
      if (transform && transform !== "none" && transform.includes("translate")) {
        hasTransformHack = true;
      }
    }
    if (needsMarginCheck && !hasChildMargins) {
      const marginBottom = parseFloat(style.marginBottom) || 0;
      const marginTop = parseFloat(style.marginTop) || 0;
      const marginLeft = parseFloat(style.marginLeft) || 0;
      const marginRight = parseFloat(style.marginRight) || 0;
      const marginInlineStart = parseFloat(style.marginInlineStart) || 0;
      const marginInlineEnd = parseFloat(style.marginInlineEnd) || 0;
      const marginBlockStart = parseFloat(style.marginBlockStart) || 0;
      const marginBlockEnd = parseFloat(style.marginBlockEnd) || 0;
      if (marginBottom > 1 || marginTop > 1 || marginLeft > 1 || marginRight > 1 || marginInlineStart > 1 || marginInlineEnd > 1 || marginBlockStart > 1 || marginBlockEnd > 1) {
        hasChildMargins = true;
      }
    }
    if (hasOutOfFlowChild && hasNegMargin && hasTransformHack && (!needsMarginCheck || hasChildMargins)) {
      break;
    }
  }
  if (hasOutOfFlowChild) {
    logDenial(container, computedStyle, childData.map((d) => d.element), RuleReason.OUT_OF_FLOW_CHILD);
    reasons.push(RuleReason.OUT_OF_FLOW_CHILD);
    return { deny: true, reasons, warnings };
  }
  if (hasOverlapOptimized(childData)) {
    logDenial(container, computedStyle, childData.map((d) => d.element), RuleReason.CHILDREN_OVERLAP);
    reasons.push(RuleReason.CHILDREN_OVERLAP);
    return { deny: true, reasons, warnings };
  }
  if (hasChildMargins) {
    logDenial(container, computedStyle, childData.map((d) => d.element), RuleReason.FLEX_WRAP_WITH_CHILD_MARGINS);
    reasons.push(RuleReason.FLEX_WRAP_WITH_CHILD_MARGINS);
    return { deny: true, reasons, warnings };
  }
  if (display === "grid" || display === "inline-grid") {
    const gridTemplateAreas = computedStyle.gridTemplateAreas;
    if (gridTemplateAreas && gridTemplateAreas !== "none") {
      logDenial(container, computedStyle, childData.map((d) => d.element), RuleReason.GRID_TEMPLATE_AREAS);
      reasons.push(RuleReason.GRID_TEMPLATE_AREAS);
      return { deny: true, reasons, warnings };
    }
    const hasExplicitPlacement = childData.some(({ style }) => {
      const rowStart = style.gridRowStart;
      const colStart = style.gridColumnStart;
      return rowStart && rowStart !== "auto" || colStart && colStart !== "auto";
    });
    if (hasExplicitPlacement) {
      logDenial(container, computedStyle, childData.map((d) => d.element), RuleReason.EXPLICIT_GRID_PLACEMENT);
      reasons.push(RuleReason.EXPLICIT_GRID_PLACEMENT);
      return { deny: true, reasons, warnings };
    }
    const cols = computedStyle.gridTemplateColumns;
    const rows = computedStyle.gridTemplateRows;
    const colCount = cols && cols !== "none" ? cols.split(" ").filter((v) => v.trim()).length : 0;
    const rowCount = rows && rows !== "none" ? rows.split(" ").filter((v) => v.trim()).length : 0;
    if ((colCount > 1 || rowCount > 1) && childData.length >= 6) {
      warnings.push(
        `${RuleReason.IMPLICIT_GRID_FIXED_DIMS}: container appears to be an implicit grid with cols=${colCount}, rows=${rowCount}`
      );
    }
  }
  if (!isVisualOrderSameAsDomOptimized(childData)) {
    logDenial(container, computedStyle, childData.map((d) => d.element), RuleReason.VISUAL_ORDER_MISMATCH);
    reasons.push(RuleReason.VISUAL_ORDER_MISMATCH);
    return { deny: true, reasons, warnings };
  }
  if (hasNegMargin) {
    logDenial(container, computedStyle, childData.map((d) => d.element), RuleReason.NEGATIVE_MARGIN_USED);
    reasons.push(RuleReason.NEGATIVE_MARGIN_USED);
    return { deny: true, reasons, warnings };
  }
  const marginVariance = adjacentSiblingMarginVarianceOptimized(childData);
  if (marginVariance.relativeStdDev > 1.2 && marginVariance.mean > 0) {
    warnings.push(
      `${RuleReason.MARGIN_VARIANCE_HIGH}: mean=${marginVariance.mean.toFixed(2)}, relStdDev=${marginVariance.relativeStdDev.toFixed(2)}`
    );
  }
  if (hasTransformHack) {
    logDenial(container, computedStyle, childData.map((d) => d.element), RuleReason.TRANSFORM_LAYOUT_HACK);
    reasons.push(RuleReason.TRANSFORM_LAYOUT_HACK);
    return { deny: true, reasons, warnings };
  }
  if (display === "flex" || display === "inline-flex" || display === "grid" || display === "inline-grid") {
    if (isVerboseEnabled()) console.log("\u2705 [AutoLayout] ALLOWED:", container.className || container.tagName);
  }
  return { deny: false, reasons, warnings };
}
function evaluateAutoLayoutValue(computedStyle, display, childData) {
  const reasons = [];
  const isFlex = display === "flex" || display === "inline-flex";
  const isGrid = display === "grid" || display === "inline-grid";
  if (isFlex) {
    const justifyContent = computedStyle.justifyContent || "normal";
    const alignItems = computedStyle.alignItems || "normal";
    if (justifyContent !== "normal" && justifyContent !== "flex-start" && justifyContent !== "start") {
      reasons.push(`justify-content: ${justifyContent}`);
    }
    if (alignItems !== "normal" && alignItems !== "stretch") {
      reasons.push(`align-items: ${alignItems}`);
    }
  }
  if (isGrid) {
    const justifyItems = computedStyle.justifyItems || "normal";
    const alignItems = computedStyle.alignItems || "normal";
    const justifyContent = computedStyle.justifyContent || "normal";
    if (justifyItems !== "normal" && justifyItems !== "stretch" && justifyItems !== "legacy") {
      reasons.push(`justify-items: ${justifyItems}`);
    }
    if (alignItems !== "normal" && alignItems !== "stretch") {
      reasons.push(`align-items: ${alignItems}`);
    }
    if (justifyContent !== "normal" && justifyContent !== "start") {
      reasons.push(`justify-content: ${justifyContent}`);
    }
  }
  const gap = computedStyle.gap || "0px";
  const rowGap = parseFloat(computedStyle.rowGap) || 0;
  const columnGap = parseFloat(computedStyle.columnGap) || 0;
  if (gap !== "0px" && gap !== "normal") {
    reasons.push(`gap: ${gap}`);
  } else if (rowGap > 0 || columnGap > 0) {
    reasons.push(`row-gap: ${rowGap}px, column-gap: ${columnGap}px`);
  }
  const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
  const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
  const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
  const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
  const totalPadding = paddingTop + paddingRight + paddingBottom + paddingLeft;
  if (totalPadding > 8) {
    reasons.push(`padding: ${paddingTop}/${paddingRight}/${paddingBottom}/${paddingLeft}`);
  }
  if (isFlex) {
    const flexDirection = computedStyle.flexDirection || "row";
    if (flexDirection === "column" || flexDirection === "column-reverse") {
      reasons.push(`flex-direction: ${flexDirection}`);
    }
  }
  if (isFlex) {
    const flexWrap = computedStyle.flexWrap || "nowrap";
    if (flexWrap === "wrap" || flexWrap === "wrap-reverse") {
      reasons.push(`flex-wrap: ${flexWrap}`);
    }
  }
  if (isGrid) {
    const gridTemplateColumns = computedStyle.gridTemplateColumns || "none";
    const gridTemplateRows = computedStyle.gridTemplateRows || "none";
    if (gridTemplateColumns !== "none") {
      reasons.push(`grid-template-columns: ${gridTemplateColumns}`);
    }
    if (gridTemplateRows !== "none") {
      reasons.push(`grid-template-rows: ${gridTemplateRows}`);
    }
  }
  if (isFlex && childData.length > 0) {
    const hasFlexGrow = childData.some(({ style }) => {
      const flexGrow = parseFloat(style.flexGrow) || 0;
      return flexGrow > 0;
    });
    if (hasFlexGrow) {
      reasons.push("child has flex-grow");
    }
  }
  if (childData.length > 0) {
    const hasAlignSelf = childData.some(({ style }) => {
      const alignSelf = style.alignSelf || "auto";
      return alignSelf !== "auto";
    });
    if (hasAlignSelf) {
      reasons.push("child has align-self");
    }
  }
  return {
    hasValue: reasons.length > 0,
    reasons
  };
}
function hasOverlapOptimized(childData, tolerance = 1) {
  const rects = childData.map((d) => d.rect);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectIntersects(rects[i], rects[j], tolerance)) {
        return true;
      }
    }
  }
  return false;
}
function rectIntersects(a, b, t = 1) {
  return !(a.x + a.width <= b.x + t || b.x + b.width <= a.x + t || a.y + a.height <= b.y + t || b.y + b.height <= a.y + t);
}
function isVisualOrderSameAsDomOptimized(childData) {
  if (childData.length < 2) return true;
  const rects = childData.map((d) => d.rect);
  const horizSpan = Math.max(...rects.map((r) => r.x + r.width)) - Math.min(...rects.map((r) => r.x));
  const vertSpan = Math.max(...rects.map((r) => r.y + r.height)) - Math.min(...rects.map((r) => r.y));
  const horizontalFlow = horizSpan >= vertSpan;
  const indexed = childData.map((data, idx) => ({ idx, rect: data.rect }));
  const visualOrder = indexed.slice().sort((a, b) => {
    if (horizontalFlow) {
      if (Math.abs(a.rect.y - b.rect.y) > 4) return a.rect.y - b.rect.y;
      return a.rect.x - b.rect.x;
    } else {
      if (Math.abs(a.rect.y - b.rect.y) > 4) return a.rect.y - b.rect.y;
      return a.rect.x - b.rect.x;
    }
  });
  for (let i = 0; i < visualOrder.length; i++) {
    if (visualOrder[i].idx !== i) {
      return false;
    }
  }
  return true;
}
function hasNegativeMargin(style) {
  const hasNegTraditional = parseFloat(style.marginTop) < 0 || parseFloat(style.marginRight) < 0 || parseFloat(style.marginBottom) < 0 || parseFloat(style.marginLeft) < 0;
  const hasNegLogical = parseFloat(style.marginInlineStart) < 0 || parseFloat(style.marginInlineEnd) < 0 || parseFloat(style.marginBlockStart) < 0 || parseFloat(style.marginBlockEnd) < 0;
  return hasNegTraditional || hasNegLogical;
}
function adjacentSiblingMarginVarianceOptimized(childData) {
  if (childData.length < 2) return { mean: 0, stdDev: 0, relativeStdDev: 0 };
  const rects = childData.map((d) => d.rect);
  const horizSpan = Math.max(...rects.map((r) => r.x + r.width)) - Math.min(...rects.map((r) => r.x));
  const vertSpan = Math.max(...rects.map((r) => r.y + r.height)) - Math.min(...rects.map((r) => r.y));
  const horizontalFlow = horizSpan >= vertSpan;
  const indexed = childData.map((data, idx) => ({ idx, rect: data.rect }));
  const sorted = indexed.sort((a, b) => {
    if (horizontalFlow) {
      if (Math.abs(a.rect.y - b.rect.y) > 4) return a.rect.y - b.rect.y;
      return a.rect.x - b.rect.x;
    } else {
      if (Math.abs(a.rect.y - b.rect.y) > 4) return a.rect.y - b.rect.y;
      return a.rect.x - b.rect.x;
    }
  });
  const gaps = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i].rect;
    const b = sorted[i + 1].rect;
    const gap = horizontalFlow ? b.x - (a.x + a.width) : b.y - (a.y + a.height);
    gaps.push(gap);
  }
  if (gaps.length === 0) return { mean: 0, stdDev: 0, relativeStdDev: 0 };
  const mean = gaps.reduce((s, v) => s + v, 0) / gaps.length;
  const stdDev = Math.sqrt(gaps.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / gaps.length);
  const relativeStdDev = mean === 0 ? stdDev > 0 ? Infinity : 0 : stdDev / Math.abs(mean);
  return { mean, stdDev, relativeStdDev };
}

// src/export-core/dom/html-to-figma/helpers/auto-layout-utils.js
function isAutoLayoutDebugEnabled() {
  try {
    return Boolean(globalThis.__AXHUB_AUTO_LAYOUT_DEBUG__) || globalThis.localStorage?.getItem("__AXHUB_AUTO_LAYOUT_DEBUG__") === "1";
  } catch {
    return Boolean(globalThis.__AXHUB_AUTO_LAYOUT_DEBUG__);
  }
}
function debugAutoLayout(stage, payload) {
  if (!isAutoLayoutDebugEnabled()) return;
  console.debug(`[AutoLayout] ${stage}`, payload);
}
function getDebugElementMeta(element) {
  return {
    tagName: element?.tagName,
    id: element?.id,
    className: element?.className
  };
}
function buildEffectiveLayoutStyle(_element, computedStyle) {
  return computedStyle;
}
function detectLayoutMode(element, computedStyle) {
  if (!element || !computedStyle) {
    return false;
  }
  const effectiveStyle = buildEffectiveLayoutStyle(element, computedStyle);
  const display = effectiveStyle.display;
  return display === "flex" || display === "inline-flex" || display === "grid" || display === "inline-grid";
}
function getFlexDirection(computedStyle) {
  const flexDirection = computedStyle.flexDirection || "row";
  switch (flexDirection) {
    case "column":
    case "column-reverse":
      return "VERTICAL";
    case "row":
    case "row-reverse":
    default:
      return "HORIZONTAL";
  }
}
function splitByTopLevelWhitespace(value) {
  if (typeof value !== "string") {
    return [];
  }
  const tokens = [];
  let current = "";
  let parenDepth = 0;
  let bracketDepth = 0;
  for (const char of value) {
    if (char === "(") {
      parenDepth += 1;
      current += char;
      continue;
    }
    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      current += char;
      continue;
    }
    if (char === "[") {
      bracketDepth += 1;
      current += char;
      continue;
    }
    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += char;
      continue;
    }
    if (/\s/.test(char) && parenDepth === 0 && bracketDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) {
        tokens.push(trimmed);
      }
      current = "";
      continue;
    }
    current += char;
  }
  const trailing = current.trim();
  if (trailing) {
    tokens.push(trailing);
  }
  return tokens;
}
function findTopLevelCommaIndex(value) {
  if (typeof value !== "string") {
    return -1;
  }
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") {
      parenDepth += 1;
      continue;
    }
    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (char === "[") {
      bracketDepth += 1;
      continue;
    }
    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (char === "," && parenDepth === 0 && bracketDepth === 0) {
      return index;
    }
  }
  return -1;
}
function isLineNameToken(token) {
  return typeof token === "string" && token.startsWith("[") && token.endsWith("]");
}
function countGridTracks(trackListValue) {
  const trackList = typeof trackListValue === "string" ? trackListValue.trim() : "";
  if (!trackList || trackList === "none") {
    return 0;
  }
  if (trackList === "subgrid" || trackList === "masonry") {
    return null;
  }
  const tokens = splitByTopLevelWhitespace(trackList);
  if (tokens.length === 0) {
    return 0;
  }
  let count = 0;
  for (const token of tokens) {
    if (isLineNameToken(token)) {
      continue;
    }
    if (/^repeat\(/i.test(token)) {
      if (!token.endsWith(")")) {
        return null;
      }
      const repeatBody = token.slice(token.indexOf("(") + 1, -1);
      const commaIndex = findTopLevelCommaIndex(repeatBody);
      if (commaIndex < 0) {
        return null;
      }
      const repeatTimesRaw = repeatBody.slice(0, commaIndex).trim().toLowerCase();
      const repeatedTrackList = repeatBody.slice(commaIndex + 1).trim();
      if (!/^\d+$/.test(repeatTimesRaw)) {
        return null;
      }
      const repeatTimes = Number.parseInt(repeatTimesRaw, 10);
      if (!Number.isFinite(repeatTimes) || repeatTimes <= 0) {
        return null;
      }
      const repeatedTrackCount = countGridTracks(repeatedTrackList);
      if (!Number.isFinite(repeatedTrackCount)) {
        return null;
      }
      count += repeatTimes * repeatedTrackCount;
      continue;
    }
    count += 1;
  }
  return count;
}
function clusterCoordinates(values, tolerance = 2) {
  const numericValues = values.map((value) => Number(value)).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (numericValues.length === 0) {
    return [];
  }
  const groups = [numericValues[0]];
  for (let index = 1; index < numericValues.length; index += 1) {
    const value = numericValues[index];
    const last = groups[groups.length - 1];
    if (Math.abs(value - last) > tolerance) {
      groups.push(value);
    }
  }
  return groups;
}
function inferGridDimensionsFromChildren(element) {
  if (!element || !element.children || element.children.length === 0) {
    return null;
  }
  const rects = [];
  const sampledChildren = [];
  const childElements = Array.from(element.children).filter((child) => child instanceof HTMLElement);
  for (const child of childElements) {
    try {
      const style = window.getComputedStyle(child);
      if (style.display === "none" || style.visibility === "hidden" || style.position === "absolute" || style.position === "fixed") {
        continue;
      }
      const rect = child.getBoundingClientRect();
      if (rect.width <= 0.5 || rect.height <= 0.5) {
        continue;
      }
      rects.push(rect);
      if (sampledChildren.length < 12) {
        sampledChildren.push({
          tagName: child.tagName,
          id: child.id,
          className: child.className,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        });
      }
    } catch {
    }
  }
  if (rects.length === 0) {
    return null;
  }
  const leftClusters = clusterCoordinates(rects.map((rect) => rect.left));
  const topClusters = clusterCoordinates(rects.map((rect) => rect.top));
  const columns = leftClusters.length;
  const rows = topClusters.length;
  debugAutoLayout("grid-infer-from-children", {
    element: getDebugElementMeta(element),
    childCount: element?.children?.length || 0,
    inFlowRenderableChildCount: rects.length,
    leftClusters,
    topClusters,
    inferredColumns: columns,
    inferredRows: rows,
    sampledChildren
  });
  if (columns <= 0 && rows <= 0) {
    return null;
  }
  return {
    gridColumns: Math.max(1, columns || 1),
    gridRows: Math.max(1, rows || 1),
    inFlowChildCount: rects.length
  };
}
function getGridLayoutMode(element, computedStyle) {
  const templateRows = computedStyle.gridTemplateRows || "none";
  const templateColumns = computedStyle.gridTemplateColumns || "none";
  const gridAutoFlow = (computedStyle.gridAutoFlow || "row").toLowerCase();
  const rowCount = countGridTracks(templateRows);
  const columnCount = countGridTracks(templateColumns);
  const inferredGrid = inferGridDimensionsFromChildren(element);
  debugAutoLayout("grid-explicit-vs-inferred", {
    element: getDebugElementMeta(element),
    templateRows,
    templateColumns,
    gridAutoFlow,
    explicitRowCount: rowCount,
    explicitColumnCount: columnCount,
    inferredGrid
  });
  const hasUnresolvedColumnTracks = !Number.isFinite(columnCount);
  const unsupportedAutoFlow = gridAutoFlow.includes("column") || gridAutoFlow.includes("dense");
  if (unsupportedAutoFlow || hasUnresolvedColumnTracks && (!inferredGrid || inferredGrid.gridColumns <= 1)) {
    debugAutoLayout("grid-fallback-linear", {
      element: getDebugElementMeta(element),
      reason: hasUnresolvedColumnTracks ? "UNRESOLVED_COLUMN_TRACKS" : "UNSUPPORTED_AUTO_FLOW",
      gridAutoFlow,
      templateRows,
      templateColumns,
      rowCount,
      columnCount,
      inferredGrid
    });
    return {
      layoutMode: "VERTICAL"
    };
  }
  const explicitColumns = Number.isFinite(columnCount) ? Number(columnCount) : 0;
  const explicitRows = Number.isFinite(rowCount) ? Number(rowCount) : 0;
  let resolvedColumns = explicitColumns > 0 ? explicitColumns : 0;
  let resolvedRows = explicitRows > 0 ? explicitRows : 0;
  if (inferredGrid) {
    if (resolvedColumns <= 0) {
      resolvedColumns = inferredGrid.gridColumns;
    }
    if (resolvedRows <= 0 && resolvedColumns > 0) {
      const childCount = Number(inferredGrid.inFlowChildCount);
      const estimatedRows = Number.isFinite(childCount) && childCount > 0 ? Math.ceil(childCount / resolvedColumns) : 0;
      if (estimatedRows > 0) {
        resolvedRows = estimatedRows;
      } else if (inferredGrid.gridRows > 0 && explicitColumns <= 0) {
        resolvedRows = inferredGrid.gridRows;
      }
    }
  }
  if (resolvedColumns > 1) {
    const safeRowCount = resolvedRows > 0 ? resolvedRows : void 0;
    debugAutoLayout("grid-final-resolved", {
      element: getDebugElementMeta(element),
      explicitColumns,
      explicitRows,
      inferredGrid,
      resolvedColumns,
      resolvedRows
    });
    return {
      layoutMode: "GRID",
      gridColumns: resolvedColumns,
      gridRows: safeRowCount
    };
  }
  return {
    layoutMode: "VERTICAL"
  };
}
function mapJustifyContent(justifyContent) {
  switch (justifyContent) {
    case "flex-start":
    case "start":
      return { align: "MIN", needsEdgePadding: false, edgePaddingRatio: 0 };
    case "center":
      return { align: "CENTER", needsEdgePadding: false, edgePaddingRatio: 0 };
    case "flex-end":
    case "end":
      return { align: "MAX", needsEdgePadding: false, edgePaddingRatio: 0 };
    case "space-between":
      return { align: "SPACE_BETWEEN", needsEdgePadding: false, edgePaddingRatio: 0 };
    case "space-around":
      return { align: "SPACE_BETWEEN", needsEdgePadding: true, edgePaddingRatio: 0.5 };
    case "space-evenly":
      return { align: "SPACE_BETWEEN", needsEdgePadding: true, edgePaddingRatio: 1 };
    default:
      return { align: "MIN", needsEdgePadding: false, edgePaddingRatio: 0 };
  }
}
function mapAlignItems(alignItems) {
  switch (alignItems) {
    case "flex-start":
    case "start":
      return "MIN";
    case "center":
      return "CENTER";
    case "flex-end":
    case "end":
      return "MAX";
    case "baseline":
      return "BASELINE";
    case "stretch":
      return "MIN";
    // Figma doesn't support STRETCH for counter axis align items
    default:
      return "MIN";
  }
}
function mapJustifyItems(justifyItems) {
  switch (justifyItems) {
    case "start":
    case "flex-start":
    case "self-start":
      return "MIN";
    case "center":
      return "CENTER";
    case "end":
    case "flex-end":
    case "self-end":
      return "MAX";
    case "left":
      return "MIN";
    case "right":
      return "MAX";
    case "stretch":
      return "MIN";
    // Figma doesn't support STRETCH on counter axis
    default:
      return "MIN";
  }
}
function parseSpacingNumber(...candidates) {
  for (const value of candidates) {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}
function getItemSpacingFromChildMargins(element, layoutMode) {
  if (!element || !element.children || element.children.length < 2) {
    return 0;
  }
  const children = Array.from(element.children).filter((child) => child instanceof HTMLElement);
  if (children.length < 2) {
    return 0;
  }
  const inFlowChildren = children.filter((child) => {
    try {
      const style = window.getComputedStyle(child);
      return style.display !== "none" && style.position !== "absolute" && style.position !== "fixed";
    } catch {
      return false;
    }
  });
  if (inFlowChildren.length < 2) {
    return 0;
  }
  const pairSpacings = [];
  for (let i = 0; i < inFlowChildren.length - 1; i += 1) {
    const current = window.getComputedStyle(inFlowChildren[i]);
    const next = window.getComputedStyle(inFlowChildren[i + 1]);
    const endSpacing = layoutMode === "HORIZONTAL" ? parseSpacingNumber(current.marginInlineEnd, current.marginRight) : parseSpacingNumber(current.marginBlockEnd, current.marginBottom);
    const startSpacing = layoutMode === "HORIZONTAL" ? parseSpacingNumber(next.marginInlineStart, next.marginLeft) : parseSpacingNumber(next.marginBlockStart, next.marginTop);
    const spacing = endSpacing + startSpacing;
    if (spacing > 0.5) {
      pairSpacings.push(spacing);
    }
  }
  if (pairSpacings.length === 0) {
    return 0;
  }
  const first = pairSpacings[0];
  const isUniform = pairSpacings.every((value) => Math.abs(value - first) <= 0.5);
  if (isUniform) {
    return first;
  }
  return Math.max(...pairSpacings);
}
function getItemSpacing(element, computedStyle, layoutMode) {
  const gap = computedStyle.gap;
  if (gap && gap !== "normal" && gap !== "0px") {
    const gapValues = gap.split(" ");
    if (gapValues.length === 2) {
      return parseFloat(layoutMode === "HORIZONTAL" ? gapValues[1] : gapValues[0]) || 0;
    }
    return parseFloat(gap) || 0;
  }
  if (layoutMode === "HORIZONTAL") {
    const columnGap = computedStyle.columnGap || computedStyle.gridColumnGap;
    const gapValue = parseFloat(columnGap) || 0;
    if (gapValue > 0) {
      return gapValue;
    }
  } else {
    const rowGap = computedStyle.rowGap || computedStyle.gridRowGap;
    const gapValue = parseFloat(rowGap) || 0;
    if (gapValue > 0) {
      return gapValue;
    }
  }
  return getItemSpacingFromChildMargins(element, layoutMode);
}
function getCounterAxisSpacing(computedStyle, layoutMode) {
  const gap = computedStyle.gap;
  if (gap && gap !== "normal" && gap !== "0px") {
    const gapValues = gap.split(" ");
    if (gapValues.length === 2) {
      return parseFloat(layoutMode === "HORIZONTAL" ? gapValues[0] : gapValues[1]) || 0;
    }
    return parseFloat(gap) || 0;
  }
  if (layoutMode === "HORIZONTAL") {
    const rowGap = computedStyle.rowGap || computedStyle.gridRowGap;
    return parseFloat(rowGap) || 0;
  } else {
    const columnGap = computedStyle.columnGap || computedStyle.gridColumnGap;
    return parseFloat(columnGap) || 0;
  }
}
function getPaddingProps(computedStyle) {
  const paddingTop = parseFloat(computedStyle.paddingTop) || parseFloat(computedStyle.paddingBlockStart) || 0;
  const paddingRight = parseFloat(computedStyle.paddingRight) || parseFloat(computedStyle.paddingInlineEnd) || 0;
  const paddingBottom = parseFloat(computedStyle.paddingBottom) || parseFloat(computedStyle.paddingBlockEnd) || 0;
  const paddingLeft = parseFloat(computedStyle.paddingLeft) || parseFloat(computedStyle.paddingInlineStart) || 0;
  return {
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft
  };
}
function getLayoutWrap(computedStyle) {
  const flexWrap = computedStyle.flexWrap || "nowrap";
  return flexWrap === "wrap" || flexWrap === "wrap-reverse" ? "WRAP" : "NO_WRAP";
}
function mapCSSToAutoLayout(element, computedStyle) {
  const effectiveStyle = buildEffectiveLayoutStyle(element, computedStyle);
  if (!detectLayoutMode(element, computedStyle)) {
    return null;
  }
  const childElements = Array.from(element.children).filter((child) => child instanceof HTMLElement);
  const denyResult = shouldDenyAutoLayout(element, effectiveStyle, childElements);
  if (denyResult.deny) {
    debugAutoLayout("denied", {
      element: {
        tagName: element?.tagName,
        id: element?.id,
        className: element?.className
      },
      reasons: denyResult.reasons,
      warnings: denyResult.warnings,
      display: effectiveStyle.display,
      justifyContent: effectiveStyle.justifyContent,
      alignItems: effectiveStyle.alignItems,
      gap: effectiveStyle.gap
    });
    return null;
  }
  const display = effectiveStyle.display;
  const isGrid = display === "grid" || display === "inline-grid";
  let layoutMode;
  let gridColumns;
  let gridRows;
  if (isGrid) {
    const gridConfig = getGridLayoutMode(element, effectiveStyle);
    layoutMode = gridConfig.layoutMode;
    gridColumns = gridConfig.gridColumns;
    gridRows = gridConfig.gridRows;
    debugAutoLayout("grid-config-selected", {
      element: getDebugElementMeta(element),
      gridConfig,
      templateRows: effectiveStyle.gridTemplateRows,
      templateColumns: effectiveStyle.gridTemplateColumns,
      gridAutoFlow: effectiveStyle.gridAutoFlow
    });
  } else {
    layoutMode = getFlexDirection(effectiveStyle);
  }
  const itemSpacing = getItemSpacing(element, effectiveStyle, layoutMode);
  const counterAxisSpacing = getCounterAxisSpacing(effectiveStyle, layoutMode);
  const padding = getPaddingProps(effectiveStyle);
  const justifyContent = effectiveStyle.justifyContent || "flex-start";
  const alignItems = effectiveStyle.alignItems || "stretch";
  const justifyItems = effectiveStyle.justifyItems || "";
  const justifyResult = mapJustifyContent(justifyContent);
  const primaryAxisAlignItems = justifyResult.align;
  let counterAxisAlignItems = mapAlignItems(alignItems);
  if (justifyItems && justifyItems !== "legacy" && justifyItems !== "normal") {
    counterAxisAlignItems = mapJustifyItems(justifyItems);
  }
  if (justifyResult.needsEdgePadding && itemSpacing > 0) {
    const edgePadding = itemSpacing * justifyResult.edgePaddingRatio;
    if (layoutMode === "HORIZONTAL") {
      padding.paddingLeft += edgePadding;
      padding.paddingRight += edgePadding;
    } else if (layoutMode === "VERTICAL") {
      padding.paddingTop += edgePadding;
      padding.paddingBottom += edgePadding;
    }
  }
  const layoutWrap = layoutMode === "GRID" ? void 0 : isGrid ? "WRAP" : getLayoutWrap(effectiveStyle);
  let primaryAxisSizingMode = "AUTO";
  let counterAxisSizingMode = "AUTO";
  if (layoutMode === "HORIZONTAL") {
    const width = effectiveStyle.width;
    if (width && width !== "auto") {
      if (width.includes("%") && parseFloat(width) === 100) {
        primaryAxisSizingMode = "FIXED";
      } else if (width.includes("px")) {
        primaryAxisSizingMode = "FIXED";
      }
    }
    const height = effectiveStyle.height;
    if (height && height !== "auto" && height.includes("px")) {
      counterAxisSizingMode = "FIXED";
    }
  } else if (layoutMode === "VERTICAL") {
    const height = effectiveStyle.height;
    if (height && height !== "auto") {
      if (height.includes("%") && parseFloat(height) === 100) {
        primaryAxisSizingMode = "FIXED";
      } else if (height.includes("px")) {
        primaryAxisSizingMode = "FIXED";
      }
    }
    const width = effectiveStyle.width;
    if (width && width !== "auto" && width.includes("px")) {
      counterAxisSizingMode = "FIXED";
    }
  }
  const result = {
    layoutMode,
    primaryAxisSizingMode,
    counterAxisSizingMode,
    primaryAxisAlignItems,
    counterAxisAlignItems,
    itemSpacing,
    ...padding,
    layoutPositioning: "AUTO"
    // Let Figma handle positioning
  };
  if (layoutWrap !== void 0) {
    result.layoutWrap = layoutWrap;
    if (layoutWrap === "WRAP") {
      result.counterAxisSpacing = counterAxisSpacing || 0;
    }
  }
  if (layoutMode === "GRID" && gridColumns) {
    result.gridColumnCount = gridColumns;
    if (Number.isFinite(gridRows) && gridRows > 0) {
      result.gridRowCount = gridRows;
    }
    const rowGap = parseFloat(effectiveStyle.rowGap || effectiveStyle.gridRowGap) || 0;
    const columnGap = parseFloat(effectiveStyle.columnGap || effectiveStyle.gridColumnGap) || 0;
    result.gridColumnGap = columnGap;
    result.gridRowGap = rowGap;
  }
  debugAutoLayout("mapped", {
    element: {
      tagName: element?.tagName,
      id: element?.id,
      className: element?.className
    },
    display: effectiveStyle.display,
    result
  });
  return result;
}

// src/export-core/dom/html-to-figma/index.js
var EXPORT_OVERLAY_ROOT_ID = "export-overlay-root";
var VERBOSE3 = false;
function isExportOverlayElement(node) {
  if (!(node instanceof Element)) return false;
  if (node.id === EXPORT_OVERLAY_ROOT_ID) return true;
  if (typeof node.closest === "function" && node.closest(`#${EXPORT_OVERLAY_ROOT_ID}`)) {
    return true;
  }
  return false;
}
function hasOverflowHidden(element) {
  if (!(element instanceof Element)) {
    return false;
  }
  try {
    const computedStyle = window.getComputedStyle(element);
    const overflowX = computedStyle.overflowX;
    const overflowY = computedStyle.overflowY;
    const overflow = computedStyle.overflow;
    return overflowX === "hidden" || overflowY === "hidden" || overflow === "hidden" || overflowX === "clip" || overflowY === "clip" || overflow === "clip";
  } catch (error) {
    return false;
  }
}
function isDocumentRootElement(element) {
  if (!(element instanceof Element)) {
    return false;
  }
  const tag = element.tagName;
  return tag === "BODY" || tag === "HTML";
}
function applyAutoLayoutChildPropsToFrame(frameLayer, elementRef) {
  if (!frameLayer || !elementRef || !(elementRef instanceof Element)) {
    return;
  }
  const isAutoMargin = (value) => typeof value === "string" && value.trim() === "auto";
  const mapAlignSelfToLayoutAlign = (alignSelf) => {
    switch ((alignSelf || "auto").toLowerCase()) {
      case "stretch":
        return "STRETCH";
      case "center":
        return "CENTER";
      case "flex-end":
      case "end":
      case "self-end":
        return "MAX";
      case "flex-start":
      case "start":
      case "self-start":
        return "MIN";
      default:
        return null;
    }
  };
  const toFinite = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const nearlyEqual = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
  const mapAutoMarginToLayoutAlign = (selfStyle, parentStyle, element, parentElement) => {
    if (!selfStyle || !parentStyle || !element || !parentElement) {
      return null;
    }
    const parentDisplay = parentStyle.display;
    if (parentDisplay !== "flex" && parentDisplay !== "inline-flex") {
      return null;
    }
    const flexDirection = parentStyle.flexDirection || "row";
    const isRowDirection = flexDirection === "row" || flexDirection === "row-reverse";
    const crossAxisStart = isRowDirection ? selfStyle.marginBlockStart || selfStyle.marginTop : selfStyle.marginInlineStart || selfStyle.marginLeft;
    const crossAxisEnd = isRowDirection ? selfStyle.marginBlockEnd || selfStyle.marginBottom : selfStyle.marginInlineEnd || selfStyle.marginRight;
    const startAuto = isAutoMargin(crossAxisStart);
    const endAuto = isAutoMargin(crossAxisEnd);
    if (startAuto && endAuto) {
      return "CENTER";
    }
    if (startAuto) {
      return "MAX";
    }
    if (endAuto) {
      return "MIN";
    }
    const startPx = toFinite(crossAxisStart);
    const endPx = toFinite(crossAxisEnd);
    if (startPx === null || endPx === null) {
      return null;
    }
    if (startPx < 0.5 && endPx < 0.5) {
      return null;
    }
    const parentRect = parentElement.getBoundingClientRect();
    const selfRect = element.getBoundingClientRect();
    const crossSize = isRowDirection ? selfRect.height : selfRect.width;
    const parentCrossRectSize = isRowDirection ? parentRect.height : parentRect.width;
    const paddingStart = toFinite(isRowDirection ? parentStyle.paddingTop : parentStyle.paddingLeft) || 0;
    const paddingEnd = toFinite(isRowDirection ? parentStyle.paddingBottom : parentStyle.paddingRight) || 0;
    const borderStart = toFinite(
      isRowDirection ? parentStyle.borderTopWidth : parentStyle.borderLeftWidth
    ) || 0;
    const borderEnd = toFinite(
      isRowDirection ? parentStyle.borderBottomWidth : parentStyle.borderRightWidth
    ) || 0;
    const parentContentCrossSize = parentCrossRectSize - paddingStart - paddingEnd - borderStart - borderEnd;
    if (!Number.isFinite(parentContentCrossSize) || parentContentCrossSize <= 1) {
      return null;
    }
    const consumedCrossSize = crossSize + startPx + endPx;
    if (!nearlyEqual(parentContentCrossSize, consumedCrossSize, 2.5)) {
      return null;
    }
    if (startPx > 0.5 && endPx > 0.5 && nearlyEqual(startPx, endPx, 1.5)) {
      return "CENTER";
    }
    if (startPx > 0.5 && endPx <= 1.5) {
      return "MAX";
    }
    if (endPx > 0.5 && startPx <= 1.5) {
      return "MIN";
    }
    return null;
  };
  try {
    const selfStyle = window.getComputedStyle(elementRef);
    const parent = elementRef.parentElement;
    const parentStyle = parent ? window.getComputedStyle(parent) : null;
    const flexGrow = parseFloat(selfStyle.flexGrow) || 0;
    if (flexGrow > 0) {
      frameLayer.layoutGrow = 1;
      if (parentStyle) {
        const parentDisplay = parentStyle.display;
        const parentFlexDirection = parentStyle.flexDirection || "row";
        if (parentDisplay === "flex" || parentDisplay === "inline-flex") {
          if (parentFlexDirection === "row" || parentFlexDirection === "row-reverse") {
            frameLayer.layoutSizingHorizontal = "FILL";
            frameLayer.layoutSizingVertical = frameLayer.layoutSizingVertical || "HUG";
          } else {
            frameLayer.layoutSizingHorizontal = frameLayer.layoutSizingHorizontal || "HUG";
            frameLayer.layoutSizingVertical = "FILL";
          }
        }
      }
    }
    const alignSelf = selfStyle.alignSelf || "auto";
    const alignFromSelf = mapAlignSelfToLayoutAlign(alignSelf);
    if (alignFromSelf) {
      frameLayer.layoutAlign = alignFromSelf;
    } else {
      const alignFromAutoMargin = mapAutoMarginToLayoutAlign(
        selfStyle,
        parentStyle,
        elementRef,
        parent
      );
      if (alignFromAutoMargin) {
        frameLayer.layoutAlign = alignFromAutoMargin;
      }
    }
  } catch (error) {
    void error;
  }
}
function createFrameFromLayers(layers, elementName, elementRef, autoLayoutProps = null, enableAutoLayout = false, forceCreateFrame = false) {
  if (!layers || layers.length === 0) {
    return null;
  }
  const logDebugEnabled = VERBOSE3 || typeof window !== "undefined" && (window.__AXHUB_HTML_TO_FIGMA_DEBUG__ || window.__AXHUB_FRAME_DEBUG__);
  const logDebug = logDebugEnabled ? (...args) => {
    console.log("[frame-build]", ...args);
  } : () => {
  };
  logDebug("start createFrameFromLayers", {
    elementName,
    layerCount: layers.length,
    hasAutoLayoutProps: Boolean(autoLayoutProps),
    forceCreateFrame,
    firstLayer: layers[0] ? {
      type: layers[0].type,
      name: layers[0].name,
      width: layers[0].width,
      height: layers[0].height
    } : null,
    sortedAlready: false
  });
  if (layers.length === 1 && !autoLayoutProps && !forceCreateFrame) {
    return layers[0];
  }
  const ownedBackgroundLayerCandidate = layers.find(
    (layer) => layer && layer.type === "RECTANGLE" && layer._sortingCache && layer._sortingCache.originalElement === elementRef
  ) || null;
  const hasSourceElementMarker = layers.some(
    (layer) => layer && layer._sortingCache && layer._sortingCache.originalElement
  );
  const sortedLayers = processLayerOrdering(layers);
  const nonAbsoluteLayers = sortedLayers.filter(
    (l) => l.layoutPositioning !== "ABSOLUTE" && l.layoutPositioning !== "FIXED"
  );
  const sizingLayers = nonAbsoluteLayers.length > 0 ? nonAbsoluteLayers : sortedLayers;
  const getBounds = (ls) => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let counted = 0;
    for (const l of ls) {
      if (typeof l.x === "number" && typeof l.y === "number" && typeof l.width === "number" && typeof l.height === "number") {
        minX = Math.min(minX, l.x);
        minY = Math.min(minY, l.y);
        maxX = Math.max(maxX, l.x + l.width);
        maxY = Math.max(maxY, l.y + l.height);
        counted += 1;
      }
    }
    if (counted === 0) return null;
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  };
  let backgroundLayer = null;
  const contentLayers = [];
  if (ownedBackgroundLayerCandidate) {
    backgroundLayer = ownedBackgroundLayerCandidate;
  } else if (!hasSourceElementMarker) {
    for (const layer of sortedLayers) {
      if (layer.type === "RECTANGLE" && !backgroundLayer) {
        backgroundLayer = layer;
        break;
      }
    }
  }
  const backgroundLayerIsOwned = !!backgroundLayer && !!ownedBackgroundLayerCandidate && backgroundLayer === ownedBackgroundLayerCandidate;
  let frameX, frameY, frameWidth, frameHeight;
  if (backgroundLayer && !backgroundLayerIsOwned) {
    const allBounds = getBounds(sizingLayers);
    const elementRect = elementRef?.getBoundingClientRect?.();
    if (allBounds) {
      const coverWidth = backgroundLayer.width >= allBounds.width * 0.9;
      const coverHeight = backgroundLayer.height >= allBounds.height * 0.9;
      const coverLeft = backgroundLayer.x <= allBounds.x + 1;
      const coverTop = backgroundLayer.y <= allBounds.y + 1;
      const coverRight = backgroundLayer.x + backgroundLayer.width >= allBounds.x + allBounds.width - 1;
      const coverBottom = backgroundLayer.y + backgroundLayer.height >= allBounds.y + allBounds.height - 1;
      const coverArea = backgroundLayer.width * backgroundLayer.height >= allBounds.width * allBounds.height * 0.8;
      const matchesElementRect = !!elementRect && Math.abs(backgroundLayer.width - elementRect.width) <= 2 && Math.abs(backgroundLayer.height - elementRect.height) <= 2 && Math.abs(backgroundLayer.x - elementRect.x) <= 2 && Math.abs(backgroundLayer.y - elementRect.y) <= 2;
      const isCovering = coverWidth && coverHeight && coverLeft && coverTop && coverRight && coverBottom && coverArea;
      logDebug("background coverage check", {
        elementName,
        bgName: backgroundLayer.name,
        bgSize: { w: backgroundLayer.width, h: backgroundLayer.height },
        bounds: allBounds,
        isCovering,
        matchesElementRect
      });
      const canTreatAsElementBackground = matchesElementRect;
      const allowCoverageFallback = !elementRect && isCovering;
      if (!canTreatAsElementBackground && !allowCoverageFallback) {
        logDebug("background rejected, fallback to element bounding rect", {
          elementName,
          bgName: backgroundLayer.name
        });
        backgroundLayer = null;
      }
    }
  }
  if (backgroundLayer) {
    frameX = backgroundLayer.x;
    frameY = backgroundLayer.y;
    frameWidth = backgroundLayer.width;
    frameHeight = backgroundLayer.height;
    logDebug("use backgroundLayer as frame basis", {
      elementName,
      frameX,
      frameY,
      frameWidth,
      frameHeight,
      bgName: backgroundLayer.name,
      bgType: backgroundLayer.type
    });
    for (const layer of sortedLayers) {
      if (layer !== backgroundLayer) {
        contentLayers.push(layer);
      }
    }
  } else {
    const elementRect = elementRef.getBoundingClientRect();
    frameX = elementRect.x;
    frameY = elementRect.y;
    frameWidth = elementRect.width;
    frameHeight = elementRect.height;
    if (isDocumentRootElement(elementRef)) {
      const contentBounds = getBounds(sizingLayers);
      if (contentBounds) {
        const minX = Math.min(frameX, contentBounds.x);
        const minY = Math.min(frameY, contentBounds.y);
        const maxX = Math.max(frameX + frameWidth, contentBounds.x + contentBounds.width);
        const maxY = Math.max(frameY + frameHeight, contentBounds.y + contentBounds.height);
        frameX = minX;
        frameY = minY;
        frameWidth = maxX - minX;
        frameHeight = maxY - minY;
      }
    }
    logDebug("use element bounding rect as frame basis", {
      elementName,
      frameX,
      frameY,
      frameWidth,
      frameHeight
    });
    contentLayers.push(...sortedLayers);
  }
  let adjustedLayers = contentLayers.map((layer) => {
    if (layer.x !== void 0 && layer.y !== void 0) {
      return {
        ...layer,
        x: layer.x - frameX,
        y: layer.y - frameY
      };
    }
    return layer;
  });
  const overflowHidden = hasOverflowHidden(elementRef);
  const layerType = enableAutoLayout ? "FRAME" : "GROUP";
  const frameLayer = {
    type: layerType,
    name: elementName || layerType,
    x: frameX,
    y: frameY,
    width: frameWidth,
    height: frameHeight,
    clipsContent: overflowHidden,
    children: []
    // Will be set after processing background
  };
  logDebug("frameLayer created", {
    name: frameLayer.name,
    x: frameLayer.x,
    y: frameLayer.y,
    width: frameLayer.width,
    height: frameLayer.height,
    childCount: adjustedLayers.length,
    hasBackground: Boolean(backgroundLayer)
  });
  if (backgroundLayer) {
    const hasImageFill = backgroundLayer.fills && backgroundLayer.fills.some((fill) => fill.type === "IMAGE");
    logDebug("background layer detected", {
      elementName,
      hasImageFill,
      backgroundFillTypes: Array.isArray(backgroundLayer.fills) ? backgroundLayer.fills.map((fill) => fill.type) : [],
      enableAutoLayout
    });
    if (!enableAutoLayout && hasImageFill) {
      logDebug("GROUP mode with image fill, keeping background as separate layer", {
        elementName,
        bgName: backgroundLayer.name
      });
      adjustedLayers.unshift({
        ...backgroundLayer,
        x: 0,
        y: 0
      });
    } else {
      if (backgroundLayer.fills && backgroundLayer.fills.length > 0) {
        frameLayer.fills = backgroundLayer.fills;
      }
      if (backgroundLayer.strokes) {
        frameLayer.strokes = backgroundLayer.strokes;
      }
      if (backgroundLayer.strokeWeight !== void 0) {
        frameLayer.strokeWeight = backgroundLayer.strokeWeight;
      }
      if (backgroundLayer.strokeAlign !== void 0) {
        frameLayer.strokeAlign = backgroundLayer.strokeAlign;
      }
      if (backgroundLayer.cornerRadius !== void 0) {
        frameLayer.cornerRadius = backgroundLayer.cornerRadius;
      }
      if (backgroundLayer.topLeftRadius !== void 0) {
        frameLayer.topLeftRadius = backgroundLayer.topLeftRadius;
        frameLayer.topRightRadius = backgroundLayer.topRightRadius;
        frameLayer.bottomLeftRadius = backgroundLayer.bottomLeftRadius;
        frameLayer.bottomRightRadius = backgroundLayer.bottomRightRadius;
      }
      if (backgroundLayer.effects && backgroundLayer.effects.length > 0) {
        frameLayer.effects = backgroundLayer.effects;
      }
      if (backgroundLayer.opacity !== void 0 && backgroundLayer.opacity !== 1) {
        frameLayer.opacity = backgroundLayer.opacity;
      }
    }
  } else {
    if (enableAutoLayout) {
      frameLayer.fills = [
        {
          type: "SOLID",
          color: { r: 1, g: 1, b: 1 },
          opacity: 0
        }
      ];
    }
  }
  frameLayer.children = adjustedLayers;
  if (autoLayoutProps) {
    Object.assign(frameLayer, autoLayoutProps);
  }
  applyAutoLayoutChildPropsToFrame(frameLayer, elementRef);
  if (elementRef) {
    const rect = elementRef.getBoundingClientRect();
    addLayerSortingCache(frameLayer, elementRef, elementRef.style, rect);
  }
  return frameLayer;
}
var processWithSnapDOMImplementation = async (el, options) => {
  const { useFrames, rootName, isAxure, widgetId, enableAutoLayout = true } = options;
  const originalClasses = getElementClassNameString(el);
  const identifierClass = "figma-target-element";
  try {
    await convertImagesInPage(el);
    el.classList.add(identifierClass);
    const svgData = await generatePageSvg({
      targetElement: el,
      filter: (node) => !isExportOverlayElement(node)
    });
    const injectedSvg = injectSvgToPage(svgData);
    let targetElement = injectedSvg.querySelector(`.${identifierClass}`);
    if (!targetElement) {
      targetElement = injectedSvg.querySelector("body");
    }
    if (!targetElement) {
      targetElement = injectedSvg;
    }
    const layers = await processWithOriginalLogic(targetElement, {
      useFrames,
      rootName,
      isAxure,
      widgetId,
      size: {
        width: svgData.pageWidth,
        height: svgData.pageHeight
      },
      isSnapdomProcessing: true,
      enableAutoLayout
    });
    cleanupInjectedSvg();
    restoreElementClassName(el, originalClasses);
    return layers;
  } catch (error) {
    console.error("\u274C [processWithSnapDOM] SnapDOM \u65B9\u6848\u5931\u8D25:", error);
    restoreElementClassName(el, originalClasses);
    try {
      cleanupInjectedSvg();
    } catch (cleanupError) {
      void cleanupError;
    }
    return null;
  }
};
async function processElementTree(tree, useFrames = false, isAxure = false, enableAutoLayout = true) {
  const layers = [];
  if (!tree) return layers;
  if (tree.type === "element") {
    const elLayers = await getLayersForElement(tree.el, isAxure, enableAutoLayout);
    if (tree.el instanceof SVGSVGElement && tree.el.id !== "snapdom-injected-svg") {
      return elLayers;
    }
    const hasOverflow = hasOverflowHidden(tree.el);
    let hasAutoLayout = false;
    let autoLayoutProps = null;
    let computedStyleForLayout = null;
    let hasStructuralFrame = false;
    try {
      computedStyleForLayout = window.getComputedStyle(tree.el);
      if (enableAutoLayout) {
        const potentialAutoLayoutProps = mapCSSToAutoLayout(tree.el, computedStyleForLayout);
        if (potentialAutoLayoutProps !== null) {
          autoLayoutProps = potentialAutoLayoutProps;
          hasAutoLayout = true;
        }
      }
      const display = computedStyleForLayout.display;
      if (tree.children && tree.children.length > 2 && display && !["inline", "inline-block", "inline-flex", "inline-grid"].includes(display)) {
        hasStructuralFrame = true;
      }
    } catch (error) {
      void error;
    }
    let hasVisualBackgroundFrame = false;
    if (tree.children && tree.children.length > 0) {
      const styleForBackground = computedStyleForLayout || (() => {
        try {
          return window.getComputedStyle(tree.el);
        } catch {
          return tree.el.style;
        }
      })();
      try {
        hasVisualBackgroundFrame = shouldGenerateBackground(tree.el, styleForBackground);
      } catch (err) {
      }
    }
    if (!computedStyleForLayout && tree.children && tree.children.length > 0) {
      hasStructuralFrame = true;
    }
    const shouldCreateFrame = (useFrames || hasOverflow || hasAutoLayout || hasVisualBackgroundFrame || hasStructuralFrame) && enableAutoLayout;
    if (shouldCreateFrame) {
      const childLayers = [];
      for (const child of tree.children) {
        const childLayerResults = await processElementTree(
          child,
          useFrames || hasAutoLayout,
          isAxure,
          enableAutoLayout
        );
        childLayers.push(...childLayerResults);
      }
      const allLayers = [...elLayers, ...childLayers];
      if (allLayers.length > 0) {
        const frameLayer = createFrameFromLayers(
          allLayers,
          getElementNameWithClass(tree.el, isAxure),
          tree.el,
          autoLayoutProps,
          // 传递 Auto Layout 属性（可能为 null）
          enableAutoLayout,
          // 传递 enableAutoLayout 参数
          hasOverflow
          // overflow hidden 元素即使单层也必须保留 FRAME，用于裁剪与子项布局
        );
        if (frameLayer) {
          layers.push(frameLayer);
        }
      }
      return layers;
    } else {
      layers.push(...elLayers);
    }
  }
  if (!useFrames) {
    for (const child of tree.children) {
      const childLayers = await processElementTree(child, useFrames, isAxure, enableAutoLayout);
      layers.push(...childLayers);
    }
  }
  return layers;
}
var processWithOriginalLogic = async (el, options) => {
  const { useFrames, rootName, size, isAxure = false, widgetId, enableAutoLayout = true } = options;
  processSvgUseElements(el);
  const elementTree = generateElementTree(el);
  const layers = await processElementTree(elementTree, useFrames, isAxure, enableAutoLayout);
  const sortedLayers = processLayerOrdering(layers);
  const root = {
    type: "FRAME",
    name: rootName || "FRAME",
    widgetId: widgetId || null,
    width: size.width || Math.round(el.scrollWidth),
    height: size.height || Math.round(el.scrollHeight),
    x: 0,
    y: 0,
    children: sortedLayers
  };
  const cleanLayers = cleanLayersDebugProperties([root]);
  return cleanLayers;
};
async function htmlToFigma(selector = "body", options) {
  const {
    useFrames: useFramesOption,
    useFrame,
    rootName,
    isAxure = false,
    widgetId,
    enableAutoLayout = true
  } = options || {};
  const useFrames = typeof useFramesOption === "boolean" ? useFramesOption : Boolean(useFrame);
  const el = selector instanceof HTMLElement ? selector : document.querySelector(selector || "body");
  if (el) {
    return processWithSnapDOMImplementation(el, {
      useFrames,
      rootName,
      isAxure,
      widgetId,
      enableAutoLayout
    });
  }
  return [];
}
export {
  htmlToFigma,
  processWithOriginalLogic,
  processWithSnapDOMImplementation
};
