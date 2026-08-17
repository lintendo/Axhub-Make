# 起始页默认 Agent 预检设计

## 背景

原型、资源和设计起始页的 AI 请求最终都会经过 `IndexPage` 的默认执行 Agent guard。原型起始页在进入该 guard 之前，可能已经创建占位原型、刷新资源并切换生成状态，因此未配置默认 Agent 时仍会留下空原型或等待状态。共享生成输入框还会在未配置时回退显示 Codex，造成已经完成配置的错觉。

## 目标

- 三类起始页在任何创建、状态更新或 AI 请求之前验证项目已配置默认 ACP Agent。
- 未配置时打开 AI 设置、显示现有警告并保留输入草稿。
- 保留 `IndexPage` 的最终 guard，防止其他调用路径绕过验证。
- 未配置时不展示 Codex 为当前选择，改为展示可进入 AI 设置的 fallback 控件。

## 方案

`ContentAreaView` 在 `handleSubmitPrototypeStartRequest` 的第一步使用当前 `preferredPromptClient` 做同语义预检。验证失败时调用 `onOpenAISettings`、显示“请先在 AI 设置中选择本地 AI Agent”并返回 `false`，后续原型创建、生成状态切换和提交函数均不执行。

`CanvasGenerationComposer` 保留 Codex 作为 ACP provider 内部初始化兜底，但增加纯函数统一计算选择器可见性。只有已配置默认 Agent 且 ACP runtime 可用时才展示 provider/model 选择器；未配置或 runtime 不可用时展示设置 fallback。这样不改变 ACP provider 接口，同时消除误导状态。

## 验证

- 源码回归测试验证预检严格位于资源/设计分支、原型创建和等待状态更新之前。
- 纯函数单元测试覆盖未配置、已配置、runtime fallback 和禁用选择器四种状态。
- 运行相关 `ContentAreaView`、`CanvasGenerationComposer` 和 `IndexPage` 测试。

