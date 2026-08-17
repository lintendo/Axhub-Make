---
name: prototype-annotation
description: 原型标注替代 PRD 时使用：把页面目录、组件说明、状态说明和补充文档接入可运行原型，供评审、交付和后续需求说明使用。
---

# 原型标注

## 概览

这是 Axhub Make 客户端原型标注的技术使用指南。它面向 `src/prototypes/` 下的多原型项目，说明如何把 `@axhub/annotation` 接到任意原型里，并维护三类标注能力：目录、组件标注、组件状态。

这个技能只约束技术接入方式。不要在这里替用户决定标注文案、设计原则、交付场景或页面风格；这些内容以用户需求、原型资料和项目规范为准。

## 使用场景

| 场景 | 使用能力 | 数据位置 |
| --- | --- | --- |
| 目录 | 原型入口、文档入口、链接入口 | `directory.nodes` |
| 组件标注 | 给页面元素挂 marker 和说明 | `data.nodes[]` + `locator` |
| 组件状态 | 给某个组件提供可切换状态 | `data.nodes[].controls` + `useProtoDevState` |

## 主流程

1. 找到目标原型：`src/prototypes/<prototype-id>/`。
2. 读取该原型的页面代码、已有 `annotation-source.json` 和相邻资料。
3. 判断本次需要哪类能力：目录、组件标注、组件状态。
4. 使用 `AnnotationSourceDocument` wire format 维护 `annotation-source.json`。
5. 页面里通过 `AnnotationViewer` 静态导入同一份 JSON。
6. 多页面或多状态原型要把当前页面/状态传给 `currentPageId`，或通过 `getCurrentPageId` 返回。
7. 目录 `route` 节点只会回调宿主；在 `onDirectoryRoute` 里切换页面、状态、数据源或 URL。
8. 按改动范围运行验证，通常是：
   ```bash
   npm run typecheck
   node scripts/check-app-ready.mjs /prototypes/<prototype-name>
   ```

需要字段结构、接入代码或控件示例时，读取 `references/axhub-annotation.md`。

## 目录

目录不是页面 marker，不需要 `locator`。它用于把多原型项目中的原型、文档和链接组织到标注面板里。

- `folder`：分组目录节点。
- `route`：交给宿主处理，可切当前原型页面、状态、数据源或路由。
- `markdown`：打开内联 Markdown 文档。
- `markdownPath`：只用于目录 Markdown 文档，可指向当前原型目录内的 `docs/*.md`；客户端构建链路会内联为运行时读取的 `markdown`。
- `link`：打开其他原型地址、资源地址或外部链接。

多原型入口优先用 `link` 指向 `/prototypes/<prototype-id>` 或完整 URL；当前原型内部页面/状态入口再用 `route`。

这里的相对 `link` 只用于 annotation 运行时数据。回复用户、请求验收或给预览入口时，优先使用 ready 检查返回的完整 `serverUrl`；管理端不可用时才使用 `targetUrl`。

## 组件标注

组件标注使用 `data.nodes[]`。每个节点至少需要稳定 `id`、`locator`、正文字段和时间字段。

- 优先给目标元素加稳定选择器，例如 `data-annotation-id="<node-id>"`。
- `pageId` 可省略；省略时该节点在所有当前页面上下文下显示。
- `pageId` 可以是字符串或字符串数组，用于限制 marker 出现在哪些页面/状态。
- `hasMarkdown: false` 使用 `annotationText` 和 `images`。
- `hasMarkdown: true` 使用 `markdownMap[node.id]`，运行时会忽略 `annotationText` 和 `images`。
- 页面有对话框或遮罩层时，检查实际 DOM，把包含弹窗内容的活动层根选择器写入 `presentation.layerSelectors`。

## 组件状态

组件状态使用节点上的 `controls`。运行时会把控件值写入 proto dev state，页面通过 `useProtoDevState` 读取并渲染对应状态。

- JSON 中的 `controls` 只写可序列化字段。
- 支持控件类型包括 `input`、`inputNumber`、`select`、`segmented`、`switch`、`checkbox`、`slider`、`textarea`、`text`、`button`、`colorPicker`。
- 三个或三个以下的离散选项通常用 `segmented`，让选项直接展示。
- 如果目录 `route` 也要切状态，在 `onDirectoryRoute` 里读取 `node.payload` 并调用页面自己的状态切换逻辑或 `setProtoDevState`。

## 使用注意

- 不要写当前公开 API 里不存在的参数；`AnnotationViewerOptions` 以 `@axhub/annotation` 类型定义为准。
- 不要把目录节点误写成组件标注节点；目录没有 marker。
- 不要把组件状态只写进页面本地 state；需要出现在标注面板里的状态要写进节点 `controls`。
- 不要依赖不稳定 CSS 选择器作为唯一定位方式；能补稳定属性时优先补。
- `showBrandLink`、`defaultMarkerIndexVisible`、`renderToolbarActions` 这类展示增强选项只有在用户明确要求品牌入口、默认显示序号或工具栏自定义动作时才设置；常规标注接入保持默认配置。
- Markdown 图片必须随原型发布：放到当前原型 `assets/` 并用最终可访问 URL；不要用本地路径、`/api/markdown-file` 或 `../assets/...`。
