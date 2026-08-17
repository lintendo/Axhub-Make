---
name: screenshot-to-prototype
description: Use only when 用户明确要求把本地截图、设计稿或高保真界面图还原成 Axhub Make client 可运行原型；或显式调用 $screenshot-to-prototype。仅提供图片作为素材、参考图、需求图或风格上下文时不要使用。
---

# Screenshot To Prototype

将本地截图还原为可评审 HTML，再转为 React 原型。顺序固定：结构化分析、脚本首版、立即返回、自动 AI 评审、最终 1:1 主规格、用户确认、React 实现。

## 边界

- 只处理用户明确要求还原的本地截图或设计稿；先取得源图本地路径。
- 所有素材提取、修复、高清化和设计分析都必须传入本地源图，不能只用文字描述。
- 位图生成或编辑使用 `ui-image-generation`；具体字段和素材分流见 `references/prompts.md`。
- 不修改通用规格模板，不把整页截图贴成页面。
- 禁止使用 `first-pass.html` 代替 `templates/prototype-spec.html` 创建 `spec.html`。

## 产物

- 主规格：`src/prototypes/<slug>/.spec/spec.html`
- 中间文件：`src/prototypes/<slug>/.spec/reconstruction/`
- 最终素材：`src/prototypes/<slug>/assets/`
- 临时数据：`.local/screenshot-to-prototype/<slug>/`

## 流程

1. 读取源图、现有规格和素材；运行 `prepare-reconstruction-source.mjs` 生成源图摘要。
2. 用 `request-vision.mjs` 对原图做第一轮素材召回，提示词只短注“含状态栏”，不提交 OCR。视觉 API 未配置完整时由当前 Agent 输出同契约结果。
3. 第一轮后处理文字：有 OCR 时直接用；没有时由视觉 API 单独检测一次，仍未配置则由当前 Agent 检测。用 `normalize-text-regions.mjs` 统一来源，再以 `mask-layer-recall.mjs` 无间距遮蔽第一轮矩形与文字。第二轮复用素材提示词且不提交文字结果；最后用 `finalize-layer-recall.mjs` 合并并从原图裁切。
4. 按 `references/prompts.md` 处理素材。前景先生成本地透明候选与矩阵，再复用 `ui-image-generation/scripts/request-image.mjs` 完整化；背景/Banner 单独清理。返回结果继续本地透明清理与审计，临时结果留在 `.local/`。
5. AI 输出带稳定 ID 的 `elements.json`，OCR 只提供文字、位置和置信度；AI 决定文字角色、渲染方式和素材动作。
6. 运行 `build-reconstruction-manifest.mjs` 和 `validate-reconstruction-manifest.mjs`，生成并校验 `reconstruction-manifest.json`。
7. 运行 `render-reconstruction-review.mjs` 确定性生成 `first-pass.html`。渲染器会再次校验 Manifest，渲染阶段模型调用必须为 0。
8. 首版生成后立即返回可访问链接：使用 `?projectId=<id>&docPath=<编码后的项目相对路径>`；标明“脚本直出、尚未 AI 评审”。不得结束当前任务，也不得等待用户确认。
9. 随后自动进入 AI 评审：对比原图与首版，审核结构、样式、特殊字体和素材；修改结构化数据或候选后重新执行步骤 4-7。
10. 将审核结果更新到 `spec.html`，保持源图 viewport 下的 1:1 尺寸。用 `preview_capture` 截图，并展示原图、HTML 结果和素材取舍。
11. 最终回复提供 HTML 主规格链接：使用 `?projectId=<id>&p=<slug>&spec=1`；附待确认事项和轻量偏差说明，然后结束当前回合。
12. 只有用户明确确认最终 HTML 主规格后，才能创建或修改 React 原型；完成后按相同 viewport 更新真实运行截图。

## 门槛

- AI 只修改结构化分析、样式和素材，不直接返回或自由编写首版 HTML。
- 两轮召回不使用 SAM 自动扩框；OCR 是可选增强，统一文字区域只在第一轮后参与脚本遮蔽和后续语义处理。
- Logo、标识、海报和 Banner 艺术字由视觉审核决定表示方式，不能因 OCR 成功就强制使用普通字体。
- 未解决的文字或素材审核不能进入首版；素材路径必须位于项目目录内。
- 需要 Tailwind 时使用 `compile-reconstruction-tailwind.mjs`；不使用 CDN，不加载 preflight。
