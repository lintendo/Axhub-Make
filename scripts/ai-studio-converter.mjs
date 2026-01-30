#!/usr/bin/env node

/**
 * AI Studio 项目预处理器（最小化处理模式）
 * 
 * 只做 100% 有把握的操作：
 * 1. 完整复制项目
 * 2. 分析项目结构
 * 3. 生成任务文档
 * 
 * 不做任何代码修改，全部留给 AI 处理
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG = {
  projectRoot: path.resolve(__dirname, '..'),
  pagesDir: path.resolve(__dirname, '../src/pages'),
  tempDir: path.resolve(__dirname, '../temp')
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

// 递归查找所有 .tsx/.ts 文件
function findFiles(dir, extensions = ['.tsx', '.ts']) {
  const results = [];
  
  if (!fs.existsSync(dir)) return results;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // 跳过 node_modules
      if (entry.name === 'node_modules') continue;
      results.push(...findFiles(fullPath, extensions));
    } else {
      const ext = path.extname(entry.name);
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  
  return results;
}

function copyDirectory(src, dest) {
  if (!fs.existsSync(src)) return 0;
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      count += copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

console.log('AI Studio Converter - Minimal Processing Mode\n');

function analyzeProject(pageDir) {
  const analysis = {
    files: [],
    components: [],
    dependencies: {},
    structure: {},
    indexHtml: null,
    viteConfig: null
  };
  
  // 查找所有 TypeScript 文件
  const files = findFiles(pageDir, ['.tsx', '.ts']);
  
  files.forEach(file => {
    const relativePath = path.relative(pageDir, file);
    const content = fs.readFileSync(file, 'utf8');
    const fileName = path.basename(file);
    
    const fileInfo = {
      path: relativePath,
      isAppTsx: fileName === 'App.tsx',
      isIndexTsx: fileName === 'index.tsx',
      imports: []
    };
    
    // 提取 import 语句
    const importMatches = content.matchAll(/import\s+.*from\s+['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
      fileInfo.imports.push(match[1]);
    }
    
    analysis.files.push(fileInfo);
    
    // 识别组件文件
    if (relativePath.startsWith('components/')) {
      analysis.components.push(relativePath);
    }
  });
  
  // 分析 index.html
  const indexHtmlPath = path.join(pageDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
    
    // 提取 Import Map
    const importMapMatch = htmlContent.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    const importMap = importMapMatch ? JSON.parse(importMapMatch[1]) : null;
    
    // 提取自定义样式
    const styleMatches = htmlContent.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g);
    const customStyles = Array.from(styleMatches).map(m => m[1].trim());
    
    // 提取外部字体
    const fontMatches = htmlContent.matchAll(/<link[^>]*href=["']([^"']*fonts\.googleapis\.com[^"']*)["'][^>]*>/g);
    const fonts = Array.from(fontMatches).map(m => m[1]);
    
    analysis.indexHtml = {
      importMap,
      customStyles,
      fonts,
      hasTailwindCDN: htmlContent.includes('cdn.tailwindcss.com')
    };
  }
  
  // 分析 vite.config.ts
  const viteConfigPath = path.join(pageDir, 'vite.config.ts');
  if (fs.existsSync(viteConfigPath)) {
    const viteContent = fs.readFileSync(viteConfigPath, 'utf8');
    
    // 提取路径别名
    const aliasMatch = viteContent.match(/alias:\s*{([^}]*)}/);
    const aliases = aliasMatch ? aliasMatch[1].trim() : null;
    
    // 提取环境变量定义
    const defineMatch = viteContent.match(/define:\s*{([^}]*)}/);
    const envVars = defineMatch ? defineMatch[1].trim() : null;
    
    analysis.viteConfig = {
      hasAlias: !!aliases,
      aliases,
      hasEnvVars: !!envVars,
      envVars
    };
  }
  
  // 分析 package.json
  const packageJsonPath = path.join(pageDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const deps = packageJson.dependencies || {};
    analysis.dependencies = {
      all: deps,
      toInstall: Object.keys(deps).filter(dep => {
        if (dep === 'react' || dep === 'react-dom') return false;
        return true;
      }),
      excluded: ['react', 'react-dom']
    };
  } else if (analysis.indexHtml?.importMap) {
    // 从 Import Map 提取依赖
    const imports = analysis.indexHtml.importMap.imports || {};
    const cdnDeps = Object.keys(imports).filter(dep => {
      if (dep === 'react' || dep === 'react-dom') return false;
      return true;
    });
    
    analysis.dependencies = {
      fromCDN: cdnDeps,
      toInstall: cdnDeps,
      excluded: ['react', 'react-dom']
    };
  }
  
  // 分析项目结构
  analysis.structure = {
    hasAppTsx: fs.existsSync(path.join(pageDir, 'App.tsx')),
    hasIndexTsx: fs.existsSync(path.join(pageDir, 'index.tsx')),
    hasIndexHtml: fs.existsSync(path.join(pageDir, 'index.html')),
    hasComponentsDir: fs.existsSync(path.join(pageDir, 'components')),
    hasAssetsDir: fs.existsSync(path.join(pageDir, 'assets')),
    hasConstantsTs: fs.existsSync(path.join(pageDir, 'constants.ts')),
    hasTypesTs: fs.existsSync(path.join(pageDir, 'types.ts')),
    hasViteConfig: fs.existsSync(path.join(pageDir, 'vite.config.ts')),
    hasMetadataJson: fs.existsSync(path.join(pageDir, 'metadata.json'))
  };
  
  return analysis;
}

function generateTasksDocument(analysis, outputDir, pageName, tempDir) {
  const report = {
    summary: {
      totalFiles: analysis.files.length,
      componentCount: analysis.components.length,
      dependenciesToInstall: analysis.dependencies.toInstall?.length || 0,
      hasImportMap: !!analysis.indexHtml?.importMap,
      hasCustomStyles: (analysis.indexHtml?.customStyles?.length || 0) > 0,
      hasFonts: (analysis.indexHtml?.fonts?.length || 0) > 0
    },
    structure: analysis.structure,
    components: analysis.components,
    dependencies: analysis.dependencies,
    indexHtml: analysis.indexHtml,
    viteConfig: analysis.viteConfig,
    files: analysis.files
  };
  
  const reportPath = path.join(outputDir, '.ai-studio-analysis.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  let markdown = `# AI Studio 项目转换任务清单\n\n`;
  markdown += `> **重要**: 请先阅读 \`/rules/ai-studio-project-converter.md\` 了解转换规范\n\n`;
  markdown += `**页面名称**: ${pageName}\n`;
  markdown += `**项目位置**: \`src/pages/${pageName}/\`\n`;
  markdown += `**原始文件**: \`${tempDir}\` (仅供参考，不要修改)\n`;
  markdown += `**生成时间**: ${new Date().toLocaleString()}\n\n`;
  
  markdown += `## 📊 项目概况\n\n`;
  markdown += `- 总文件数: ${report.summary.totalFiles}\n`;
  markdown += `- 组件数: ${report.summary.componentCount}\n`;
  markdown += `- Import Map: ${report.summary.hasImportMap ? '✓ 存在' : '✗ 不存在'}\n`;
  markdown += `- 自定义样式: ${report.summary.hasCustomStyles ? '✓ 存在' : '✗ 不存在'}\n`;
  markdown += `- 外部字体: ${report.summary.hasFonts ? '✓ 存在' : '✗ 不存在'}\n`;
  markdown += `- 需要安装的依赖: ${report.summary.dependenciesToInstall} 个\n\n`;
  
  markdown += `## ✅ 转换任务（共 5 个）\n\n`;
  
  markdown += `### 任务 1: 转换主应用组件\n\n`;
  markdown += `**目标**: 将 \`App.tsx\` 转换为本项目组件规范\n\n`;
  if (report.structure.hasAppTsx) {
    markdown += `**参考文件**: \`src/pages/${pageName}/App.tsx\`\n\n`;
    markdown += `**操作**:\n`;
    markdown += `1. 重命名 \`App.tsx\` 为 \`index.tsx\`\n`;
    markdown += `2. 按照 \`/rules/ai-studio-project-converter.md\` 中的本项目组件规范改造\n`;
    markdown += `3. 添加文件头部注释（\`@name\` 和参考资料）\n`;
    markdown += `4. 使用 \`forwardRef<AxureHandle, AxureProps>\` 包装\n`;
    markdown += `5. 实现 \`useImperativeHandle\`\n`;
    markdown += `6. 保持原有的 JSX、Hooks 和 Tailwind 类名不变\n\n`;
  } else {
    markdown += `⚠️ 未找到 \`App.tsx\`，请手动创建 \`index.tsx\`\n\n`;
  }
  
  markdown += `### 任务 2: 创建 style.css\n\n`;
  markdown += `**目标**: 提取 index.html 中的样式信息\n\n`;
  if (report.indexHtml) {
    markdown += `**操作**:\n`;
    markdown += `1. 创建 \`style.css\`，开头添加 \`@import "tailwindcss";\`\n`;
    
    if (report.indexHtml.customStyles.length > 0) {
      markdown += `2. 从 \`index.html\` 的 \`<style>\` 标签提取自定义样式\n`;
      markdown += `3. 将提取的样式添加到 \`style.css\`\n`;
    }
    
    if (report.indexHtml.fonts.length > 0) {
      markdown += `4. 添加外部字体引用:\n`;
      report.indexHtml.fonts.forEach(font => {
        markdown += `   \`@import url('${font}');\`\n`;
      });
    }
    markdown += `\n`;
  } else {
    markdown += `**操作**: 创建基础样式文件，内容为 \`@import "tailwindcss";\`\n\n`;
  }
  
  markdown += `### 任务 3: 移除 AI Studio 特定文件\n\n`;
  markdown += `**目标**: 删除不需要的文件\n\n`;
  markdown += `**需要删除**:\n`;
  if (report.structure.hasIndexHtml) {
    markdown += `- ✓ \`index.html\` (已提取信息)\n`;
  }
  if (report.structure.hasIndexTsx) {
    markdown += `- ✓ \`index.tsx\` (本项目有自己的入口)\n`;
  }
  if (report.structure.hasViteConfig) {
    markdown += `- ⚠️ \`vite.config.ts\` (检查路径别名后可删除)\n`;
  }
  if (report.structure.hasMetadataJson) {
    markdown += `- ⚠️ \`metadata.json\` (可选保留作为参考)\n`;
  }
  markdown += `\n`;
  
  markdown += `### 任务 4: 安装依赖\n\n`;
  if (report.dependencies.toInstall && report.dependencies.toInstall.length > 0) {
    markdown += `**执行命令**:\n`;
    markdown += `\`\`\`bash\n`;
    markdown += `pnpm add ${report.dependencies.toInstall.join(' ')}\n`;
    markdown += `\`\`\`\n\n`;
    
    if (report.dependencies.fromCDN) {
      markdown += `**CDN 依赖映射**:\n`;
      report.dependencies.fromCDN.forEach(dep => {
        markdown += `- \`${dep}\` (从 Import Map 识别)\n`;
      });
      markdown += `\n`;
    }
  } else {
    markdown += `✓ 无需安装额外依赖\n\n`;
  }
  
  if (report.viteConfig?.hasEnvVars) {
    markdown += `**环境变量**:\n`;
    markdown += `⚠️ 项目使用了环境变量，需要配置 \`.env.local\`\n`;
    markdown += `\`\`\`\n${report.viteConfig.envVars}\n\`\`\`\n\n`;
  }
  
  markdown += `### 任务 5: 验收测试\n\n`;
  markdown += `**执行命令**:\n`;
  markdown += `\`\`\`bash\n`;
  markdown += `node scripts/check-app-ready.mjs /pages/${pageName}\n`;
  markdown += `\`\`\`\n\n`;
  markdown += `**验收标准**: 状态为 READY，页面正常渲染，无控制台错误\n\n`;
  
  markdown += `## 📚 参考资料\n\n`;
  markdown += `- **转换规范**: \`/rules/ai-studio-project-converter.md\`\n`;
  markdown += `- **原始项目**: \`${tempDir}\` (仅供参考)\n`;
  markdown += `- **详细数据**: \`.ai-studio-analysis.json\`\n\n`;
  
  markdown += `## 💡 注意事项\n\n`;
  markdown += `1. **Import Map**: CDN 依赖需转换为 npm 包\n`;
  markdown += `2. **自定义样式**: 从 index.html 提取到 style.css\n`;
  markdown += `3. **路径别名**: 检查 vite.config.ts 中的 alias 配置\n`;
  markdown += `4. **环境变量**: \`process.env.*\` 需改为 \`import.meta.env.VITE_*\`\n`;
  markdown += `5. **原始文件**: \`${tempDir}\` 目录保留作为参考，不要修改\n`;
  markdown += `6. **验证**: 完成后务必运行验收脚本确认\n`;
  
  const mdPath = path.join(outputDir, '.ai-studio-tasks.md');
  fs.writeFileSync(mdPath, markdown);
  
  return { reportPath, mdPath };
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log(`
AI Studio 项目预处理器

使用方法:
  node scripts/ai-studio-converter.mjs <ai-studio-project-dir> [output-name]

示例:
  node scripts/ai-studio-converter.mjs "temp/my-ai-studio-project" my-page

功能:
  - 完整复制 AI Studio 项目（不修改代码）
  - 生成 AI 工作文档 (.ai-studio-tasks.md)
  - 生成分析报告 (.ai-studio-analysis.json)
    `);
    process.exit(0);
  }
  
  const aiStudioDirArg = args[0];
  const outputName = args[1] || path.basename(aiStudioDirArg)
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  
  const aiStudioDir = path.resolve(CONFIG.projectRoot, aiStudioDirArg);
  const outputDir = path.join(CONFIG.pagesDir, outputName);
  
  if (!fs.existsSync(aiStudioDir)) {
    log(`错误: 找不到目录 ${aiStudioDir}`, 'error');
    process.exit(1);
  }
  
  const appTsx = path.join(aiStudioDir, 'App.tsx');
  const indexHtml = path.join(aiStudioDir, 'index.html');
  if (!fs.existsSync(appTsx) && !fs.existsSync(indexHtml)) {
    log('错误: 这不是一个有效的 AI Studio 项目（缺少 App.tsx 或 index.html）', 'error');
    process.exit(1);
  }
  
  try {
    log('开始预处理 AI Studio 项目...', 'info');
    
    log('步骤 1/4: 复制项目文件...', 'progress');
    const fileCount = copyDirectory(aiStudioDir, outputDir);
    log(`已复制 ${fileCount} 个文件`, 'info');
    
    log('步骤 2/4: 复制 assets 到页面根目录...', 'progress');
    const assetsDir = path.join(aiStudioDir, 'assets');
    const pageAssetsDir = path.join(outputDir, 'assets');
    let assetCount = 0;
    if (fs.existsSync(assetsDir)) {
      assetCount = copyDirectory(assetsDir, pageAssetsDir);
      log(`已复制 ${assetCount} 个资源文件到 src/pages/${outputName}/assets/`, 'info');
    } else {
      log('未找到 assets 目录，跳过', 'info');
    }
    
    log('步骤 3/4: 分析项目结构...', 'progress');
    const analysis = analyzeProject(outputDir);
    log(`发现 ${analysis.components.length} 个组件`, 'info');
    
    log('步骤 4/4: 生成任务文档...', 'progress');
    const { reportPath, mdPath } = generateTasksDocument(analysis, outputDir, outputName, `temp/${path.basename(aiStudioDir)}`);
    
    log('✅ 预处理完成！', 'info');
    log('', 'info');
    log(`📁 页面位置: src/pages/${outputName}/`, 'info');
    log(`📋 AI 工作文档: ${path.relative(CONFIG.projectRoot, mdPath)}`, 'info');
    log(`📊 详细数据: ${path.relative(CONFIG.projectRoot, reportPath)}`, 'info');
    log('', 'info');
    log('📈 统计:', 'info');
    log(`  - 文件数: ${analysis.files.length}`, 'info');
    log(`  - 组件数: ${analysis.components.length}`, 'info');
    log(`  - 依赖: ${analysis.dependencies.toInstall?.length || 0} 个`, 'info');
    log('', 'info');
    log('🎯 下一步:', 'info');
    log(`1. 查看任务文档: cat ${path.relative(CONFIG.projectRoot, mdPath)}`, 'info');
    log('2. 让 AI 根据任务清单完成转换', 'info');
    
  } catch (error) {
    log(`预处理失败: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

main();
