#!/usr/bin/env node

/**
 * =====================================================
 * Chrome 扩展导出转换器
 * 
 * 专门处理通过 Chrome 扩展本项目导出的 HTML 文件
 * 
 * 功能：
 * 1. 转换 index.html 为 React 组件
 * 2. 智能处理字体：CDN 保留链接，本地文件复制
 * 3. 复制静态资源（图片、字体）
 * 4. 保留完整的 style.css 样式
 * =====================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  projectRoot: path.resolve(__dirname, '..'),
  pagesDir: path.resolve(__dirname, '../src/pages')
};

function log(message, type = 'info') {
  const prefix = { info: '✓', warn: '⚠', error: '✗', progress: '⏳' }[type] || 'ℹ';
  console.log(`${prefix} ${message}`);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 判断是否为 CDN 链接
 */
function isCDNUrl(url) {
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');
}

/**
 * 递归复制目录
 */
function copyDirectory(src, dest) {
  if (!fs.existsSync(src)) return 0;
  
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  let count = 0;
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      count += copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  
  return count;
}

/**
 * 提取 head 内容（仅处理外部资源和字体）
 */
function extractHeadContent(html) {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return { scripts: [], links: [] };
  
  const headContent = headMatch[1];
  const scripts = [];
  const links = [];
  
  // 提取 script 标签（排除 Tailwind CDN）
  const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(headContent)) !== null) {
    const attrs = match[1];
    const content = match[2].trim();
    
    const srcMatch = attrs.match(/src=["']([^"']+)["']/);
    if (srcMatch) {
      const src = srcMatch[1].replace(/&amp;/g, '&');
      // 跳过 Tailwind CDN
      if (src.includes('tailwindcss.com')) continue;
      
      scripts.push({ 
        src,
        id: attrs.match(/id=["']([^"']+)["']/)?.[1]
      });
    } else if (content) {
      const id = attrs.match(/id=["']([^"']+)["']/)?.[1];
      scripts.push({ id, content });
    }
  }
  
  // 提取 link 标签
  const linkRegex = /<link[^>]*>/gi;
  while ((match = linkRegex.exec(headContent)) !== null) {
    const tag = match[0];
    const href = tag.match(/href=["']([^"']+)["']/)?.[1];
    if (href) {
      links.push({
        href: href.replace(/&amp;/g, '&'),
        rel: tag.match(/rel=["']([^"']+)["']/)?.[1] || 'stylesheet',
        crossorigin: tag.includes('crossorigin')
      });
    }
  }
  
  return { scripts, links };
}

/**
 * 转义文本节点中的花括号
 * 只处理标签之间的文本内容，不处理属性值
 */
function escapeTextBraces(html) {
  const parts = [];
  let lastIndex = 0;
  const tagRegex = /<[^>]+>/g;
  let match;
  
  while ((match = tagRegex.exec(html)) !== null) {
    // 提取标签之前的文本
    const textBefore = html.substring(lastIndex, match.index);
    if (textBefore) {
      // 转义文本中的花括号 - 使用占位符避免重复替换
      const escaped = textBefore
        .replace(/\{/g, "__LBRACE__")
        .replace(/\}/g, "__RBRACE__");
      parts.push(escaped);
    }
    // 添加标签本身（不转义）
    parts.push(match[0]);
    lastIndex = tagRegex.lastIndex;
  }
  
  // 添加最后一段文本
  const textAfter = html.substring(lastIndex);
  if (textAfter) {
    const escaped = textAfter
      .replace(/\{/g, "__LBRACE__")
      .replace(/\}/g, "__RBRACE__");
    parts.push(escaped);
  }
  
  return parts.join('')
    .replace(/__LBRACE__/g, "{'{'}")
    .replace(/__RBRACE__/g, "{'}'}")
}

/**
 * 提取并转换 body 内容
 */
function extractBodyContent(html) {
  const bodyMatch = html.match(/(<body[^>]*>)([\s\S]*)(<\/body>)/i);
  if (!bodyMatch) return '';
  
  const [, openTag, innerContent, closeTag] = bodyMatch;
  
  // 移除 <root> 标签（Chrome 扩展导出特有的包装标签）
  let cleanedContent = innerContent.trim()
    .replace(/^\s*<root>\s*/i, '')
    .replace(/\s*<\/root>\s*$/i, '');
  
  // 检查是否有嵌套的 body 标签
  const hasNestedBody = /<body[^>]*>/i.test(cleanedContent);
  
  // 如果有嵌套的 body，直接返回内容（不添加外层 body）
  // 如果没有嵌套的 body，添加外层 body 标签
  let content = cleanedContent
    .replace(/<!--([\s\S]*?)-->/g, '{/* $1 */}')
    .replace(/(\s)class=/g, '$1className=')
    .replace(/(<pre[^>]*>)([\s\S]*?)(<\/pre>)/gi, (_, openTag, preContent) => {
      const escapedContent = preContent
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$')
        .replace(/\{/g, '\\{');
      return `${openTag.slice(0, -1)} dangerouslySetInnerHTML={{ __html: \`${escapedContent}\` }} />`;
    })
    .replace(/(\s)for=/g, '$1htmlFor=')
    // Convert SVG attributes to camelCase
    .replace(/(\s)(stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit|stroke-dasharray|stroke-dashoffset|fill-rule|fill-opacity|stroke-opacity|clip-path|clip-rule)=/g, (match, space, attr) => {
      const camelCase = attr.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      return `${space}${camelCase}=`;
    })
    .replace(/style='([^']*)'/g, (_, styleStr) => convertStyleToJSX(styleStr))
    .replace(/style="([^"]*)"/g, (_, styleStr) => convertStyleToJSX(styleStr))
    // Convert self-closing tags - first remove closing tags, then convert to self-closing
    .replace(/<\/(br|hr|img|input|meta|link)>/gi, '')
    .replace(/<(br|hr|img|input|meta|link)([^>]*)>/gi, '<$1$2 />')
    // Convert HTML entities to placeholders first
    .replace(/&lt;\//g, '__LTSLASH__')  // 先处理 &lt;/
    .replace(/&lt;/g, '__LT__')
    .replace(/&gt;/g, '__GT__')
    .replace(/&amp;/g, '__AMP__');
  
  // 转义文本节点中的花括号
  content = escapeTextBraces(content);
  
  // 将占位符替换为 JSX 表达式
  content = content
    .replace(/__LTSLASH__/g, "{'</'}")
    .replace(/__LT__/g, "{'<'}")
    .replace(/__GT__/g, "{'>'}")
    .replace(/__AMP__/g, '&');
  
  if (hasNestedBody) {
    // 已经有内层 body 标签，直接返回
    return content;
  } else {
    // 没有内层 body，添加外层 body
    let convertedOpenTag = openTag
      .replace(/(\s)class=/g, '$1className=')
      .replace(/(\s)for=/g, '$1htmlFor=');
    return convertedOpenTag + '\n' + content + '\n    </body>';
  }
}

function convertStyleToJSX(styleStr) {
  if (!styleStr.trim()) return 'style={{}}';
  
  // 先解码 HTML 实体
  const decodedStr = styleStr
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  
  const styles = [];
  let currentProp = '';
  let inUrl = false;
  
  for (let i = 0; i < decodedStr.length; i++) {
    const char = decodedStr[i];
    if (char === '(' && decodedStr.substring(i - 3, i) === 'url') inUrl = true;
    else if (char === ')' && inUrl) inUrl = false;
    
    if (char === ';' && !inUrl) {
      if (currentProp.trim()) styles.push(currentProp.trim());
      currentProp = '';
    } else {
      currentProp += char;
    }
  }
  if (currentProp.trim()) styles.push(currentProp.trim());
  
  const jsxStyles = styles
    .filter(s => s.includes(':'))
    .map(s => {
      const colonIndex = s.indexOf(':');
      const key = s.substring(0, colonIndex).trim();
      const value = s.substring(colonIndex + 1).trim();
      if (!key || !value) return '';
      
      const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      let jsxValue;
      if (value.startsWith('url(') || value.includes('var(')) {
        jsxValue = `'${value.replace(/'/g, "\\'")}'`;
      } else if (/^-?\d+(\.\d+)?$/.test(value)) {
        jsxValue = value;
      } else {
        // 转义单引号和反斜杠
        const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        jsxValue = `'${escapedValue}'`;
      }
      return `${camelKey}: ${jsxValue}`;
    })
    .filter(Boolean)
    .join(', ');
  
  return `style={{ ${jsxStyles} }}`;
}

/**
 * 生成组件代码
 */
function normalizeDisplayName(displayName) {
  const text = String(displayName ?? '').trim();
  const singleLine = text.replace(/\r?\n/g, ' ');
  const safeText = singleLine.replace(/\*\//g, '* /');
  return safeText.slice(0, 200);
}

function generateComponent(pageSlug, displayName, bodyContent, headContent) {
  const componentName = pageSlug
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  const safeDisplayName = normalizeDisplayName(displayName || pageSlug);
  
  let cleanedContent = bodyContent.trim();
  if (cleanedContent.startsWith('{/*')) {
    const firstTagIndex = cleanedContent.indexOf('<');
    if (firstTagIndex > 0) {
      cleanedContent = cleanedContent.substring(firstTagIndex);
    }
  }
  
  const needsWrapper = !isWrappedInSingleElement(cleanedContent);
  const finalContent = needsWrapper ? `<>\n${cleanedContent}\n    </>` : cleanedContent;
  
  // 生成注入代码
  let injectionCode = '';
  
  if (headContent.links.length > 0 || headContent.scripts.length > 0) {
    const hasExternalScripts = headContent.scripts.some(s => s.src);
    
    injectionCode = `
  // 动态注入外部资源
  React.useEffect(function () {
    const injected: (HTMLElement)[] = [];
    `;
    
    if (headContent.links.length > 0) {
      injectionCode += `
    // 注入 links
    ${JSON.stringify(headContent.links)}.forEach(function (linkInfo: any) {
      const existing = document.querySelector(\`link[href="\${linkInfo.href}"]\`);
      if (!existing) {
        const link = document.createElement('link');
        link.rel = linkInfo.rel;
        link.href = linkInfo.href;
        if (linkInfo.crossorigin) link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
        injected.push(link);
      }
    });
    `;
    }
    
    if (hasExternalScripts) {
      injectionCode += `
    // 注入外部脚本
    ${JSON.stringify(headContent.scripts.filter(s => s.src))}.forEach(function (scriptInfo: any) {
      const existing = document.querySelector(\`script[src="\${scriptInfo.src}"]\`);
      if (!existing) {
        const script = document.createElement('script');
        if (scriptInfo.id) script.id = scriptInfo.id;
        script.src = scriptInfo.src;
        document.head.appendChild(script);
        injected.push(script);
      }
    });
    `;
    }
    
    injectionCode += `
    return function () {
      injected.forEach(function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    };
  }, []);
`;
  }
  
  return `/**
 * @name ${safeDisplayName}
 * 
 * 参考资料：
 * - /rules/development-standards.md
 * - /assets/libraries/tailwind-css.md
 */

import './style.css';
import React, { forwardRef, useImperativeHandle } from 'react';
import type { AxureProps, AxureHandle } from '../../common/axure-types';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[${pageSlug}] 组件渲染错误:', error);
    console.error('[${pageSlug}] 错误详情:', errorInfo);
    console.error('[${pageSlug}] 错误堆栈:', error.stack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red', border: '2px solid red', margin: '20px' }}>
          <h2>组件渲染失败: ${safeDisplayName}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>
            {this.state.error?.toString()}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

const Component = forwardRef<AxureHandle, AxureProps>(function ${componentName}(innerProps, ref) {
  console.log('[${pageSlug}] 组件开始渲染');
  
  useImperativeHandle(ref, function () {
    return {
      getVar: function () { return undefined; },
      fireAction: function () {},
      eventList: [],
      actionList: [],
      varList: [],
      configList: [],
      dataList: []
    };
  }, []);
${injectionCode}
  console.log('[${pageSlug}] 准备返回 JSX');
  
  try {
    return (
${finalContent.split('\n').map(line => '      ' + line).join('\n')}
    );
  } catch (error) {
    console.error('[${pageSlug}] JSX 渲染错误:', error);
    throw error;
  }
});

const WrappedComponent = forwardRef<AxureHandle, AxureProps>((props, ref) => (
  <ErrorBoundary>
    <Component {...props} ref={ref} />
  </ErrorBoundary>
));

export default WrappedComponent;
`;
}

function isWrappedInSingleElement(content) {
  const trimmed = content.trim();
  if (!trimmed.startsWith('<')) return false;
  if (trimmed.startsWith('<body')) return trimmed.endsWith('</body>');
  
  const firstTagMatch = trimmed.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
  if (!firstTagMatch) return false;
  
  const tagName = firstTagMatch[1];
  const closingTag = `</${tagName}>`;
  if (!trimmed.endsWith(closingTag)) return false;
  
  const openCount = (trimmed.match(new RegExp(`<${tagName}[\\s>]`, 'g')) || []).length;
  const closeCount = (trimmed.match(new RegExp(`</${tagName}>`, 'g')) || []).length;
  return openCount === closeCount && openCount === 1;
}

/**
 * 生成 CSS 文件（仅处理外部 style.css）
 */
function generateStyleCSS(fonts, sourcePath) {
  let css = '@import "tailwindcss";\n';
  
  // 处理字体
  if (fonts && fonts.length > 0) {
    css += '\n/* 字体定义 */\n';
    
    const cdnFonts = fonts.filter(f => f.isCDN);
    const localFonts = fonts.filter(f => !f.isCDN);
    
    if (cdnFonts.length > 0) {
      css += '\n/* CDN 字体（保留原始链接） */\n';
      cdnFonts.forEach(font => {
        css += font.rule + '\n\n';
      });
    }
    
    if (localFonts.length > 0) {
      css += '\n/* 本地字体（已复制到 assets 目录） */\n';
      localFonts.forEach(font => {
        // 将字体路径改为相对于 style.css 的路径
        const modifiedRule = font.rule.replace(
          /url\(['"]?([^'")\s]+)['"]?\)/g,
          (match, url) => `url('./${url}')`
        );
        css += modifiedRule + '\n\n';
      });
    }
  }
  
  // 读取外部 CSS 文件的完整内容（排除字体定义）
  const externalCSSPath = path.join(sourcePath, 'style.css');
  if (fs.existsSync(externalCSSPath)) {
    const externalCSS = fs.readFileSync(externalCSSPath, 'utf8');
    // 移除 @font-face 规则（已单独处理）
    const withoutFontFace = externalCSS.replace(/@font-face\s*\{[^}]+\}/g, '').trim();
    if (withoutFontFace) {
      css += '\n/* 样式类定义（来自 style.css）*/\n';
      css += withoutFontFace + '\n';
    }
  }
  
  return css;
}

/**
 * 从外部 CSS 文件提取字体
 */
function extractFontsFromCSS(cssPath) {
  if (!fs.existsSync(cssPath)) return [];
  
  const css = fs.readFileSync(cssPath, 'utf8');
  const fonts = [];
  
  const fontFaceRegex = /@font-face\s*\{([^}]+)\}/g;
  let match;
  while ((match = fontFaceRegex.exec(css)) !== null) {
    const fontRule = match[1];
    const srcMatch = fontRule.match(/src:\s*url\(['"]?([^'")\s]+)['"]?\)/);
    const familyMatch = fontRule.match(/font-family:\s*['"]([^'"]+)['"]/);
    
    if (srcMatch && familyMatch) {
      const fontSrc = srcMatch[1];
      const fontFamily = familyMatch[1];
      
      fonts.push({
        family: fontFamily,
        src: fontSrc,
        isCDN: isCDNUrl(fontSrc),
        rule: match[0]
      });
    }
  }
  
  return fonts;
}

/**
 * 转换单个页面
 */
function convertPage(sourcePath, outputDir, pageSlug, displayName) {
  log(`正在转换页面: ${pageSlug}`, 'progress');
  
  // Chrome 扩展导出固定使用 index.html
  const htmlPath = path.join(sourcePath, 'index.html');
  
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`找不到 index.html 文件: ${htmlPath}`);
  }
  
  const html = fs.readFileSync(htmlPath, 'utf8');
  
  const headContent = extractHeadContent(html);
  const bodyContent = extractBodyContent(html);
  
  // 从外部 CSS 文件提取字体
  const externalCSSPath = path.join(sourcePath, 'style.css');
  let fonts = [];
  if (fs.existsSync(externalCSSPath)) {
    fonts = extractFontsFromCSS(externalCSSPath);
    if (fonts.length > 0) {
      log(`  ✓ 从 style.css 提取了 ${fonts.length} 个字体定义`, 'info');
    }
  }
  
  ensureDir(outputDir);
  
  // 生成组件和样式
  const componentCode = generateComponent(pageSlug, displayName, bodyContent, headContent);
  const styleCSS = generateStyleCSS(fonts, sourcePath);
  
  fs.writeFileSync(path.join(outputDir, 'index.tsx'), componentCode);
  fs.writeFileSync(path.join(outputDir, 'style.css'), styleCSS);
  
  // 复制静态资源
  const assetsPath = path.join(sourcePath, 'assets');
  if (fs.existsSync(assetsPath)) {
    const outputAssetsPath = path.join(outputDir, 'assets');
    
    // 复制图片
    const imagesPath = path.join(assetsPath, 'images');
    if (fs.existsSync(imagesPath)) {
      const imageCount = copyDirectory(imagesPath, path.join(outputAssetsPath, 'images'));
      if (imageCount > 0) {
        log(`  ✓ 复制了 ${imageCount} 个图片文件`, 'info');
      }
    }
    
    // 复制本地字体
    const localFonts = fonts.filter(f => !f.isCDN);
    if (localFonts.length > 0) {
      const fontsPath = path.join(assetsPath, 'fonts');
      if (fs.existsSync(fontsPath)) {
        const fontCount = copyDirectory(fontsPath, path.join(outputAssetsPath, 'fonts'));
        log(`  ✓ 复制了 ${fontCount} 个字体文件`, 'info');
      }
    }
    
    // 统计 CDN 字体
    const cdnFonts = fonts.filter(f => f.isCDN);
    if (cdnFonts.length > 0) {
      log(`  ✓ 保留了 ${cdnFonts.length} 个 CDN 字体链接`, 'info');
    }
  }
  
  // 复制参考文件（如果存在）
  const filesToCopy = ['screenshot.png', 'content.md', 'theme.json'];
  filesToCopy.forEach(filename => {
    const srcFile = path.join(sourcePath, filename);
    if (fs.existsSync(srcFile)) {
      const destFile = path.join(outputDir, filename);
      fs.copyFileSync(srcFile, destFile);
      log(`  ✓ 复制了 ${filename}`, 'info');
    }
  });
  
  log(`页面转换完成: ${pageSlug}`, 'info');
}

/**
 * 检测项目类型（仅支持 Chrome 扩展导出）
 */
function detectProjectType(sourcePath) {
  const items = fs.readdirSync(sourcePath);
  
  // 检查是否为 Chrome 扩展导出格式（有 index.html）
  if (items.includes('index.html')) {
    return { type: 'chrome-export', pages: [{ name: 'index', path: sourcePath }] };
  }
  
  throw new Error('未找到 index.html 文件，请确认这是 Chrome 扩展导出的项目');
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Chrome 扩展导出转换器

使用方法:
  node scripts/chrome-export-converter.mjs <source-dir> [output-name] [display-name]
  node scripts/chrome-export-converter.mjs <source-dir> --name <output-name> --display-name <display-name>

参数说明:
  source-dir   : Chrome 扩展导出的目录（包含 index.html）
  output-name  : 输出页面名称（可选，默认使用目录名）
  display-name : 页面显示名（可选，写入 index.tsx 的 @name）

示例:
  node scripts/chrome-export-converter.mjs ".drafts/my-export" my-page
  node scripts/chrome-export-converter.mjs ".drafts/my-export" my-page "登录页"
    `);
    process.exit(0);
  }

  const flags = {};
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--name' || token === '--display-name') {
      const next = args[i + 1];
      if (typeof next === 'string' && next) {
        flags[token] = next;
        i += 1;
      } else {
        flags[token] = '';
      }
      continue;
    }
    positionals.push(token);
  }

  const sourceDirArg = positionals[0];
  const outputNameRaw = flags['--name'] || positionals[1] || path.basename(sourceDirArg);
  const outputName = String(outputNameRaw)
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const displayNameRaw = flags['--display-name'] ?? positionals[2];
  const displayName = (displayNameRaw !== undefined ? String(displayNameRaw).trim() : '') || outputName;
  if (displayNameRaw !== undefined) {
    const trimmedDisplayName = String(displayNameRaw).trim();
    if (!trimmedDisplayName || trimmedDisplayName.length > 200) {
      throw new Error('displayName 长度必须在 1-200 字符');
    }
  }

  const sourcePath = path.resolve(CONFIG.projectRoot, sourceDirArg);
  const outputDir = path.join(CONFIG.pagesDir, outputName);
  
  if (!fs.existsSync(sourcePath)) {
    log(`错误: 找不到目录 ${sourcePath}`, 'error');
    process.exit(1);
  }
  
  try {
    log('开始转换 Chrome 扩展导出...', 'info');
    
    const { type, pages } = detectProjectType(sourcePath);
    log(`项目类型: ${type}`, 'info');
    
    convertPage(pages[0].path, outputDir, outputName, displayName);
    log('✅ 转换完成！', 'info');
    log(`📁 页面位置: ${outputDir}`, 'info');
    
  } catch (error) {
    log(`转换失败: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

main();
