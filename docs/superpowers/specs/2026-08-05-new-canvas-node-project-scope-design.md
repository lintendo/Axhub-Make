# 新建画布节点的项目作用域链接

## 目标

仅修复今后新建的画布嵌入节点：其项目内链接必须包含当前 `projectId`。覆盖资源选择器创建以及 AI 按 `canvas-workspace` 规范直接写入画布两条路径；不迁移、不改写、也不在点击时修复已有画布节点。

## 根因

资源选择器在构造 `openUrl` 时调用深链生成器，但没有传入当前项目 ID；同时，AI 使用的 `canvas-workspace` 节点参考示例没有把 `projectId` 规定为新建项目内节点的必填字段。两条路径因此都可能写出无项目作用域的链接。

## 方案

1. 将当前 `projectId` 传入资源选择器生成的文档、主题和原型深链；`createEmbeddableFromDrop` 继续保存该链接。
2. 更新 Codex 与 Claude 共用的 `canvas-workspace` 节点参考：新建项目内嵌入节点必须保存 `customData.projectId`，并在 `link`、`previewUrl`、`openUrl` 的 Make/API 相对链接中携带相同的 `projectId`。
3. 不新增旧节点兼容逻辑，也不修改已有 `.excalidraw` 文件。

## 验收

- 新建文档、主题、原型节点的 `customData.openUrl` 均带有当前 `projectId`。
- AI 新建项目内节点时遵循同一项目作用域字段约束。
- 预览链接的现有项目作用域行为不变。
- 不修改现有 `.excalidraw` 文件，也不改变点击旧节点时的解析逻辑。
