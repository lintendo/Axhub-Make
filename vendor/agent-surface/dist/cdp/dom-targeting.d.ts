export interface DomRectLike {
    width: number;
    height: number;
}
export interface DomStyleLike {
    display?: string;
    visibility?: string;
}
export interface DomElementLike {
    textContent: string | null;
    hidden?: boolean;
    getAttribute(name: string): string | null;
    getBoundingClientRect(): DomRectLike;
}
export type DomStyleReader = (element: DomElementLike) => DomStyleLike;
export declare function normalizeDomLabel(value: string | null): string;
export declare function isVisibleDomElement(element: DomElementLike, readStyle: DomStyleReader): boolean;
export declare function findVisibleReferenceByLabel<T extends DomElementLike>(elements: Iterable<T>, labels: readonly string[], readStyle: DomStyleReader): T | undefined;
