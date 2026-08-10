# PRD 标注“更多”菜单精简设计

## 目标

仅在原型的 PRD 标注会话激活时，隐藏顶部“更多”菜单中的“页面”和“保存”两组。普通批注、快速编辑及其他资源模式保持现有行为。

## 设计

`PresentationToolbar` 已通过 `prototypeAnnotationSessionActive` 区分 PRD 标注会话。菜单渲染层直接使用该状态控制以下内容：

- PRD 标注激活时不渲染“页面”组，包括“设计决策”和页面动画开关。
- PRD 标注激活时不渲染“保存”组，包括“保存文本”和“保存样式”。
- 与隐藏分组绑定的分隔线一起隐藏，避免菜单出现连续或多余分隔线。
- “Agent”和“帮助”两组继续保留。

不修改底层页面动画、设计决策或保存动作，也不改变 `CommentaryHostToolbarState` 与宿主动作协议。

## 状态与交互

- `prototypeAnnotationSessionActive === true`：菜单只展示仍适用于 PRD 标注的 Agent 和帮助操作。
- `prototypeAnnotationSessionActive === false`：沿用现有菜单结构与操作。
- 状态切换使用现有 React 渲染流程立即更新菜单，无新增持久化或异步流程。

## 错误处理

本次改动仅调整条件渲染，不引入新的失败路径。保留菜单项继续沿用现有动作处理和禁用状态。

## 测试

在 `PresentationToolbar.test.ts` 增加针对性回归断言：

- PRD 标注激活条件同时控制“页面”组及其前置分隔线。
- PRD 标注激活条件同时控制“保存”组及其前置分隔线。
- 普通快速编辑仍保留页面动画、设计决策、保存文本和保存样式入口。

运行该组件的 Vitest 测试，并按子项目要求执行相关 TypeScript 或构建验证。
