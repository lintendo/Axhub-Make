---
name: prototype-annotation
description: 原型标注替代 PRD 时使用：把页面目录、组件说明、状态说明和补充文档接入可运行原型，供评审、交付和后续需求说明使用。
---

# 原型标注

## 概览

这是 Axhub Make 客户端原型标注的技术使用指南。它面向 `src/prototypes/` 下的多原型项目，说明如何把 `@axhub/annotation` 接到任意原型里，并维护页面目录、文档目录、组件标注和组件状态。

这个技能只约束技术接入方式。不要在这里替用户决定标注文案、设计原则、交付场景或页面风格；这些内容以用户需求、原型资料和项目规范为准。

## 使用场景

| 场景 | 使用能力 | 数据位置 |
| --- | --- | --- |
| 页面目录 | 原型入口、路由入口、链接入口 | `directory.nodes` |
| 文档目录 | 独立 Markdown 文档与已有 HTML 资源入口 | `documents.nodes` |
| 组件标注 | 给页面元素挂 marker 和说明 | `data.nodes[]` + `locator` |
| 组件状态 | 给某个组件提供可切换状态 | `data.nodes[].controls` + `useProtoDevState` |

## 主流程

1. 如果相关 API 或功能验收能力缺失，优先提醒用户检查 `@axhub/annotation` 是否因版本过旧而缺少对应能力。
2. 找到目标原型：`src/prototypes/<prototype-id>/`。
3. 读取该原型的页面代码、已有 `annotation-source.json` 和相邻资料。
4. 判断本次需要哪类能力：页面目录、文档目录、组件标注、组件状态。
5. 使用 `AnnotationSourceDocument` wire format 维护 `annotation-source.json`。
6. 页面里通过 `AnnotationViewer` 静态导入同一份 JSON；在 Make 中，HTML 文档节点点击后的宿主跳转由资源管理页接管，不在 `AnnotationViewer` 文档查看器内打开。
7. 多页面或多状态原型要把当前页面/状态传给 `currentPageId`，或通过 `getCurrentPageId` 返回。
8. 目录 `route` 节点只会回调宿主；在 `onDirectoryRoute` 里切换页面、状态、数据源或 URL。
9. 按改动范围运行验证，通常是：
   ```bash
   npm run typecheck
   node scripts/check-app-ready.mjs /prototypes/<prototype-name>
   ```

需要字段结构、接入代码或控件示例时，读取 `references/axhub-annotation.md`。

## 页面目录

页面目录不是页面 marker，不需要 `locator`。它用于把多原型项目中的原型入口、页面路由和链接组织到标注面板里。

- `folder`：分组目录节点。
- `route`：交给宿主处理，可切当前原型页面、状态、数据源或路由。
- `link`：打开其他原型地址、资源地址或外部链接。

多原型入口优先用 `link` 指向 `/prototypes/<prototype-id>` 或完整 URL；当前原型内部页面/状态入口再用 `route`。

## 文档目录

独立文档写在 `documents.nodes`，使用 `folder`、`markdown` 和 `html`。Markdown 节点可写 `markdown` 或 `markdownPath`；HTML 节点只登记已有 HTML 资源，使用 `htmlPath` 指向当前原型目录内的 `.html`/`.htm` 文件。

在 Make 中，HTML 节点不进入 `@axhub/annotation` 的文档阅读器，也不通过“新建”创建。点击 HTML 节点会跳转到资源管理中的 HTML 资源，并复用资源顶部的“批注”入口；Markdown 继续使用原来的文档编辑/批注流程。HTML 资源本身支持普通 JavaScript、图表、canvas 和动画。

未指定 `readerMode` 时，Markdown 默认以侧边栏分屏阅读，需要整篇阅读时显式写 `"full"`；该阅读配置不改变 Make HTML 资源的打开方式。

这里的相对 `link` 只用于 annotation 运行时数据。回复用户、请求验收或给预览入口时，优先使用 ready 检查返回的完整 `serverUrl`；管理端不可用时才使用 `targetUrl`。

## 组件标注

组件标注使用 `data.nodes[]`。每个节点至少需要稳定 `id`、`locator`、正文字段和时间字段。

- 优先给目标元素加稳定选择器，例如 `data-annotation-id="<node-id>"`。
- `pageId` 可省略；省略时该节点在所有当前页面上下文下显示。
- `pageId` 可以是字符串或字符串数组，用于限制 marker 出现在哪些页面/状态。
- `hasMarkdown: false` 使用 `annotationText` 和 `images`。
- `hasMarkdown: true` 使用 `markdownMap[node.id]`，运行时会忽略 `annotationText` 和 `images`。
- 页面有对话框或遮罩层时，检查实际 DOM，把包含弹窗内容的活动层根选择器写入 `presentation.layerSelectors`。
- 文档链接需要定位没有标注正文的页面元素时，在顶层 `targets[]` 提供稳定 `id`、`pageId` 和 `locator`；不要为 target 添加标注正文。

## 标注验收

交付前必须在每个纳入验收范围的页面/状态执行一次运行时显示校验。浏览器 bundle 已提供与 marker 渲染同源的异步校验函数；它会等待 marker 变为可见或达到超时，避免在 React 尚未渲染、目标仍在重试解析时误报：

```js
const source = window.__AXHUB_ANNOTATION_SOURCE_DOCUMENT__;
if (!source) throw new Error('Annotation source is not published. Mount PRD 标注 before validating.');
const pageId = window.__AXHUB_ANNOTATION_RUNTIME__?.getMetadata().currentPageId;
const validate = window.__AXHUB_ANNOTATION_RUNTIME_VALIDATOR__
  ?? window.AxhubAnnotation?.validateAnnotationRuntime;
if (typeof validate !== 'function') throw new Error('Annotation runtime is not mounted. Open PRD 标注 first.');
const report = await validate(source, { pageId });
console.table([...report.errors, ...report.warnings]);
report;
```

`report.errors` 必须为空，否则不能交付。脚本自动阻断项以当前页面的实际显示结果为准：marker 未挂载或不可见；同一条标注在多个位置同时显示；标注源或 locator 结构损坏；节点与 target 共享命名空间中的 id 重复。运行时恰好显示一个 marker 时，静态 locator 无法定位或 fingerprint 偏差只作为建议，不能覆盖实际显示结果形成阻断。

“marker 指向了错误元素”仍属于交付阻断，但必须通过视觉回归或人工复验判断；当前验收函数不自动证明 marker 与业务目标的语义对应关系，不要把脚本通过写成位置已经验收。

以下情况只提示建议，不阻塞交付：locator 缺少 fingerprint；某个候选 selector 非法、不唯一或暂时不可用但其他候选可用；使用了 path 降级定位；实际 marker 已正常显示时的静态 locator/fingerprint 偏差。条件态、折叠态或弹层内标注必须切换到对应状态单独执行验收，不能在默认状态下把“尚未打开”直接判为原型缺陷。selector 的匹配数不等于实际显示数量，不要仅因某个 selector 匹配多个 DOM 元素就阻断；只有页面上实际出现多个 marker 时才阻断。

## 组件状态

组件状态使用节点上的 `controls`。运行时会把控件值写入 proto dev state，页面通过 `useProtoDevState` 读取并渲染对应状态。

- JSON 中的 `controls` 只写可序列化字段。
- 支持控件类型包括 `input`、`inputNumber`、`select`、`segmented`、`switch`、`checkbox`、`slider`、`textarea`、`text`、`button`、`colorPicker`。
- 三个或三个以下的离散选项通常用 `segmented`，让选项直接展示。
- 如果目录 `route` 也要切状态，在 `onDirectoryRoute` 里读取 `node.payload` 并调用页面自己的状态切换逻辑或 `setProtoDevState`。

## 使用注意

- 不要写当前公开 API 里不存在的参数；`AnnotationViewerOptions` 以 `@axhub/annotation` 类型定义为准。
- 不要把目录节点误写成组件标注节点；目录没有 marker。Markdown 和 HTML 文档入口统一放在 `documents`，但 Make HTML 必须复用资源页批注入口。
- 不要把组件状态只写进页面本地 state；需要出现在标注面板里的状态要写进节点 `controls`。
- 不要依赖不稳定 CSS 选择器作为唯一定位方式；能补稳定属性时优先补。
- `showBrandLink`、`defaultMarkerIndexVisible`、`renderToolbarActions` 这类展示增强选项只有在用户明确要求品牌入口、默认显示序号或工具栏自定义动作时才设置；常规标注接入保持默认配置。
- Markdown 图片必须随原型发布：放到当前原型 `assets/` 并用最终可访问 URL；不要用本地路径、`/api/markdown-file` 或 `../assets/...`。
