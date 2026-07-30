import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import zlib from 'node:zlib';

import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..');
const agentSkillRoot = path.join(appRoot, '.agents/skills/screenshot-to-prototype');
const claudeSkillRoot = path.join(appRoot, '.claude/skills/screenshot-to-prototype');
const skillRelativeFiles = [
  'SKILL.md',
  'references/prompts.md',
  'scripts/build-reconstruction-manifest.mjs',
  'scripts/compile-reconstruction-tailwind.mjs',
  'scripts/key-transparent-image.mjs',
  'scripts/prepare-reconstruction-source.mjs',
  'scripts/probe-key-color.mjs',
  'scripts/png-utils.mjs',
  'scripts/slice-alpha-components.mjs',
  'scripts/slice-asset-sheet.mjs',
  'scripts/audit-assets.mjs',
  'scripts/validate-reconstruction-manifest.mjs',
];
const removedWorkflowFiles = [
  'assets/visual-comparison-template.html',
  'scripts/build-visual-comparison.mjs',
  'scripts/compare-reconstruction.mjs',
];

function readSkillFile(root: string, relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function writeRgbaPng(filePath: string, width: number, height: number, pixels: Uint8Array) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    scanlines[rowStart] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(scanlines, rowStart + 1);
  }

  fs.writeFileSync(filePath, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function createFixtureSheet(filePath: string) {
  const width = 16;
  const height = 8;
  const pixels = new Uint8Array(width * height * 4);

  function setPixel(x: number, y: number, rgba: [number, number, number, number]) {
    const offset = (y * width + x) * 4;
    pixels[offset] = rgba[0];
    pixels[offset + 1] = rgba[1];
    pixels[offset + 2] = rgba[2];
    pixels[offset + 3] = rgba[3];
  }

  for (let y = 2; y <= 5; y += 1) {
    for (let x = 2; x <= 5; x += 1) {
      setPixel(x, y, [220, 40, 40, 255]);
    }
  }
  for (let y = 1; y <= 6; y += 1) {
    for (let x = 11; x <= 14; x += 1) {
      setPixel(x, y, [40, 120, 220, 255]);
    }
  }

  writeRgbaPng(filePath, width, height, pixels);
}

describe('screenshot-to-prototype skill', () => {
  it('ships matching default skills for agent harnesses with narrow triggers and relative paths', () => {
    for (const relativePath of skillRelativeFiles) {
      expect(fs.existsSync(path.join(agentSkillRoot, relativePath)), `${relativePath} missing in .agents`).toBe(true);
      expect(fs.existsSync(path.join(claudeSkillRoot, relativePath)), `${relativePath} missing in .claude`).toBe(true);
      expect(readSkillFile(agentSkillRoot, relativePath)).toBe(readSkillFile(claudeSkillRoot, relativePath));
    }
    for (const relativePath of removedWorkflowFiles) {
      expect(fs.existsSync(path.join(agentSkillRoot, relativePath)), `${relativePath} should not remain in .agents`).toBe(false);
      expect(fs.existsSync(path.join(claudeSkillRoot, relativePath)), `${relativePath} should not remain in .claude`).toBe(false);
    }

    const skillSource = readSkillFile(agentSkillRoot, 'SKILL.md');
    const promptsSource = readSkillFile(agentSkillRoot, 'references/prompts.md');
    const combinedMarkdown = `${skillSource}\n${promptsSource}`;
    const combinedSkillFiles = skillRelativeFiles.map((relativePath) => readSkillFile(agentSkillRoot, relativePath)).join('\n');
    const frontmatterMatch = skillSource.match(/^---\n([\s\S]*?)\n---/u);
    expect(frontmatterMatch).not.toBeNull();
    const frontmatter = frontmatterMatch?.[1] || '';

    expect(frontmatter).toContain('name: screenshot-to-prototype');
    expect(frontmatter).toContain('$screenshot-to-prototype');
    expect(frontmatter).toContain('Use only when 用户明确要求把本地截图、设计稿或高保真界面图还原成 Axhub Make client 可运行原型');
    expect(frontmatter).toContain('仅提供图片作为素材、参考图、需求图或风格上下文时不要使用');
    expect(frontmatter).not.toMatch(/URL cloning|theme extraction|general UI image generation|ordinary prototype creation/iu);
    expect(frontmatter).not.toMatch(/截图或本地图片|转换为|做网页|生成图片|提取主题|参考 URL/u);
    expect(frontmatter).not.toMatch(/还原.*复刻|复刻.*还原|截图或本地图片/u);

    expect(combinedMarkdown).toContain('源图本地路径');
    expect(combinedMarkdown).toContain('所有素材提取、修复、高清化、设计分析都必须把用户本地图片路径作为参考图传入');
    expect(combinedMarkdown).toContain('不能只用文字描述生成素材');
    expect(skillSource).toContain('需要生成、编辑或派生位图素材时，使用 `ui-image-generation`');
    expect(skillSource).toContain('工具选择、配置读取和回退规则全部遵循该技能');
    expect(combinedMarkdown).not.toMatch(/系统 `imagegen`|内部图片生成 MCP|Agent 图片配置|生成通道/u);
    expect(combinedMarkdown).toContain('由图片 AI 判断具体提取对象');
    expect(combinedMarkdown).toContain('只说明筛选规则');
    expect(combinedMarkdown).not.toContain('AGENTS.md');
    expect(combinedMarkdown).toContain('src/prototypes/<slug>/assets/');
    expect(combinedMarkdown).toContain('.local/screenshot-to-prototype/<slug>/');
    expect(combinedMarkdown).toContain('reconstruction-manifest.json');
    expect(combinedMarkdown).toContain('data-page-target');
    expect(combinedMarkdown).toContain('data-spec-page');
    expect(combinedMarkdown).toContain('不要修改通用规格模板');
    expect(combinedMarkdown).toContain('先完成固定 viewport 下的 1:1 绝对定位视觉稿');
    expect(combinedMarkdown).toContain('preview_capture');
    expect(combinedMarkdown).toContain('.spec/reconstruction/visual-check/');
    expect(combinedMarkdown).toContain('原图与真实运行截图左右并排');
    expect(skillSource).toContain('素材评审区逐项使用相同预览框左右展示候选与最终真实内容');
    expect(skillSource).toContain('透明素材使用棋盘格背景');
    expect(skillSource).toContain('图片、SVG 和组件都必须实际渲染');
    expect(skillSource).toContain('不得只提供文字、文件名或路径');
    expect(combinedMarkdown).toContain('完整原型时无需等待额外确认');
    expect(combinedMarkdown).toContain('clean-crop');
    expect(combinedMarkdown).toContain('generated-refined');
    expect(combinedMarkdown).toContain('generated-chroma');
    expect(combinedMarkdown).toContain('不加载 Tailwind preflight');
    expect(combinedMarkdown).toContain('不使用 Tailwind CDN');
    expect(skillSource).toContain('先按 UI 职责分流，再按视觉复杂度');
    expect(skillSource).toContain('文本、按钮、输入框、导航、卡片、列表和表格');
    expect(skillSource).toContain('图标、Logo、进度和简单图表');
    expect(skillSource).toContain('照片、头像、商品图、插画、纹理和页面内嵌截图');
    expect(skillSource).toContain('`flatten-in-page` 只用于第一阶段视觉稿');
    expect(combinedMarkdown).toContain('按 bbox 单独裁切');
    expect(combinedMarkdown).toContain('多个独立装饰位图');
    expect(combinedMarkdown).toContain('键色透明化只在');
    expect(combinedMarkdown).toContain('不生成 UI 文案、控件、通用图标或数据内容');
    expect(combinedMarkdown).toContain('目标 bbox 和 DPR');
    expect(promptsSource).toContain('## UI 元素分流');
    expect(promptsSource).toContain('## 批量候选素材（条件触发）');
    expect(promptsSource).not.toContain('## Banner/封面高清化');
    expect(combinedMarkdown).toContain('轻量偏差说明');
    expect(combinedMarkdown).toContain('HTML/CSS 难快速稳定还原');
    expect(combinedMarkdown).toContain('中文');
    expect(promptsSource).not.toContain('such as icons, logos, avatars');
    expect(combinedMarkdown).toContain('交互状态');
    expect(combinedMarkdown).toContain('SVG');
    expect(combinedMarkdown).not.toMatch(/\bHard rule\b|\bInput:\b|\bPrompt:\b|\bWorkflow\b|\bAsset Naming\b|\bIcon Strategy\b/u);
    expect(combinedMarkdown).not.toMatch(/\/Users\/|[A-Za-z]:\\|apps\/axhub-make|Axhub Runtime|Mac|macOS/u);
    expect(skillSource).toContain('## 适用范围');
    expect(skillSource).not.toContain('## 退出规则');
    expect(skillSource).not.toContain('必须停止');
    expect(combinedSkillFiles).not.toMatch(/asset-manifest\.json|comparison\.html|visual-comparison-template|build-visual-comparison|compare-reconstruction|reviewStatus|needs-review|\bapproved\b|pixelmatch|diff\.png|comparison-metrics|SnapDiff|FigEdit/iu);
    expect(combinedMarkdown).not.toMatch(/Source \/ Render \/ Overlay \/ Diff|\bDiff\b|diff\.png|comparison-metrics|pixelmatch/iu);

    const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    expect(packageJson.devDependencies.pixelmatch).toBeUndefined();
  });

  it('cuts transparent asset sheets and audits the generated manifest', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-to-prototype-skill-'));
    const inputPath = path.join(tempDir, 'sheet.png');
    const outputDir = path.join(tempDir, 'assets');
    const manifestPath = path.join(outputDir, 'candidate-manifest.json');
    createFixtureSheet(inputPath);

    execFileSync(process.execPath, [
      path.join(agentSkillRoot, 'scripts/slice-asset-sheet.mjs'),
      '--input',
      inputPath,
      '--output-dir',
      outputDir,
      '--grid',
      '2x1',
      '--names',
      'icon-alert,banner-hero',
      '--manifest',
      manifestPath,
    ], { cwd: appRoot, encoding: 'utf8' });

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.source).toBe(path.relative(outputDir, inputPath));
    expect(manifest.assets).toHaveLength(2);
    expect(manifest.assets.map((asset: { file: string }) => asset.file)).toEqual([
      'icon-alert.png',
      'banner-hero.png',
    ]);
    expect(manifest.assets[0]).toMatchObject({
      id: 'icon-alert',
      sourceCell: { column: 0, row: 0 },
      width: 6,
      height: 6,
    });
    expect(manifest.assets[1]).toMatchObject({
      id: 'banner-hero',
      sourceCell: { column: 1, row: 0 },
      width: 6,
      height: 8,
    });
    expect(fs.existsSync(path.join(outputDir, 'icon-alert.png'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'banner-hero.png'))).toBe(true);

    const auditOutput = execFileSync(process.execPath, [
      path.join(agentSkillRoot, 'scripts/audit-assets.mjs'),
      '--manifest',
      manifestPath,
    ], { cwd: appRoot, encoding: 'utf8' });
    const audit = JSON.parse(auditOutput);
    expect(audit.status).toBe('passed');
    expect(audit.assets).toHaveLength(2);
    expect(audit.summary.failed).toBe(0);
  });

  it('flags empty and edge-touching assets during audit', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-to-prototype-audit-'));
    const outputDir = path.join(tempDir, 'assets');
    fs.mkdirSync(outputDir, { recursive: true });

    const emptyPixels = new Uint8Array(4 * 4 * 4);
    writeRgbaPng(path.join(outputDir, 'empty.png'), 4, 4, emptyPixels);

    const edgePixels = new Uint8Array(4 * 4 * 4);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const offset = (y * 4 + x) * 4;
        edgePixels[offset] = 24;
        edgePixels[offset + 1] = 24;
        edgePixels[offset + 2] = 24;
        edgePixels[offset + 3] = 255;
      }
    }
    writeRgbaPng(path.join(outputDir, 'edge.png'), 4, 4, edgePixels);

    const manifestPath = path.join(outputDir, 'candidate-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      schemaVersion: 1,
      source: '../../sheet.png',
      assets: [
        { id: 'empty', file: 'empty.png', width: 4, height: 4 },
        { id: 'edge', file: 'edge.png', width: 4, height: 4 },
      ],
    }, null, 2));

    const auditProcess = spawnSync(process.execPath, [
      path.join(agentSkillRoot, 'scripts/audit-assets.mjs'),
      '--manifest',
      manifestPath,
    ], { cwd: appRoot, encoding: 'utf8' });
    expect(auditProcess.status).toBe(1);

    const audit = JSON.parse(auditProcess.stdout);
    expect(audit.status).toBe('failed');
    expect(audit.summary.failed).toBe(2);
    expect(audit.assets.find((asset: { id: string }) => asset.id === 'empty')?.issues).toContain('empty-transparent-image');
    expect(audit.assets.find((asset: { id: string }) => asset.id === 'edge')?.issues).toEqual(
      expect.arrayContaining(['alpha-touches-edge', 'opaque-corners']),
    );
  });
});
