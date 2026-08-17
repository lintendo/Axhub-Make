# Axhub Make 全局设置规则

供 AI Agent 协助用户检查或修改 Axhub Make 用户级全局设置。不授权修改项目内容、处理凭据、安装软件或执行发布。

## 范围

| 文件 | Windows | macOS / Linux |
| --- | --- | --- |
| `server.config.json` | `%USERPROFILE%\.axhub\make\server.config.json` | `~/.axhub/make/server.config.json` |
| `voice-assistant.settings.json` | `%USERPROFILE%\.axhub\make\voice-assistant.settings.json` | `~/.axhub/make/voice-assistant.settings.json` |

两份文件均为 UTF-8 JSON，写回时使用两空格缩进并保留末尾换行。不得修改项目目录内的 `.axhub/make/axhub.config.json`。

## 操作原则

1. 按操作系统解析用户主目录，先读取目标文件并严格解析 JSON；无法解析时不得覆盖原文件。
2. 写入前列出将修改的文件和完整字段路径，等待用户确认。
3. 只合并用户明确要求的字段，保留未知字段、未提及分组和现有数组项；文件不存在时只创建最小对象。
4. 写入后重新解析文件并核对差异；验证失败时恢复原值。
5. 不得猜测模型 ID、服务地址、本地路径或验证结果。

## 敏感操作

密钥、密码、token、secret，以及密码散列、LAN secret、发布 token 和对象存储凭据都是敏感值。

- 不得擅自生成、删除、回显或迁移敏感值；只有用户明确提供新值、目标字段并确认写入时才能修改。
- 不得在终端、日志、diff、截图或最终报告中展示完整敏感值。
- 局域网密码必须由 Make 的密码设置流程生成，不得手工拼装 `passwordHash`、`salt` 或 `secret`。
- 安装软件、提升权限或对外发布前，必须单独说明目标和影响并取得确认。

## 字段速查

### `server.config.json`

| 分组 | 用途与约束 |
| --- | --- |
| `automation` | `conversationPromptClient` / `annotationPromptClient` / `canvasPromptClient` 及对应模型；`agentRunConcurrency` 范围 1–10；ACP 权限放宽前先说明风险。 |
| `assistant` | `webBaseUrl` 和 `apiBaseUrl`；只使用用户提供或本机已验证的服务。 |
| `ai.imageGeneration` | `baseUrl`、`apiKey`、`model`、`lastTest`；不得伪造测试状态。 |
| `uiPreferences` | Excalidraw 属性面板开关与位置；不同时修改画布内容。 |
| `toolOpenState` | 只合并对应路径字段，保留同条目其他字段和 `web:<agent>` 条目。 |
| `accessControl.lanPassword` | 只通过 Make 流程设置或清除；更换后旧登录和分享链接失效。 |
| `cloudPublishing` | Vercel、Cloudflare Pages、S3、GitHub Pages 和 `publishSettings`；修改配置不等于获得发布授权。 |

Agent 路径分别使用 `ide:<agent>.executablePath`、`local-app:<agent>.commandPath` 和 `cli:<agent>.commandPath`。

### `voice-assistant.settings.json`

| 分组 | 字段 |
| --- | --- |
| `doubao` | `appId`、`resourceId`、`accessKey`、`appKey`、`realtimeUrl`、`speaker` |
| `processing` | 界面名称“网页任务 API”；`baseUrl`、`apiKey`、`model` |
| `vision` | `endpoint`、`apiKey`、`model` |

豆包语音 API 配置缺失时，引导用户登录 [火山引擎豆包语音控制台](https://console.volcengine.com/speech/new/overview) 开通服务并获取 App ID、Resource ID 与所需凭据。AI 不代替用户登录，不猜测或回显凭据。

顶层 `version` 和 `updatedAt` 由 Make 管理，不得伪造。远程 HTTP/WebSocket 地址应使用 HTTPS/WSS。

## 本地 Agent 验证

1. 先用无副作用方式检测是否已安装，已安装时定位真实路径。
2. 缺失时说明产品、官方渠道和命令，取得确认后才能安装。
3. 写入前保存原值；安装或验证失败时恢复原值并报告原因。

### CLI Agent

写入 `cli:<agent>.commandPath` 后请求 `GET <MAKE_API_ORIGIN>/api/agent/versions?agent=<agent>`。只有 `agents.<agent>.status` 为 `installed` 且 `version` 非空时才保留，否则恢复原值。

### ACP Provider

CLI 检测通过后请求 `POST <MAKE_API_ORIGIN>/api/ai/runs?projectId=<PROJECT_ID>`，请求体使用 `scene: "agent-provider-test"`、`client: "acp:<agent>"` 和提示词 `请只返回 AXHUB_AGENT_TEST_OK，不要返回其他文字。`。只有 SSE 实际输出包含 `AXHUB_AGENT_TEST_OK` 才算通过；CLI 和 Provider 结果分别报告。

### 桌面 Agent

验证 `ide:<agent>.executablePath` 或 `local-app:<agent>.commandPath` 存在且可启动，Make 支持时再走一次“打开 AI”链路。无对应 CLI 检测时报告“路径验证通过、CLI 版本检测不适用”，不得伪造版本或启动结果。

## 完成报告

- 列出实际读取和改动的文件、字段路径与 JSON 复读结果。
- 敏感字段只报告“已保留”“已更新”“未设置”或“已清除”。
- CLI、ACP Provider 和桌面打开验证分别报告。
- 列出因未获确认而没有执行的安装、凭据、密码或发布操作。
