/**
 * 代码检查插件
 *
 * 提供 /api/code-review 端点，用于检查代码是否符合开发规范
 *
 * 检查项目：
 * 1. 导出规范：必须存在 `export default`
 *    - 仅在 Axure 导出检查模式下，默认导出名必须是 `Component`
 * 2. Tailwind CSS：如果使用了 Tailwind 类名，必须在 style.css 中添加 `@import "tailwindcss"`
 * 3. Axure API：如果使用了 Axure API，必须符合 axure-types.ts 的类型定义
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
const AXURE_LIST_KEYS = ['eventList', 'actionList', 'varList', 'configList', 'dataList'];
function extractDefaultExportName(content) {
    const namedFunctionMatch = content.match(/export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (namedFunctionMatch) {
        return namedFunctionMatch[1];
    }
    const namedClassMatch = content.match(/export\s+default\s+class\s+([A-Za-z_$][\w$]*)\b/);
    if (namedClassMatch) {
        return namedClassMatch[1];
    }
    const identifierMatch = content.match(/export\s+default\s+(?!function\b|class\b)([A-Za-z_$][\w$]*)\s*;?/);
    if (identifierMatch) {
        return identifierMatch[1];
    }
    return null;
}
function resolveReviewMode(options = {}) {
    if (options.mode === 'axure-export') {
        return 'axure-export';
    }
    return 'default';
}
function inferIssueCategory(rule) {
    if (rule.startsWith('axure-api')) {
        return 'axure-api';
    }
    if (rule.startsWith('tailwind')) {
        return 'tailwind';
    }
    if (rule.startsWith('file-header') || rule.startsWith('file-spec')) {
        return 'docs';
    }
    if (rule.startsWith('jsx-') || rule.startsWith('state-')) {
        return 'recommendation';
    }
    return 'export-structure';
}
function finalizeIssues(issues) {
    return issues.map((issue) => ({
        ...issue,
        blocking: issue.blocking ?? issue.type === 'error',
        category: issue.category ?? inferIssueCategory(issue.rule),
    }));
}
function buildReviewResult(filePath, mode, issues) {
    const finalizedIssues = finalizeIssues(issues);
    const blockingErrors = finalizedIssues.filter((issue) => issue.type === 'error' && issue.blocking).length;
    const warnings = finalizedIssues.filter((issue) => issue.type === 'warning').length;
    return {
        file: filePath,
        passed: blockingErrors === 0,
        mode,
        summary: {
            blockingErrors,
            warnings,
        },
        issues: finalizedIssues,
    };
}
function hasHeaderMarker(content, marker) {
    return content.includes(marker);
}
function hasTopLevelComponentBinding(content, filePath) {
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    return sourceFile.statements.some((statement) => {
        if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
            return statement.name?.text === 'Component';
        }
        if (!ts.isVariableStatement(statement)) {
            return false;
        }
        return statement.declarationList.declarations.some((declaration) => (ts.isIdentifier(declaration.name) && declaration.name.text === 'Component'));
    });
}
function collectNamedImportLocalNames(sourceFile, moduleName, importedName) {
    const result = new Set();
    sourceFile.statements.forEach((statement) => {
        if (!ts.isImportDeclaration(statement))
            return;
        if (!ts.isStringLiteral(statement.moduleSpecifier))
            return;
        if (statement.moduleSpecifier.text !== moduleName)
            return;
        const namedBindings = statement.importClause?.namedBindings;
        if (!namedBindings || !ts.isNamedImports(namedBindings))
            return;
        namedBindings.elements.forEach((element) => {
            const sourceName = element.propertyName?.text ?? element.name.text;
            if (sourceName === importedName) {
                result.add(element.name.text);
            }
        });
    });
    return result;
}
function collectLocalAnnotationSourceJsonImports(sourceFile) {
    const result = new Set();
    sourceFile.statements.forEach((statement) => {
        if (!ts.isImportDeclaration(statement))
            return;
        if (!ts.isStringLiteral(statement.moduleSpecifier))
            return;
        const importPath = statement.moduleSpecifier.text.trim();
        const fileName = importPath.split(/[\\/]/u).pop() || '';
        const isLocalAnnotationSourceJson = importPath.startsWith('.')
            && fileName.includes('annotation-source')
            && fileName.endsWith('.json');
        if (!isLocalAnnotationSourceJson)
            return;
        const localName = statement.importClause?.name?.text;
        if (localName) {
            result.add(localName);
        }
    });
    return result;
}
function unwrapExpression(expression) {
    if (ts.isAsExpression(expression)
        || ts.isTypeAssertionExpression(expression)
        || ts.isNonNullExpression(expression)
        || ts.isSatisfiesExpression(expression)
        || ts.isParenthesizedExpression(expression)) {
        return unwrapExpression(expression.expression);
    }
    return expression;
}
function getJsxAttributeExpression(element, attributeName) {
    const attribute = element.attributes.properties.find((property) => (ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === attributeName));
    if (!attribute?.initializer || !ts.isJsxExpression(attribute.initializer)) {
        return null;
    }
    return attribute.initializer.expression ?? null;
}
function getIdentifierJsxTagName(element) {
    return ts.isIdentifier(element.tagName) ? element.tagName.text : null;
}
function checkAxureAnnotationSourceImport(content, filePath) {
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const annotationViewerNames = collectNamedImportLocalNames(sourceFile, '@axhub/annotation', 'AnnotationViewer');
    if (annotationViewerNames.size === 0) {
        return [];
    }
    const annotationSourceImports = collectLocalAnnotationSourceJsonImports(sourceFile);
    let usesAnnotationViewer = false;
    let hasInvalidAnnotationViewerSource = false;
    const visit = (node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const tagName = getIdentifierJsxTagName(node);
            if (tagName && annotationViewerNames.has(tagName)) {
                usesAnnotationViewer = true;
                const sourceExpression = getJsxAttributeExpression(node, 'source');
                const unwrapped = sourceExpression ? unwrapExpression(sourceExpression) : null;
                if (!unwrapped || !ts.isIdentifier(unwrapped) || !annotationSourceImports.has(unwrapped.text)) {
                    hasInvalidAnnotationViewerSource = true;
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
    if (!usesAnnotationViewer || !hasInvalidAnnotationViewerSource) {
        return [];
    }
    return [{
            type: 'error',
            rule: 'axure-annotation-source-import',
            message: 'Axure Runtime 导出中使用了 AnnotationViewer，但未把本地 annotation-source JSON 静态传入 source',
            suggestion: '请在当前文件中 `import annotationSourceDocument from \'./annotation-source.json\'`，并使用 `<AnnotationViewer source={annotationSourceDocument as unknown as AnnotationSourceDocument} />`，确保标注随 Axure Runtime bundle 构建进去',
            blocking: true,
            category: 'export-structure',
        }];
}
function checkAxureExportStructure(content, filePath) {
    const issues = [];
    if (!/@name\s+.+/.test(content)) {
        issues.push({
            type: 'error',
            rule: 'file-header-name',
            message: '缺少 @name 注释',
            suggestion: '请在文件头部添加 @name 注释',
            blocking: true,
            category: 'docs',
        });
    }
    if (!hasHeaderMarker(content, '@mode axure')) {
        issues.push({
            type: 'error',
            rule: 'file-header-mode-axure',
            message: 'Axure 导出要求头部包含 @mode axure',
            suggestion: '请在文件头注释中添加 `@mode axure`',
            blocking: true,
            category: 'docs',
        });
    }
    if (!hasHeaderMarker(content, 'rules/axure-export-workflow.md')) {
        issues.push({
            type: 'warning',
            rule: 'file-header-axure-rule',
            message: '建议在 Axure 导出文件头部包含 rules/axure-export-workflow.md 参考路径',
            suggestion: '请在文件头注释中补充 rules 路径',
            blocking: false,
            category: 'docs',
        });
    }
    issues.push(...checkExportDefault(content, filePath, { enforceComponentExportName: true }).map((issue) => ({
        ...issue,
        blocking: true,
        category: 'export-structure',
    })));
    if (!hasTopLevelComponentBinding(content, filePath)) {
        issues.push({
            type: 'error',
            rule: 'component-binding',
            message: 'Axure 导出要求源码中存在可静态识别的顶层 Component 定义',
            suggestion: '请使用 `const Component = ...` 或 `function Component() {}` 并导出 `export default Component`',
            blocking: true,
            category: 'export-structure',
        });
    }
    issues.push(...checkAxureAnnotationSourceImport(content, filePath));
    return issues;
}
/**
 * 检查文件是否包含 default export
 */
function checkExportDefault(content, filePath, options = {}) {
    const issues = [];
    // 检查是否有 default export（不限制导出名称）
    const hasExportDefault = /\bexport\s+default\b/.test(content);
    if (!hasExportDefault) {
        issues.push({
            type: 'error',
            rule: 'export-default',
            message: '缺少 export default 导出',
            suggestion: '请添加 default 导出（例如：export default MyComponent）'
        });
        return issues;
    }
    if (options.enforceComponentExportName) {
        const exportedName = extractDefaultExportName(content);
        if (exportedName !== 'Component') {
            issues.push({
                type: 'error',
                rule: 'export-default-name',
                message: exportedName
                    ? `导出名称错误：使用了 "${exportedName}"，Axure 导出检查要求使用 "Component"`
                    : 'Axure 导出检查要求默认导出为命名变量 "Component"',
                suggestion: '请使用 `const Component = ...` 并导出 `export default Component`'
            });
        }
    }
    return issues;
}
/**
 * 检查 Tailwind CSS 配置
 */
function checkTailwindCSS(content, filePath) {
    const issues = [];
    // 检查是否使用了 Tailwind 类名（常见的 Tailwind 类名模式）
    const tailwindPatterns = [
        /className=["'][^"']*\b(flex|grid|block|inline|hidden|relative|absolute|fixed|sticky)\b/,
        /className=["'][^"']*\b(w-|h-|m-|p-|text-|bg-|border-|rounded-)/,
        /className=["'][^"']*\b(hover:|focus:|active:|disabled:)/,
        /className=["'][^"']*\b(sm:|md:|lg:|xl:|2xl:)/
    ];
    const usesTailwind = tailwindPatterns.some(pattern => pattern.test(content));
    if (usesTailwind) {
        // 检查是否导入了 CSS 文件（支持 style.css, styles.css 等）
        const hasStyleImport = /import\s+['"]\.\/[^'"]*\.css['"]/.test(content);
        if (!hasStyleImport) {
            issues.push({
                type: 'error',
                rule: 'tailwind-style-import',
                message: '使用了 Tailwind CSS 类名，但未导入 CSS 文件',
                suggestion: '在文件顶部添加：import \'./style.css\' 或 import \'./styles.css\''
            });
        }
        else {
            // 提取导入的 CSS 文件名
            const styleImportMatch = content.match(/import\s+['"]\.\/([^'"]+\.css)['"]/);
            if (styleImportMatch) {
                const cssFileName = styleImportMatch[1];
                const dir = path.dirname(filePath);
                const stylePath = path.join(dir, cssFileName);
                if (fs.existsSync(stylePath)) {
                    const styleContent = fs.readFileSync(stylePath, 'utf8');
                    const hasTailwindImport = /@import\s+["']tailwindcss["']/.test(styleContent);
                    if (!hasTailwindImport) {
                        issues.push({
                            type: 'error',
                            rule: 'tailwind-css-import',
                            message: `${cssFileName} 中缺少 @import "tailwindcss"`,
                            suggestion: `在 ${cssFileName} 文件中添加：@import "tailwindcss";`
                        });
                    }
                }
                else {
                    issues.push({
                        type: 'error',
                        rule: 'tailwind-style-file',
                        message: `导入了 ${cssFileName} 但文件不存在`,
                        suggestion: `创建 ${cssFileName} 文件并添加：@import "tailwindcss";`
                    });
                }
            }
        }
    }
    return issues;
}
/**
 * 检查 Axure API 使用规范
 */
function checkAxureAPI(content, filePath) {
    const issues = [];
    // 检查是否使用了 forwardRef
    const usesForwardRef = /forwardRef(?:\s*<|\s*\()/.test(content);
    if (!usesForwardRef) {
        // 可能不是 Axure 组件，跳过检查
        return issues;
    }
    // 检查是否导入了 AxureProps 和 AxureHandle（支持多行导入）
    const hasAxurePropsImport = /import\s+type\s*\{[^}]*\bAxureProps\b[^}]*\}\s*from\s+['"].*axure-types/.test(content.replace(/\n/g, ' '));
    const hasAxureHandleImport = /import\s+type\s*\{[^}]*\bAxureHandle\b[^}]*\}\s*from\s+['"].*axure-types/.test(content.replace(/\n/g, ' '));
    if (!hasAxurePropsImport) {
        issues.push({
            type: 'error',
            rule: 'axure-api-props',
            message: '使用了 forwardRef 但未导入 AxureProps 类型',
            suggestion: '从 axure-types 导入：import type { AxureProps, AxureHandle } from \'../../common/axure-types\''
        });
    }
    if (!hasAxureHandleImport) {
        issues.push({
            type: 'error',
            rule: 'axure-api-handle',
            message: '使用了 forwardRef 但未导入 AxureHandle 类型',
            suggestion: '从 axure-types 导入：import type { AxureProps, AxureHandle } from \'../../common/axure-types\''
        });
    }
    // 检查 forwardRef 类型标注
    const forwardRefMatch = content.match(/forwardRef\s*<\s*([^,>]+)\s*,\s*([^>]+)\s*>/);
    if (forwardRefMatch) {
        const handleType = forwardRefMatch[1].trim();
        const propsType = forwardRefMatch[2].trim();
        if (handleType !== 'AxureHandle') {
            issues.push({
                type: 'error',
                rule: 'axure-api-handle-type',
                message: `forwardRef 第一个类型参数错误：使用了 "${handleType}"，应该使用 "AxureHandle"`,
                suggestion: '使用正确的类型：forwardRef<AxureHandle, AxureProps>'
            });
        }
        if (propsType !== 'AxureProps') {
            issues.push({
                type: 'error',
                rule: 'axure-api-props-type',
                message: `forwardRef 第二个类型参数错误：使用了 "${propsType}"，应该使用 "AxureProps"`,
                suggestion: '使用正确的类型：forwardRef<AxureHandle, AxureProps>'
            });
        }
    }
    // 检查是否有 useImperativeHandle
    const hasUseImperativeHandle = /useImperativeHandle\s*\(/.test(content);
    if (usesForwardRef && !hasUseImperativeHandle) {
        issues.push({
            type: 'warning',
            rule: 'axure-api-imperative-handle',
            message: '使用了 forwardRef 但未使用 useImperativeHandle',
            suggestion: '使用 useImperativeHandle 暴露 AxureHandle 接口'
        });
    }
    // 检查 onEvent 参数类型（payload 必须是 string）
    const onEventCalls = content.match(/onEvent(?:Handler)?\s*\(\s*['"][^'"]+['"]\s*,\s*([^)]+)\)/g);
    if (onEventCalls) {
        onEventCalls.forEach(call => {
            // 检查是否传递了对象字面量作为 payload
            if (/\{[^}]+\}/.test(call)) {
                issues.push({
                    type: 'error',
                    rule: 'axure-api-event-payload',
                    message: 'onEvent 的 payload 参数必须是字符串类型，不能传递对象',
                    suggestion: '将对象转换为 JSON 字符串：JSON.stringify(payload)'
                });
            }
        });
    }
    return issues;
}
/**
 * 检查单个文件
 */
export function reviewFile(filePath, options = {}) {
    const issues = [];
    const mode = resolveReviewMode(options);
    try {
        if (!fs.existsSync(filePath)) {
            return buildReviewResult(filePath, mode, [{
                    type: 'error',
                    rule: 'file-not-found',
                    message: '文件不存在',
                    blocking: true,
                    category: 'docs',
                }]);
        }
        const content = fs.readFileSync(filePath, 'utf8');
        console.log('[Code Review] Starting checks for:', filePath);
        if (mode === 'axure-export') {
            const exportIssues = checkAxureExportStructure(content, filePath);
            console.log('[Code Review] Axure export structure issues:', exportIssues.length);
            issues.push(...exportIssues);
            const tailwindIssues = checkTailwindCSS(content, filePath);
            console.log('[Code Review] Tailwind issues:', tailwindIssues.length);
            issues.push(...tailwindIssues.map((issue) => ({
                ...issue,
                blocking: issue.type === 'error',
                category: 'tailwind',
            })));
            const axureIssues = collectAxureExportApiIssues(content, filePath);
            console.log('[Code Review] Axure export API issues:', axureIssues.length);
            issues.push(...axureIssues);
        }
        else {
            const exportIssues = checkExportDefault(content, filePath, options);
            console.log('[Code Review] Export issues:', exportIssues.length);
            issues.push(...exportIssues);
            const tailwindIssues = checkTailwindCSS(content, filePath);
            console.log('[Code Review] Tailwind issues:', tailwindIssues.length);
            issues.push(...tailwindIssues);
            const axureIssues = checkAxureAPI(content, filePath);
            console.log('[Code Review] Axure issues:', axureIssues.length);
            issues.push(...axureIssues);
        }
        console.log('[Code Review] Total issues:', issues.length);
    }
    catch (error) {
        issues.push({
            type: 'error',
            rule: 'file-read-error',
            message: `读取文件失败: ${error.message}`,
            blocking: true,
        });
    }
    return buildReviewResult(filePath, mode, issues);
}
function createMissingListPreview() {
    return {
        sourceKey: null,
        raw: null,
        items: [],
        parseStatus: 'missing',
        warnings: [],
    };
}
function createEmptyAxureApiPreview(filePath, passedSourceCheck) {
    return {
        file: filePath,
        passedSourceCheck,
        hasAxureHandle: false,
        lists: {
            eventList: createMissingListPreview(),
            actionList: createMissingListPreview(),
            varList: createMissingListPreview(),
            configList: createMissingListPreview(),
            dataList: createMissingListPreview(),
        },
    };
}
function isUseImperativeHandleCallee(expression) {
    if (ts.isIdentifier(expression)) {
        return expression.text === 'useImperativeHandle';
    }
    if (ts.isPropertyAccessExpression(expression)) {
        return expression.name.text === 'useImperativeHandle';
    }
    return false;
}
function collectTopLevelConstInitializers(sourceFile) {
    const map = new Map();
    sourceFile.statements.forEach((statement) => {
        if (!ts.isVariableStatement(statement)) {
            return;
        }
        const isConst = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
        if (!isConst) {
            return;
        }
        statement.declarationList.declarations.forEach((declaration) => {
            if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
                return;
            }
            map.set(declaration.name.text, declaration.initializer);
        });
    });
    return map;
}
function getObjectPropertyName(name) {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
        return name.text;
    }
    return null;
}
function findReturnedObjectFromFunction(fn) {
    if (!fn) {
        return null;
    }
    if (ts.isArrowFunction(fn)) {
        if (ts.isObjectLiteralExpression(fn.body)) {
            return fn.body;
        }
        if (ts.isParenthesizedExpression(fn.body) && ts.isObjectLiteralExpression(fn.body.expression)) {
            return fn.body.expression;
        }
        if (ts.isBlock(fn.body)) {
            for (const statement of fn.body.statements) {
                if (ts.isReturnStatement(statement) && statement.expression && ts.isObjectLiteralExpression(statement.expression)) {
                    return statement.expression;
                }
            }
        }
    }
    if (ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn)) {
        if (!fn.body) {
            return null;
        }
        for (const statement of fn.body.statements) {
            if (ts.isReturnStatement(statement) && statement.expression && ts.isObjectLiteralExpression(statement.expression)) {
                return statement.expression;
            }
        }
    }
    return null;
}
function findHandleReturnObject(sourceFile) {
    const matches = [];
    let hasCall = false;
    const visit = (node) => {
        if (ts.isCallExpression(node) && isUseImperativeHandleCallee(node.expression)) {
            hasCall = true;
            const handleObject = findReturnedObjectFromFunction(node.arguments[1]);
            if (handleObject) {
                matches.push(handleObject);
            }
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
    if (!hasCall) {
        return { hasAxureHandle: false, handleObject: null };
    }
    const withTargetKeys = matches.find((objectLiteral) => objectLiteral.properties.some((property) => {
        if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
            return false;
        }
        const propertyName = getObjectPropertyName(property.name);
        return propertyName != null && AXURE_LIST_KEYS.includes(propertyName);
    }));
    return {
        hasAxureHandle: true,
        handleObject: withTargetKeys ?? matches[0] ?? null,
    };
}
function resolveExpressionFromConstMap(expression, constants) {
    const warnings = [];
    const visited = new Set();
    let current = expression;
    while (ts.isIdentifier(current)) {
        const key = current.text;
        const next = constants.get(key);
        if (!next) {
            break;
        }
        if (visited.has(key)) {
            warnings.push(`检测到循环引用: ${key}`);
            break;
        }
        visited.add(key);
        current = next;
    }
    return { expression: current, warnings };
}
function expressionToJson(expression, sourceFile, constants, visitedIdentifiers = new Set()) {
    if (ts.isParenthesizedExpression(expression)) {
        return expressionToJson(expression.expression, sourceFile, constants, visitedIdentifiers);
    }
    if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression) || ts.isSatisfiesExpression(expression)) {
        return expressionToJson(expression.expression, sourceFile, constants, visitedIdentifiers);
    }
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
        return { value: expression.text, unresolved: false, warnings: [] };
    }
    if (ts.isNumericLiteral(expression)) {
        return { value: Number(expression.text), unresolved: false, warnings: [] };
    }
    if (expression.kind === ts.SyntaxKind.TrueKeyword) {
        return { value: true, unresolved: false, warnings: [] };
    }
    if (expression.kind === ts.SyntaxKind.FalseKeyword) {
        return { value: false, unresolved: false, warnings: [] };
    }
    if (expression.kind === ts.SyntaxKind.NullKeyword) {
        return { value: null, unresolved: false, warnings: [] };
    }
    if (ts.isPrefixUnaryExpression(expression)) {
        const inner = expressionToJson(expression.operand, sourceFile, constants, visitedIdentifiers);
        if (typeof inner.value === 'number') {
            if (expression.operator === ts.SyntaxKind.MinusToken) {
                return { value: -inner.value, unresolved: inner.unresolved, warnings: inner.warnings };
            }
            if (expression.operator === ts.SyntaxKind.PlusToken) {
                return { value: Number(inner.value), unresolved: inner.unresolved, warnings: inner.warnings };
            }
            if (expression.operator === ts.SyntaxKind.ExclamationToken) {
                return { value: !inner.value, unresolved: inner.unresolved, warnings: inner.warnings };
            }
        }
        const warning = `无法静态解析前缀表达式: ${expression.getText(sourceFile)}`;
        return {
            value: { __expr: expression.getText(sourceFile) },
            unresolved: true,
            warnings: [...inner.warnings, warning],
        };
    }
    if (ts.isArrayLiteralExpression(expression)) {
        const warnings = [];
        let unresolved = false;
        const value = expression.elements.map((element) => {
            if (ts.isSpreadElement(element)) {
                unresolved = true;
                warnings.push(`数组项包含扩展语法: ${element.getText(sourceFile)}`);
                return { __expr: element.getText(sourceFile) };
            }
            const parsed = expressionToJson(element, sourceFile, constants, new Set(visitedIdentifiers));
            unresolved = unresolved || parsed.unresolved;
            warnings.push(...parsed.warnings);
            return parsed.value;
        });
        return { value, unresolved, warnings };
    }
    if (ts.isObjectLiteralExpression(expression)) {
        const warnings = [];
        let unresolved = false;
        const value = {};
        expression.properties.forEach((property, index) => {
            if (ts.isPropertyAssignment(property)) {
                const propertyName = getObjectPropertyName(property.name);
                if (!propertyName) {
                    unresolved = true;
                    warnings.push(`对象属性名无法静态解析: ${property.getText(sourceFile)}`);
                    value[`__expr_${index}`] = property.getText(sourceFile);
                    return;
                }
                const parsed = expressionToJson(property.initializer, sourceFile, constants, new Set(visitedIdentifiers));
                unresolved = unresolved || parsed.unresolved;
                warnings.push(...parsed.warnings);
                value[propertyName] = parsed.value;
                return;
            }
            if (ts.isShorthandPropertyAssignment(property)) {
                const propertyName = property.name.text;
                if (visitedIdentifiers.has(propertyName)) {
                    unresolved = true;
                    warnings.push(`检测到循环引用: ${propertyName}`);
                    value[propertyName] = { __expr: property.getText(sourceFile) };
                    return;
                }
                const initializer = constants.get(propertyName);
                if (!initializer) {
                    unresolved = true;
                    warnings.push(`未找到简写属性引用: ${propertyName}`);
                    value[propertyName] = { __expr: property.getText(sourceFile) };
                    return;
                }
                const nextVisited = new Set(visitedIdentifiers);
                nextVisited.add(propertyName);
                const parsed = expressionToJson(initializer, sourceFile, constants, nextVisited);
                unresolved = unresolved || parsed.unresolved;
                warnings.push(...parsed.warnings);
                value[propertyName] = parsed.value;
                return;
            }
            unresolved = true;
            warnings.push(`对象包含无法静态解析的属性: ${property.getText(sourceFile)}`);
            value[`__expr_${index}`] = property.getText(sourceFile);
        });
        return { value, unresolved, warnings };
    }
    if (ts.isIdentifier(expression)) {
        const identifier = expression.text;
        if (visitedIdentifiers.has(identifier)) {
            return {
                value: { __expr: expression.getText(sourceFile) },
                unresolved: true,
                warnings: [`检测到循环引用: ${identifier}`],
            };
        }
        const next = constants.get(identifier);
        if (!next) {
            return {
                value: { __expr: expression.getText(sourceFile) },
                unresolved: true,
                warnings: [`无法静态解析标识符: ${identifier}`],
            };
        }
        const nextVisited = new Set(visitedIdentifiers);
        nextVisited.add(identifier);
        return expressionToJson(next, sourceFile, constants, nextVisited);
    }
    return {
        value: { __expr: expression.getText(sourceFile) },
        unresolved: true,
        warnings: [`无法静态解析表达式: ${expression.getText(sourceFile)}`],
    };
}
function toSerializableRecordArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
            return item;
        }
        return { value: item };
    });
}
function normalizeWarnings(warnings) {
    const seen = new Set();
    const deduped = [];
    for (const warning of warnings) {
        const normalized = String(warning || '').trim();
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        deduped.push(normalized);
    }
    return deduped;
}
function buildListPreview(key, handleObject, sourceFile, constants) {
    if (!handleObject) {
        return createMissingListPreview();
    }
    const property = handleObject.properties.find((node) => {
        if (!ts.isPropertyAssignment(node) && !ts.isShorthandPropertyAssignment(node)) {
            return false;
        }
        const propertyName = getObjectPropertyName(node.name);
        return propertyName === key;
    });
    if (!property) {
        return createMissingListPreview();
    }
    const rawExpression = ts.isPropertyAssignment(property)
        ? property.initializer
        : property.name;
    const sourceKey = ts.isIdentifier(rawExpression) ? rawExpression.text : null;
    const resolved = resolveExpressionFromConstMap(rawExpression, constants);
    const parsed = expressionToJson(resolved.expression, sourceFile, constants);
    const warnings = normalizeWarnings([...resolved.warnings, ...parsed.warnings]);
    if (!Array.isArray(parsed.value)) {
        return {
            sourceKey,
            raw: resolved.expression.getText(sourceFile),
            items: [],
            parseStatus: 'raw',
            warnings: normalizeWarnings([...warnings, `字段 ${key} 不是数组字面量`]),
        };
    }
    const parseStatus = parsed.unresolved || warnings.length > 0 ? 'raw' : 'parsed';
    return {
        sourceKey,
        raw: resolved.expression.getText(sourceFile),
        items: toSerializableRecordArray(parsed.value),
        parseStatus,
        warnings,
    };
}
export function extractAxureApiPreviewFromContent(content, filePath) {
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const constants = collectTopLevelConstInitializers(sourceFile);
    const handleResult = findHandleReturnObject(sourceFile);
    const result = createEmptyAxureApiPreview(filePath, true);
    result.hasAxureHandle = handleResult.hasAxureHandle;
    AXURE_LIST_KEYS.forEach((key) => {
        result.lists[key] = buildListPreview(key, handleResult.handleObject, sourceFile, constants);
    });
    return result;
}
export function getAxureApiPreviewFromFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return createEmptyAxureApiPreview(filePath, false);
    }
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return extractAxureApiPreviewFromContent(content, filePath);
    }
    catch {
        return createEmptyAxureApiPreview(filePath, false);
    }
}
function isExplicitAxureApiUsage(content) {
    return /AxureHandle|AxureProps|useImperativeHandle|forwardRef(?:\s*<|\s*\()/.test(content);
}
function collectAxureExportApiIssues(content, filePath) {
    const issues = [];
    const explicitUsage = isExplicitAxureApiUsage(content);
    const preview = extractAxureApiPreviewFromContent(content, filePath);
    if (!explicitUsage) {
        return issues;
    }
    issues.push(...checkAxureAPI(content, filePath).map((issue) => {
        if (issue.rule === 'axure-api-imperative-handle') {
            return {
                ...issue,
                type: 'error',
                blocking: true,
                category: 'axure-api',
            };
        }
        return {
            ...issue,
            blocking: issue.type === 'error',
            category: 'axure-api',
        };
    }));
    if (!preview.hasAxureHandle) {
        issues.push({
            type: 'error',
            rule: 'axure-api-handle-contract',
            message: '检测到 Axure API 用法，但未找到 useImperativeHandle 返回的 AxureHandle 对象',
            suggestion: '请通过 useImperativeHandle 返回 getVar、fireAction 与五类列表',
            blocking: true,
            category: 'axure-api',
        });
        return issues;
    }
    AXURE_LIST_KEYS.forEach((key) => {
        const listPreview = preview.lists[key];
        if (listPreview.parseStatus === 'missing') {
            issues.push({
                type: 'error',
                rule: `axure-api-missing-${key}`,
                message: `已接入 Axure API，但缺少 ${key} 定义`,
                suggestion: `请在 useImperativeHandle 返回对象中补齐 ${key}`,
                blocking: true,
                category: 'axure-api',
            });
            return;
        }
    });
    preview.lists.varList.items.forEach((item, index) => {
        if (typeof item.name === 'string' && !/^[a-z0-9_]+$/.test(item.name)) {
            issues.push({
                type: 'error',
                rule: 'axure-api-var-name',
                message: `varList 第 ${index + 1} 项 name="${item.name}" 不符合 snake_case 规范`,
                suggestion: '请使用小写字母、数字和下划线命名变量',
                blocking: true,
                category: 'axure-api',
            });
        }
    });
    return issues;
}
function isSafeRelativeTargetPath(targetPath) {
    const normalized = String(targetPath || '');
    if (!normalized)
        return false;
    if (normalized.includes('..'))
        return false;
    if (normalized.startsWith('/'))
        return false;
    if (normalized.startsWith('\\'))
        return false;
    if (path.isAbsolute(normalized))
        return false;
    return true;
}
export function resolveCodeReviewFilePath(projectRoot, targetPath) {
    if (!isSafeRelativeTargetPath(targetPath)) {
        return null;
    }
    return path.resolve(projectRoot, 'src', targetPath, 'index.tsx');
}
