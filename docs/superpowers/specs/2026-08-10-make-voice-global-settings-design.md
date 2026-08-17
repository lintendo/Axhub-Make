# Axhub Make 语音助手全局设置设计

## 目标

在 Axhub Make 的“设置 > AI”中增加一套全局语音助手配置，分别保存豆包语音 API、OpenAI-compatible 处理 API 和视觉 API 的参数。

## 范围

- 仅增加设置 UI、Make 服务端的全局配置存储和脱敏配置 API。
- 配置归 Make 所有，不读取 ACP UI 的 `voice-settings.json`。
- 不修改 `MakeVoiceAssistant`、`VoiceConversationBridge`、现有九个 `axhub_make_*` 工具、批注持久化、ACP/direct-run 或 AI 任务流程。
- 现有运行时本次不消费新配置；后续接入可以读取同一服务端配置存储。

## 配置结构

配置保存在 Make 全局状态目录下的独立文件 `~/.axhub/make/voice-assistant.settings.json`，不进入项目仓库。

- `doubao`：`appId`、`accessKey`、`speaker`。豆包协议所需的 App Key、Resource ID 和实时语音 URL 已按后续精简设计收敛为 ACP 内部常量，不属于 Make 用户配置。
- `processing`：`baseUrl`、`apiKey`、`model`。
- `vision`：`endpoint`、`apiKey`、`model`。

处理 API 默认使用 OpenAI-compatible `/v1` 地址；视觉配置默认留空。旧文件中的 `appKey`、`resourceId`、`realtimeUrl` 读取时忽略。

## 安全与保存语义

- 配置文件使用原子写入，并设置为仅当前用户可读写（`0600`）。
- GET API 永不返回真实密钥，只返回 `hasAccessKey`、`hasApiKey`。
- 设置页的密钥输入框始终为空；未输入新值时保留已保存密钥。
- 清除密钥必须点击显式清除操作，并通过 `clearSecrets` 路径列表提交。
- URL 只接受 HTTPS/WSS；loopback 地址允许 HTTP/WS，禁止 URL 内嵌凭据和 fragment。

## UI

- 在现有 AI 页签的“图片生成 API”之后挂载全局服务配置，不再使用“语音助手”总分组。
- 组件自己通过项目作用域 URL 读取并维护全局配置草稿，不把状态继续堆进 2000 行以上的 `SettingsDialog.tsx`。
- “豆包语音 API”“网页任务 API”“视觉 API”是三个同级、可独立复用的折叠面板，并提供明确的“已配置”密钥状态；不增加区域内的独立保存按钮。
- AI 设置页的本地 ACP、本地桌面 Agent、本地 CLI Agent、AI 用途配置、声音通知、图片生成 API 和上述三个全局服务统一使用 `SettingsCollapsiblePanel`，每个面板可独立展开或收起。
- 设置窗口底部现有“保存”按钮统一提交项目设置和语音助手配置；保存后按现有设置行为关闭窗口，不触发当前语音会话重连。
- 设置页签只在窗口真正打开时初始化一次，窗口打开后的属性更新不得把用户当前页签重置回“项目设置”。

## API

- `GET /api/config/voice-assistant`：返回脱敏配置。
- `PUT /api/config/voice-assistant`：接收 `{ patch, clearSecrets }`，合并保存并返回脱敏配置。
- 两个端点沿用 Make 现有项目作用域校验，但底层配置为全局，所有项目读取同一份值。

## 验证

- Store 单元测试覆盖默认值、规范化、密钥保留、显式清除、脱敏和文件权限。
- API 测试覆盖跨项目共享、响应不泄漏密钥和 PUT 合并语义。
- UI 测试覆盖三个配置区、脱敏输入、显式清除和项目作用域请求。
- 运行聚焦 Vitest、前端/服务端 TypeScript 检查和管理端构建。
