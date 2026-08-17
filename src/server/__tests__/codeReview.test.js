import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractAxureApiPreviewFromContent, getAxureApiPreviewFromFile, resolveCodeReviewFilePath, reviewFile, } from '../codeReview.ts';
const tempRoots = [];
function createAxureExportFixture(source) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-code-review-'));
    tempRoots.push(root);
    fs.writeFileSync(path.join(root, 'index.tsx'), source, 'utf8');
    return path.join(root, 'index.tsx');
}
function createFixture(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axhub-code-review-'));
    tempRoots.push(root);
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }
    return root;
}
function getIssueRules(filePath, options) {
    return reviewFile(filePath, options).issues.map((issue) => issue.rule);
}
afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
describe('code review', () => {
    it('keeps the Axure export rules header path as a non-blocking suggestion', () => {
        const filePath = createAxureExportFixture(`/**
 * @name 演示页面
 * @mode axure
 */

const Component = () => null;

export default Component;
`);
        const result = reviewFile(filePath, { mode: 'axure-export' });
        const ruleHeaderIssue = result.issues.find((issue) => issue.rule === 'file-header-axure-rule');
        expect(result.passed).toBe(true);
        expect(result.summary.blockingErrors).toBe(0);
        expect(result.summary.warnings).toBe(1);
        expect(ruleHeaderIssue).toMatchObject({
            type: 'warning',
            blocking: false,
            category: 'docs',
            suggestion: '请在文件头注释中补充 rules 路径',
        });
    });
    it('accepts the Axure export rules header path relative to the client root', () => {
        const filePath = createAxureExportFixture(`/**
 * @name 演示页面
 * @mode axure
 * rules/axure-export-workflow.md
 */

const Component = () => null;

export default Component;
`);
        const result = reviewFile(filePath, { mode: 'axure-export' });
        expect(result.passed).toBe(true);
        expect(result.summary.warnings).toBe(0);
        expect(getIssueRules(filePath, { mode: 'axure-export' })).not.toContain('file-header-axure-rule');
    });
    it('returns a blocking file-not-found issue for missing files', () => {
        const missingPath = path.join(os.tmpdir(), `axhub-missing-${Date.now()}`, 'index.tsx');
        const result = reviewFile(missingPath);
        expect(result.passed).toBe(false);
        expect(result.summary.blockingErrors).toBe(1);
        expect(result.issues[0]).toMatchObject({
            rule: 'file-not-found',
            blocking: true,
            category: 'docs',
        });
    });
    it('checks default exports without requiring an Axure export component name in default mode', () => {
        const missingExportPath = createAxureExportFixture('const Component = () => null;\n');
        const namedExportPath = createAxureExportFixture('const Demo = () => null;\nexport default Demo;\n');
        expect(getIssueRules(missingExportPath)).toContain('export-default');
        expect(reviewFile(namedExportPath)).toMatchObject({
            passed: true,
            summary: { blockingErrors: 0 },
        });
    });
    it('reports Tailwind style import problems only when Tailwind-like classes are used', () => {
        const noImportRoot = createFixture({
            'index.tsx': 'export default function Demo() { return <div className="flex p-4" />; }\n',
        });
        const missingFileRoot = createFixture({
            'index.tsx': 'import "./style.css";\nexport default function Demo() { return <div className="grid" />; }\n',
        });
        const missingTailwindRoot = createFixture({
            'index.tsx': 'import "./style.css";\nexport default function Demo() { return <div className="hover:bg-red-500" />; }\n',
            'style.css': '.demo { color: red; }\n',
        });
        const validRoot = createFixture({
            'index.tsx': 'import "./style.css";\nexport default function Demo() { return <div className="md:flex" />; }\n',
            'style.css': '@import "tailwindcss";\n',
        });
        const plainRoot = createFixture({
            'index.tsx': 'export default function Demo() { return <div className="app-shell" />; }\n',
        });
        expect(getIssueRules(path.join(noImportRoot, 'index.tsx'))).toContain('tailwind-style-import');
        expect(getIssueRules(path.join(missingFileRoot, 'index.tsx'))).toContain('tailwind-style-file');
        expect(getIssueRules(path.join(missingTailwindRoot, 'index.tsx'))).toContain('tailwind-css-import');
        expect(getIssueRules(path.join(validRoot, 'index.tsx'))).not.toContain('tailwind-css-import');
        expect(reviewFile(path.join(plainRoot, 'index.tsx')).passed).toBe(true);
    });
    it('validates Axure API imports, forwardRef generics, imperative handles, and string payloads', () => {
        const filePath = createAxureExportFixture(`
import { forwardRef } from 'react';

const Component = forwardRef<HTMLDivElement, { label: string }>((props, ref) => {
  onEvent('changed', { value: props.label });
  return null;
});

export default Component;
`);
        expect(getIssueRules(filePath)).toEqual(expect.arrayContaining([
            'axure-api-props',
            'axure-api-handle',
            'axure-api-handle-type',
            'axure-api-props-type',
            'axure-api-imperative-handle',
            'axure-api-event-payload',
        ]));
    });
    it('treats Axure export structure problems as blocking errors', () => {
        const filePath = createAxureExportFixture(`
const Demo = () => null;
export default Demo;
`);
        const result = reviewFile(filePath, { mode: 'axure-export' });
        expect(result.passed).toBe(false);
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ rule: 'file-header-name', blocking: true, category: 'docs' }),
            expect.objectContaining({ rule: 'file-header-mode-axure', blocking: true, category: 'docs' }),
            expect.objectContaining({ rule: 'export-default-name', blocking: true, category: 'export-structure' }),
            expect.objectContaining({ rule: 'component-binding', blocking: true, category: 'export-structure' }),
        ]));
    });
    it('requires Axure annotation viewers to use a local static annotation source import', () => {
        const filePath = createAxureExportFixture(`/**
 * @name Demo
 * @mode axure
 * rules/axure-export-workflow.md
 */
import { AnnotationViewer } from '@axhub/annotation';

const Component = () => (
  <AnnotationViewer source={{ data: null }} />
);

export default Component;
`);
        const result = reviewFile(filePath, { mode: 'axure-export' });
        expect(result.passed).toBe(false);
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                rule: 'axure-annotation-source-import',
                type: 'error',
                blocking: true,
                category: 'export-structure',
            }),
        ]));
    });
    it('accepts Axure annotation viewers when the imported source document is passed to source', () => {
        const filePath = createAxureExportFixture(`/**
   * @name Demo
   * @mode axure
   * rules/axure-export-workflow.md
 */
import { AnnotationViewer, type AnnotationSourceDocument } from '@axhub/annotation';
import annotationSourceDocument from './annotation-source.json';

const Component = () => (
  <AnnotationViewer source={annotationSourceDocument as unknown as AnnotationSourceDocument} />
);

export default Component;
`);
        expect(getIssueRules(filePath, { mode: 'axure-export' })).not.toContain('axure-annotation-source-import');
    });
    it('ignores namespaced JSX attributes when reading the Axure annotation source prop', () => {
        const filePath = createAxureExportFixture(`/**
   * @name Demo
   * @mode axure
   * rules/axure-export-workflow.md
   */
import { AnnotationViewer, type AnnotationSourceDocument } from '@axhub/annotation';
import annotationSourceDocument from './annotation-source.json';

const Component = () => (
  <AnnotationViewer axhub:source="legacy" source={annotationSourceDocument as unknown as AnnotationSourceDocument} />
);

export default Component;
`);
        expect(getIssueRules(filePath, { mode: 'axure-export' })).not.toContain('axure-annotation-source-import');
    });
    it('does not run the annotation source import rule outside Axure export review mode', () => {
        const filePath = createAxureExportFixture(`
import { AnnotationViewer } from '@axhub/annotation';

const Component = () => <AnnotationViewer source={{ data: null }} />;

export default Component;
`);
        expect(getIssueRules(filePath)).not.toContain('axure-annotation-source-import');
    });
    it('enforces Axure export API handle contracts and snake_case variable names', () => {
        const filePath = createAxureExportFixture(`/**
 * @name Demo
 * @mode axure
 * rules/axure-export-workflow.md
 */
import { forwardRef, useImperativeHandle } from 'react';
import type { AxureHandle, AxureProps } from '../../common/axure-types';

const varList = [{ name: 'BadName' }];

const Component = forwardRef<AxureHandle, AxureProps>((props, ref) => {
  useImperativeHandle(ref, () => ({
    varList,
  }));
  return null;
});

export default Component;
`);
        const result = reviewFile(filePath, { mode: 'axure-export' });
        expect(result.issues.map((issue) => issue.rule)).toEqual(expect.arrayContaining([
            'axure-api-missing-eventList',
            'axure-api-missing-actionList',
            'axure-api-missing-configList',
            'axure-api-missing-dataList',
            'axure-api-var-name',
        ]));
        expect(result.issues.every((issue) => issue.category)).toBe(true);
    });
    it('extracts Axure API list previews from literal, aliased, shorthand, and raw expressions', () => {
        const content = `
import { forwardRef, useImperativeHandle } from 'react';
import type { AxureHandle, AxureProps } from '../../common/axure-types';

const eventList = [{ name: 'tap', enabled: true, order: -1, meta: null }];
const actionName = 'open_modal';
const actionList = [{ name: actionName, values: [...extraActions] }];
const configItems = [{ name: 'theme', value: 'dark' }];
const dataList = makeDataList();
const varList = [{ name: 'user_name', defaultValue: 'Ada' }];

const Component = forwardRef<AxureHandle, AxureProps>((props, ref) => {
  useImperativeHandle(ref, () => ({
    eventList,
    actionList,
    varList,
    configList: configItems,
    dataList,
  }));
  return null;
});
`;
        const preview = extractAxureApiPreviewFromContent(content, '/tmp/index.tsx');
        expect(preview.hasAxureHandle).toBe(true);
        expect(preview.lists.eventList).toMatchObject({
            sourceKey: 'eventList',
            parseStatus: 'parsed',
            items: [{ name: 'tap', enabled: true, order: -1, meta: null }],
        });
        expect(preview.lists.configList).toMatchObject({
            sourceKey: 'configItems',
            parseStatus: 'parsed',
            items: [{ name: 'theme', value: 'dark' }],
        });
        expect(preview.lists.actionList.parseStatus).toBe('raw');
        expect(preview.lists.actionList.warnings.join('\n')).toContain('扩展语法');
        expect(preview.lists.dataList).toMatchObject({
            sourceKey: 'dataList',
            parseStatus: 'raw',
            items: [],
        });
    });
    it('returns empty Axure API previews when files are missing or unreadable', () => {
        const missingPath = path.join(os.tmpdir(), `axhub-preview-missing-${Date.now()}.tsx`);
        expect(getAxureApiPreviewFromFile(missingPath)).toMatchObject({
            file: missingPath,
            passedSourceCheck: false,
            hasAxureHandle: false,
            lists: {
                eventList: { parseStatus: 'missing', items: [] },
            },
        });
    });
    it('resolves code review targets only inside src relative paths', () => {
        const projectRoot = path.resolve('/tmp/project');
        expect(resolveCodeReviewFilePath(projectRoot, 'prototypes/home')).toBe(path.join(projectRoot, 'src/prototypes/home/index.tsx'));
        expect(resolveCodeReviewFilePath(projectRoot, '')).toBeNull();
        expect(resolveCodeReviewFilePath(projectRoot, '../outside')).toBeNull();
        expect(resolveCodeReviewFilePath(projectRoot, '/absolute')).toBeNull();
        expect(resolveCodeReviewFilePath(projectRoot, '\\absolute')).toBeNull();
    });
});
