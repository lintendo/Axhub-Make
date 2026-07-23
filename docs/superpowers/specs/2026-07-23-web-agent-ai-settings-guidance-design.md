# Web Agent 打开失败时引导 AI 设置设计

## 背景

在 Make 的项目起始页点击“对话 AI”时，当前没有项目上下文，因此 Web Agent 回调不会注入到 `OpenInDropdown`。组件现在只显示“打开 Web Agent 失败”，用户无法判断下一步应做什么；而组件已经具备打开“AI 设置”的回调，且 AI 设置是本地 Agent 配置入口。

## 目标

- 将配置缺失或 Web Agent 回调不可用时的通用错误提示改成可执行的配置引导。
- 提示出现时自动打开项目“AI 设置”，让用户直接检查或选择本地 AI Agent。
- 保留下拉菜单中的“设置”入口，并保持已配置 Web Agent、CLI Agent、本地应用和 IDE 的打开流程不变。

## 交互设计

当 `OpenInDropdown` 无法执行 Web Agent 打开操作时：

1. 调用现有 `onOpenAISettings` 回调，打开 AI 设置页。
2. 显示“请先在 AI 设置中选择本地 AI Agent”提示。

该行为覆盖两处当前的通用兜底分支：

- `handleOpenWithWebAgent` 收到 `acp` 但没有可用回调时；
- 默认打开方式解析为未知 Web Agent 时。

正常情况下，`IndexPage` 中已有的 AI 配置检查仍负责处理已注入回调但尚未选择 Agent 的场景，不在本次设计中重复实现。

## 方案取舍

- 仅修改文案：改动最小，但用户仍需自己在菜单中寻找“设置”，反馈不够可执行。
- 禁用“对话 AI”入口：能避免错误提示，但无法帮助用户完成配置，也会降低入口可发现性。
- 复用 `onOpenAISettings` 自动打开设置并给出引导（采用）：沿用现有组件契约和设置入口，覆盖起始页场景，改动集中且不影响其他 Agent 类型。

## 实现边界

- 只修改 `src/index/components/sidebar/OpenInDropdown.tsx` 及其针对性源测试。
- 不修改 AI 设置面板内容、配置存储、服务端 API 或其他打开失败提示。
- 不自动重试打开；用户完成配置后可从 AI 设置或原入口再次打开。

## 验证

- 源码测试确认两个 Web Agent 失败分支都调用 `onOpenAISettings`，并使用新的引导文案。
- 运行 `OpenInDropdown` 相关 Vitest 测试。
- 运行 `git diff --check`，确认只包含本次行为与测试变更。
