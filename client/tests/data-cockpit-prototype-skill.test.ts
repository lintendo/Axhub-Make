import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  it('ships matching skill packages with a narrow trigger', () => {
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

  it('uses the built-in style library instead of the default DESIGN.md flow', () => {
    const skill = read(agentsRoot, 'SKILL.md');
    const styleAlignment = read(agentsRoot, 'references/style-alignment.md');

    expect(skill).not.toContain('rules/requirements-alignment-guide.md');
    expect(skill).not.toContain('rules/prototype-development-guide.md');
    expect(skill).not.toContain('## 使用边界');
    expect(skill).not.toContain('用户已经提供本地截图且只要还原时，直接使用 `screenshot-to-prototype`');
    expect(skill).toContain('数据大屏相关任务始终先由本 Skill 判断入口');
    expect(skill).toContain('完整目标大屏截图');
    expect(skill).toContain('跳过候选图生成');
    expect(skill).toContain('直接冻结为选中图片');
    expect(skill).toContain('ui-image-generation');
    expect(skill).toContain('explore-options');
    expect(skill).toContain('用户指定数量');
    expect(skill).toContain('没有指定时默认 3 张');
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

    const selectionIndex = skill.indexOf('### 3. 冻结选中图片');
    const specIndex = skill.indexOf('### 4. 由规格子代理实际实现主规格');
    const reactIndex = skill.indexOf('### 5. 由实现子代理制作 React 原型');
    expect(selectionIndex).toBeGreaterThan(-1);
    expect(specIndex).toBeGreaterThan(selectionIndex);
    expect(reactIndex).toBeGreaterThan(specIndex);
  });

  it('treats the selected image as the reconstruction source and isolates phase agents', () => {
    const skill = read(agentsRoot, 'SKILL.md');
    const handoffs = read(agentsRoot, 'references/subagent-handoffs.md');
    const combined = `${skill}\n${handoffs}`;

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
    ]) {
      expect(handoffs).toContain(reconstructionArtifact);
    }
    expect(skill).toContain('按 [subagent-handoffs.md]');
    expect(skill).not.toContain('本 Skill 的全部引用文档');
    expect(handoffs).toContain('相同 viewport');
    expect(combined).toContain('用户最新明确修改');

    const specStage = skill.slice(skill.indexOf('### 4.'), skill.indexOf('### 5.'));
    const reactStage = skill.slice(skill.indexOf('### 5.'), skill.indexOf('### 6.'));
    expect(specStage).toContain('[visual-routing.md](references/visual-routing.md)');
    expect(specStage).toContain('严格执行 `screenshot-to-prototype`');
    expect(specStage).toContain('实际实现');
    expect(reactStage).not.toContain('[visual-routing.md](references/visual-routing.md)');
    expect(reactStage).toContain('不重新选择视觉风格、素材方案或技术路线');
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

  it('ships eight compressed 4K WebP style references within the package budget', () => {
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
