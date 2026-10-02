# Make HTML 资源 Agent 能力

本文说明 Agent 创建 `src/resources/**/*.html` 时可使用的 Make 能力。这里只定义通用接入，不规定评审清单、页面结构或具体场景。

## 基础约定

- 使用可直接运行的普通 HTML，不要求 React、Axhub 包或专用组件。
- 资源引用使用项目相对路径或文档相对路径，不得使用机器绝对路径。
- 页面脱离 Make 批注运行时后，仍应可以正常阅读和交互。
- 不自行实现批注工具栏、图表编辑入口或 Make 内部接口。

## 页面交互

HTML 可以自由定义选择题、确认项和输入项，Make 不要求固定的评审清单结构。

批注模式会保留 `radio`、`checkbox`、其他非提交型 `input`、`select`、`textarea`、`button type="button"` 和标准 ARIA 控件的交互。自定义组件需在交互元素或其祖先上添加：

```html
<div data-axhub-review-interactive>...</div>
```

需要把页面选择写入普通批注时，使用可选协议：

```js
window.axhubReview?.setComment?.({
  element: document.querySelector('#review-item'),
  comment: '采用紧凑布局。',
});

window.axhubReview?.clearComment?.({
  element: document.querySelector('#review-item'),
});
```

同一确认项应始终使用同一个稳定 DOM 元素。协议不可用时，页面自身交互仍应正常工作。

## Mermaid

使用标准 `.mermaid` 容器，建议提供稳定 `id`：

```html
<pre id="approval-flow" class="mermaid">flowchart LR
  A[提交方案] --> B[确认结果]
</pre>
```

- Make 能识别 Mermaid 容器和渲染后的 SVG，并提供画布编辑入口。
- Make 负责转换并保存 Excalidraw 支撑文件，Agent 不生成或内嵌 Excalidraw JSON。
- Make 当前不自动注入 Mermaid 渲染库；页面需要图形化展示时，只加载一次 Mermaid，并保留源内容作为降级展示。

## Draw.io

优先使用包含可编辑源数据的 `.drawio.svg`：

```html
<img src="../.assets/review/demo.html/diagrams/architecture.drawio.svg" alt="系统架构图" />
```

Make 能识别 `img`、`object` 引用的 `.drawio.svg`，以及带 `data-drawio` 或 `metadata#drawio-source` 的内嵌 SVG。普通 SVG 不会被视为可编辑 Draw.io 图。

Agent 可以创建首次引用的 `.drawio.svg`，打开、保存和回传由 Make 处理。

## 支撑文件

图表编辑产物统一保存在资源根目录的 `.assets/<HTML 资源相对路径>/` 下：

```text
src/resources/review/demo.html
src/resources/.assets/review/demo.html/
├── diagrams/
├── diagram-manifest.json
└── .sessions/
```

- Agent 可以创建 HTML 首次引用的图片和 `.drawio.svg`。
- Agent 不预建或修改 `.sessions/`、`diagram-manifest.json` 和宿主派生文件。
- Mermaid 的 `.excalidraw` 转换文件、编辑会话和预览文件由 Make 按需管理。
- 同名 `.assets` 目录不会作为独立文档显示在资源列表中。

## 能力边界

- 普通文本和控件状态不会自动变成批注，需显式调用 `window.axhubReview`。
- 任意 SVG、Canvas 或图片不能自动获得图表编辑能力。
- 不在 HTML 中嵌入 Excalidraw JSON，也不直接调用 Make 内部接口。
- 具体评审场景使用独立规则，不写入本通用能力文档。
