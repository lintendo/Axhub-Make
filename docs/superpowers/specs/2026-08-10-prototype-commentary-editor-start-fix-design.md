# 原型批注编辑器启动失败修复设计

## 问题

用户点击原型顶部工具栏的“批注”后，界面提示“启动编辑器失败”。

`usePrototypeEditorBridgeActions` 在构造 `PrototypeEditorContext` 时读取了尚不存在的 `context.makeServerOrigin`。该表达式会在编辑器启动链路中抛出 `ReferenceError`，外层统一错误处理随后显示兜底提示，导致批注编辑器无法启用。

## 目标

- 原型批注入口可以正常构造编辑器上下文并启动 Quick Edit runtime。
- 上下文和编辑器启用选项继续使用同一个宿主 Make 服务地址。
- 增加窄范围回归覆盖，防止上下文构造再次引用未定义变量。

## 方案

在 `buildPrototypeEditorContext` 中直接调用 `resolveHostedMakeServerOrigin(window.location.origin)` 生成 `makeServerOrigin`，与 `buildPrototypeEditorEnableOptions` 的现有来源保持一致。

不抽取新的上下文构造模块，不改变 Quick Edit 握手、跨域 bridge、批注持久化或错误提示行为。当前问题由单个错误表达式引起，扩大重构范围会增加与工作区现有改动冲突的风险。

## 测试

在 `usePrototypeEditorBridgeActions.test.ts` 增加源码契约测试：

- `PrototypeEditorContext` 的 `makeServerOrigin` 直接来自 `resolveHostedMakeServerOrigin(window.location.origin)`。
- 源码中不再出现 `context.makeServerOrigin` 这一无效引用。

先确认测试在当前实现下因无效引用而失败，再修改生产代码并运行该测试文件。随后运行相关预览操作测试，确认编辑器入口现有行为没有回归。

## 非目标

- 不调整“启动编辑器失败”的用户提示文案。
- 不重构 `usePrototypeEditorBridgeActions` 的其他职责。
- 不修改文档编辑器、HTML 编辑器或 PRD 标注会话行为。
