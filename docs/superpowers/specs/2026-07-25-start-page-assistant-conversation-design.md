# 资源与设计起始页可见会话发送设计

## 背景

资源和设计起始页当前共用展示态输入框。发送后，页面通过后台 SSE 创建独立 AI 会话，并等待整条流结束后才结束输入框的提交状态。同时，`startPageActive` 会强制阻止右侧 AI 侧栏挂载和显示。

这会造成三个体验问题：

- 新会话已经创建，但用户看不到会话、执行过程和错误上下文。
- 发送按钮把完整 AI 任务时长表现为“正在发送”，长任务看起来像卡死。
- 资源或设计提交入口会吞掉下游返回值，失败结果可能被当作成功处理并清空草稿。

## 目标

- 资源和设计起始页不再禁止 AI 侧栏出现。
- 从起始页发送时始终创建一个新的可见会话。
- 发送按钮只等待会话提交进入 `started`，不等待完整 AI 任务结束。
- AI 后续执行、进度和错误在右侧会话中持续展示。
- 提交失败时保留输入、附件和上下文。
- 画布内已有后台直跑与任务卡流程保持不变。

## 非目标

- 不为起始页新增另一套任务中心或会话存储。
- 不在发送前创建空资源或空设计。
- 不改变画布生成的并发控制、状态卡和 artifact 收集。
- 不增加旧版本兼容分支或新依赖。

## 交互设计

### 侧栏行为

起始页保留用户当前的 AI 侧栏状态：原本打开则继续打开，原本关闭则保持关闭。起始页上的侧栏开关仍可使用，不再由 `startPageActive` 强制屏蔽。

当用户从资源或设计起始页发送提示词时，系统自动挂载并打开右侧 AI 侧栏，切换到新创建的会话。左侧仍停留在当前起始页，不自动跳转，也不提前创建空资源。

用户在任务执行中关闭侧栏不会取消任务；再次打开时应回到当前活动会话。

### 发送状态

发送按钮只覆盖“连接 AI、创建新会话并提交消息”这段过程：

1. 校验提示词和 AI 配置。
2. 打开右侧侧栏并等待 ACP UI 就绪。
3. 写入当前起始页上下文。
4. 强制创建新会话并提交消息。
5. 收到 `started` 后结束按钮提交状态并清空草稿。
6. AI 完整执行继续在侧栏中展示。

提交期间禁用重复发送。每次新的资源或设计起始页提交都创建独立新会话，不复用上一资源的会话。

### 错误行为

下列失败均结束按钮提交状态，并保留提示词、附件与上下文：

- 未配置可用 AI Agent。
- ACP 运行时启动或侧栏加载失败。
- 会话提交超时。
- ACP 明确返回提交错误。

错误使用现有消息系统显示可操作提示。若侧栏已经成功打开但消息提交失败，侧栏保持打开，便于用户查看状态或调整配置后重试。

## 技术设计

### 提交路由

`IndexPage` 将起始页可见提交与画布后台直跑拆分为两个明确入口：

- `resource-start` 和 `theme-start` 使用 `assistantController.openAssistantWithContextAndSubmitPrompt`。
- `canvas-start`、画布节点生成和其他已有画布请求继续使用 `submitAnnotationPromptViaApi`。

起始页调用现有侧栏控制器时传入：

- `forceNewThread: true`
- `waitUntil: 'started'`
- 当前选择的 `provider`、`model`、`mode` 和 `thought`

上下文继续由现有 `buildCanvasAssistantContext` 构建，避免在起始页维护第二套上下文格式。

### 侧栏显示边界

`IndexPage` 不再针对 `startPageActive` 改写下列值：

- `assistantPanelProps.mounted`
- `assistantPanelProps.visible`
- presentation/sidebar props 中的 `assistantVisible`、`webAgentPanelOpen` 和 `aiPanelMode`
- 侧栏切换及 AI 面板打开动作

这些值统一由 `useAssistantPanelController` 决定，使起始页和普通资源页遵循相同侧栏生命周期。

### 返回值传播

`ContentAreaView` 的起始页提交函数必须返回下游提交结果，不得只 `await` 后返回 `undefined`。展示态输入框以明确的 `false` 判断失败：

- 成功或 `{ ok: true }`：清空草稿、附件和上下文。
- `false` 或 `{ ok: false }`：保留当前输入状态。
- 抛出异常：由现有异常路径保留草稿并显示错误。

为避免模糊真值判断，起始页适配层将控制器结果规范化为布尔成功值后再返回给 composer。

## 数据流

```text
StartGuide display composer
  -> ContentAreaView start submit adapter
  -> IndexPage start-guide assistant submitter
  -> buildCanvasAssistantContext
  -> useAssistantPanelController.openAssistantWithContextAndSubmitPrompt
  -> mount/open ACP sidebar
  -> ACP new thread + message submit
  -> started result
  -> boolean success back to display composer
```

完整 AI 任务在 ACP 会话内继续运行，不再占用 display composer 的提交 Promise。

## 验证

### 自动化测试

- `IndexPage` 不再用 `startPageActive` 屏蔽侧栏的挂载、显示和操作。
- 资源和设计起始页提交使用侧栏控制器，并传入 `forceNewThread: true` 与 `waitUntil: 'started'`。
- 画布提交仍使用后台直跑 API。
- provider、model、mode 和 thought 完整透传。
- `ContentAreaView` 将失败结果返回给展示态输入框。
- 展示态输入框在失败时保留草稿，成功后才清空。

### 浏览器验证

- 从资源起始页发送后，右侧侧栏自动出现并显示新消息。
- 从设计起始页发送后行为一致。
- 消息进入 started 后按钮及时停止转圈，而 AI 仍可继续执行。
- 侧栏原本打开和关闭两种状态都能发送。
- 提交失败后提示词仍保留，可直接重试。

## 风险控制

- 仅资源和设计起始页切换为可见会话链路，避免影响已有画布并行任务。
- 复用现有侧栏控制器的新会话、超时和 iframe pool 能力，不引入重复会话状态。
- 不改变资源创建时机，避免留下未完成的空资源。
