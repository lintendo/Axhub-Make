# 全局设置 AI 指导设计

## 目标

把 AI 设置页底部现有仅覆盖 `toolOpenState` 的“复制 AI 配置提示词”，升级为能指导 AI 安全处理 Axhub Make 全局设置的入口。

提示词不展开全部字段，而是要求 AI 先阅读项目内的 `rules/axhub-make-global-settings.md`。规则文档说明配置文件位置、JSON 结构、字段含义、写入限制、密钥处理和本地 Agent 的安装与验证方式。

## 配置范围

本次只覆盖用户主目录 `.axhub/make/` 下的全局配置；不修改任何项目目录内的 `.axhub/make/axhub.config.json`、项目名称、项目描述或默认设计。

| 配置文件 | 平台路径 | 覆盖内容 |
| --- | --- | --- |
| `server.config.json` | Windows：`%USERPROFILE%\\.axhub\\make\\server.config.json`；macOS/Linux：`~/.axhub/make/server.config.json` | `automation`、`assistant`、`ai.imageGeneration`、`uiPreferences`、`toolOpenState`、LAN 访问控制和云发布配置 |
| `voice-assistant.settings.json` | Windows：`%USERPROFILE%\\.axhub\\make\\voice-assistant.settings.json`；macOS/Linux：`~/.axhub/make/voice-assistant.settings.json` | 豆包语音 API、轻量网页任务 API 和视觉 API |

两份文件都是 UTF-8、两空格缩进的 JSON。AI 必须先读取、只合并用户指定字段、保留未知字段；无法解析时不得覆盖原文件。

## Rules 文档

新增并随 Make 客户端模板分发 `client/rules/axhub-make-global-settings.md`。它是给外部 AI Agent 看的稳定说明，包含：

- 两份全局配置文件的绝对/相对路径、用途和 JSON 格式。
- `server.config.json` 顶层分组与常用字段含义：执行 Agent 与模型、ACP、图片生成、桌面/CLI Agent 路径、界面偏好、局域网访问和云发布。
- `voice-assistant.settings.json` 的 `doubao`、`processing`（UI 名称“网页任务 API”）和 `vision` 分组。
- 密钥、密码散列、LAN secret 和发布 token 的保护规则：不得擅自生成、删除、回显或迁移；仅在用户明确提供新值并确认目标字段时写入。
- 本地桌面 Agent 的 `ide:<agent>.executablePath` / `local-app:<agent>.commandPath`，以及本地 CLI Agent 的 `cli:<agent>.commandPath` 格式。
- 先探测、必要时使用官方渠道安装、再写入和复测的执行步骤。
- 豆包语音 API 配置缺失时，引导用户前往火山引擎豆包语音控制台 `https://console.volcengine.com/speech/new/overview` 开通或获取，AI 不猜测、不回显凭据。

Rules 文档使用与其他 `client/rules/` 一致的简洁风格：优先用短段落、短列表和字段速查表，合并重复的安全说明与验证步骤，总长度不超过 100 行。

## AI 提示词和验证

底部按钮保持用户可理解的“复制 AI 配置提示词”。复制的内容将覆盖全局配置，包含当前 Make API 地址与项目 ID，并要求 AI：

1. 阅读 `rules/axhub-make-global-settings.md`，列出本次实际将改动的配置文件和字段后再写入。
2. 仅处理用户明确要求的全局设置；任何安装、密钥、密码、token 或对外发布操作都需要用户确认。
3. 当用户要求本地 Agent 时，先检查是否已安装；未安装时使用官方安装渠道完成安装，再找到实际可执行路径。
4. 写入 CLI 路径后请求 `GET <MAKE_API_ORIGIN>/api/agent/versions?agent=<agent>`。仅当 `agents.<agent>.status` 为 `installed` 且有版本值时保留该 CLI 配置；否则恢复原值并说明失败原因。
5. 对可作为 ACP Provider 的 Agent，再调用 `POST <MAKE_API_ORIGIN>/api/ai/runs?projectId=<PROJECT_ID>`，请求体使用 `scene: "agent-provider-test"`、对应 `client: "acp:<agent>"` 和固定探测提示词。SSE 响应包含 `AXHUB_AGENT_TEST_OK` 才表示供应商可执行。
6. 桌面 Agent 不强行走 CLI 版本接口；验证路径存在、可启动，并在可用时通过 Make 的“打开 AI”链路完成一次打开验证。

不支持版本检测的桌面应用仍可保存正确路径，但提示词必须清楚报告“路径验证通过、CLI 版本检测不适用”，不能伪造通过状态。

## 组件边界

- `localAgentSettings.ts`：从“本地 Agent 提示词”演进为全局设置提示词构造器；接收 API origin 和 project ID，不读取浏览器全局状态。
- `SettingsDialog.tsx`：提供当前 Make API 地址与已选项目 ID，负责复制和 toast；按钮文案同步更新。
- `client/rules/axhub-make-global-settings.md`：配置说明的唯一长文来源。提示词只引用它并提供验证 API，不复制整份 schema。

## 验证

- 单元测试覆盖提示词引用 Rules 文档、携带 API origin/project ID、要求 JSON 合并与密钥保护，并包含 CLI 版本检测和 Provider 执行检测地址。
- 设置页源码测试覆盖新的按钮文案和参数传递。
- Rules 文档测试覆盖两份文件路径、`toolOpenState` 的路径字段、网页任务 API 名称和两类检测约定。
- 运行聚焦 Vitest 与管理端编译验证。

## 非目标

- 不新增一个让管理端直接代替 AI 安装任意软件的 API。
- 不通过提示词自动修改项目级配置。
- 不自动写入或外传 API Key、密码、token、secret；这类值始终需要用户显式提供和确认。
