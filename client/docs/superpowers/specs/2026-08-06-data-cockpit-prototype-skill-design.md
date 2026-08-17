# 数据驾驶舱原型生成 Skill 设计

## 目标

新增 `generate-data-cockpit-prototype`，用于从文字需求生成驾驶舱、指挥中心、数据可视化大屏或数字孪生大屏候选图，并在用户选图后还原为可运行原型。

前期需求与 `DESIGN.md` 选择继续遵循 `rules/requirements-alignment-guide.md`，但不落盘、不新建设计基底。对齐结果只用于生成图片提示词。

## 权威与门槛

1. 用户指定候选图片数量；没有指定时默认 3 张。
2. 图片确认前不创建主规格、需求 Brief 或 React 原型。
3. 用户选中的本地图片是可见视觉事实的唯一还原标准。旧需求不约束还原。
4. 选图后才整理图片无法表达且仍有效的非视觉运行约束，并由规格子代理写入 `.spec/spec.html`；不另建 Brief。
5. 选图后才创建或更新 `.spec/spec.html`，记录素材拆分、技术路线、交互和验收。
6. 用户明确确认 HTML 主规格后，才能进入 React 实现。
7. 用户最新明确修改可以覆盖选中图片；明显视觉改向时重新冻结参考图。

## 子代理

- 主代理负责需求对齐、候选图、选图和用户确认。
- 选图后使用无历史继承的新规格子代理。它必须读取本 Skill 主文档、三份引用文档和 `screenshot-to-prototype`，并接收选中图片、净化后的项目规则、已确认非视觉运行约束和输出契约；重叠部分以本 Skill 为准。
- 规格确认后使用另一个实现子代理。它只接收选中图片、确认规格、还原清单和目标目录。
- 实现后使用独立验收子代理，对比选中图片、规格截图和运行截图。
- 环境没有子代理时，告知用户并建议在阶段门槛处新开对话。

旧规格的目标画面视觉内容在选图后失效；只保留范围外页面、稳定标识、项目固定规则和再次确认的非视觉运行约束。交接必须包含 client 根目录、projectId、prototypeId、原型绝对目录和完整规格评审链接。

## 技术路由

- 文本、指标、表格和控件使用 HTML/CSS。
- 数据图表默认使用 ECharts；不把图表烘焙为图片。
- 图表边框默认抽成共享 CSS/SVG 组件。
- 行政区划立体图使用 GeoJSON + Three.js；真实底图使用高德、MapLibre 或 Mapbox，并按需叠加 AntV L7 或 deck.gl。
- 物体、设备、建筑、厂区和园区存在空间状态或镜头交互时使用 Three.js。React 18.2.0 使用 `@react-three/fiber@8`。
- GSAP 只用于跨 DOM、图表、地图和 Three.js 的统一时间轴；各渲染引擎内部动画由自身管理。

## 文件

```text
.agents/skills/generate-data-cockpit-prototype/
├── SKILL.md
├── agents/openai.yaml
└── references/
    ├── industry-scenes.md
    ├── visual-routing.md
    └── subagent-handoffs.md
```

同一 Skill 完整镜像到 `.claude/skills/`。正式验证放在 `tests/data-cockpit-prototype-skill.test.ts`。

## 验收

- 触发范围不覆盖“只生成图片”和“还原用户已有截图”。
- 图片数量、选图门槛、规格确认门槛和子代理隔离均有测试约束。
- 主 Skill 简短；行业与技术细节按需读取。
- `.agents` 与 `.claude` 内容完全一致。
