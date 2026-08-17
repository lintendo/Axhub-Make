# Screenshot To Prototype 提示词

通用规则：生成、编辑或派生位图素材时遵循 `ui-image-generation`。始终附带用户本地源图路径作为参考图，不要只靠文字生成；以下只补充截图还原中的 bbox、裁切、修复和素材分流约束。

## 两轮视觉召回

第一轮只向 `request-vision.mjs` 提交原图和下面的提示词，不提交 OCR：

```text
分析附图，找出所有需要保留原始像素才能忠实复现的视觉对象。

要求：
1. 完整检查整张图片（含状态栏），不要只返回最明显的区域。
2. 每个视觉上可以独立复用的对象单独返回。
3. 不要把多个彼此独立的对象合并成一个大区域。
4. 如果一个区域内部的图像、装饰或艺术内容在视觉上不可分割，可以作为一个整体返回。
5. 普通文字、布局容器、纯色区域和规则几何形状不需要返回。
6. 只依据图片本身判断，不使用外部文字识别结果。

仅返回一个 JSON 对象，对象只包含 regions 数组。
每个 region 只包含 id、bounds 和 confidence。
bounds 包含 left、top、right、bottom，均为相对于整张图片的 0–1000 整数。
confidence 是 0–1 数值。
只返回 JSON，不要输出其他字段、说明、Markdown 或代码围栏。
```

第一轮完成后才处理文字区域；用 `mask-layer-recall.mjs` 原位遮蔽已召回矩形与 `text-regions.json`，padding 固定为 0。第二轮对遮蔽图复用同一提示词；第二轮不得提交 OCR。最后用 `finalize-layer-recall.mjs` 去重、合并，并从未修改原图生成矩形裁片与参考矩阵。

视觉 API 配置不完整时，`request-vision.mjs` 返回 `fallback-required`，由当前 Agent 按同一提示词补全同一 JSON 契约；已配置但请求失败时直接报错，不静默换模型。

矩形裁片是原始像素基准。前景素材先按透明背景路线生成本地透明候选并拼成素材矩阵，再把矩阵、对应裁片和完整原图一并交给 `ui-image-generation/scripts/request-image.mjs`，补齐缺边缺角并保持原尺寸、构图和比例；背景或 Banner 每张单独连同完整原图生成干净版本。两类请求都不传 mask，返回后再做本地透明清理、审计和原位回填。

## 可选 OCR 与文字区域

文字检测必须与素材召回分开。客户端存在 OCR 结果时，用 `normalize-text-regions.mjs --ocr` 统一为 `text-regions.json`；没有 OCR 时，用 `request-vision.mjs --kind text` 对原图单独调用一次下面的提示词，再用 `normalize-text-regions.mjs --vision` 统一。视觉 API 也未配置时仍由当前 Agent 返回同一契约。输出的 `source` 必须是 `ocr`、`vision-api` 或 `current-agent`。

```text
检测附图中的全部可见文字区域。只做文字区域检测，不判断素材、组件或布局。
每个区域返回独立 id、原文 text、视觉完整边界 bounds 和 confidence；不要把相邻但独立的文字合并。
bounds 包含 left、top、right、bottom，均为相对于整张图片的 0–1000 整数。
仅返回只含 regions 数组的 JSON；不要输出说明、Markdown 或代码围栏。
```

`text-regions.json` 只用于遮蔽、文字语义与边界校验，不能作为素材判断提示。普通 UI 文字不是素材；独立艺术字可进入素材流程；与海报或 Banner 构图不可分割的艺术字使用 `preserve-in-image` 并保留整体。

## UI 元素分流

```text
请分析参考截图和可选的 text-regions.json，先输出完整 elements.json。每个可见元素包含 id、parentId、kind、源图 bbox、目标 bbox、UI 职责、visualStyle、建议表示方式、候选、textReview 和 assetReview。无可见文字时仍要输出 textReview: null；assetReview 不得省略。

普通 UI 文字、按钮、输入框、导航、卡片、列表和表格归为 HTML/CSS；图标、进度和简单图表归为图标库或 SVG；照片、头像、商品图、插画、纹理和页面内嵌截图归为位图。Logo、标识、海报和 Banner 中的艺术字不能按普通文字处理，必须走下面的文字角色与素材审核。复杂图表和地图拆分为视觉底层与可交互覆盖层。

素材清单必须覆盖所有独立视觉素材，包括图标、Logo、照片、头像、商品图、插画、纹理、装饰图形和被判定为素材的特殊视觉文字；不要把普通 UI 文案、布局容器、简单 CSS 形状、数据内容或整页截图列为素材。
```

## 文字角色与素材审核

```text
text-regions.json 只提供文字内容、位置、置信度和来源，不决定最终渲染方式。请结合原图字形、上下文、所属视觉区域和可编辑性要求，为含文字元素输出：

textReview:
- content：OCR 校正后的语义文字。
- textRole：ui-text、brand-text、display-text 或 decorative-text。
- renderMode：html-text、font-matched-html、preserve-in-image、transparent-asset、svg 或 manual-review。
- ocrUsage：render、semantic-only 或 verification-only。
- decisionSource：固定为 vision-ai。
- confidence：0 到 1。
- reason：简短说明视觉证据；font-matched-html 还必须给出 fontEvidence。

assetReview:
- assetAction：none、reuse、remove-background、rembg、reconstruct-svg、reconstruct-css、regenerate 或 manual-review。
- decisionSource：固定为 vision-ai。
- status：accepted、accepted-with-warning 或 needs-review。
- reason：说明为什么复用、抠图、重构、重新生成或人工审核。

决策规则：
- ui-text 默认 html-text + render，保留可编辑性。
- brand-text、display-text、decorative-text 不得因为 OCR 成功就使用普通 html-text。
- Logo 和品牌标识优先复用原素材、透明裁切或 SVG；文字区域信息仅作 semantic-only。
- 海报/Banner 中已属于构图的文字使用 preserve-in-image，不能再叠加一份可见 HTML 文字。
- 独立艺术字使用 transparent-asset、svg 或有明确字体证据的 font-matched-html。
- 独立艺术字最终边界取相关文字框并集与 AI 完整视觉边界的并集，再由脚本向外收齐边缘；扩选 padding 为 0，不能进入其他素材框或其他文字框。
- 无法可靠判断时使用 manual-review，不得静默选择近似字体。
- needs-review 或任一 manual-review 表示当前元素尚不可渲染；先解决审核并更新为 accepted 或 accepted-with-warning，才能进入确定性首版。
- 候选 assetPath 必须是项目根目录内的相对路径，不能使用绝对路径或 ../ 越界。
```

## 透明背景路线判断

```text
只为位图候选选择一个 backgroundMode：

- preserve：背景属于内容或构图，需要原样保留。
- existing-alpha：源素材已有正确透明通道，直接审计。
- known-key：需要透明背景，且背景是连续、纯净、可确定颜色的键色，使用本地键色脚本。
- complex-remove：需要透明背景，但背景自然、渐变或复杂；始终生成 generated-refined 或 generated-chroma，本机 rembg 可用时同时生成 rembg-cutout，不得二选一。

不要把应保留环境的照片、页面内嵌截图或背景图标成 complex-remove。
```

## 完整候选素材矩阵

```text
基于参考截图和完整素材清单生成透明背景 PNG 素材矩阵，覆盖清单中的全部素材项，包括图标、Logo、照片、头像、商品图、插画、纹理和装饰图形，不得遗漏。

矩阵不包含纯文本、布局容器、简单 CSS 形状、图表数据和整页截图；它用于视觉基准和候选切分，最终表示方式仍按元素分流结果确定。

排布规则：固定清晰网格，一格一个素材，素材居中，格与格之间不得接触或跨格；每个素材四周保留足够透明安全边距。

背景规则：画布背景和格子背景必须完全透明 alpha=0；不要生成底色、卡片、光晕底、投影底、边框、分隔线、编号或标签。只有原素材本身包含阴影、透明度或局部光效时才保留。

视觉规则：保持原视觉风格、颜色、阴影、透明度和比例；普通 UI 文案不得转换成素材，已判定为 preserve-in-image、transparent-asset 或 svg 的特殊视觉文字必须纳入对应素材；不要新增装饰。
```

## 高清透明 PNG 最终化

```text
请基于参考截图和候选切图，生成这个 UI 素材的高清透明 PNG 最终版。

候选切图只用于确认对象范围和风格线索；最终形状、颜色、比例、阴影和细节以参考截图为准。

去除背景污染、误切碎片和边缘脏点；补足透明留白；按目标 bbox 和 DPR 保持合适清晰度；不要添加标签、外框、底色或新装饰。
```

## 复杂抠图双候选

```text
complex-remove 且本机 rembg 可用时，基于本地参考截图中的同一区域同时准备两类候选：

1. rembg-cutout：使用本地 CLI 输出并保留模型信息。
2. generated-refined 或 generated-chroma：使用图片生成方案输出。

两个候选必须使用相同源图和 bbox，保持相同主体、比例、方向和视觉语义。分别审计后选择质量最优结果，两种候选都进入主规格并标明最终采用项。
```

## 键色透明候选

```text
请基于本地参考截图生成指定素材，并使用已探测的安全键色作为纯色背景。主体内不得出现该键色或接近该键色的新增细节；主体四周保留足够边距；不要自行透明化，后续由本地脚本完成连通背景键控和质量审计。
```

## SVG/组件重绘判断

```text
请基于参考截图和候选切图判断这个素材是否适合重绘为 SVG 或图标组件。

若它是简单图标、线性图标、几何 logo、少色块图形，或需要颜色继承、hover/focus 状态，请输出“适合 SVG/组件重绘”，并给出形状结构、颜色、描边、圆角和尺寸建议。

若它包含复杂插画、照片、纹理、拟物质感、大面积渐变或复杂阴影，请输出“不适合 SVG/组件重绘”，并建议走高清透明 PNG。
```
