---
name: canvas-workspace
description: 当任务明确涉及 Axhub 画布、原型草稿、Excalidraw 文件、画布节点/批注/截图/图片，需要把文档、原型页面、图片、流程图等产物呈现在画布上，或同时提供指定画布文件与用户当前看到的画布截图/视图信息时使用。
---

# Canvas Workspace — 画布工作区

仅当任务明确涉及 Axhub 画布、原型草稿，或需要把产物落到画布/Excalidraw 上时使用本技能。画布是普通资源文件：

```text
src/resources/**/*.excalidraw
src/resources/.assets/<resource-relative-path>/
```

本技能按四类产物分流：文档、原型页面、图片、流程图。产物分流是入口门禁：先确定项目内的真实产物及其画布呈现方式，再处理当前画布。只有无法从现有上下文可靠判断时才询问必要问题。如果用户已在画布/草稿中工作，不再询问放在哪里，默认更新当前 `src/resources/**/*.excalidraw` 资源画布。

## 产物分流

画布负责组织、预览和操作项目产物，不代替产物本身。文档、原型和图片必须先形成可独立使用的项目资源，再更新当前画布中的对应节点；当前截图和视图信息只决定节点的落位与关系，不改变产物载体。

- 文档：用户要求生成文档、说明、PRD、清单、列表、报告或其他文本内容时，先形成 `src/resources/` 下的项目内正式文档资源，使用 Markdown 或 HTML 等项目支持的文档格式，再以内嵌文档节点创建或更新到当前资源画布；不要把文档正文铺成普通画布文本。
- 原型页面：先创建或更新 `src/prototypes/<prototype-name>/` 中的项目内可运行的原型，再以内嵌预览节点放到画布；不要使用普通 Excalidraw 元素模拟页面 UI。节点尺寸与网页内部视口分开处理，用 `customData.embedContentScale` 缩放显示。
- 图片：先形成可持久化的图片资源；按用途保存到 `src/resources/`、当前画布对应的 `src/resources/.assets/<resource-relative-path>/` 或原型资源目录，再以图片节点放到画布。
- 流程图：先判断图表类型和可编辑载体。流程、关系、序列、状态、类、ER 和简单盒线架构优先用 Mermaid 作为中间结构并转普通 Excalidraw 元素；简单手绘式图也可直接画普通 Excalidraw。复杂泳道、排期/甘特、复杂云架构、网络拓扑或厂商图标等需要 Draw.io 语义或素材库的图，才按 `references/drawio/SKILL.md` 生成或编辑 Drawio 资产，并按 `references/axhub-nodes.md` 的 Drawio 节点结构更新画布；只有类型或载体重叠不确定时才询问用户。

流程图、关系图和对既有画布元素的修改，才直接使用普通 Excalidraw 元素。文档、原型和图片完成后，按 `references/axhub-nodes.md` 创建或更新对应节点，并放在当前视图附近的合理空白位置。

## 工具优先级

- 先完成“产物分流”；需要将结果呈现到画布或编辑画布时，再选择画布工具。
- 命中“画布上下文操作”时按对应专节执行。
- 其他实时画布任务已连接 MCP 时，优先调用 `axhub-canvas` 的工具更新当前画布。
- 生成 Mermaid 流程、关系、序列、状态、类、ER 或简单盒线架构图时，优先调用 `canvas_insert_mermaid`，传入 `mermaidCode` 和可选 `position`，由浏览器画布转换成可编辑 Excalidraw 元素并保存。
- MCP 不可用、没有实时画布、或用户明确要求离线编辑文件时，直接更新对应 `.excalidraw` 文件；需要插入 Mermaid 时，先得到已转换的 Excalidraw elements/files，再写入 `elements` 和 `files`。
- 只有需要读取状态、插入普通元素、刷新、截图、更新、删除或聚焦画布时，才改用 `canvas_get_state`、`canvas_insert_elements`、`canvas_refresh`、`canvas_capture`、`canvas_update_elements`、`canvas_delete_elements`、`canvas_focus`。

## 读取顺序

1. 用户指定画布名或画布链接时，先从名称或链接定位对应的 `src/resources/**/*.excalidraw`。
2. 查看 `elements`、`files` 和元素的 `customData`。
3. 只有元素引用了持久化截图或图片文件时，才读取 `src/resources/.assets/<resource-relative-path>/`。
4. 不使用 `axhub-make canvas` CLI；画布内容读取和修改仍以 `.excalidraw` 文件为准。

## 参考文档分流

- 读写画布文件本身仍不清楚时，才读 `references/canvas-read-write.md`。
- 遇到 Axhub 专属节点或不确定 `customData` 字段含义时，才读 `references/axhub-nodes.md`。
- 需要普通 Excalidraw 元素绘制时，才读 `references/excalidraw-basics.md`。
- 确定要创建或编辑 Drawio 节点时，才读 `references/drawio/SKILL.md`。

## 画布上下文操作

当任务同时提供指定的 `.excalidraw` 目标文件和用户当前看到的画布截图，并可能附带当前视图坐标或可见元素 ID 时，按本节执行。进入本节前必须先按“产物分流”确定画布呈现方式；触发入口不影响处理方式。

1. 写入前重新读取目标文件，只修改该文件，不创建替代文件。
2. 直接读取并修改指定文件，不调用任何 MCP 或画布桥接工具。
3. 结合截图、视图信息与目标文件，把用户意图判断为编辑、新增或不明确：

   - 编辑：标记或说明指向已有元素时，原位修改目标节点、文字、分支、连线或关系。
   - 新增：用户明确要求补充内容时，根据空白、语义关系和阅读顺序，在相关内容上下左右的合理位置放置，避免重叠。
   - 不明确：只有无法从截图和文件可靠判断时才询问必要问题。

视觉标记只是证据，不能按元素类型直接判定。完成后只清理遮挡正式内容或导致结果歧义的操作标记；保留不遮挡的说明文字和无关手绘内容。不要创建任务状态元素，也不要把结果交给前端再次定位。涉及已有元素、绑定或连线的编辑时，读取 `references/canvas-read-write.md`。

## 默认规则

- 元素 `id` 必须唯一，并尽量沿用现有文件的 ID 风格。
- 修改元素时同步更新 `version`、`versionNonce` 和 `updated`。
- 结构性改动后检查绑定、容器、分组和 Frame 引用。
- 流程图及其他由多个相关元素组成的新产物，先创建一个唯一的 Frame，再创建或整理相关元素。所有相关元素（包括文字、形状、连线和图片）都必须设置同一个 `frameId`，该 `frameId` 必须指向实际存在的 Frame；Frame 自身保持 `frameId: null`。
- Frame 的边界必须覆盖所有相关元素，Frame 必须使用能够表达产物内容的名称，不能保留空名称或默认的 `Frame`。写入后检查 Frame 的子元素、边界和 `frameId` 引用，不得留下没有 `frameId` 的相关元素。
- 产物已有可见边框或视觉容器时，保留现有容器，Frame 的边框和背景保持透明，不要重复创建视觉外框；没有现有视觉容器时，Frame 自身可作为唯一外层边界。
- 除非用户需求要求修改，否则保留已有 Axhub `customData`。
- 较长任务可渐进式写入以减少用户等待；每次写入都必须保持完整、可解析的 Excalidraw JSON，并保留文件中的其他有效字段。

## 回复要求

完成画布相关工作后，说明：

- 画布文件路径。
- 修改了什么，或读取到了什么。
- 相关节点 ID 或批注。
- 是否使用了本地图片或集中资源资产目录。
- 如果当前环境能确定，给出画布确认链接。
