/**
 * 代码检查插件
 * 
 * 提供 /api/code-review 端点，用于检查代码是否符合开发规范
 * 
 * 检查项目：
 * 1. 导出规范：必须使用 `export default Component`
 * 2. Tailwind CSS：如果使用了 Tailwind 类名，必须在 style.css 中添加 `@import "tailwindcss"`
 * 3. Axure API：如果使用了 Axure API，必须符合 axure-types.ts 的类型定义
 */

import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

// 检查结果类型
export interface ReviewIssue {
  type: 'error' | 'warning';
  rule: string;
  message: string;
  line?: number;
  suggestion?: string;
}

export interface ReviewResult {
  file: string;
  passed: boolean;
  issues: ReviewIssue[];
}

/**
 * 检查文件是否使用了 export default Component
 */
function checkExportDefault(content: string, filePath: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  
  // 检查是否有 export default
  const hasExportDefault = /export\s+default\s+\w+/.test(content);
  
  if (!hasExportDefault) {
    issues.push({
      type: 'error',
      rule: 'export-default',
      message: '缺少 export default 导出',
      suggestion: '必须使用 `export default Component` 导出组件'
    });
    return issues;
  }
  
  // 检查是否是 export default Component（大小写敏感）
  const exportDefaultMatch = content.match(/export\s+default\s+(\w+)/);
  if (exportDefaultMatch) {
    const exportedName = exportDefaultMatch[1];
    if (exportedName !== 'Component') {
      issues.push({
        type: 'error',
        rule: 'export-default-name',
        message: `导出名称错误：使用了 "${exportedName}"，应该使用 "Component"`,
        suggestion: '必须使用 `export default Component`（大小写敏感）'
      });
    }
  }
  
  return issues;
}

/**
 * 检查 Tailwind CSS 配置
 */
function checkTailwindCSS(content: string, filePath: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  
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
    } else {
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
        } else {
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
function checkAxureAPI(content: string, filePath: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  
  // 检查是否使用了 forwardRef
  const usesForwardRef = /forwardRef\s*</.test(content);
  
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
 * 其他推荐检查项（需要用户确认）
 */
function checkRecommended(content: string, filePath: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  
  // 检查是否有 @name 注释
  const hasNameComment = /@name\s+.+/.test(content);
  if (!hasNameComment) {
    issues.push({
      type: 'warning',
      rule: 'file-header-name',
      message: '缺少 @name 注释',
      suggestion: '在文件头部添加：/**\\n * @name 组件名称\\n */'
    });
  }
  
  // 检查是否在 JSX 中直接定义函数（性能问题）
  const hasInlineFunction = /onClick=\{function\s*\(/.test(content) || /onClick=\{\(\s*\)\s*=>/.test(content);
  if (hasInlineFunction) {
    issues.push({
      type: 'warning',
      rule: 'jsx-inline-function',
      message: '在 JSX 中直接定义了函数，可能影响性能',
      suggestion: '使用 useCallback 预定义函数'
    });
  }
  
  // 检查是否使用了 ES6 解构 state（不推荐）
  const hasStateDestructure = /const\s*\[\s*\w+\s*,\s*\w+\s*\]\s*=\s*useState/.test(content);
  if (hasStateDestructure) {
    issues.push({
      type: 'warning',
      rule: 'state-destructure',
      message: '使用了 ES6 解构 state，不符合项目规范',
      suggestion: '使用数组索引访问：const countState = useState(0); const count = countState[0];'
    });
  }
  
  return issues;
}

/**
 * 检查单个文件
 */
function reviewFile(filePath: string): ReviewResult {
  const issues: ReviewIssue[] = [];
  
  try {
    if (!fs.existsSync(filePath)) {
      return {
        file: filePath,
        passed: false,
        issues: [{
          type: 'error',
          rule: 'file-not-found',
          message: '文件不存在'
        }]
      };
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    console.log('[Code Review] Starting checks for:', filePath);
    
    // 执行各项检查
    const exportIssues = checkExportDefault(content, filePath);
    console.log('[Code Review] Export issues:', exportIssues.length);
    issues.push(...exportIssues);
    
    const tailwindIssues = checkTailwindCSS(content, filePath);
    console.log('[Code Review] Tailwind issues:', tailwindIssues.length);
    issues.push(...tailwindIssues);
    
    const axureIssues = checkAxureAPI(content, filePath);
    console.log('[Code Review] Axure issues:', axureIssues.length);
    issues.push(...axureIssues);
    
    console.log('[Code Review] Total issues:', issues.length);
    
  } catch (error: any) {
    issues.push({
      type: 'error',
      rule: 'file-read-error',
      message: `读取文件失败: ${error.message}`
    });
  }
  
  // 只有 error 类型的问题才算不通过
  const hasErrors = issues.some(issue => issue.type === 'error');
  
  return {
    file: filePath,
    passed: !hasErrors,
    issues
  };
}

/**
 * 代码检查插件
 */
export function codeReviewPlugin(): Plugin {
  return {
    name: 'code-review-plugin',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.method !== 'POST' || req.url !== '/api/code-review') {
          return next();
        }
        
        const chunks: Buffer[] = [];
        
        req.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const targetPath = body.path; // e.g., 'pages/landing-page' or 'elements/button'
            
            if (!targetPath) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Missing path parameter' }));
              return;
            }
            
            // 验证路径安全性
            if (targetPath.includes('..') || targetPath.startsWith('/')) {
              res.statusCode = 403;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Invalid path' }));
              return;
            }
            
            // 构建文件路径
            const filePath = path.resolve(process.cwd(), 'src', targetPath, 'index.tsx');
            
            // 执行检查
            const result = reviewFile(filePath);
            
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(result));
            
          } catch (error: any) {
            console.error('Code review error:', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      });
    }
  };
}
