import type { ItemData } from '../types';

export const UI_REVIEW_RULE_PATH = 'rules/ui-review-guide.md';
export const UI_REVIEW_FILE_NAME = 'ui-review.md';
export const UI_REVIEW_REPORT_TEMPLATE_PATH = 'templates/ui-review.md';
export const PROTOTYPE_REVIEW_RULE_PATH = 'rules/prototype-review-guide.md';
export const PROTOTYPE_REVIEW_FILE_NAME = 'prototype-review.md';
export const PROTOTYPE_REVIEW_REPORT_TEMPLATE_PATH = 'templates/prototype-review.md';

export type ReviewKind = 'design' | 'requirements';

export interface ReviewKindConfig {
    kind: ReviewKind;
    label: string;
    title: string;
    rulePath: string;
    templatePath: string;
    fileName: string;
    fallbackPath: string;
    targetDescription: string;
    emptyDescription: string;
    requiredBasis: string;
}

export const REVIEW_KIND_CONFIGS: Record<ReviewKind, ReviewKindConfig> = {
    design: {
        kind: 'design',
        label: '设计',
        title: 'UI 评审',
        rulePath: UI_REVIEW_RULE_PATH,
        templatePath: UI_REVIEW_REPORT_TEMPLATE_PATH,
        fileName: UI_REVIEW_FILE_NAME,
        fallbackPath: `src/prototypes/<prototype-id>/.spec/reviews/${UI_REVIEW_FILE_NAME}`,
        targetDescription: '当前原型执行 UI 评审',
        emptyDescription: '发起评审后，AI 会检查页面设计质量，并整理出可改进的问题清单。',
        requiredBasis: '优先读取当前原型附近的 DESIGN.md；如果没有 DESIGN.md，则按常规设计评审执行。',
    },
    requirements: {
        kind: 'requirements',
        label: '需求',
        title: '原型评审',
        rulePath: PROTOTYPE_REVIEW_RULE_PATH,
        templatePath: PROTOTYPE_REVIEW_REPORT_TEMPLATE_PATH,
        fileName: PROTOTYPE_REVIEW_FILE_NAME,
        fallbackPath: `src/prototypes/<prototype-id>/.spec/reviews/${PROTOTYPE_REVIEW_FILE_NAME}`,
        targetDescription: '当前原型执行原型评审 / 需求评审',
        emptyDescription: '发起评审后，AI 会检查原型需求是否完整，并整理出遗漏、冲突和风险。',
        requiredBasis: '依次读取原型主规格 <prototype-spec-root>/spec.html、<prototype-spec-root>/spec.md，同时存在时以 HTML 为准；再按主规格链接读取必要子文档。',
    },
};

function normalizePath(value: unknown): string {
    return String(value || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/');
}

function stripIndexFilePath(value: string): string {
    return value.replace(/\/index\.(?:tsx?|jsx?|html)$/iu, '');
}

export function resolveUiReviewDocumentPath(selectedItem: Pick<ItemData, 'absoluteFilePath' | 'filePath' | 'name' | 'resourceId'> | null | undefined): string {
    return resolveReviewDocumentPath(selectedItem, 'design');
}

export function resolveReviewDocumentPath(
    selectedItem: Pick<ItemData, 'absoluteFilePath' | 'filePath' | 'name' | 'resourceId'> | null | undefined,
    kind: ReviewKind = 'design',
): string {
    const config = REVIEW_KIND_CONFIGS[kind] ?? REVIEW_KIND_CONFIGS.design;
    const explicitSourcePath = normalizePath(selectedItem?.absoluteFilePath || selectedItem?.filePath);
    const sourceBasePath = stripIndexFilePath(explicitSourcePath);
    if (sourceBasePath) {
        return `${sourceBasePath}/.spec/reviews/${config.fileName}`;
    }

    const prototypeId = normalizePath(selectedItem?.resourceId || selectedItem?.name);
    return prototypeId ? `src/prototypes/${prototypeId}/.spec/reviews/${config.fileName}` : '';
}

export function resolvePrototypeSpecRoot(
    selectedItem: Pick<ItemData, 'absoluteFilePath' | 'filePath' | 'name' | 'resourceId'> | null | undefined,
): string {
    const explicitSourcePath = normalizePath(selectedItem?.absoluteFilePath || selectedItem?.filePath);
    const sourceBasePath = stripIndexFilePath(explicitSourcePath);
    if (sourceBasePath) {
        return `${sourceBasePath}/.spec`;
    }

    const prototypeId = normalizePath(selectedItem?.resourceId || selectedItem?.name);
    return prototypeId ? `src/prototypes/${prototypeId}/.spec` : 'src/prototypes/<prototype-id>/.spec';
}

export function buildUiReviewPrompt(params: {
    selectedItem: Pick<ItemData, 'name' | 'displayName' | 'resourceId' | 'absoluteFilePath' | 'filePath'> | null | undefined;
    reviewDocumentPath: string;
}): string {
    return buildReviewPrompt({ ...params, kind: 'design' });
}

export function buildReviewPrompt(params: {
    selectedItem: Pick<ItemData, 'name' | 'displayName' | 'resourceId' | 'absoluteFilePath' | 'filePath'> | null | undefined;
    reviewDocumentPath: string;
    kind: ReviewKind;
}): string {
    const selectedItem = params.selectedItem;
    const config = REVIEW_KIND_CONFIGS[params.kind] ?? REVIEW_KIND_CONFIGS.design;
    const prototypeLabel = String(selectedItem?.displayName || selectedItem?.name || selectedItem?.resourceId || '当前原型').trim();
    const sourcePath = normalizePath(selectedItem?.filePath || selectedItem?.absoluteFilePath);
    const reviewDocumentPath = normalizePath(params.reviewDocumentPath || resolveReviewDocumentPath(selectedItem, config.kind));
    const requiredBasis = config.kind === 'requirements'
        ? config.requiredBasis.replaceAll('<prototype-spec-root>', resolvePrototypeSpecRoot(selectedItem))
        : config.requiredBasis;

    return [
        `请对${config.targetDescription}，并把结果写成 Markdown。`,
        '',
        '【前置阅读】',
        `- 请先读取并严格遵循：${config.rulePath}`,
        `- 请先读取并套用报告模板：${config.templatePath}`,
        '',
        '【评审目标】',
        `- 原型：${prototypeLabel}`,
        sourcePath ? `- 源码路径：${sourcePath}` : null,
        `- 评审结果写入：${reviewDocumentPath || config.fallbackPath}`,
        '',
        '【执行要求】',
        '1. 细节以规则文档和报告模板为准；这里不重复展开。',
        `2. ${requiredBasis}`,
        '3. 输出 Markdown，不写 .impeccable 产物作为交付。',
        '4. 优先级只使用 P0-P3，最多列出 5 条优先级问题。',
        '',
        '【最终回复要求】',
        `- 说明已写入的路径：${reviewDocumentPath || config.fallbackPath}`,
        '- 汇总 P0-P3 数量。',
    ].filter(Boolean).join('\n');
}
