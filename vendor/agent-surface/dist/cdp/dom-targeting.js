export function normalizeDomLabel(value) {
    return (value ?? "").replace(/\s+/gu, " ").trim().toLowerCase();
}
export function isVisibleDomElement(element, readStyle) {
    if (element.hidden || element.getAttribute("aria-hidden") === "true")
        return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0)
        return false;
    const style = readStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse";
}
export function findVisibleReferenceByLabel(elements, labels, readStyle) {
    const expected = new Set(labels.map((label) => normalizeDomLabel(label)).filter(Boolean));
    for (const element of elements) {
        if (expected.has(normalizeDomLabel(element.textContent)) && isVisibleDomElement(element, readStyle)) {
            return element;
        }
    }
    return undefined;
}
//# sourceMappingURL=dom-targeting.js.map