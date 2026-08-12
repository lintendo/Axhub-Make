# 子代理交接协议

各阶段使用不同的干净子代理。Codex 创建子代理时必须设置 `fork_turns: "none"`；其他运行时使用等价的无历史继承机制。为避免早期设想干扰选图后的还原，不传递原始对话，也不传递前期需求对齐内容，不要求子代理推断用户为什么选择该图片。

## 通用输入

- client 根目录、projectId、prototypeId、原型绝对目录 `<client-root>/src/prototypes/<prototype-id>` 和本 Skill 根目录。
- 选中图片本地路径 `<prototype-root>/.spec/reference/selected-source.png`、图片尺寸和 SHA-256。
- 当前 Make 服务 origin；规格链接必须使用完整格式 `<make-origin>/?projectId=<project-id>&p=<prototype-id>&spec=1`，并替换、编码实际值。
- 选图后整理的已确认非视觉运行约束；只包含图片无法表达但仍有效的数据、地图、3D、交互、动画、性能、权限和验收条件。
- 当前阶段所需文件和明确任务。
- 用户最新明确修改；它是选中图之外唯一允许改变可见结果的输入。

禁止传入：未被最终图片采用的候选方向、早期视觉偏好、被图片推翻的 2D/3D 设想，以及无关实现讨论。非视觉约束如与选中图或用户最新决定冲突，必须先向用户确认，不能自行保留。

已有 `.spec/spec.html` 时先净化：旧规格中的目标画面视觉内容失效，不得作为选中图片的修正依据；只保留目标范围外页面、稳定标识、项目固定规则，以及选图后再次确认的非视觉运行约束。随后在同一主规格中重建目标画面。

## 规格子代理

输入：通用输入和净化后的项目上下文。必须实际读取本 Skill 的主文档 `SKILL.md`、`visual-routing.md` 及 `screenshot-to-prototype`，不得只接收摘要；与 `screenshot-to-prototype` 重叠时，以本 Skill 为准。

规格子代理必须以选中图片为源图，逐项完整执行 `screenshot-to-prototype` 的 10 步流程和门槛，不能跳过脚本和结构化中间产物直接自由编写主规格。以下是驾驶舱任务中的执行映射，不替代其中任何一步：

1. 运行 `prepare-reconstruction-source.mjs` 生成源图摘要。
2. 完成 OCR 与结构化视觉分析，生成带稳定 ID 的 `elements.json`；按 `visual-routing.md` 的常用视觉元素分类拆分画面。
3. 按 `screenshot-to-prototype` 继续生成既有 `asset-audit.json`，用于位图候选的透明度和尺寸审计；另生成 `visual-audit.json`，覆盖 `elements.json` 中全部可见元素，包括 HTML/CSS、SVG、地图、3D、图片和媒体，不能因为不是位图或 `assetAction: none` 就排除。两者职责不同，不得混用。
4. 使用指定脚本生成并校验 `reconstruction-manifest.json`。
5. 确定性生成 `first-pass.html`，渲染阶段不调用模型。
6. 首版生成后立即发出可访问链接并标明“脚本直出、尚未 AI 评审”；不得结束任务，也不得等待用户确认。
7. 自动进行 AI 对比评审；按元素 ID 逐元素对比源图区域和当前渲染，修正结构化数据、素材与样式后重新执行素材、Manifest 和首版流程，直到达到可评审质量。每条 finding 必须记录 `elementId`、严重度和解决状态。
8. 将最终视觉按源图 viewport 1:1 实际实现到 `.spec/spec.html`，完成视觉元素实现清单及技术路线；使用 `preview_capture` 对比并展示原图与 HTML 结果。
9. 生成 `final-acceptance.json`；状态必须为 `passed`，每条 `knownDeviations` 必须记录 `elementId` 和严重度。最终回复提供完整 Make 服务规格评审链接、待确认事项和轻量偏差说明，然后停止当前回合。
10. 只有用户明确确认最终 HTML 主规格后，才由主流程另启实现子代理进入 React 阶段。

`visual-audit.json` 使用 `schemaVersion: 1`，每个元素逐项记录 `elementId`、`implementation`、`component` 或 `outputPath`、`selectedRoute`、`implementedRoute`、`implementationType`、源图和最终渲染证据图片及区域坐标、`status`、`fidelity`、`deviation`、`routeStatus` 和 `deferredStage`。证据图片路径相对 `visual-audit.json`，必须是按该元素 `sourceBBox` / `targetBBox` 裁切的真实、可解码且含可见内容的 PNG，尺寸与 bbox 完全一致；核心视觉证据不得是单色，源图和渲染证据不能是相同占位图。`implementedRoute` 必须等于 `selectedRoute`，路线和实现类型不得包含 approximate、placeholder 或 deferred，`routeStatus` 必须为 `implemented`，`deferredStage` 必须为空。

交付前从 Skill 根目录运行 `node scripts/validate-visual-audit.mjs --elements <elements.json> --visual-audit <visual-audit.json> --review <ai-review.json> --acceptance <final-acceptance.json>`；若当前目录是 client，则脚本路径使用 `.agents/skills/generate-data-cockpit-prototype/scripts/validate-visual-audit.mjs`。只有退出码为 0 才能继续。中央主视觉、地图/3D、主标题框架和主要数据模块属于核心视觉；任一核心视觉仍有中等或高偏差、缺少验证记录、使用占位/近似实现，或把已经选定的正式路线推迟到 React 时，主规格不得交付；`final-acceptance.json` 也不能标记为 `passed-with-known-deviations`。应继续修正；缺少必要数据或能力时停止并请求用户决策。

八套风格提示词不进入本阶段；选中图片已经取代所有候选风格，元素只按图片事实和通用类别拆分。

输出：

- `.spec/spec.html`：相同 viewport 的实际视觉实现、结构、真实文本、数据内容、交互状态和验收口径。
- 视觉元素实现清单、既有位图 `asset-audit.json`、全量 `visual-audit.json` 与图表/地图/3D/动画技术路由；不记录素材来源，只记录最终实现方式和必要产物路径。
- 逐元素对比证据、完整 Make 服务规格评审链接和待用户决策项。

完成后停止，不创建 React 页面，不替用户确认规格。

## 实现子代理

输入：通用输入、用户确认后的 `.spec/spec.html`、现有源码和项目开发规则。

输出：可运行 React 原型、依赖变更、规格状态同步与验证结果。严格复用主规格确认的结构、素材产物、组件拆分和技术路线，不重新解释早期需求，也不重新选择视觉或素材方案；发现规格冲突或需要可见降级时停止并回交规格阶段。

## 验收子代理

输入：通用输入、确认后的 `.spec/spec.html`、React 运行地址和既定验证命令。

在相同 viewport 分别截取选中图片、HTML 主规格渲染和 React 页面，对比布局、文字、颜色、层级、图表、地图、3D、动画与交互；同时检查控制台、资源加载、滚动/溢出和关键状态。输出差异清单、证据路径和通过/不通过结论，不直接改变产品方向。

## 无子代理环境

明确告知用户无法获得干净上下文，并建议在每个阶段门新开对话；新对话只携带本节对应输入，不携带原始需求对齐记录。
