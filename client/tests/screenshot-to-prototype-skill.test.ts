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
  'agents/openai.yaml',
  'references/prompts.md',
  'scripts/build-reconstruction-manifest.mjs',
  'scripts/compile-reconstruction-tailwind.mjs',
  'scripts/key-transparent-image.mjs',
  'scripts/prepare-reconstruction-source.mjs',
  'scripts/probe-key-color.mjs',
  'scripts/png-utils.mjs',
  'scripts/remove-background-rembg.mjs',
  'scripts/render-reconstruction-review.mjs',
  'scripts/slice-alpha-components.mjs',
  'scripts/request-vision.mjs',
  'scripts/normalize-text-regions.mjs',
  'scripts/mask-layer-recall.mjs',
  'scripts/finalize-layer-recall.mjs',
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
  it('keeps the main workflow concise and returns first-pass HTML before automatic review', () => {
    const skillSource = readSkillFile(agentSkillRoot, 'SKILL.md');
    const wordCount = skillSource.trim().split(/\s+/u).length;
    expect(wordCount).toBeLessThanOrEqual(320);
    expect(skillSource).toContain('具体字段和素材分流见 `references/prompts.md`');

    const firstPassIndex = skillSource.indexOf('首版生成后立即返回可访问链接');
    const continueIndex = skillSource.indexOf('不得结束当前任务，也不得等待用户确认');
    const autoReviewIndex = skillSource.indexOf('随后自动进入 AI 评审');
    const finalSpecIndex = skillSource.indexOf('最终回复提供 HTML 主规格链接');
    expect(firstPassIndex).toBeGreaterThan(-1);
    expect(continueIndex).toBeGreaterThan(firstPassIndex);
    expect(autoReviewIndex).toBeGreaterThan(continueIndex);
    expect(finalSpecIndex).toBeGreaterThan(autoReviewIndex);
    expect(skillSource).toContain('使用 `?projectId=<id>&docPath=<编码后的项目相对路径>`');
    expect(skillSource).toContain('使用 `?projectId=<id>&p=<slug>&spec=1`');
  });

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
    const openAiPrompt = readSkillFile(agentSkillRoot, 'agents/openai.yaml');
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
    expect(openAiPrompt).toContain('脚本生成首版 HTML 后立即给我链接');
    expect(openAiPrompt).toContain('在同一任务中自动继续视觉评审');
    expect(openAiPrompt).toContain('等我明确确认后再转换为当前 client 的 React 可运行原型');
    expect(frontmatter).not.toMatch(/URL cloning|theme extraction|general UI image generation|ordinary prototype creation/iu);
    expect(frontmatter).not.toMatch(/截图或本地图片|转换为|做网页|生成图片|提取主题|参考 URL/u);
    expect(frontmatter).not.toMatch(/还原.*复刻|复刻.*还原|截图或本地图片/u);

    expect(skillSource).toContain('源图本地路径');
    expect(skillSource).toContain('不能只用文字描述');
    expect(skillSource).toContain('`ui-image-generation`');
    expect(skillSource).toContain('src/prototypes/<slug>/.spec/spec.html');
    expect(skillSource).toContain('src/prototypes/<slug>/assets/');
    expect(skillSource).toContain('.local/screenshot-to-prototype/<slug>/');
    expect(skillSource).toContain('reconstruction-manifest.json');
    expect(skillSource).toContain('render-reconstruction-review.mjs');
    expect(skillSource).toContain('request-vision.mjs');
    expect(skillSource).toContain('normalize-text-regions.mjs');
    expect(skillSource).toContain('mask-layer-recall.mjs');
    expect(skillSource).toContain('finalize-layer-recall.mjs');
    expect(skillSource).toContain('含状态栏');
    expect(promptsSource).toContain('（含状态栏）');
    expect(promptsSource).toContain('第二轮不得提交 OCR');
    expect(skillSource).toContain('OCR 是可选增强');
    expect(promptsSource).toContain('text-regions.json');
    expect(promptsSource).toContain('`ocr`、`vision-api` 或 `current-agent`');
    expect(promptsSource).toContain('不能进入其他素材框或其他文字框');
    expect(skillSource).toContain('preview_capture');
    expect(skillSource).toContain('源图 viewport 下的 1:1 尺寸');
    expect(skillSource).toContain('只有用户明确确认最终 HTML 主规格后');
    expect(skillSource).toContain('不使用 CDN，不加载 preflight');
    expect(readSkillFile(agentSkillRoot, 'scripts/render-reconstruction-review.mjs')).toContain('[--generation-artifacts <json>]');

    expect(promptsSource).toContain('## UI 元素分流');
    expect(promptsSource).toContain('## 文字角色与素材审核');
    expect(promptsSource).toContain('brand-text');
    expect(promptsSource).toContain('display-text');
    expect(promptsSource).toContain('decorative-text');
    expect(promptsSource).toContain('preserve-in-image');
    expect(promptsSource).toContain('semantic-only');
    expect(promptsSource).toContain('## 完整候选素材矩阵');
    expect(promptsSource).toContain('preserve');
    expect(promptsSource).toContain('existing-alpha');
    expect(promptsSource).toContain('known-key');
    expect(promptsSource).toContain('complex-remove');
    expect(promptsSource).toContain('不得二选一');
    expect(promptsSource).toContain('两种候选都进入主规格');
    expect(skillSource).not.toContain('birefnet-general');
    expect(skillSource).not.toContain('generated-chroma');
    expect(skillSource).not.toContain('candidate-manifest.json');
    expect(combinedMarkdown).not.toContain('flatten-in-page');
    expect(combinedMarkdown).not.toMatch(/\bHard rule\b|\bInput:\b|\bPrompt:\b|\bWorkflow\b|\bAsset Naming\b|\bIcon Strategy\b/u);
    expect(combinedMarkdown).not.toMatch(/\/Users\/|[A-Za-z]:\\|apps\/axhub-make|Axhub Runtime|Mac|macOS/u);
    expect(combinedSkillFiles).not.toMatch(/asset-manifest\.json|comparison\.html|visual-comparison-template|build-visual-comparison|compare-reconstruction|pixelmatch|diff\.png|comparison-metrics|SnapDiff|FigEdit/iu);
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
