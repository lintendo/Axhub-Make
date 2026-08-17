import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillName = 'generate-data-cockpit-prototype';
const agentsRoot = path.join(clientRoot, '.agents/skills', skillName);
const claudeRoot = path.join(clientRoot, '.claude/skills', skillName);
const relativeFiles = [
  'SKILL.md',
  'agents/openai.yaml',
  'references/industry-scenes.md',
  'references/style-alignment.md',
  'references/visual-routing.md',
  'references/subagent-handoffs.md',
  'scripts/validate-visual-audit.mjs',
];

function read(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function listRelativeFiles(root: string, relativeDirectory = ''): string[] {
  return fs
    .readdirSync(path.join(root, relativeDirectory), { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      return entry.isDirectory() ? listRelativeFiles(root, relativePath) : [relativePath];
    })
    .sort();
}

function readUint24LE(bytes: Buffer, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readWebPDimensions(bytes: Buffer): { width: number; height: number } {
  for (let chunkOffset = 12; chunkOffset + 8 <= bytes.length;) {
    const chunkType = bytes.subarray(chunkOffset, chunkOffset + 4).toString('ascii');
    const chunkSize = bytes.readUInt32LE(chunkOffset + 4);
    const dataOffset = chunkOffset + 8;

    if (chunkType === 'VP8 ') {
      return {
        width: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }
    if (chunkType === 'VP8L') {
      const packed = bytes.readUInt32LE(dataOffset + 1);
      return {
        width: (packed & 0x3fff) + 1,
        height: ((packed >>> 14) & 0x3fff) + 1,
      };
    }
    if (chunkType === 'VP8X') {
      return {
        width: readUint24LE(bytes, dataOffset + 4) + 1,
        height: readUint24LE(bytes, dataOffset + 7) + 1,
      };
    }

    chunkOffset = dataOffset + chunkSize + (chunkSize % 2);
  }

  throw new Error('WebP image chunk not found');
}

describe('generate-data-cockpit-prototype skill', () => {
  it('keeps the unfinished source mirrored but excludes it from the client template', () => {
    expect(listRelativeFiles(agentsRoot)).toEqual(listRelativeFiles(claudeRoot));

    const templateManifest = JSON.parse(
      fs.readFileSync(path.join(clientRoot, 'template-manifest.json'), 'utf8'),
    );
    const excludedPaths = (templateManifest.runtime.fileRules || [])
      .filter(({ action }: { action?: string }) => action === 'exclude')
      .map(({ pattern }: { pattern: string }) => new RegExp(pattern, 'u'));

    for (const skillRoot of ['.agents', '.claude']) {
      expect(
        excludedPaths.some((pattern: RegExp) => pattern.test(`${skillRoot}/skills/${skillName}/SKILL.md`)),
      ).toBe(true);
    }
    expect(
      templateManifest.resources.files.some((relativePath: string) => (
        relativePath.startsWith('src/resources/data-visualization-style-reference/')
      )),
    ).toBe(false);
  });

  it('keeps matching source packages with a narrow trigger', () => {
    for (const relativePath of relativeFiles) {
      expect(fs.existsSync(path.join(agentsRoot, relativePath)), `${relativePath} missing in .agents`).toBe(true);
      expect(fs.existsSync(path.join(claudeRoot, relativePath)), `${relativePath} missing in .claude`).toBe(true);
      expect(read(claudeRoot, relativePath)).toBe(read(agentsRoot, relativePath));
    }

    const skill = read(agentsRoot, 'SKILL.md');
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
    const frontmatterKeys = frontmatter
      .split('\n')
      .map((line) => line.match(/^([a-z][a-z0-9_-]*):/u)?.[1])
      .filter(Boolean);

    expect(frontmatterKeys).toEqual(['name', 'description']);
    expect(frontmatter).toContain(`name: ${skillName}`);
    expect(frontmatter).toContain('description: Use when');
    for (const trigger of ['驾驶舱', '指挥中心', '数据可视化大屏', '数字孪生', `$${skillName}`]) {
      expect(frontmatter).toContain(trigger);
    }

    const metadata = read(agentsRoot, 'agents/openai.yaml');
    expect(metadata).toContain('display_name: "生成数据驾驶舱原型"');
    expect(metadata).toContain(`$${skillName}`);
  });

  it.skip('uses the built-in style library instead of the default DESIGN.md flow', () => {
    const skill = read(agentsRoot, 'SKILL.md');
    const styleAlignment = read(agentsRoot, 'references/style-alignment.md');

    expect(skill).not.toContain('rules/requirements-alignment-guide.md');
    expect(skill).not.toContain('rules/prototype-development-guide.md');
    expect(skill).not.toContain('## 使用边界');
    expect(skill).not.toContain('用户已经提供本地截图且只要还原时，直接使用 `screenshot-to-prototype`');
    expect(skill).toContain('数据大屏相关任务始终先由本 Skill 判断入口');
    expect(skill).toContain('完整目标大屏截图');
    expect(skill).toContain('跳过本阶段和候选图生成');
    expect(skill).toContain('直接冻结为选中图片');
    expect(skill).toContain('ui-image-generation');
    expect(skill).toContain('explore-options');
    expect(skill).toContain('先展示文字方案');
    expect(skill).toContain('默认 3 套');
    expect(skill).toContain('等待用户明确确认');
    expect(skill).toContain('确认前不得调用 `ui-image-generation`');
    expect(skill).toContain('只为用户确认的方向生成图片');
    expect(skill).toContain('每个确认方向默认生成 1 张');
    expect(skill).toContain('需求对齐只用于生成图片提示词');
    expect(skill).toContain('明确例外');
    expect(skill).toContain('跳过 `DESIGN.md`');
    expect(skill).toContain('[style-alignment.md](references/style-alignment.md)');
    expect(skill).not.toContain('用户确认一个现有 `DESIGN.md`');
    expect(skill).toContain('不使用前期需求纠正选中图片');
    expect(skill).toContain('图片冻结前不创建或更新主规格');
    expect(skill).toContain('不创建需求 Brief');
    expect(skill).not.toContain('generation-brief.json');
    expect(skill).not.toContain('cockpit-brief.json');

    for (const required of [
      '用户参考图',
      '用户明确的布局、风格和主题色',
      '内置 8 套风格',
      '推荐 3 套',
      '主要板块与布局',
      '中央载体',
      '主题色',
      '主要取舍',
      '完整提示词',
    ]) {
      expect(styleAlignment).toContain(required);
    }
    const stylePromptRelativePath =
      '../../../../src/resources/data-visualization-style-reference/visualization-style-prompts.md';
    expect(styleAlignment).toContain(stylePromptRelativePath);
    expect(fs.existsSync(path.resolve(agentsRoot, 'references', stylePromptRelativePath))).toBe(true);
    expect(styleAlignment).toContain('不静默回退到 `DESIGN.md`');
    expect(styleAlignment).toContain('八套风格只用于候选图提示词');
    expect(styleAlignment).toContain('后续还原不再按风格案例分类素材');
    expect(styleAlignment).toContain('先展示 3 套文字方案');
    expect(styleAlignment).toContain('原样嵌入权威资料中的 Markdown 参考图链接');
    expect(styleAlignment).toContain('不得只写文件名或文字说明');
    expect(styleAlignment).toContain('不展开未选方案的完整提示词');
    expect(styleAlignment).toContain('禁止一次性读取全文');
    expect(styleAlignment).toContain('只读取“风格总览”');
    expect(styleAlignment).toContain('只读取已确认风格的“完整提示词”段落');
    expect(styleAlignment).toContain('确认前禁止生成图片');
    expect(styleAlignment).toContain('明确指定单一参考图、布局、风格或主题色方向');
    expect(styleAlignment).toContain('没有指定单一方向或数量时，仍默认提供 3 套');
    expect(styleAlignment).not.toContain('不增加一次只选择风格的中间门槛');

    const planIndex = skill.indexOf('### 2. 对比并确认文字方案');
    const imageIndex = skill.indexOf('### 3. 生成候选图片');
    const selectionIndex = skill.indexOf('### 4. 冻结选中图片');
    const specIndex = skill.indexOf('### 5. 由规格子代理实际实现主规格');
    const reactIndex = skill.indexOf('### 6. 由实现子代理制作 React 原型');
    expect(planIndex).toBeGreaterThan(-1);
    expect(imageIndex).toBeGreaterThan(planIndex);
    expect(selectionIndex).toBeGreaterThan(-1);
    expect(selectionIndex).toBeGreaterThan(imageIndex);
    expect(specIndex).toBeGreaterThan(selectionIndex);
    expect(reactIndex).toBeGreaterThan(specIndex);
  });

  it('treats the selected image as the reconstruction source and isolates phase agents', () => {
    const skill = read(agentsRoot, 'SKILL.md');
    const handoffs = read(agentsRoot, 'references/subagent-handoffs.md');
    const routing = read(agentsRoot, 'references/visual-routing.md');
    const combined = `${skill}\n${handoffs}\n${routing}`;

    expect(skill).toContain('选中图片是所有可见视觉事实的唯一还原标准');
    expect(skill).toContain('.spec/reference/selected-source.png');
    expect(skill).toContain('记录尺寸和 SHA-256');
    expect(skill).toContain('不使用前期需求纠正选中图片');
    expect(skill).toContain('图片无法表达且仍有效的非视觉运行约束');
    expect(combined).toContain('已确认非视觉运行约束');
    expect(skill).toContain('规格子代理');
    expect(skill).toContain('实现子代理');
    expect(skill).toContain('验收子代理');
    expect(skill).toContain('不同的干净子代理');
    expect(combined).toContain('fork_turns: "none"');
    expect(handoffs).toContain('无子代理环境');
    expect(handoffs).toContain('新开对话');
    expect(skill).toContain('screenshot-to-prototype');
    expect(skill).toContain('用户明确确认当前 HTML 主规格后');
    expect(skill).toContain('提供完整 Make 服务规格评审链接并结束当前回合');

    expect(handoffs).toContain('不传递原始对话');
    expect(handoffs).toContain('不传递前期需求对齐内容');
    expect(handoffs).toContain('选中图片本地路径');
    expect(handoffs).toContain('client 根目录');
    expect(handoffs).toContain('projectId');
    expect(handoffs).toContain('prototypeId');
    expect(handoffs).toContain('原型绝对目录');
    expect(handoffs).toContain('?projectId=<project-id>&p=<prototype-id>&spec=1');
    expect(handoffs).toContain('确认后的 `.spec/spec.html`');
    expect(handoffs).toContain('旧规格中的目标画面视觉内容失效');
    expect(handoffs).toContain('本 Skill 的主文档 `SKILL.md`');
    expect(handoffs).not.toContain('本 Skill 的全部引用文档');
    expect(handoffs).not.toContain('industry-scenes.md');
    expect(handoffs).not.toContain('style-alignment.md');
    expect(handoffs).toContain('与 `screenshot-to-prototype` 重叠时，以本 Skill 为准');
    expect(handoffs).toContain('完整执行 `screenshot-to-prototype`');
    for (const reconstructionArtifact of [
      'prepare-reconstruction-source.mjs',
      'elements.json',
      'reconstruction-manifest.json',
      'first-pass.html',
      '脚本直出、尚未 AI 评审',
      '不得等待用户确认',
      'AI 对比评审',
      'preview_capture',
      'asset-audit.json',
      'visual-audit.json',
      'final-acceptance.json',
    ]) {
      expect(handoffs).toContain(reconstructionArtifact);
    }
    expect(handoffs).toContain('覆盖 `elements.json` 中全部可见元素');
    expect(handoffs).toContain('HTML/CSS、SVG、地图、3D、图片和媒体');
    expect(handoffs).toContain('不能因为不是位图或 `assetAction: none` 就排除');
    expect(handoffs).toContain('两者职责不同，不得混用');
    expect(routing).toContain('中央主视觉存在时，其验证记录不得为 0');
    expect(handoffs).toContain('逐元素对比');
    expect(handoffs).toContain('核心视觉');
    expect(handoffs).toContain('中等或高偏差');
    expect(handoffs).toContain('不得交付');
    expect(handoffs).toContain('推迟到 React');
    expect(handoffs).toContain('不能标记为 `passed-with-known-deviations`');
    expect(handoffs).toContain('validate-visual-audit.mjs');
    expect(handoffs).toContain('--visual-audit');
    expect(handoffs).toContain('--acceptance');
    expect(handoffs).toContain('.agents/skills/generate-data-cockpit-prototype/scripts/validate-visual-audit.mjs');
    expect(handoffs).toContain('`selectedRoute`');
    expect(handoffs).toContain('`implementedRoute`');
    expect(handoffs).toContain('真实、可解码且含可见内容的 PNG');
    expect(handoffs).toContain('核心视觉证据不得是单色');
    expect(handoffs).toContain('尺寸与 bbox 完全一致');
    expect(handoffs).toContain('退出码为 0');
    expect(skill).toContain('按 [subagent-handoffs.md]');
    expect(skill).not.toContain('本 Skill 的全部引用文档');
    expect(handoffs).toContain('相同 viewport');
    expect(combined).toContain('用户最新明确修改');

    const specStage = skill.slice(skill.indexOf('### 5.'), skill.indexOf('### 6.'));
    const reactStage = skill.slice(skill.indexOf('### 6.'), skill.indexOf('### 7.'));
    expect(specStage).toContain('[visual-routing.md](references/visual-routing.md)');
    expect(specStage).toContain('严格执行 `screenshot-to-prototype`');
    expect(specStage).toContain('实际实现');
    expect(reactStage).not.toContain('[visual-routing.md](references/visual-routing.md)');
    expect(reactStage).toContain('不重新选择视觉风格、素材方案或技术路线');
    expect(specStage).toContain('正式技术路线');
    expect(specStage).toContain('不得留到 React');
  });

  it('fails closed on incomplete visual evidence and unresolved core deviations before spec delivery', async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-visual-audit-'));
    const validatorPath = path.join(agentsRoot, 'scripts/validate-visual-audit.mjs');
    const elementsPath = path.join(temporaryRoot, 'elements.json');
    const auditPath = path.join(temporaryRoot, 'visual-audit.json');
    const reviewPath = path.join(temporaryRoot, 'ai-review.json');
    const acceptancePath = path.join(temporaryRoot, 'final-acceptance.json');
    const evidenceRoot = path.join(temporaryRoot, 'evidence');
    const sourceEvidencePath = path.join(evidenceRoot, 'central-map-source.png');
    const renderedEvidencePath = path.join(evidenceRoot, 'central-map-rendered.png');
    const decorationSourcePath = path.join(evidenceRoot, 'minor-decoration-source.png');
    const decorationRenderedPath = path.join(evidenceRoot, 'minor-decoration-rendered.png');
    const runValidator = () => spawnSync(
      process.execPath,
      [
        validatorPath,
        '--elements', elementsPath,
        '--visual-audit', auditPath,
        '--review', reviewPath,
        '--acceptance', acceptancePath,
      ],
      { encoding: 'utf8' },
    );
    const writeJson = (filePath: string, value: unknown) => fs.writeFileSync(filePath, JSON.stringify(value));

    try {
      fs.mkdirSync(evidenceRoot);
      const writeEvidence = (filePath: string, width: number, height: number, start: string, end: string) => sharp(Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
      )).png().toFile(filePath);
      await Promise.all([
        writeEvidence(sourceEvidencePath, 800, 600, '#123456', '#456789'),
        writeEvidence(renderedEvidencePath, 800, 600, '#123457', '#456780'),
        writeEvidence(decorationSourcePath, 20, 20, '#abcdef', '#345678'),
        writeEvidence(decorationRenderedPath, 20, 20, '#abcdee', '#345679'),
      ]);
      writeJson(
        elementsPath,
        {
          elements: [
            {
              id: 'central-map',
              kind: 'map',
              uiRole: '中央主视觉',
              representation: 'svg',
              sourceBBox: { x: 0, y: 0, width: 800, height: 600 },
              targetBBox: { x: 0, y: 0, width: 800, height: 600 },
              assetReview: { assetAction: 'none' },
            },
            {
              id: 'minor-decoration',
              kind: 'decoration',
              uiRole: '角部装饰',
              representation: 'css',
              sourceBBox: { x: 810, y: 0, width: 20, height: 20 },
              targetBBox: { x: 810, y: 0, width: 20, height: 20 },
              assetReview: { assetAction: 'none' },
            },
          ],
        },
      );
      writeJson(
        auditPath,
        { schemaVersion: 1, status: 'passed', summary: { total: 0, passed: 0, failed: 0 }, elements: [] },
      );
      writeJson(
        reviewPath,
        {
          decision: 'passed-with-known-deviations',
          findings: [{
            elementId: 'central-map',
            severity: 'high',
            area: 'map',
            finding: '行政轮廓和源图有偏差',
          }],
        },
      );
      writeJson(acceptancePath, { status: 'passed-with-known-deviations', knownDeviations: [] });

      const failed = runValidator();

      expect(failed.status).not.toBe(0);
      expect(`${failed.stdout}\n${failed.stderr}`).toContain('central-map');
      expect(`${failed.stdout}\n${failed.stderr}`).toContain('unresolved high');
      expect(`${failed.stdout}\n${failed.stderr}`).toContain('passed-with-known-deviations');

      writeJson(
        auditPath,
        {
          schemaVersion: 1,
          status: 'passed',
          summary: { total: 2, passed: 2, failed: 0 },
          elements: [
            {
              elementId: 'central-map', implementation: 'GeoJSON + ECharts', component: 'ChinaPowerMap',
              sourceEvidence: 'evidence/central-map-source.png', renderedEvidence: 'evidence/central-map-rendered.png',
              sourceRegion: { x: 0, y: 0, width: 800, height: 600 },
              renderedRegion: { x: 0, y: 0, width: 800, height: 600 },
              selectedRoute: 'geojson-echarts', implementedRoute: 'geojson-echarts', implementationType: 'map-runtime',
              status: 'passed', fidelity: 'high', deviation: 'low', routeStatus: 'implemented', deferredStage: null,
            },
            {
              elementId: 'minor-decoration', implementation: 'CSS', component: 'CornerDecoration',
              sourceEvidence: 'evidence/minor-decoration-source.png', renderedEvidence: 'evidence/minor-decoration-rendered.png',
              sourceRegion: { x: 810, y: 0, width: 20, height: 20 },
              renderedRegion: { x: 810, y: 0, width: 20, height: 20 },
              selectedRoute: 'css', implementedRoute: 'css', implementationType: 'css',
              status: 'passed', fidelity: 'acceptable', deviation: 'medium', routeStatus: 'implemented', deferredStage: null,
            },
          ],
        },
      );
      writeJson(
        reviewPath,
        {
          decision: 'passed',
          findings: [{ elementId: 'minor-decoration', severity: 'medium', area: 'decoration', resolved: false }],
        },
      );
      writeJson(acceptancePath, {
        status: 'passed',
        knownDeviations: [{ elementId: 'minor-decoration', severity: 'medium', detail: '装饰光晕略弱' }],
      });

      const passed = runValidator();

      expect(passed.status).toBe(0);
      expect(passed.stdout).toContain('Visual audit valid');

      writeJson(auditPath, {
        schemaVersion: 1,
        status: 'passed',
        summary: { total: 2, passed: 2, failed: 0 },
        elements: [
          {
            elementId: 'central-map', implementation: '近似 SVG 占位', component: 'ChinaPowerMap',
            sourceEvidence: 'evidence/missing.png', renderedEvidence: 'evidence/central-map-rendered.png',
            sourceRegion: { x: 0, y: 0, width: 800, height: 600 }, renderedRegion: { x: 0, y: 0, width: 800, height: 600 },
            selectedRoute: 'geojson-echarts', implementedRoute: 'approximate-svg', implementationType: 'placeholder',
            status: 'passed', fidelity: 'placeholder', deviation: 'low', routeStatus: 'deferred', deferredStage: 'react',
          },
          {
            elementId: 'minor-decoration', implementation: 'CSS', component: 'CornerDecoration',
            sourceEvidence: 'evidence/minor-decoration-source.png', renderedEvidence: 'evidence/minor-decoration-rendered.png',
            sourceRegion: { x: 810, y: 0, width: 20, height: 20 }, renderedRegion: { x: 810, y: 0, width: 20, height: 20 },
            selectedRoute: 'css', implementedRoute: 'css', implementationType: 'css',
            status: 'passed', fidelity: 'acceptable', deviation: 'low', routeStatus: 'implemented', deferredStage: null,
          },
        ],
      });
      writeJson(reviewPath, {});
      const failClosed = runValidator();
      expect(failClosed.status).not.toBe(0);
      expect(`${failClosed.stdout}\n${failClosed.stderr}`).toContain('evidence file does not exist');
      expect(`${failClosed.stdout}\n${failClosed.stderr}`).toContain('fidelity placeholder');
      expect(`${failClosed.stdout}\n${failClosed.stderr}`).toContain('implemented route must match selected route');
      expect(`${failClosed.stdout}\n${failClosed.stderr}`).toContain('implementationType placeholder is not deliverable');
      expect(`${failClosed.stdout}\n${failClosed.stderr}`).toContain('route must be implemented in the HTML spec');
      expect(`${failClosed.stdout}\n${failClosed.stderr}`).toContain('review decision must be passed');

      writeJson(elementsPath, { elements: [] });
      writeJson(auditPath, { schemaVersion: 1, status: 'passed', summary: { total: 0, passed: 0, failed: 0 }, elements: [] });
      writeJson(reviewPath, { decision: 'passed', findings: [] });
      writeJson(acceptancePath, { status: 'passed', knownDeviations: [] });
      const empty = runValidator();
      expect(empty.status).not.toBe(0);
      expect(`${empty.stdout}\n${empty.stderr}`).toContain('elements must be a non-empty array');

      writeJson(elementsPath, {
        elements: [{
          id: 'core-analysis', kind: 'scene', uiRole: '核心分析区域', representation: 'svg',
          sourceBBox: { x: 0, y: 0, width: 800, height: 600 }, targetBBox: { x: 0, y: 0, width: 800, height: 600 },
          assetReview: { assetAction: 'none' },
        }],
      });
      writeJson(auditPath, {
        schemaVersion: 1, status: 'passed', summary: { total: 1, passed: 1, failed: 0 },
        elements: [{
          elementId: 'core-analysis', implementation: 'SVG map', component: 'CoreAnalysis',
          selectedRoute: 'approximate-svg', implementedRoute: 'approximate-svg', implementationType: 'approximate-svg',
          sourceEvidence: 'evidence/central-map-source.png', renderedEvidence: 'evidence/central-map-rendered.png',
          sourceRegion: { x: 0, y: 0, width: 4, height: 4 }, renderedRegion: { x: 0, y: 0, width: 4, height: 4 },
          status: 'passed', fidelity: 'acceptable', deviation: 'high', routeStatus: 'implemented', deferredStage: null,
        }],
      });
      writeJson(reviewPath, { decision: 'passed', findings: [] });
      writeJson(acceptancePath, { status: 'passed', knownDeviations: [] });
      const disguisedApproximation = runValidator();
      expect(disguisedApproximation.status).not.toBe(0);
      expect(`${disguisedApproximation.stdout}\n${disguisedApproximation.stderr}`).toContain('evidence regions must match');
      expect(`${disguisedApproximation.stdout}\n${disguisedApproximation.stderr}`).toContain('approximate-svg is not deliverable');
      expect(`${disguisedApproximation.stdout}\n${disguisedApproximation.stderr}`).toContain('unresolved high core deviation');

      await Promise.all([
        sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0 } } }).png().toFile(sourceEvidencePath),
        sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 4, g: 5, b: 6, alpha: 0 } } }).png().toFile(renderedEvidencePath),
      ]);
      writeJson(auditPath, {
        schemaVersion: 1, status: 'passed', summary: { total: 1, passed: 1, failed: 0 },
        elements: [{
          elementId: 'core-analysis', implementation: 'SVG map', component: 'CoreAnalysis',
          selectedRoute: 'svg', implementedRoute: 'svg', implementationType: 'svg',
          sourceEvidence: 'evidence/central-map-source.png', renderedEvidence: 'evidence/central-map-rendered.png',
          sourceRegion: { x: 0, y: 0, width: 800, height: 600 }, renderedRegion: { x: 0, y: 0, width: 800, height: 600 },
          status: 'passed', fidelity: 'acceptable', deviation: 'low', routeStatus: 'implemented', deferredStage: null,
        }],
      });
      const transparentEvidence = runValidator();
      expect(transparentEvidence.status).not.toBe(0);
      expect(`${transparentEvidence.stdout}\n${transparentEvidence.stderr}`).toContain('evidence is blank or single-color');
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('routes industry scenes, charts, maps, 3D assets and animation without baking data into images', () => {
    const industry = read(agentsRoot, 'references/industry-scenes.md');
    const routing = read(agentsRoot, 'references/visual-routing.md');

    for (const field of ['目标角色', '核心任务', '常见主题', '推荐主 VI', '常见指标', '数据来源', '数据时效', '告警体系', '地图需求', '3D 适用度', '常见交互', '素材需求', '风险项']) {
      expect(industry).toContain(field);
    }
    for (const scene of ['电力与新能源', '制造业', '城市治理', '交通运输', '物流与仓储', '产业园与楼宇', '通信与数据中心', '水利、环保、气象', '航空航天与低空经济']) {
      expect(industry).toContain(scene);
    }
    expect(industry).toContain('只用于需求对齐和提示词设计');
    expect(industry).toContain('不落盘');

    expect(routing).toContain('ECharts');
    expect(routing).toContain('不把图表烘焙为图片');
    expect(routing).toContain('共享 CSS/SVG 框架组件');
    expect(routing).toContain('GeoJSON');
    expect(routing).toContain('Three.js');
    expect(routing).toContain('AntV L7');
    expect(routing).toContain('高德');
    expect(routing).toContain('MapLibre');
    expect(routing).toContain('deck.gl');
    expect(routing).toContain('GLTF');
    expect(routing).toContain('img2threejs');
    expect(routing).toContain('能力可用时');
    expect(routing).toContain('@react-three/fiber@8');
    expect(routing).toContain('GSAP');
    expect(routing).toContain('不是默认依赖');
    expect(routing).toContain('多角度参考图');
    expect(routing).toContain('不得降级为背景图');
    expect(routing).toContain('用户确认');

    for (const commonElement of [
      '场景基底',
      '中央主视觉',
      'UI 框架',
      '数据内容',
      '标注与状态',
      '装饰与特效',
      '图标与媒体',
    ]) {
      expect(routing).toContain(commonElement);
    }
    for (const frameworkType of [
      '大屏主标题框架',
      '模块标题框架',
      '面板框架',
      '图表框架',
      '指标框架',
      '表格与列表框架',
      '主视觉框架',
    ]) {
      expect(routing).toContain(frameworkType);
    }
    expect(routing).toContain('框架承担信息分区、层级或内容承载');
    expect(routing).toContain('图表框架不包含真实图表');
    expect(routing).toContain('视觉元素实现清单');
    expect(routing).toContain('视觉元素验证');
    expect(routing).toContain('每一个可见元素');
    expect(routing).toContain('`asset-audit.json` 保留给截图还原流程审计位图候选');
    expect(routing).toContain('`visual-audit.json`');
    expect(routing).toContain('`assetAction` 是否为 `none`');
    expect(routing).toContain('最终产物路径或组件');
    expect(routing).toContain('真实存在的源图区域和最终渲染证据图片');
    expect(routing).toContain('中央主视觉');
    expect(routing).toContain('验证记录不得为 0');
    expect(routing).toContain('地图轮廓、省界、地形层次、点位和线路');
    expect(routing).toContain('HTML 主规格阶段');
    expect(routing).toContain('不得用近似 SVG 占位');
    expect(routing).toContain('不记录素材来源');
    expect(routing).toContain('最终实现方式');
    expect(routing).not.toContain('源文件或数据源');
    expect(routing).not.toContain('负责人');
    expect(routing).not.toContain('素材对照表');
    expect(routing).not.toContain('模型来源顺序');
    expect(routing).not.toContain('用户提供或项目已有');
    expect(routing).not.toContain('合法模型库');
    expect(routing).not.toContain('电影科幻 FUI');
    expect(routing).not.toContain('八套风格');
  });

  it.skip('ships eight compressed 4K WebP style references within the package budget', () => {
    const styleRoot = path.join(clientRoot, 'src/resources/data-visualization-style-reference');
    const stylePrompts = fs.readFileSync(path.join(styleRoot, 'visualization-style-prompts.md'), 'utf8');
    const fourKRoot = path.join(styleRoot, 'assets/4k');
    const fourKFiles = fs.readdirSync(fourKRoot).filter((name) => !name.startsWith('.')).sort();
    const expectedWebPFiles = [
      '01-cinematic-fui-4k.webp',
      '02-holographic-lattice-4k.webp',
      '03-enterprise-blue-ioc-4k.webp',
      '04-photoreal-digital-twin-4k.webp',
      '05-bright-natural-gis-4k.webp',
      '06-new-chinese-oriental-4k.webp',
      '07-minimal-glass-saas-4k.webp',
      '08-data-decision-bi-4k.webp',
    ];

    expect(fourKFiles).toEqual(expectedWebPFiles);
    for (const fileName of expectedWebPFiles) {
      const bytes = fs.readFileSync(path.join(fourKRoot, fileName));
      expect(bytes.subarray(0, 4).toString('ascii'), `${fileName} RIFF header`).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii'), `${fileName} WebP header`).toBe('WEBP');
      expect(readWebPDimensions(bytes), `${fileName} dimensions`).toEqual({
        width: 3840,
        height: 2160,
      });
      expect(stylePrompts).toContain(`assets%2F4k%2F${fileName}`);
    }

    expect(stylePrompts).not.toContain('-4k.png');
    expect(fs.existsSync(path.join(styleRoot, '.DS_Store'))).toBe(false);
    expect(fs.existsSync(path.join(styleRoot, 'assets/.DS_Store'))).toBe(false);

    const totalBytes = expectedWebPFiles.reduce(
      (total, fileName) => total + fs.statSync(path.join(fourKRoot, fileName)).size,
      0,
    );
    expect(totalBytes).toBeLessThanOrEqual(16 * 1024 * 1024);

    const templateManifest = JSON.parse(
      fs.readFileSync(path.join(clientRoot, 'template-manifest.json'), 'utf8'),
    );
    const publishedResources = new Set<string>(templateManifest.resources.files);
    const styleResourcePrefix = 'src/resources/data-visualization-style-reference';
    for (const relativePath of listRelativeFiles(styleRoot)) {
      expect(
        publishedResources.has(`${styleResourcePrefix}/${relativePath}`),
        `${relativePath} missing from client template package`,
      ).toBe(true);
    }
  });
});
