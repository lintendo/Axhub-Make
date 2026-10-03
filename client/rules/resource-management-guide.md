# 资源指南

`src/resources/` 用于存放项目资料、需求说明、文档、图表和原型讨论中需要长期保留的上下文，方便后续生成、修改和复盘原型时读取。新建项目文档时，默认保存到这里。

常见内容包括：

- 文档：Markdown、HTML 文档，如需求说明、页面说明、调研记录、会议纪要
- 图表：Draw.io 可编辑图表，如 `.drawio`、`.drawio.svg`
- 数据样例：JSON、CSV、TSV、YAML、TXT、表格导出文件
- 设计或业务附件：图片、PDF、Office 文档、压缩包等

## HTML 资源能力

创建或修改 `src/resources/**/*.html` 前，必须阅读 [Make HTML 资源 Agent 能力协议](./html-agent-capabilities.md)。该分文档只声明普通 HTML 可使用的 Make 宿主能力、接入标记和文件边界，不规定评审清单或具体业务场景。

原型评审、计划评审、指定方案评审等场景如果有额外要求，应使用独立的场景文档；不得把场景规则反向写成所有 HTML 都必须遵守的通用协议。

## 目录边界

- `src/resources/` 存放长期项目资料、文档、画布、图表、数据样例和业务附件。
- 项目固定文档模板位于根目录 `templates/`，通过项目设置预览和编辑；缺失时可恢复默认模板。
- 画布是普通资源文件，保存为 `src/resources/**/*.excalidraw`；画布内图片、截图和 AI 生成图统一保存到 `src/resources/.assets/<资源相对路径>/`，例如 `src/resources/.assets/flows/order.excalidraw/`。
- 原型页面专属素材放在对应原型目录内，例如 `src/prototypes/<name>/assets/`。
- 主题素材放在对应主题目录内，例如 `src/themes/<theme-key>/assets/`。

设计图、流程图、图表、参考图等 AI 产物默认保存到 `src/resources/`，需要时再作为资源嵌入画布或原型。

## 资源链接

资源通常保留两种链接：

- 只读链接：用于预览、嵌入、下载或外部读取。
- 编辑链接：Make 管理端地址，用于打开资源详情页，带顶部工具栏和系统编辑能力。

本节示例是资源路由格式，可用于文档、metadata 或运行时字段。回复用户时，如果要作为可点击链接使用，必须先按当前 Make 管理端或 runtime origin 补齐完整 URL；无法确认 origin 时，只能标为“资源路径/预览路径”。

编辑链接统一使用 Make 管理端 deep link：

```text
/?projectId=<projectId>&doc=<resource-path>
```

其中 `resource-path` 是相对 `src/resources/` 的路径，例如 `documents/prd.md`、`flows/app.excalidraw` 或 `flows/order-status.drawio`。

除 Markdown 外，所有资源的只读链接统一使用文档资源文件地址：

```text
/api/docs/<encoded-resource-path>?projectId=<projectId>
```

Markdown 文档 `.md` 的只读预览使用文档预览页：

```text
/spec-template.html?url=<encoded-doc-api-url>
```

其中 `doc-api-url` 通常是 `/api/docs/<encoded-resource-path>?projectId=<projectId>`。
