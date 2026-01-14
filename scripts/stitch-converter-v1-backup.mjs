#!/usr/bin/env node

/**
 * =====================================================
 * Stitch 转换器 V2 - 通用版本
 * 
 * 设计理念：
 * 1. 完整保留原始 HTML 的 head 内容（scripts、links、styles）
 * 2. 通过 useEffect 动态注入到页面，确保所有配置生效
 * 3. 不尝试解析或转换复杂的配置，保持最大兼容性
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
 * 提取完整的 head 内容（保留所有 scripts、links、styles）
 */
function extractHeadContent(html) {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return { scripts: [], links: [], styles: [] };
  
  const headContent = headMatch[1];
  const scripts = [];
  const links = [];
  const styles = [];
  
  // 提取所有 script 标签（不包括外部 CDN）
  const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(headContent)) !== null) {
    const attrs = match[1];
    const content = match[2].trim();
    
    // 只保留内联脚本（配置类）
    if (!attrs.includes('src=') && content) {
      const id = attrs.match(/id=["']([^"']+)["']/)?.[1];
      scripts.push({ id, content });
    }
  }
  
  // 提取所有 link 标签
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
  
  // 提取所有 style 标签
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((match = styleRegex.exec(headContent)) !== null) {
    const content = match[1].trim();
    if (content) {
      styles.push(content);
    }
  }
  
  return { scripts, links, styles };
}

/**
 * 提取并转换 body 内容
 */
function extractBodyContent(html) {
  const bodyMatch = html.match(/(<body[^>]*>)([\s\S]*)(<\/body>)/i);
  if (!bodyMatch) return '';
  
  const [, openTag, innerContent, closeTag] = bodyMatch;
  
  let convertedOpenTag = openTag
    .replace(/(\s)class=/g, '$1className=')
    .replace(/(\s)for=/g, '$1htmlFor=');
  
  let content = innerContent.trim()
    .replace(/<!--([\s\S]*?)-->/g, '{/* $1 */}')
    .replace(/(\s)class=/g, '$1className=')
    .replace(/(<pre[^>]*>)([\s\S]*?)(<\/pre>)/gi, (match, openTag, preContent, closeTag) => {
      const escapedContent = preContent
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$')
        .replace(/\{/g, '\\{');
      return `${openTag.slice(0, -1)} dangerouslySetInnerHTML={{ __html: \`${escapedContent}\` }} />`;
    })
    .replace(/(\s)for=/g, '$1htmlFor=')
    .replace(/style='([^']*)'/g, (match, styleStr) => convertStyleToJSX(styleStr))
    .replace(/style="([^"]*)"/g, (match, styleStr) => convertStyleToJSX(styleStr));
  
  return convertedOpenTag + '\n' + content + '\n    </body>';
}

function convertStyleToJSX(styleStr) {
  if (!styleStr.trim()) return 'style={{}}';
  
  const styles = [];
  let currentProp = '';
  let inUrl = false;
  
  for (let i = 0; i < styleStr.length; i++) {
    const char = styleStr[i];
    if (char === '(' && styleStr.substring(i - 3, i) === 'url') inUrl = true;
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
        jsxValue = `'${value.replace(/'/g, "\\'")}'`;
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
function generateComponent(pageName, bodyContent, headContent) {
  const componentName = pageName
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  
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
  
  if (headContent.links.length > 0 || headContent.scripts.length > 0 || headContent.styles.length > 0) {
    injectionCode = `
  // 动态注入原始 head 内容（保持完整兼容性）
  React.useEffect(function () {
    const injected: (HTMLElement)[] = [];
    
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
    
    // 注入 scripts
    ${JSON.stringify(headContent.scripts)}.forEach(function (scriptInfo: any) {
      if (scriptInfo.id && document.getElementById(scriptInfo.id)) return;
      const script = document.createElement('script');
      if (scriptInfo.id) script.id = scriptInfo.id;
      script.textContent = scriptInfo.content;
      document.head.appendChild(script);
      injected.push(script);
    });
    
    // 注入 styles
    ${JSON.stringify(headContent.styles)}.forEach(function (styleContent: string) {
      const style = document.createElement('style');
      style.textContent = styleContent;
      document.head.appendChild(style);
      injected.push(style);
    });
    
    return function () {
      injected.forEach(function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    };
  }, []);
`;
  }
  
  return `/**
 * @name ${pageName}
 * 
 * 参考资料：
 * - /rules/development-standards.md
 * - /assets/libraries/tailwind-css.md
 */

import './style.css';
import React, { forwardRef, useImperativeHandle } from 'react';
import type { AxhubProps, AxhubHandle } from '../../common/axhub-types';

const Component = forwardRef<AxhubHandle, AxhubProps>(function ${componentName}(innerProps, ref) {
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
  return (
${finalContent.split('\n').map(line => '    ' + line).join('\n')}
  );
});

export default Component;
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

function generateStyleCSS(headContent) {
  return `@import "tailwindcss";\n\n/* 所有原始样式和配置已通过 useEffect 动态注入 */\n`;
}

/**
 * 转换单个页面
 */
function convertPage(pagePath, outputDir, pageName) {
  log(`正在转换页面: ${pageName}`, 'progress');
  
  const htmlPath = path.join(pagePath, 'code.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  
  const headContent = extractHeadContent(html);
  const bodyContent = extractBodyContent(html);
  
  ensureDir(outputDir);
  
  const componentCode = generateComponent(pageName, bodyContent, headContent);
  const styleCSS = generateStyleCSS(headContent);
  
  fs.writeFileSync(path.join(outputDir, 'index.tsx'), componentCode);
  fs.writeFileSync(path.join(outputDir, 'style.css'), styleCSS);
  
  log(`页面转换完成: ${pageName}`, 'info');
}

/**
 * 检测项目类型
 */
function detectProjectType(stitchDir) {
  const items = fs.readdirSync(stitchDir);
  
  if (items.includes('code.html')) {
    return { type: 'single', pages: [{ name: 'index', path: stitchDir }] };
  }
  
  const pages = [];
  for (const item of items) {
    const itemPath = path.join(stitchDir, item);
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory() && fs.existsSync(path.join(itemPath, 'code.html'))) {
      pages.push({ name: item, path: itemPath });
    }
  }
  
  if (pages.length > 0) return { type: 'multi', pages };
  throw new Error('未找到有效的 Stitch 项目结构');
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log(`
使用方法:
  node scripts/stitch-converter-v2.mjs <stitch-dir> [output-name]

示例:
  node scripts/stitch-converter-v2.mjs ".drafts/stitch_project" my-page
    `);
    process.exit(0);
  }
  
  const stitchDirArg = args[0];
  const outputName = args[1] || path.basename(stitchDirArg)
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  
  const stitchDir = path.resolve(CONFIG.projectRoot, stitchDirArg);
  const outputDir = path.join(CONFIG.pagesDir, outputName);
  
  if (!fs.existsSync(stitchDir)) {
    log(`错误: 找不到目录 ${stitchDir}`, 'error');
    process.exit(1);
  }
  
  try {
    log('开始转换 Stitch 项目...', 'info');
    
    const { type, pages } = detectProjectType(stitchDir);
    log(`项目类型: ${type === 'single' ? '单页面' : '多页面'}`, 'info');
    
    if (type === 'single') {
      convertPage(pages[0].path, outputDir, outputName);
    } else {
      for (const page of pages) {
        const pageFolderName = page.name.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
        const pageOutputDir = path.join(outputDir, pageFolderName);
        convertPage(page.path, pageOutputDir, page.name);
      }
    }
    
    log('✅ 转换完成！', 'info');
    log(`📁 页面位置: ${outputDir}`, 'info');
    
  } catch (error) {
    log(`转换失败: ${error.message}`, 'error');
    process.exit(1);
  }
}

main();
